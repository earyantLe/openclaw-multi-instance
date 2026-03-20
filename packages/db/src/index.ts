import { Model, Pojo } from 'objection';
import Knex from 'knex';

// Initialize Knex
const knex = Knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'openclaw',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: {
    min: 2,
    max: 10
  }
});

Model.knex(knex);

// Tenant Model
export class Tenant extends Model {
  id!: string;
  name!: string;
  slug!: string;
  plan!: 'community' | 'professional' | 'enterprise';
  maxInstances!: number;
  settings?: Record<string, any>;
  createdAt!: Date;
  updatedAt!: Date;

  static tableName = 'tenants';
  static idColumn = 'id';

  static relationMappings = {
    users: {
      relation: Model.HasManyRelation,
      modelClass: User,
      join: {
        from: 'tenants.id',
        to: 'users.tenantId'
      }
    },
    instances: {
      relation: Model.HasManyRelation,
      modelClass: Instance,
      join: {
        from: 'tenants.id',
        to: 'instances.tenantId'
      }
    }
  };

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json);
    delete json.passwordHash;
    return json;
  }
}

// User Model
export class User extends Model {
  id!: string;
  tenantId!: string;
  email!: string;
  passwordHash!: string;
  name!: string;
  status!: 'active' | 'inactive' | 'suspended';
  lastLoginAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;

  static tableName = 'users';
  static idColumn = 'id';

  static relationMappings = {
    tenant: {
      relation: Model.BelongsToOneRelation,
      modelClass: Tenant,
      join: {
        from: 'users.tenantId',
        to: 'tenants.id'
      }
    },
    roles: {
      relation: Model.ManyToManyRelation,
      modelClass: Role,
      join: {
        from: 'users.id',
        through: {
          from: 'user_roles.userId',
          to: 'user_roles.roleId'
        },
        to: 'roles.id'
      }
    }
  };

  $formatJson(json: Pojo): Pojo {
    json = super.$formatJson(json);
    delete json.passwordHash;
    return json;
  }
}

// Role Model
export class Role extends Model {
  id!: string;
  name!: string;
  description?: string;
  isDefault!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static tableName = 'roles';
  static idColumn = 'id';

  static relationMappings = {
    permissions: {
      relation: Model.ManyToManyRelation,
      modelClass: Permission,
      join: {
        from: 'roles.id',
        through: {
          from: 'role_permissions.roleId',
          to: 'role_permissions.permissionId'
        },
        to: 'permissions.id'
      }
    },
    users: {
      relation: Model.ManyToManyRelation,
      modelClass: User,
      join: {
        from: 'roles.id',
        through: {
          from: 'user_roles.roleId',
          to: 'user_roles.userId'
        },
        to: 'users.id'
      }
    }
  };
}

// Permission Model
export class Permission extends Model {
  id!: string;
  name!: string;
  description?: string;
  resource!: string;
  action!: string;
  createdAt!: Date;
  updatedAt!: Date;

  static tableName = 'permissions';
  static idColumn = 'id';

  static relationMappings = {
    roles: {
      relation: Model.ManyToManyRelation,
      modelClass: Role,
      join: {
        from: 'permissions.id',
        through: {
          from: 'role_permissions.permissionId',
          to: 'role_permissions.roleId'
        },
        to: 'roles.id'
      }
    }
  };
}

// Instance Model
export class Instance extends Model {
  id!: string;
  tenantId!: string;
  name!: string;
  profile!: string;
  port!: number;
  workspace?: string;
  status!: 'stopped' | 'running' | 'error' | 'starting' | 'stopping';
  pid?: number;
  config?: Record<string, any>;
  lastStartedAt?: Date;
  lastStoppedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;

  static tableName = 'instances';
  static idColumn = 'id';

  static relationMappings = {
    tenant: {
      relation: Model.BelongsToOneRelation,
      modelClass: Tenant,
      join: {
        from: 'instances.tenantId',
        to: 'tenants.id'
      }
    },
    backups: {
      relation: Model.HasManyRelation,
      modelClass: Backup,
      join: {
        from: 'instances.id',
        to: 'backups.instanceId'
      }
    },
    auditLogs: {
      relation: Model.HasManyRelation,
      modelClass: AuditLog,
      join: {
        from: 'instances.id',
        to: 'audit_logs.instanceId'
      }
    }
  };
}

// Backup Model
export class Backup extends Model {
  id!: string;
  tenantId!: string;
  instanceId!: string;
  name!: string;
  path!: string;
  size!: number;
  status!: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  createdAt!: Date;
  updatedAt!: Date;

  static tableName = 'backups';
  static idColumn = 'id';

  static relationMappings = {
    instance: {
      relation: Model.BelongsToOneRelation,
      modelClass: Instance,
      join: {
        from: 'backups.instanceId',
        to: 'instances.id'
      }
    }
  };
}

// AuditLog Model
export class AuditLog extends Model {
  id!: string;
  tenantId!: string;
  userId?: string;
  instanceId?: string;
  action!: string;
  resource!: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt!: Date;

  static tableName = 'audit_logs';
  static idColumn = 'id';

  static relationMappings = {
    user: {
      relation: Model.BelongsToOneRelation,
      modelClass: User,
      join: {
        from: 'audit_logs.userId',
        to: 'users.id'
      }
    },
    instance: {
      relation: Model.BelongsToOneRelation,
      modelClass: Instance,
      join: {
        from: 'audit_logs.instanceId',
        to: 'instances.id'
      }
    }
  };
}

// Export knex instance for migrations
export { knex as db };

// Default exports for convenience
export default {
  Tenant,
  User,
  Role,
  Permission,
  Instance,
  Backup,
  AuditLog,
  db: knex
};
