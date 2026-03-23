# 多客户端支持扩展方案

## 背景

当前 OpenClaw Enterprise 主要支持 Claude Code (通过 `openclaw` 命令) 的实例管理。为了支持更多 AI 客户端（如 Qclaw、WorkBuddy、Aider 等），需要进行架构扩展。

## 支持的客户端类型

### 1. Claude Code 系列
```yaml
client_type: claude-code
command: openclaw
profile_support: true
profile_format: "--profile {name}"
gateway_command: "gateway --port {port} --allow-unconfigured"
config_dir: "~/.claude"
workspace_dir: "~/.claude/projects"
```

### 2. Qclaw 系列
```yaml
client_type: qclaw
command: qclaw
profile_support: true
profile_format: "--profile {name}"
gateway_command: "serve --port {port}"
config_dir: "~/.qclaw"
workspace_dir: "~/.qclaw/workspaces"
```

### 3. WorkBuddy 系列
```yaml
client_type: workbuddy
command: workbuddy
profile_support: false
env_config: true
gateway_command: "start --port {port}"
config_dir: "~/.workbuddy"
workspace_dir: "~/.workbuddy/projects"
```

### 4. Aider 系列
```yaml
client_type: aider
command: aider
profile_support: true
profile_format: "--model {model} --dir {workspace}"
gateway_command: null  # Aider 是项目级别的
config_dir: "~/.aider"
workspace_dir: "project-specific"
```

### 5. 通用客户端
```yaml
client_type: generic
command: <custom>
profile_support: configurable
env_config: configurable
gateway_command: <custom>
config_dir: <custom>
workspace_dir: <custom>
```

## 数据库扩展

### 新增 clients 表

```sql
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    client_type VARCHAR(50) NOT NULL,
    command VARCHAR(255) NOT NULL,
    config_dir VARCHAR(500),
    workspace_dir VARCHAR(500),
    profile_support BOOLEAN DEFAULT true,
    profile_format VARCHAR(255),
    gateway_command VARCHAR(500),
    env_template JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name)
);

-- 预置客户端配置
INSERT INTO clients (name, client_type, command, profile_support, profile_format, gateway_command, config_dir, workspace_dir) VALUES
('Claude Code', 'claude-code', 'openclaw', true, '--profile {name}', 'gateway --port {port} --allow-unconfigured', '~/.claude', '~/.claude/projects'),
('Qclaw', 'qclaw', 'qclaw', true, '--profile {name}', 'serve --port {port}', '~/.qclaw', '~/.qclaw/workspaces'),
('WorkBuddy', 'workbuddy', 'workbuddy', false, null, 'start --port {port}', '~/.workbuddy', '~/.workbuddy/projects'),
('Aider', 'aider', 'aider', true, '--model {model}', null, '~/.aider', 'project-specific');
```

### 修改 instances 表

```sql
ALTER TABLE instances ADD COLUMN client_id UUID REFERENCES clients(id);
ALTER TABLE instances ADD COLUMN client_type VARCHAR(50) DEFAULT 'claude-code';
ALTER TABLE instances ADD COLUMN model VARCHAR(100);
ALTER TABLE instances ADD COLUMN env_config JSONB DEFAULT '{}';
```

## 服务层扩展

### Instance Service 修改

```typescript
// apps/instance-service/src/services/ClientManager.ts

interface ClientConfig {
  name: string;
  clientType: string;
  command: string;
  profileSupport: boolean;
  profileFormat?: string;
  gatewayCommand?: string;
  configDir?: string;
  workspaceDir?: string;
  envTemplate?: Record<string, any>;
}

export class ClientManager {
  private clients: Map<string, ClientConfig> = new Map();

  async registerClient(config: ClientConfig): Promise<void> {
    this.clients.set(config.name, config);
  }

  async getClient(clientName: string): Promise<ClientConfig | undefined> {
    return this.clients.get(clientName);
  }

  async buildCommand(instance: Instance): Promise<string> {
    const client = await this.getClient(instance.clientType);
    if (!client) {
      throw new Error(`Unknown client type: ${instance.clientType}`);
    }

    const profileName = instance.profile;
    const port = instance.port;
    const workspace = instance.workspace;

    if (client.profileSupport && client.profileFormat) {
      const profileArg = client.profileFormat.replace('{name}', profileName);
      const gateway = client.gatewayCommand
        ? client.gatewayCommand.replace('{port}', String(port))
        : '';
      return `${client.command} ${profileArg} ${gateway}`;
    }

    // 不支持 profile 的客户端，使用环境变量
    return `${client.command} ${client.gatewayCommand || ''}`;
  }

  async buildEnv(instance: Instance): Promise<Record<string, string>> {
    const client = await this.getClient(instance.clientType);
    if (!client) {
      return {};
    }

    const baseEnv = {
      OPENCLAW_PORT: String(instance.port),
      OPENCLAW_INSTANCE_ID: String(instance.id),
      OPENCLAW_INSTANCE_NAME: instance.name,
      OPENCLAW_WORKSPACE: instance.workspace || ''
    };

    // 合并客户端特定的环境变量
    return { ...baseEnv, ...instance.envConfig };
  }
}
```

### 修改启动逻辑

```typescript
// apps/instance-service/src/index.ts (修改 start_instance)

app.post('/api/instances/:id/start', verifyAuth, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const instance = await Instance.query().findOne({ id, tenantId });
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    // 获取客户端配置
    const clientManager = new ClientManager();
    const client = await clientManager.getClient(instance.clientType);

    if (!client) {
      return res.status(400).json({ error: `Unknown client type: ${instance.clientType}` });
    }

    // 构建启动命令
    const command = await clientManager.buildCommand(instance);
    const env = await clientManager.buildEnv(instance);

    // 启动进程
    const { spawn } = await import('child_process');
    const proc = spawn(command, {
      shell: true,
      env: { ...process.env, ...env },
      cwd: instance.workspace || process.cwd()
    });

    // 记录 PID
    await Instance.query().patchAndFetchById(id, {
      status: 'running',
      pid: proc.pid,
      lastStartedAt: new Date(),
      updatedAt: new Date()
    });

    logger.info(`Instance started: ${instance.name}`, {
      tenantId,
      instanceId: id,
      clientType: instance.clientType,
      pid: proc.pid
    });

    res.json({ status: 'success', message: 'Instance started', pid: proc.pid });
  } catch (error: any) {
    logger.error(`Instance start error: ${error.message}`);
    res.status(500).json({ error: 'Failed to start instance' });
  }
});
```

## API 扩展

### 客户端管理 API

```typescript
// GET /api/clients - 列出所有客户端
app.get('/api/clients', verifyAuth, async (req: any, res: Response) => {
  const { tenantId } = req.user;
  const clients = await Client.query().where({ tenantId, is_active: true });
  res.json(clients);
});

// POST /api/clients - 注册新客户端
app.post('/api/clients', verifyAuth, requirePermission('clients:create'), async (req: any, res: Response) => {
  const { name, clientType, command, profileSupport, profileFormat, gatewayCommand, configDir, workspaceDir, envTemplate } = req.body;

  const client = await Client.query().insertAndFetch({
    id: uuidv4(),
    tenantId: req.user.tenantId,
    name,
    clientType,
    command,
    profileSupport,
    profileFormat,
    gatewayCommand,
    configDir,
    workspaceDir,
    envTemplate,
    is_active: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  res.status(201).json(client);
});

// GET /api/clients/:id - 获取客户端详情
app.get('/api/clients/:id', verifyAuth, async (req: any, res: Response) => {
  const { id } = req.params;
  const client = await Client.query().findById(id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  res.json(client);
});

// PUT /api/clients/:id - 更新客户端配置
app.put('/api/clients/:id', verifyAuth, requirePermission('clients:update'), async (req: any, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  const client = await Client.query().patchAndFetchById(id, { ...updates, updatedAt: new Date() });
  res.json(client);
});

// DELETE /api/clients/:id - 删除客户端（软删除）
app.delete('/api/clients/:id', verifyAuth, requirePermission('clients:delete'), async (req: any, res: Response) => {
  const { id } = req.params;
  await Client.query().patchAndFetchById(id, { is_active: false, updatedAt: new Date() });
  res.json({ status: 'success', message: 'Client deactivated' });
});
```

## Web Console 扩展

### 客户端管理页面

```tsx
// apps/web-console/src/pages/Clients.tsx

import React, { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Switch, message, Typography, Popconfirm
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const Clients: React.FC = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchClients = async () => {
    setLoading(true);
    // TODO: API call
    // const response = await axios.get('/api/clients');
    // setClients(response.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreateClient = async (values: any) => {
    try {
      // TODO: API call
      // await axios.post('/api/clients', values);
      message.success('客户端添加成功！');
      setIsModalOpen(false);
      form.resetFields();
      fetchClients();
    } catch (error: any) {
      message.error(error.response?.data?.error || '添加失败');
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'clientType',
      key: 'clientType',
      render: (type: string) => {
        const colorMap: Record<string, string> = {
          'claude-code': 'blue',
          'qclaw': 'green',
          'workbuddy': 'orange',
          'aider': 'purple',
          'generic': 'default'
        };
        return <Tag color={colorMap[type] || 'default'}>{type}</Tag>;
      }
    },
    { title: '命令', dataIndex: 'command', key: 'command' },
    {
      title: 'Profile 支持',
      dataIndex: 'profileSupport',
      key: 'profileSupport',
      render: (support: boolean) => support ? '✅' : '❌'
    },
    { title: '配置目录', dataIndex: 'configDir', key: 'configDir' },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />}>编辑</Button>
          <Popconfirm title="确定停用此客户端？" onConfirm={() => handleDeleteClient(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>停用</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Typography.Title level={2}>AI 客户端管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
          添加客户端
        </Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={clients} rowKey="id" loading={loading} />
      </Card>

      <Modal title="添加 AI 客户端" open={isModalOpen} onCancel={() => { setIsModalOpen(false); form.resetFields(); }} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleCreateClient}>
          <Form.Item name="name" label="客户端名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：Qclaw" />
          </Form.Item>
          <Form.Item name="clientType" label="客户端类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Input placeholder="例如：qclaw" />
          </Form.Item>
          <Form.Item name="command" label="启动命令" rules={[{ required: true, message: '请输入命令' }]}>
            <Input placeholder="例如：qclaw" />
          </Form.Item>
          <Form.Item name="profileSupport" label="支持 Profile" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="profileFormat" label="Profile 格式">
            <Input placeholder="例如：--profile {name}" />
          </Form.Item>
          <Form.Item name="gatewayCommand" label="Gateway 命令">
            <Input placeholder="例如：serve --port {port}" />
          </Form.Item>
          <Form.Item name="configDir" label="配置目录">
            <Input placeholder="例如：~/.qclaw" />
          </Form.Item>
          <Form.Item name="workspaceDir" label="工作空间目录">
            <Input placeholder="例如：~/.qclaw/workspaces" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Clients;
```

## 实现路线图

### Phase 1 - 基础架构 (Week 1-2)
- [ ] 数据库 schema 扩展
- [ ] ClientManager 服务实现
- [ ] 客户端配置管理 API

### Phase 2 - 实例管理扩展 (Week 3-4)
- [ ] 修改实例启动/停止逻辑
- [ ] 支持多种客户端类型
- [ ] 环境变量管理

### Phase 3 - Web Console 扩展 (Week 5-6)
- [ ] 客户端管理页面
- [ ] 实例创建时选择客户端类型
- [ ] 客户端状态监控

### Phase 4 - 测试与文档 (Week 7-8)
- [ ] 集成测试
- [ ] 客户端配置模板
- [ ] 用户文档

## 结论

通过上述扩展，OpenClaw Enterprise 将能够管理多种 AI 客户端实例，包括：

1. **Claude Code** - Anthropic 官方 CLI
2. **Qclaw** - 社区衍生版本
3. **WorkBuddy** - 工作流自动化工具
4. **Aider** - Git 感知 AI 编程
5. **自定义客户端** - 通过通用配置支持

这将使 OpenClaw Enterprise 成为一个通用的**AI 助手多实例管理平台**，而不是仅限于单一客户端。
