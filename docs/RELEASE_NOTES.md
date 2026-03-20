# OpenClaw Enterprise 版本发布说明

## v2.0.0-enterprise (2026-03-20)

### 重大变更

这是企业级重构版本，完全重新设计了系统架构，支持多租户和三种部署模式。

### 新增功能

#### 核心服务

**1. Auth Service (认证授权服务)**
- JWT 令牌认证
- RBAC 基于角色的权限控制
- 多租户隔离
- 用户/角色/权限管理
- 租户配额管理

**2. Instance Service (实例管理服务)**
- 实例 CRUD 操作
- 实例状态管理
- 备份管理
- 与 instance-manager.sh 集成

**3. Monitor Service (资源监控服务)**
- 实时 CPU/内存/磁盘监控
- 资源历史记录（最多 100 条）
- 租户资源配额查询
- 日志自动清理
- 审计日志查询

**4. Web Console (React 前端)**
- 仪表盘 - 实例统计和资源使用
- 实例管理 - 创建/启动/停止/重启/删除
- 备份管理 - 创建/还原/删除备份
- 用户管理 - 用户和角色管理
- 系统设置 - 租户和告警配置

#### 工具脚本

| 脚本 | 描述 |
|------|------|
| `scripts/api-client.js` | CLI 命令行工具（支持交互模式） |
| `scripts/init-tenant.js` | 租户和管理员初始化 |
| `scripts/migrate.sh` | 数据库迁移工具 |
| `scripts/test-api.sh` | API 测试套件 |

#### 部署配置

**Docker Compose (单机部署)**
- PostgreSQL 16
- Redis 7
- Auth Service
- Instance Service
- Monitor Service
- Web Console (NGINX)

**Kubernetes (生产部署)**
- 完整 manifests 配置
- Helm Chart
- 多副本支持
- 健康检查
- 资源限制

**CI/CD (GitHub Actions)**
- 自动构建和测试
- Docker 镜像构建和推送
- Staging 环境自动部署
- Production 环境手动部署

### 数据库设计

```sql
tenants          -- 租户表
users            -- 用户表
roles            -- 角色表
permissions      -- 权限表
user_roles       -- 用户 - 角色关联
role_permissions -- 角色 - 权限关联
instances        -- 实例表
backups          -- 备份表
audit_logs       -- 审计日志表
```

### API 端点

#### 认证 API
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户
- `POST /api/auth/refresh` - 刷新令牌

#### 租户 API
- `POST /api/tenants` - 创建租户
- `GET /api/tenants/:id` - 获取租户信息

#### 实例 API
- `GET /api/instances` - 列出实例
- `POST /api/instances` - 创建实例
- `POST /api/instances/:id/start` - 启动实例
- `POST /api/instances/:id/stop` - 停止实例
- `POST /api/instances/:id/restart` - 重启实例
- `DELETE /api/instances/:id` - 删除实例
- `POST /api/instances/:id/backup` - 创建备份

#### 资源 API
- `GET /api/resources/stats` - 资源统计
- `GET /api/resources/limits` - 资源配额
- `GET /api/instances/:id/resources` - 实例资源
- `GET /api/instances/:id/resources/history` - 资源历史
- `POST /api/logs/cleanup` - 日志清理

#### 审计 API
- `GET /api/audit-logs` - 审计日志查询

### 套餐限制

| 功能 | Community | Professional | Enterprise |
|------|-----------|--------------|------------|
| 最大实例数 | 10 | 50 | 200 |
| 最大用户数 | 3 | 25 | 100 |
| RBAC | ✅ | ✅ | ✅ |
| 审计日志 | ❌ | ✅ | ✅ |
| SSO/SAML | ❌ | ❌ | ✅ |
| 高可用部署 | ❌ | ✅ | ✅ |
| K8s 支持 | ❌ | ✅ | ✅ |
| 技术支持 | 社区 | 邮件 | 专属 |

### 快速开始

#### 1. Docker Compose 部署

```bash
# 配置环境
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET 和密码

# 启动服务
cd deploy/docker
docker-compose up -d

# 初始化租户
npm run init-tenant

# 访问管理面板
open http://localhost:8080
```

#### 2. 开发环境

```bash
# 安装依赖
npm install

# 启动所有服务
npm run dev

# 构建生产版本
npm run build

# 运行 API 测试
npm run test:api
```

#### 3. CLI 工具

```bash
# 交互式模式
npm run cli

# 登录
npm run cli -- login admin@example.com password tenant-uuid

# 列出实例
npm run cli -- instances

# 创建实例
npm run cli -- create my-instance 18790

# 健康检查
npm run cli -- health
```

### 技术栈

**前端:**
- React 18 + TypeScript
- Ant Design 5
- Zustand (状态管理)
- React Router 6
- Axios

**后端:**
- Node.js 22 + TypeScript
- Express.js
- JWT 认证
- Objection.js (ORM)

**数据库:**
- PostgreSQL 16
- Redis 7

**部署:**
- Docker & Docker Compose
- Kubernetes + Helm
- NGINX

### 升级指南

从 v1.x 升级到 v2.0：

```bash
# 1. 备份现有数据
./scripts/backup.sh backup all pre-upgrade-backup

# 2. 拉取新代码
git pull origin master

# 3. 运行数据库迁移
npm run migrate

# 4. 重新构建和启动
cd deploy/docker
docker-compose down
docker-compose up -d --build

# 5. 初始化租户（如果是首次）
npm run init-tenant
```

### 已知问题

- Web Console 的部分 API 调用仍在实现中
- 备份 API 需要 Instance Service 配合
- 监控服务的历史数据在重启后会丢失（需要 Redis 持久化）

### 后续计划

**v2.1.0 (Week 5-8)**
- [ ] 告警通知（邮件/Slack/Webhook）
- [ ] 批量操作优化
- [ ] 性能测试和优化
- [ ] 完整的 E2E 测试

**v2.2.0 (Week 9-12)**
- [ ] Helm Chart 完善
- [ ] 自动扩缩容
- [ ] 服务网格集成
- [ ] 多集群管理

**v2.3.0 (Week 13-16)**
- [ ] 计费系统集成
- [ ] 自助服务门户
- [ ] 多区域部署
- [ ] SSO/SAML 集成

### 联系方式

- 官网：https://openclaw.io
- 文档：https://docs.openclaw.io
- 邮箱：team@openclaw.io
- GitHub Issues: https://github.com/openclaw/openclaw-multi-instance/issues

---

*发布日期：2026-03-20*
