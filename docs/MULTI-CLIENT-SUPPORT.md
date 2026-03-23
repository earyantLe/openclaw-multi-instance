# OpenClaw 多客户端支持

## 概述

OpenClaw 现在支持管理多种 AI 客户端实例，包括：

- **Claude Code** - 默认的 OpenClaw 客户端
- **Qclaw** - 类似 Claude Code 的开源替代
- **WorkBuddy** - 基于环境变量的客户端
- **Aider** - 支持模型和目录参数的 CLI 工具

## 架构设计

### 1. 数据库扩展

#### clients 表
```sql
CREATE TABLE clients (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    client_type VARCHAR(100) NOT NULL,
    command VARCHAR(500) NOT NULL,
    config_dir VARCHAR(500),
    workspace_dir VARCHAR(500),
    profile_support BOOLEAN DEFAULT true,
    profile_format VARCHAR(255),
    gateway_command VARCHAR(500),
    env_template JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true
);
```

#### instances 表扩展
```sql
ALTER TABLE instances
    ADD COLUMN client_id UUID REFERENCES clients(id),
    ADD COLUMN client_type VARCHAR(100) DEFAULT 'claude-code',
    ADD COLUMN model VARCHAR(255),
    ADD COLUMN env_config JSONB DEFAULT '{}';
```

### 2. ClientManager 类

核心服务类，负责：

- 注册和加载客户端配置
- 构建客户端特定的启动命令
- 生成环境变量配置

```typescript
class ClientManager {
  async registerClient(client: Client): Promise<void>
  async loadClients(tenantId?: string): Promise<void>
  async getClient(clientNameOrType: string): Promise<Client | undefined>
  async buildCommand(instance: Instance): Promise<string>
  async buildEnv(instance: Instance): Promise<Record<string, string>>
  static getDefaultClients(): Client[]
}
```

## 客户端配置示例

### Claude Code
```json
{
  "name": "Claude Code",
  "clientType": "claude-code",
  "command": "openclaw",
  "profileSupport": true,
  "profileFormat": "--profile {name}",
  "gatewayCommand": "gateway --port {port} --allow-unconfigured",
  "configDir": "~/.claude",
  "workspaceDir": "~/.claude/projects"
}
```

### Qclaw
```json
{
  "name": "Qclaw",
  "clientType": "qclaw",
  "command": "qclaw",
  "profileSupport": true,
  "profileFormat": "--profile {name}",
  "gatewayCommand": "serve --port {port}",
  "configDir": "~/.qclaw",
  "workspaceDir": "~/.qclaw/workspaces"
}
```

### WorkBuddy（无 profile 支持）
```json
{
  "name": "WorkBuddy",
  "clientType": "workbuddy",
  "command": "workbuddy",
  "profileSupport": false,
  "gatewayCommand": "start --port {port}",
  "envTemplate": {
    "WORKBUDDY_PORT": "{port}",
    "WORKBUDDY_WORKSPACE": "{workspace}"
  }
}
```

### Aider
```json
{
  "name": "Aider",
  "clientType": "aider",
  "command": "aider",
  "profileSupport": true,
  "profileFormat": "--model {model} --dir {workspace}"
}
```

## API 端点

### 获取可用客户端列表
```bash
GET /api/clients
Authorization: Bearer <token>

Response:
[
  {
    "name": "Claude Code",
    "clientType": "claude-code",
    "command": "openclaw",
    "profileSupport": true,
    "profileFormat": "--profile {name}",
    "source": "default"
  },
  ...
]
```

### 注册自定义客户端
```bash
POST /api/clients
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "CustomClient",
  "clientType": "custom",
  "command": "custom-ai",
  "profileSupport": true,
  "profileFormat": "--config {name}",
  "gatewayCommand": "serve --port {port}"
}
```

### 创建指定客户端的实例
```bash
POST /api/instances
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "my-qclaw-instance",
  "clientType": "qclaw",
  "port": 18790,
  "workspace": "/path/to/workspace"
}
```

### 启动实例（自动使用对应客户端命令）
```bash
POST /api/instances/:id/start
Authorization: Bearer <token>
```

## 命令构建逻辑

ClientManager 根据客户端配置构建启动命令：

1. **支持 profile 的客户端**（Claude Code、Qclaw）：
   ```
   {command} {profileFormat} {gatewayCommand}
   例：openclaw --profile instance_xxx gateway --port 18790
   ```

2. **不支持 profile 的客户端**（WorkBuddy）：
   ```
   {command} {gatewayCommand}
   例：workbuddy start --port 18790
   环境变量：WORKBUDDY_PORT=18790, WORKBUDDY_WORKSPACE=/path
   ```

3. **特殊格式客户端**（Aider）：
   ```
   {command} {profileFormat}
   例：aider --model claude-3-5-sonnet --dir /workspace
   ```

## 环境变量模板

对于不支持 profile 的客户端，使用环境变量传递配置：

```typescript
envTemplate: {
  "WORKBUDDY_PORT": "{port}",
  "WORKBUDDY_WORKSPACE": "{workspace}",
  "CUSTOM_VAR": "static_value"
}
```

模板变量会自动替换：
- `{port}` - 实例端口
- `{workspace}` - 工作空间路径
- `{profile}` - profile 名称

## 数据库迁移

执行迁移脚本添加多客户端支持：

```bash
psql -U postgres -d openclaw -f packages/db/migrations/002_add_multi_client_support.sql
```

迁移内容：
- 创建 `clients` 表
- 为 `instances` 表添加客户端相关字段
- 插入默认客户端配置
- 创建索引优化查询性能

## 使用示例

### 1. 查看所有可用客户端
```javascript
const clients = await fetch('/api/clients', {
  headers: { Authorization: `Bearer ${token}` }
});
console.log(await clients.json());
```

### 2. 创建 Qclaw 实例
```javascript
await fetch('/api/instances', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'my-qclaw',
    clientType: 'qclaw',
    port: 18790
  })
});
```

### 3. 创建 Aider 实例（指定模型）
```javascript
await fetch('/api/instances', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'aider-project',
    clientType: 'aider',
    model: 'claude-3-5-sonnet',
    workspace: '/path/to/project'
  })
});
```

## 扩展新客户端

### 步骤

1. **添加客户端配置到数据库**
   ```sql
   INSERT INTO clients (tenant_id, name, client_type, command, profile_support, profile_format, gateway_command)
   VALUES ('your-tenant-id', 'NewClient', 'newclient', 'newclient-cli', true, '--profile {name}', 'server --port {port}');
   ```

2. **或使用 API 注册**
   ```bash
   POST /api/clients
   {
     "name": "NewClient",
     "clientType": "newclient",
     "command": "newclient-cli",
     "profileSupport": true,
     "profileFormat": "--profile {name}",
     "gatewayCommand": "server --port {port}"
   }
   ```

3. **测试启动命令**
   ```javascript
   const client = await clientManager.getClient('newclient');
   const command = await clientManager.buildCommand(instance);
   console.log(command); // newclient-cli --profile xxx server --port 18790
   ```

## 注意事项

1. **客户端类型唯一性**：每个租户下同一客户端类型只能有一个配置
2. **默认客户端**：未指定 clientType 时默认为 `claude-code`
3. **环境变量优先级**：instance.envConfig > client.envTemplate > baseEnv
4. **命令安全**：启动命令会进行参数转义，防止注入攻击

## 未来计划

- [ ] Web Console 客户端管理界面
- [ ] 客户端配置模板市场
- [ ] 客户端特定的健康检查
- [ ] 客户端版本管理和自动更新
- [ ] 多客户端并发测试框架
