-- OpenClaw Enterprise Database Schema
-- PostgreSQL 16+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants table (multi-tenant isolation)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'community',
    max_instances INTEGER NOT NULL DEFAULT 10,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

-- Roles table
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name)
);

-- Permissions table
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User-Roles junction table
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

-- Role-Permissions junction table
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Instances table
CREATE TABLE instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    profile VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    workspace VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'stopped',
    pid INTEGER,
    config JSONB DEFAULT '{}',
    last_started_at TIMESTAMP WITH TIME ZONE,
    last_stopped_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, profile)
);

-- Backups table
CREATE TABLE backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    path VARCHAR(500) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    instance_id UUID REFERENCES instances(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_instances_tenant_id ON instances(tenant_id);
CREATE INDEX idx_instances_status ON instances(status);
CREATE INDEX idx_backups_tenant_id ON backups(tenant_id);
CREATE INDEX idx_backups_instance_id ON backups(instance_id);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- Insert default roles
INSERT INTO roles (name, description, is_default) VALUES
    ('admin', 'Full access to all resources', false),
    ('member', 'Standard user access', true),
    ('viewer', 'Read-only access', false);

-- Insert default permissions
INSERT INTO permissions (name, resource, action) VALUES
    -- Instance permissions
    ('instances:read', 'instances', 'read'),
    ('instances:create', 'instances', 'create'),
    ('instances:update', 'instances', 'update'),
    ('instances:delete', 'instances', 'delete'),
    ('instances:start', 'instances', 'start'),
    ('instances:stop', 'instances', 'stop'),
    ('instances:restart', 'instances', 'restart'),
    -- Backup permissions
    ('backups:read', 'backups', 'read'),
    ('backups:create', 'backups', 'create'),
    ('backups:restore', 'backups', 'restore'),
    ('backups:delete', 'backups', 'delete'),
    -- User permissions
    ('users:read', 'users', 'read'),
    ('users:create', 'users', 'create'),
    ('users:update', 'users', 'update'),
    ('users:delete', 'users', 'delete'),
    -- Tenant permissions
    ('tenants:read', 'tenants', 'read'),
    ('tenants:update', 'tenants', 'update'),
    -- Admin permissions
    ('admin:audit_logs', 'audit_logs', 'read'),
    ('admin:system', 'system', 'manage');

-- Assign all permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin';

-- Assign basic permissions to member role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'member'
AND p.name IN (
    'instances:read', 'instances:start', 'instances:stop',
    'backups:read', 'backups:create'
);

-- Assign read-only permissions to viewer role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'viewer'
AND p.name IN ('instances:read', 'backups:read');
