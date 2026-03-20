// Shared types for OpenClaw Multi-Instance

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'community' | 'professional' | 'enterprise';
  maxInstances: number;
  settings?: Record<string, any>;
}

export interface Instance {
  id: string;
  tenantId: string;
  name: string;
  profile: string;
  port: number;
  workspace?: string;
  status: InstanceStatus;
  pid?: number;
  config?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type InstanceStatus = 'stopped' | 'running' | 'error' | 'starting' | 'stopping';

export interface Backup {
  id: string;
  tenantId: string;
  instanceId: string;
  name: string;
  path: string;
  size: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  createdAt: Date;
}

// RBAC Permissions
export const PERMISSIONS = {
  // Instance permissions
  INSTANCES_READ: 'instances:read',
  INSTANCES_CREATE: 'instances:create',
  INSTANCES_UPDATE: 'instances:update',
  INSTANCES_DELETE: 'instances:delete',
  INSTANCES_START: 'instances:start',
  INSTANCES_STOP: 'instances:stop',
  INSTANCES_RESTART: 'instances:restart',

  // Backup permissions
  BACKUPS_READ: 'backups:read',
  BACKUPS_CREATE: 'backups:create',
  BACKUPS_RESTORE: 'backups:restore',
  BACKUPS_DELETE: 'backups:delete',

  // User permissions
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',

  // Tenant permissions
  TENANTS_READ: 'tenants:read',
  TENANTS_UPDATE: 'tenants:update',
  TENANTS_DELETE: 'tenants:delete',

  // Admin permissions
  ADMIN_AUDIT_LOGS: 'admin:audit_logs',
  ADMIN_SYSTEM: 'admin:system',
  ADMIN_BILLING: 'admin:billing'
} as const;

// Default roles
export const DEFAULT_ROLES = {
  ADMIN: {
    name: 'admin',
    permissions: Object.values(PERMISSIONS)
  },
  MEMBER: {
    name: 'member',
    permissions: [
      PERMISSIONS.INSTANCES_READ,
      PERMISSIONS.INSTANCES_START,
      PERMISSIONS.INSTANCES_STOP,
      PERMISSIONS.BACKUPS_READ,
      PERMISSIONS.BACKUPS_CREATE
    ]
  },
  VIEWER: {
    name: 'viewer',
    permissions: [
      PERMISSIONS.INSTANCES_READ,
      PERMISSIONS.BACKUPS_READ
    ]
  }
};

// API Response types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Config types
export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  jwtSecret: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  logLevel: string;
  logDir: string;
}

// Environment variables helper
export const getConfig = (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as any) || 'development',
  port: parseInt(process.env.PORT || '3000'),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT || '5432'),
  dbName: process.env.DB_NAME || 'openclaw',
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.DB_PASSWORD || 'postgres',
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || 'logs'
});
