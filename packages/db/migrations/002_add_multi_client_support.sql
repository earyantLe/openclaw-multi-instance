-- Migration: Add multi-client support
-- Creates clients table and extends instances table with client_type, model, env_config

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    client_type VARCHAR(100) NOT NULL,
    command VARCHAR(500) NOT NULL,
    config_dir VARCHAR(500),
    workspace_dir VARCHAR(500),
    profile_support BOOLEAN NOT NULL DEFAULT true,
    profile_format VARCHAR(255),
    gateway_command VARCHAR(500),
    env_template JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, client_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_client_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active) WHERE is_active = true;

-- Add columns to instances table for multi-client support
ALTER TABLE instances
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS client_type VARCHAR(100) NOT NULL DEFAULT 'claude-code',
    ADD COLUMN IF NOT EXISTS model VARCHAR(255),
    ADD COLUMN IF NOT EXISTS env_config JSONB DEFAULT '{}';

-- Create index for instances by client
CREATE INDEX IF NOT EXISTS idx_instances_client_id ON instances(client_id);
CREATE INDEX IF NOT EXISTS idx_instances_client_type ON instances(client_type);

-- Insert default client configurations (tenant_id will be updated by tenant initialization)
INSERT INTO clients (tenant_id, name, client_type, command, profile_support, profile_format, gateway_command, config_dir, workspace_dir, env_template, is_active) VALUES
    -- Claude Code (default)
    ('00000000-0000-0000-0000-000000000000', 'Claude Code', 'claude-code', 'openclaw', true, '--profile {name}', 'gateway --port {port} --allow-unconfigured', '~/.claude', '~/.claude/projects', '{}', true),

    -- Qclaw
    ('00000000-0000-0000-0000-000000000000', 'Qclaw', 'qclaw', 'qclaw', true, '--profile {name}', 'serve --port {port}', '~/.qclaw', '~/.qclaw/workspaces', '{}', true),

    -- WorkBuddy (uses environment variables instead of profiles)
    ('00000000-0000-0000-0000-000000000000', 'WorkBuddy', 'workbuddy', 'workbuddy', false, NULL, 'start --port {port}', '~/.workbuddy', '~/.workbuddy/projects', '{"WORKBUDDY_PORT": "{port}", "WORKBUDDY_WORKSPACE": "{workspace}"}', true),

    -- Aider (uses model and directory arguments)
    ('00000000-0000-0000-0000-000000000000', 'Aider', 'aider', 'aider', true, '--model {model} --dir {workspace}', NULL, '~/.aider', 'project-specific', '{}', true)
ON CONFLICT (tenant_id, client_type) DO NOTHING;

-- Update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for clients table
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE clients IS 'AI client configurations for multi-client instance management';
COMMENT ON COLUMN clients.client_type IS 'Unique identifier for client type (e.g., claude-code, qclaw, workbuddy, aider)';
COMMENT ON COLUMN clients.profile_format IS 'Profile argument format (e.g., --profile {name})';
COMMENT ON COLUMN clients.gateway_command IS 'Gateway/serve command template with {port} placeholder';
COMMENT ON COLUMN clients.env_template IS 'Environment variable template for clients without profile support';
