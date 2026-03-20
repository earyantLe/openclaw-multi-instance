import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from '@openclaw/logger';
import { Instance, Backup, AuditLog } from '@openclaw/db';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.INSTANCE_PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Auth middleware (verify token with auth service)
const verifyAuth = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify with auth service
    const response = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/api/auth/me`, {
      headers: { Authorization: authHeader }
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = await response.json();
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Instance management
app.post('/api/instances', verifyAuth, async (req: any, res: Response) => {
  try {
    const { name, port, workspace } = req.body;
    const { tenantId } = req.user;

    // Check tenant limits
    const tenantInstances = await Instance.query().where({ tenantId });
    const tenant = await fetch(`${process.env.AUTH_SERVICE_URL || 'http://localhost:3001'}/api/tenants/${tenantId}`, {
      headers: { Authorization: req.headers.authorization! }
    }).then(r => r.json());

    if (tenantInstances.length >= tenant.maxInstances) {
      return res.status(403).json({ error: `Instance limit reached: ${tenant.maxInstances}` });
    }

    const profile = `instance_${Date.now()}`;
    const instancePort = port || (18789 + tenantInstances.length * 5);

    // Create instance using instance-manager.sh
    const scriptPath = process.env.INSTANCE_MANAGER_PATH || './deploy-core/instance-manager.sh';
    await execAsync(`${scriptPath} create ${profile} ${instancePort}`);

    const instance = await Instance.query().insertAndFetch({
      id: `inst_${Date.now()}`,
      tenantId,
      name: name || profile,
      profile,
      port: instancePort,
      workspace: workspace || `~/.openclaw/instances/${tenantId}/${profile}/workspace`,
      status: 'stopped',
      config: {},
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Audit log
    await AuditLog.query().insert({
      id: `audit_${Date.now()}`,
      tenantId,
      userId: req.user.id,
      instanceId: instance.id,
      action: 'instance:create',
      resource: 'instance',
      resourceId: instance.id,
      createdAt: new Date()
    });

    logger.info(`Instance created: ${instance.name}`, { tenantId, instanceId: instance.id });
    res.status(201).json(instance);
  } catch (error: any) {
    logger.error(`Instance creation error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

app.get('/api/instances', verifyAuth, async (req: any, res: Response) => {
  try {
    const { tenantId } = req.user;
    const instances = await Instance.query().where({ tenantId });

    // Get live status for each instance
    const instancesWithStatus = await Promise.all(
      instances.map(async (instance: any) => {
        try {
          const { stdout } = await execAsync(`pgrep -f "openclaw.*${instance.profile}"`);
          const pid = stdout.trim() ? parseInt(stdout.trim()) : undefined;
          return {
            ...instance,
            status: pid ? 'running' : instance.status,
            pid
          };
        } catch {
          return { ...instance, status: instance.status || 'stopped' };
        }
      })
    );

    res.json(instancesWithStatus);
  } catch (error: any) {
    logger.error(`Instance list error: ${error.message}`);
    res.status(500).json({ error: 'Failed to list instances' });
  }
});

app.get('/api/instances/:id', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    res.json(instance);
  } catch (error: any) {
    logger.error(`Instance fetch error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch instance' });
  }
});

app.post('/api/instances/:id/start', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    // Start instance
    const scriptPath = process.env.INSTANCE_MANAGER_PATH || './deploy-core/instance-manager.sh';
    await execAsync(`${scriptPath} start ${instance.profile}`);

    await Instance.query().patchAndFetchById(id, {
      status: 'running',
      lastStartedAt: new Date(),
      updatedAt: new Date()
    });

    // Audit log
    await AuditLog.query().insert({
      id: `audit_${Date.now()}`,
      tenantId,
      userId: req.user.id,
      instanceId: id,
      action: 'instance:start',
      resource: 'instance',
      resourceId: id,
      createdAt: new Date()
    });

    logger.info(`Instance started: ${instance.name}`, { tenantId, instanceId: id });
    res.json({ status: 'success', message: 'Instance started' });
  } catch (error: any) {
    logger.error(`Instance start error: ${error.message}`);
    res.status(500).json({ error: 'Failed to start instance' });
  }
});

app.post('/api/instances/:id/stop', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const scriptPath = process.env.INSTANCE_MANAGER_PATH || './deploy-core/instance-manager.sh';
    await execAsync(`${scriptPath} stop ${instance.profile}`);

    await Instance.query().patchAndFetchById(id, {
      status: 'stopped',
      lastStoppedAt: new Date(),
      updatedAt: new Date()
    });

    // Audit log
    await AuditLog.query().insert({
      id: `audit_${Date.now()}`,
      tenantId,
      userId: req.user.id,
      instanceId: id,
      action: 'instance:stop',
      resource: 'instance',
      resourceId: id,
      createdAt: new Date()
    });

    logger.info(`Instance stopped: ${instance.name}`, { tenantId, instanceId: id });
    res.json({ status: 'success', message: 'Instance stopped' });
  } catch (error: any) {
    logger.error(`Instance stop error: ${error.message}`);
    res.status(500).json({ error: 'Failed to stop instance' });
  }
});

app.post('/api/instances/:id/restart', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const scriptPath = process.env.INSTANCE_MANAGER_PATH || './deploy-core/instance-manager.sh';
    await execAsync(`${scriptPath} restart ${instance.profile}`);

    await Instance.query().patchAndFetchById(id, {
      status: 'running',
      lastStartedAt: new Date(),
      updatedAt: new Date()
    });

    logger.info(`Instance restarted: ${instance.name}`, { tenantId, instanceId: id });
    res.json({ status: 'success', message: 'Instance restarted' });
  } catch (error: any) {
    logger.error(`Instance restart error: ${error.message}`);
    res.status(500).json({ error: 'Failed to restart instance' });
  }
});

app.delete('/api/instances/:id', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;
    const { force } = req.query;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const scriptPath = process.env.INSTANCE_MANAGER_PATH || './deploy-core/instance-manager.sh';
    const forceFlag = force === 'true' ? '--force' : '';
    await execAsync(`${scriptPath} delete ${instance.profile} ${forceFlag}`);

    await Instance.query().deleteById(id);

    // Audit log
    await AuditLog.query().insert({
      id: `audit_${Date.now()}`,
      tenantId,
      userId: req.user.id,
      instanceId: id,
      action: 'instance:delete',
      resource: 'instance',
      resourceId: id,
      createdAt: new Date()
    });

    logger.info(`Instance deleted: ${instance.name}`, { tenantId, instanceId: id });
    res.json({ status: 'success', message: 'Instance deleted' });
  } catch (error: any) {
    logger.error(`Instance delete error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// Backup management
app.post('/api/instances/:id/backup', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;
    const { name } = req.body;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const backupName = name || `${instance.profile}_${Date.now()}`;
    const scriptPath = process.env.BACKUP_SCRIPT_PATH || './scripts/backup.sh';
    await execAsync(`${scriptPath} backup ${instance.profile} ${backupName}`);

    const backup = await Backup.query().insertAndFetch({
      id: `backup_${Date.now()}`,
      tenantId,
      instanceId: id,
      name: backupName,
      path: `~/.openclaw/backups/${backupName}.tar.gz`,
      size: 0,
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    logger.info(`Backup created: ${backupName}`, { tenantId, instanceId: id });
    res.status(201).json(backup);
  } catch (error: any) {
    logger.error(`Backup creation error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'instance-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  logger.info(`Instance Service listening on port ${PORT}`);
});

export default app;
