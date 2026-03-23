import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '@openclaw/logger';
import { Instance, Backup, AuditLog, Tenant } from '@openclaw/db';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        tenantId: string;
        email: string;
        name: string;
      };
    }
  }
}

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.MONITOR_PORT || 3003;

// Alert evaluation interval (seconds)
const ALERT_EVALUATION_INTERVAL = parseInt(process.env.ALERT_EVALUATION_INTERVAL || '60');

// In-memory alert state for tracking threshold duration
const alertStateCache = new Map<string, { value: number; since: number; ruleId: string }>();

// Prometheus-style metrics cache
const metricsCache = new Map<string, { labels: Record<string, string>; value: number; timestamp: number }>();

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

// Alert interfaces
interface AlertRule {
  id: string;
  tenantId: string;
  tenant_id?: string;
  name: string;
  resourceType: string;
  resource_type?: string;
  conditionType: string;
  condition_type?: string;
  threshold: number;
  durationSeconds: number;
  duration_seconds?: number;
  severity: string;
  isActive: boolean;
  is_active?: boolean;
  webhookUrl?: string;
  webhook_url?: string;
}

interface TriggeredAlert {
  id: string;
  ruleId: string;
  instanceId: string;
  severity: string;
  title: string;
  message: string;
  metricValue: number;
  thresholdValue: number;
  createdAt: Date;
}

async function getInstanceResources(instance: any): Promise<ResourceUsage> {
  let cpu = 0;
  let memory = 0;
  let disk = 0;
  let network = { rx: 0, tx: 0 };

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

      // Get network I/O for process
      try {
        const { stdout } = await execAsync(`cat /proc/${instance.pid}/net/dev 2>/dev/null | tail -n+3 | awk '{rx+=$2; tx+=$10} END {print rx, tx}'`);
        const [rx, tx] = stdout.trim().split(/\s+/).map(Number);
        network = { rx: rx || 0, tx: tx || 0 };
      } catch {
        // Network stats not available
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
  } catch (error: any) {
    logger.error(`Failed to get resources for instance ${instance.id}: ${error.message}`);
  }

  const usage: ResourceUsage = {
    instanceId: instance.id,
    cpu,
    memory,
    disk,
    network,
    timestamp: new Date()
  };

  // Store in metrics cache for Prometheus export
  const metricKey = `instance_${instance.id}`;
  metricsCache.set(`${metricKey}_cpu`, {
    labels: { instance_id: instance.id, instance_name: instance.name },
    value: cpu,
    timestamp: Date.now()
  });
  metricsCache.set(`${metricKey}_memory`, {
    labels: { instance_id: instance.id, instance_name: instance.name },
    value: memory,
    timestamp: Date.now()
  });
  metricsCache.set(`${metricKey}_disk`, {
    labels: { instance_id: instance.id, instance_name: instance.name },
    value: disk,
    timestamp: Date.now()
  });

  return usage;
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

// Alert evaluation
async function evaluateAlerts(instance: any, resources: ResourceUsage) {
  try {
    const { tenantId } = instance;

    // Get active alert rules for tenant
    const rules: AlertRule[] = [];
    try {
      // Use raw query since alert_rules table is not in Objection models
      const knex = (await import('knex')).default;
      const db = knex({
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'openclaw',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        }
      });

      const tenantRules = await db('alert_rules')
        .where({ tenant_id: tenantId, is_active: true });

      // Map database snake_case to camelCase
      rules.push(...tenantRules.map((r: any) => ({
        id: r.id,
        tenantId: r.tenant_id,
        name: r.name,
        resourceType: r.resource_type,
        resource_type: r.resource_type,
        conditionType: r.condition_type,
        condition_type: r.condition_type,
        threshold: parseFloat(r.threshold),
        durationSeconds: parseInt(r.duration_seconds),
        duration_seconds: parseInt(r.duration_seconds),
        severity: r.severity,
        isActive: r.is_active,
        is_active: r.is_active,
        webhookUrl: r.webhook_url,
        webhook_url: r.webhook_url
      })));

      await db.destroy();
    } catch (error: any) {
      // Table might not exist yet, skip alert evaluation
      logger.debug('Alert rules table not available yet');
      return;
    }

    for (const rule of rules) {
      const metricValue = getMetricValue(resources, rule.resourceType);
      if (metricValue === null) continue;

      const stateKey = `${instance.id}-${rule.id}`;
      const currentState = alertStateCache.get(stateKey);
      const now = Date.now();

      // Check if threshold is exceeded
      const isExceeded = checkThreshold(metricValue, rule.conditionType, rule.threshold);

      if (isExceeded) {
        // Check duration requirement
        if (!currentState || currentState.ruleId !== rule.id) {
          alertStateCache.set(stateKey, { value: metricValue, since: now, ruleId: rule.id });
        } else if (now - currentState.since >= rule.durationSeconds * 1000) {
          // Threshold exceeded for required duration, trigger alert
          await triggerAlert(instance, rule, metricValue);
          // Reset state to avoid duplicate alerts
          alertStateCache.delete(stateKey);
        }
      } else {
        // Reset state if threshold is no longer exceeded
        alertStateCache.delete(stateKey);
      }
    }
  } catch (error: any) {
    logger.error(`Alert evaluation error: ${error.message}`);
  }
}

function getMetricValue(resources: ResourceUsage, resourceType: string): number | null {
  switch (resourceType) {
    case 'cpu':
      return resources.cpu;
    case 'memory':
      return resources.memory;
    case 'disk':
      return resources.disk;
    case 'instance_status':
      return 0; // Handled separately
    default:
      return null;
  }
}

function checkThreshold(value: number, conditionType: string, threshold: number): boolean {
  switch (conditionType) {
    case 'greater_than':
      return value > threshold;
    case 'less_than':
      return value < threshold;
    case 'equals':
      return value === threshold;
    case 'greater_than_or_equal':
      return value >= threshold;
    case 'less_than_or_equal':
      return value <= threshold;
    default:
      return false;
  }
}

async function triggerAlert(instance: any, rule: AlertRule, metricValue: number) {
  try {
    const knex = (await import('knex')).default;
    const db = knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'openclaw',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
      }
    });

    const alert: TriggeredAlert = {
      id: `alert_${Date.now()}`,
      ruleId: rule.id,
      instanceId: instance.id,
      severity: rule.severity,
      title: `${rule.name} - ${instance.name}`,
      message: `实例 "${instance.name}" 触发告警：${rule.name}。当前值：${metricValue}, 阈值：${rule.threshold}`,
      metricValue,
      thresholdValue: rule.threshold,
      createdAt: new Date()
    };

    // Store alert in database
    try {
      await db('alerts').insert({
        id: alert.id,
        tenant_id: instance.tenantId,
        rule_id: rule.id,
        instance_id: instance.id,
        severity: rule.severity,
        title: alert.title,
        message: alert.message,
        metric_value: metricValue,
        threshold_value: rule.threshold,
        status: 'firing',
        created_at: new Date()
      });
    } catch (error: any) {
      logger.debug('Could not store alert in database');
    }

    await db.destroy();

    // Send notifications
    await sendNotifications(alert, instance, rule);

    logger.warn(`Alert triggered: ${alert.title}`, {
      instanceId: instance.id,
      severity: rule.severity,
      metricValue,
      threshold: rule.threshold
    });
  } catch (error: any) {
    logger.error(`Trigger alert error: ${error.message}`);
  }
}

async function sendNotifications(alert: TriggeredAlert, instance: any, rule: AlertRule) {
  try {
    const channels = ['webhook']; // Default to webhook for now

    for (const channel of channels) {
      if (channel === 'webhook' && rule.webhookUrl) {
        try {
          await fetch(rule.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert: alert,
              instance: { id: instance.id, name: instance.name },
              timestamp: new Date().toISOString()
            })
          });
        } catch (error: any) {
          logger.error(`Webhook notification failed: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    logger.error(`Send notification error: ${error.message}`);
  }
}

// Routes

// Get single instance resources
app.get('/api/instances/:id/resources', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user!;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const usage = await cacheResources(instance);
    // Evaluate alerts after getting resources
    await evaluateAlerts(instance, usage);
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
app.get('/api/resources/stats', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;

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
app.get('/api/resources/limits', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;

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
app.post('/api/logs/cleanup', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { days = 7, maxSize = 100 } = req.body; // days to keep, max size in MB

    const instances = await Instance.query().where({ tenantId });
    const results = [];

    for (const instance of instances) {
      try {
        const logDir = `${instance.workspace || '/tmp'}/logs`;

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
app.get('/api/audit-logs', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
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

// Prometheus-style metrics endpoint
app.get('/api/metrics', async (req: Request, res: Response) => {
  try {
    const lines: string[] = [];

    // Helper to format metrics
    const formatMetric = (name: string, help: string, type: string, labels: Record<string, string>, value: number, timestamp: number) => {
      const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
      return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}{${labelStr}} ${value} ${timestamp}`;
    };

    for (const [key, metric] of metricsCache.entries()) {
      lines.push(formatMetric(`openclaw_${key}`, 'OpenClaw instance metric', 'gauge', metric.labels, metric.value, metric.timestamp));
    }

    // Add system metrics
    const memUsage = process.memoryUsage();
    lines.push(`# HELP openclaw_service_memory_rss Service memory RSS\n# TYPE openclaw_service_memory_rss gauge`);
    lines.push(`openclaw_service_memory_rss ${memUsage.rss} ${Date.now()}`);

    res.set('Content-Type', 'text/plain');
    res.send(lines.join('\n') + '\n');
  } catch (error: any) {
    logger.error(`Metrics export error: ${error.message}`);
    res.status(500).send('Error exporting metrics');
  }
});

// Alert rules management
app.get('/api/alert-rules', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;

    let rules: any[] = [];
    try {
      const knex = (await import('knex')).default;
      const db = knex({
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'openclaw',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        }
      });
      rules = await db('alert_rules').where({ tenant_id: tenantId });
      await db.destroy();
    } catch (error: any) {
      // Table might not exist
      logger.debug('Alert rules table not available');
    }

    res.json(rules);
  } catch (error: any) {
    logger.error(`Alert rules list error: ${error.message}`);
    res.status(500).json({ error: 'Failed to list alert rules' });
  }
});

// Create alert rule
app.post('/api/alert-rules', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { name, description, resourceType, conditionType, threshold, durationSeconds, severity, webhookUrl } = req.body;

    const rule = {
      id: `rule_${Date.now()}`,
      tenant_id: tenantId,
      name,
      description: description || '',
      resource_type: resourceType,
      condition_type: conditionType,
      threshold,
      duration_seconds: durationSeconds || 300,
      severity: severity || 'warning',
      webhook_url: webhookUrl || null,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    try {
      const knex = (await import('knex')).default;
      const db = knex({
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'openclaw',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        }
      });
      await db('alert_rules').insert(rule);
      await db.destroy();
    } catch (error: any) {
      logger.debug('Could not store alert rule in database');
    }

    logger.info(`Alert rule created: ${name}`);
    res.status(201).json({ ...rule, tenantId, resourceType, conditionType, durationSeconds, isActive: true, webhookUrl });
  } catch (error: any) {
    logger.error(`Create alert rule error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

// Delete alert rule
app.delete('/api/alert-rules/:id', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    try {
      const knex = (await import('knex')).default;
      const db = knex({
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'openclaw',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        }
      });
      await db('alert_rules').where({ id, tenant_id: tenantId }).delete();
      await db.destroy();
    } catch (error: any) {
      logger.debug('Could not delete alert rule from database');
    }

    logger.info(`Alert rule deleted: ${id}`);
    res.json({ status: 'success' });
  } catch (error: any) {
    logger.error(`Delete alert rule error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

// Get alerts
app.get('/api/alerts', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { status, severity, limit = 100 } = req.query;

    let query: any[] = [];
    try {
      const knex = (await import('knex')).default;
      const db = knex({
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'openclaw',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        }
      });
      let q = db('alerts').where({ tenant_id: tenantId }).orderBy('created_at', 'desc').limit(Number(limit));

      if (status) {
        q = q.andWhere({ status });
      }

      if (severity) {
        q = q.andWhere({ severity });
      }

      query = await q;
      await db.destroy();
    } catch (error: any) {
      logger.debug('Alerts table not available');
    }

    res.json(query);
  } catch (error: any) {
    logger.error(`Alerts list error: ${error.message}`);
    res.status(500).json({ error: 'Failed to list alerts' });
  }
});

// Acknowledge alert
app.post('/api/alerts/:id/acknowledge', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;

    try {
      const knex = (await import('knex')).default;
      const db = knex({
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'openclaw',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        }
      });
      await db('alerts')
        .where({ id, tenant_id: tenantId })
        .update({
          status: 'acknowledged',
          acknowledged_by: userId,
          acknowledged_at: new Date()
        });
      await db.destroy();
    } catch (error: any) {
      logger.debug('Could not acknowledge alert');
    }

    logger.info(`Alert acknowledged: ${id}`);
    res.json({ status: 'success' });
  } catch (error: any) {
    logger.error(`Acknowledge alert error: ${error.message}`);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

// Resolve alert
app.post('/api/alerts/:id/resolve', verifyAuth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    try {
      const knex = (await import('knex')).default;
      const db = knex({
        client: 'pg',
        connection: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME || 'openclaw',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres'
        }
      });
      await db('alerts')
        .where({ id, tenant_id: tenantId })
        .update({
          status: 'resolved',
          resolved_at: new Date()
        });
      await db.destroy();
    } catch (error: any) {
      logger.debug('Could not resolve alert');
    }

    logger.info(`Alert resolved: ${id}`);
    res.json({ status: 'success' });
  } catch (error: any) {
    logger.error(`Resolve alert error: ${error.message}`);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'monitor-service', timestamp: new Date().toISOString() });
});

// Periodic alert evaluation
async function startAlertEvaluation() {
  try {
    const instances = await Instance.query().where({ status: 'running' });

    for (const instance of instances) {
      const resources = await getInstanceResources(instance);
      await evaluateAlerts(instance, resources);
    }
  } catch (error: any) {
    logger.error(`Periodic alert evaluation error: ${error.message}`);
  }
}

// Run alert evaluation periodically
const alertInterval = setInterval(startAlertEvaluation, ALERT_EVALUATION_INTERVAL * 1000);
logger.info(`Alert evaluation started, interval: ${ALERT_EVALUATION_INTERVAL}s`);

// Cleanup on process exit
process.on('SIGTERM', () => {
  clearInterval(alertInterval);
});

process.on('SIGINT', () => {
  clearInterval(alertInterval);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Monitor Service listening on port ${PORT}`);
});

export default app;
