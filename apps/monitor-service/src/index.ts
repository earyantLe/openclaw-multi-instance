import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '@openclaw/logger';
import { Instance, Backup, AuditLog, Tenant } from '@openclaw/db';

const app = express();
const PORT = process.env.MONITOR_PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api', limiter);

// Auth middleware (verify token with auth service)
const verifyAuth = async (req: any, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
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

// Resource monitoring
interface ResourceUsage {
  instanceId: string;
  cpu: number;
  memory: number;
  disk: number;
  network?: {
    rx: number;
    tx: number;
  };
  timestamp: Date;
}

const resourceCache = new Map<string, ResourceUsage[]>();
const MAX_HISTORY = 100;

async function getInstanceResources(instance: any): Promise<ResourceUsage> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  let cpu = 0;
  let memory = 0;
  let disk = 0;

  try {
    // Get CPU and memory from process
    if (instance.pid) {
      try {
        const { stdout } = await execAsync(`ps -p ${instance.pid} -o %cpu,%mem --no-headers 2>/dev/null`);
        const [cpuStr, memStr] = stdout.trim().split(/\s+/);
        cpu = parseFloat(cpuStr) || 0;
        memory = parseFloat(memStr) || 0;
      } catch {
        // Process not found
      }
    }

    // Get disk usage from workspace
    if (instance.workspace) {
      try {
        const { stdout } = await execAsync(`du -sb ${instance.workspace} 2>/dev/null | cut -f1`);
        disk = parseInt(stdout) || 0;
      } catch {
        // Workspace not found
      }
    }
  } catch (error) {
    logger.error(`Failed to get resources for instance ${instance.id}: ${error}`);
  }

  return {
    instanceId: instance.id,
    cpu,
    memory,
    disk,
    timestamp: new Date()
  };
}

// Cache resource data
async function cacheResources(instance: any) {
  const usage = await getInstanceResources(instance);
  const history = resourceCache.get(instance.id) || [];
  history.push(usage);

  // Keep only last MAX_HISTORY entries
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  resourceCache.set(instance.id, history);
  return usage;
}

// Routes

// Get single instance resources
app.get('/api/instances/:id/resources', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const usage = await cacheResources(instance);
    res.json(usage);
  } catch (error: any) {
    logger.error(`Resource fetch error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// Get instance resource history
app.get('/api/instances/:id/resources/history', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const history = resourceCache.get(id) || [];
    res.json(history);
  } catch (error: any) {
    logger.error(`Resource history fetch error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch resource history' });
  }
});

// Get all instances resources for tenant
app.get('/api/resources/stats', verifyAuth, async (req: any, res: Response) => {
  try {
    const { tenantId } = req.user;

    const instances = await Instance.query().where({ tenantId });
    const stats = await Promise.all(instances.map(cacheResources));

    const summary = {
      totalInstances: instances.length,
      runningInstances: instances.filter((i: any) => i.status === 'running').length,
      totalCPU: stats.reduce((sum: number, s: any) => sum + s.cpu, 0),
      totalMemory: stats.reduce((sum: number, s: any) => sum + s.memory, 0),
      totalDisk: stats.reduce((sum: number, s: any) => sum + s.disk, 0),
      avgCPU: stats.length > 0 ? stats.reduce((sum: number, s: any) => sum + s.cpu, 0) / stats.length : 0,
      avgMemory: stats.length > 0 ? stats.reduce((sum: number, s: any) => sum + s.memory, 0) / stats.length : 0
    };

    res.json({
      summary,
      instances: stats
    });
  } catch (error: any) {
    logger.error(`Resource stats error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch resource stats' });
  }
});

// Get tenant resource limits
app.get('/api/resources/limits', verifyAuth, async (req: any, res: Response) => {
  try {
    const { tenantId } = req.user;

    const tenant = await Tenant.query().findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const instances = await Instance.query().where({ tenantId });
    const usageStats = await Promise.all(instances.map(cacheResources));

    res.json({
      plan: tenant.plan,
      limits: {
        maxInstances: tenant.maxInstances,
        maxCPU: tenant.plan === 'enterprise' ? 800 : tenant.plan === 'professional' ? 400 : 100, // percentage
        maxMemory: tenant.plan === 'enterprise' ? 80 : tenant.plan === 'professional' ? 50 : 20, // GB
        maxDisk: tenant.plan === 'enterprise' ? 500 : tenant.plan === 'professional' ? 200 : 50 // GB
      },
      usage: {
        instances: instances.length,
        cpu: usageStats.reduce((sum: any, s: any) => sum + s.cpu, 0),
        memory: usageStats.reduce((sum: any, s: any) => sum + s.memory, 0) / 1024 / 1024 / 1024, // Convert to GB
        disk: usageStats.reduce((sum: any, s: any) => sum + s.disk, 0) / 1024 / 1024 / 1024 // Convert to GB
      },
      quota: {
        instancesUsed: instances.length,
        instancesRemaining: tenant.maxInstances - instances.length
      }
    });
  } catch (error: any) {
    logger.error(`Resource limits error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch resource limits' });
  }
});

// Trigger resource cleanup
app.post('/api/logs/cleanup', verifyAuth, async (req: any, res: Response) => {
  try {
    const { tenantId } = req.user;
    const { days = 7, maxSize = 100 } = req.body; // days to keep, max size in MB

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const instances = await Instance.query().where({ tenantId });
    const results = [];

    for (const instance of instances) {
      try {
        const logDir = `${instance.logDir || instance.dir}/logs`;

        // Rotate logs larger than maxSize
        await execAsync(`find ${logDir} -name "*.log" -size +${maxSize}M -exec mv {} {}.old \\; 2>/dev/null`);

        // Delete old logs
        await execAsync(`find ${logDir} -name "*.log.old" -mtime +${days} -delete 2>/dev/null`);

        results.push({ instanceId: instance.id, status: 'success' });
      } catch (error: any) {
        results.push({ instanceId: instance.id, status: 'error', error: error.message });
      }
    }

    logger.info(`Log cleanup completed for tenant ${tenantId}`);
    res.json({ results });
  } catch (error: any) {
    logger.error(`Log cleanup error: ${error.message}`);
    res.status(500).json({ error: 'Failed to cleanup logs' });
  }
});

// Get audit logs
app.get('/api/audit-logs', verifyAuth, async (req: any, res: Response) => {
  try {
    const { tenantId } = req.user;
    const { limit = 100, instanceId, action } = req.query;

    let query = AuditLog.query().where({ tenantId }).orderBy('createdAt', 'desc').limit(Number(limit));

    if (instanceId) {
      query = query.andWhere({ instanceId });
    }

    if (action) {
      query = query.andWhere('action', 'like', `%${action}%`);
    }

    const logs = await query;
    res.json(logs);
  } catch (error: any) {
    logger.error(`Audit logs fetch error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'monitor-service', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Monitor Service listening on port ${PORT}`);
});

export default app;
