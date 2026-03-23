-- Migration: Add monitoring and alerting tables
-- Creates resource_metrics, alert_rules, and alerts tables

-- Resource metrics table for historical data
CREATE TABLE IF NOT EXISTS resource_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    cpu_usage NUMERIC(5,2) DEFAULT 0, -- CPU percentage (0-100)
    memory_usage NUMERIC(10,2) DEFAULT 0, -- Memory in MB
    disk_usage NUMERIC(15,0) DEFAULT 0, -- Disk in bytes
    network_rx NUMERIC(15,0) DEFAULT 0, -- Network received in bytes
    network_tx NUMERIC(15,0) DEFAULT 0, -- Network transmitted in bytes
    process_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_resource_metrics_tenant ON resource_metrics(tenant_id);
CREATE INDEX idx_resource_metrics_instance ON resource_metrics(instance_id);
CREATE INDEX idx_resource_metrics_created ON resource_metrics(created_at DESC);
CREATE INDEX idx_resource_metrics_tenant_time ON resource_metrics(tenant_id, created_at DESC);

-- Alert rules table
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) NOT NULL, -- 'cpu', 'memory', 'disk', 'instance_status', 'network'
    condition_type VARCHAR(50) NOT NULL, -- 'greater_than', 'less_than', 'equals', 'change_percent'
    threshold NUMERIC(15,2) NOT NULL,
    duration_seconds INTEGER DEFAULT 300, -- Time threshold must be exceeded (default 5 min)
    severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
    notification_channels JSONB DEFAULT '[]', -- ['email', 'webhook', 'slack']
    webhook_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_rules_tenant ON alert_rules(tenant_id);
CREATE INDEX idx_alert_rules_active ON alert_rules(is_active) WHERE is_active = true;

-- Alerts table (triggered instances)
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    instance_id UUID REFERENCES instances(id) ON DELETE SET NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metric_value NUMERIC(15,2),
    threshold_value NUMERIC(15,2),
    status VARCHAR(20) NOT NULL DEFAULT 'firing', -- 'firing', 'acknowledged', 'resolved'
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_tenant ON alerts(tenant_id);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX idx_alerts_tenant_status ON alerts(tenant_id, status);

-- Default alert rules for all tenants (tenant_id = 00000000-0000-0000-0000-000000000000)
-- These will be copied to each tenant during tenant initialization
INSERT INTO alert_rules (tenant_id, name, description, resource_type, condition_type, threshold, duration_seconds, severity, is_active) VALUES
    ('00000000-0000-0000-0000-000000000000', '高 CPU 使用率', '实例 CPU 使用率超过 80%', 'cpu', 'greater_than', 80, 300, 'warning', true),
    ('00000000-0000-0000-0000-000000000000', '严重高 CPU 使用率', '实例 CPU 使用率超过 95%', 'cpu', 'greater_than', 95, 120, 'critical', true),
    ('00000000-0000-0000-0000-000000000000', '高内存使用率', '实例内存使用率超过 80%', 'memory', 'greater_than', 80, 300, 'warning', true),
    ('00000000-0000-0000-0000-000000000000', '高磁盘使用率', '实例磁盘使用超过 5GB', 'disk', 'greater_than', 5368709120, 600, 'warning', true),
    ('00000000-0000-0000-0000-000000000000', '实例异常停止', '实例状态变为 error', 'instance_status', 'equals', 0, 0, 'critical', true)
ON CONFLICT DO NOTHING;

-- Update updated_at timestamp trigger
DROP TRIGGER IF EXISTS update_alert_rules_updated_at ON alert_rules;
CREATE TRIGGER update_alert_rules_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE resource_metrics IS 'Historical resource usage metrics for instances';
COMMENT ON TABLE alert_rules IS 'Alert rule definitions for monitoring';
COMMENT ON TABLE alerts IS 'Triggered alert instances';
COMMENT ON COLUMN alert_rules.duration_seconds IS 'Duration threshold must be exceeded before alert fires';
COMMENT ON COLUMN alert_rules.notification_channels IS 'JSON array of notification channels: ["email", "webhook", "slack", "discord"]';
COMMENT ON COLUMN alerts.status IS 'Alert lifecycle status: firing -> acknowledged -> resolved';
