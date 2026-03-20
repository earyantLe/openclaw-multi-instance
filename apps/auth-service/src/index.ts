import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import { logger } from '@openclaw/logger';
import { db, Tenant, User, Role, Permission } from '@openclaw/db';

const app = express();
const PORT = process.env.AUTH_PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// RBAC Middleware
interface AuthRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    roles: string[];
    permissions: string[];
  };
}

const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = payload;

    // Load permissions from database
    const user = await User.query().findById(payload.id).withGraphFetched('roles.permissions');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user.permissions = user.roles.flatMap((r: any) => r.permissions.map((p: any) => p.name));
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.permissions.includes(permission)) {
      return res.status(403).json({ error: `Permission denied: ${permission}` });
    }
    next();
  };
};

// Validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  tenantId: Joi.string().uuid().required()
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().required(),
  tenantId: Joi.string().uuid().required()
});

// Routes
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, name, tenantId } = value;

    // Check if user exists
    const existingUser = await User.query().findOne({ email, tenantId });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user with default role
    const user = await User.query().insertAndFetch({
      id: uuidv4(),
      tenantId,
      email,
      passwordHash,
      name,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Assign default role
    const defaultRole = await Role.query().findOne({ name: 'member', isDefault: true });
    if (defaultRole) {
      await User.relatedQuery('roles').for(user.id).relate(defaultRole.id);
    }

    logger.info(`User registered: ${email}`);
    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name
    });
  } catch (error: any) {
    logger.error(`Registration error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, tenantId } = value;

    // Find user
    const user = await User.query().findOne({ email, tenantId });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Load roles and permissions
    const userWithRoles = await User.query().findById(user.id).withGraphFetched('roles.permissions');
    const roles = userWithRoles.roles.map((r: any) => r.name);
    const permissions = userWithRoles.roles.flatMap((r: any) => r.permissions.map((p: any) => p.name));

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        roles,
        permissions
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logger.info(`User logged in: ${email}`);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles
      }
    });
  } catch (error: any) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/refresh', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        tenantId: user.tenantId,
        roles: user.roles,
        permissions: user.permissions
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({ token });
  } catch (error: any) {
    logger.error(`Token refresh error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Tenant management
app.post('/api/tenants', requireAuth, requirePermission('tenants:create'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, plan } = req.body;

    const tenant = await Tenant.query().insertAndFetch({
      id: uuidv4(),
      name,
      slug,
      plan: plan || 'community',
      maxInstances: plan === 'enterprise' ? 200 : plan === 'professional' ? 50 : 10,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create admin user for the tenant
    if (req.body.adminEmail && req.body.adminPassword) {
      const passwordHash = await bcrypt.hash(req.body.adminPassword, 12);
      const admin = await User.query().insertAndFetch({
        id: uuidv4(),
        tenantId: tenant.id,
        email: req.body.adminEmail,
        passwordHash,
        name: req.body.adminName || 'Admin',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const adminRole = await Role.query().findOne({ name: 'admin' });
      if (adminRole) {
        await User.relatedQuery('roles').for(admin.id).relate(adminRole.id);
      }
    }

    logger.info(`Tenant created: ${slug}`);
    res.status(201).json(tenant);
  } catch (error: any) {
    logger.error(`Tenant creation error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tenants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Check permission
    if (req.user?.tenantId !== id && !req.user?.permissions.includes('tenants:read:any')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await Tenant.query().findById(id);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json(tenant);
  } catch (error: any) {
    logger.error(`Tenant fetch error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User management
app.get('/api/users', requireAuth, requirePermission('users:read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const users = await User.query().where({ tenantId });
    res.json(users.map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt
    })));
  } catch (error: any) {
    logger.error(`User fetch error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.user!;
    const user = await User.query().findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      createdAt: user.createdAt
    });
  } catch (error: any) {
    logger.error(`User fetch error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Auth Service listening on port ${PORT}`);
});

export default app;
