# OpenClaw Enterprise - 企业级多实例部署管理系统

> 🚀 面向中型企业的 OpenClaw 多实例管理平台，支持单机部署、Kubernetes 集群和 SaaS 多租户模式

![License](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.x-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![React](https://img.shields.io/badge/React-18.2-61dafb)

## 版本对比

| 功能 | Community | Professional | Enterprise |
|------|-----------|--------------|------------|
| 最大实例数 | 10 | 50 | 200 |
| 用户数 | 3 | 25 | 100 |
| RBAC 权限控制 | ✅ | ✅ | ✅ |
| 备份管理 | ✅ | ✅ | ✅ |
| 审计日志 | ❌ | ✅ | ✅ |
| SSO 单点登录 | ❌ | ❌ | ✅ |
| 高可用部署 | ❌ | ✅ | ✅ |
| K8s 支持 | ❌ | ✅ | ✅ |
| 技术支持 | 社区 | 邮件 | 专属 |

## 快速开始

### 单机部署 (Docker Compose)

```bash
# 克隆仓库
git clone https://github.com/openclaw/openclaw-multi-instance.git
cd openclaw-multi-instance

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 JWT_SECRET 和数据库密码

# 启动所有服务
cd deploy/docker
docker-compose up -d

# 访问管理面板
open http://localhost:8080
```

### Kubernetes 部署

```bash
# 使用 Helm 部署
helm repo add openclaw https://charts.openclaw.io
helm install openclaw openclaw/openclaw -n openclaw --create-namespace

# 或使用 manifests 直接部署
kubectl apply -f deploy/kubernetes/manifests.yaml
```

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务
npm run dev

# 构建生产版本
npm run build

# 运行测试
npm test
```

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      OpenClaw Enterprise                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Web       │  │   Auth      │  │    Instance         │  │
│  │   Console   │  │   Service   │  │    Service          │  │
│  │   (React)   │  │   (JWT)     │  │    (Node.js)        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│              ┌───────────┴───────────┐                       │
│              │    PostgreSQL         │                       │
│              │    (Users/Tenants)    │                       │
│              └───────────────────────┘                       │
│              ┌───────────────────────┐                       │
│              │    Redis              │                       │
│              │    (Cache/Sessions)   │                       │
│              └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## 核心功能

### 1. 多租户架构
- 租户级别的数据隔离
- 基于角色的访问控制 (RBAC)
- 租户配额管理（实例数、用户数）

### 2. 实例管理
- 创建/启动/停止/重启/删除实例
- 实例配置在线编辑
- 实例状态实时监控

### 3. 备份还原
- 自动备份和手动备份
- 备份列表和恢复
- 备份下载

### 4. 用户管理
- 用户创建和权限分配
- 角色管理（Admin/Member/Viewer）
- 审计日志

## 技术栈

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
- PostgreSQL 16 (主数据库)
- Redis 7 (缓存和会话)

**部署:**
- Docker & Docker Compose
- Kubernetes + Helm
- NGINX (反向代理)

## 目录结构

```
openclaw-multi-instance/
├── apps/
│   ├── auth-service/        # 认证授权服务
│   ├── instance-service/    # 实例管理服务
│   └── web-console/         # Web 控制台
├── packages/
│   ├── common/              # 共享工具和类型
│   ├── db/                  # 数据库模型
│   └── logger/              # 日志服务
├── deploy/
│   ├── docker/              # Docker 配置
│   ├── kubernetes/          # K8s 配置
│   └── saas/                # SaaS 部署配置
└── scripts/
    ├── setup.sh             # 安装脚本
    ├── backup.sh            # 备份脚本
    └── health-check.sh      # 健康检查
```

## API 接口

### 认证 API

```bash
# 用户登录
POST /api/auth/login
{
  "email": "admin@example.com",
  "password": "password",
  "tenantId": "uuid"
}

# 用户注册
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password",
  "name": "User Name",
  "tenantId": "uuid"
}

# 获取当前用户
GET /api/auth/me
Authorization: Bearer <token>
```

### 实例 API

```bash
# 创建实例
POST /api/instances
{
  "name": "instance-api",
  "port": 18790,
  "workspace": "~/projects/api"
}

# 获取实例列表
GET /api/instances

# 启动实例
POST /api/instances/:id/start

# 停止实例
POST /api/instances/:id/stop

# 删除实例
DELETE /api/instances/:id
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| DB_HOST | PostgreSQL 主机 | localhost |
| DB_PORT | PostgreSQL 端口 | 5432 |
| DB_NAME | 数据库名称 | openclaw |
| DB_USER | 数据库用户 | postgres |
| DB_PASSWORD | 数据库密码 | - |
| JWT_SECRET | JWT 密钥 | - |
| JWT_EXPIRES_IN | Token 有效期 | 24h |
| AUTH_PORT | Auth 服务端口 | 3001 |
| INSTANCE_PORT | Instance 服务端口 | 3002 |
| WEB_PORT | Web 控制台端口 | 3000 |

## 开发指南

### 添加新服务

1. 在 `apps/` 目录下创建新的服务目录
2. 创建 `package.json` 并添加 dependencies
3. 创建 `tsconfig.json` 配置 TypeScript
4. 在根目录 `package.json` 的 `workspaces` 中添加路径

### 添加共享包

1. 在 `packages/` 目录下创建新的包目录
2. 创建 `package.json` 和 `tsconfig.json`
3. 导出公共接口和工具函数

### 数据库迁移

```bash
# 创建新迁移
npm run migrate:make -- create_users_table

# 运行迁移
npm run migrate

# 回滚迁移
npm run migrate:rollback
```

## 安全建议

1. **生产环境必须修改默认密钥**
   - `JWT_SECRET` 使用强随机字符串
   - `DB_PASSWORD` 使用强密码

2. **配置 HTTPS**
   - 使用 Let's Encrypt 或其他 CA 证书
   - 配置 NGINX SSL

3. **防火墙规则**
   - 只开放必要的端口 (80/443)
   - 数据库不暴露到公网

4. **定期备份**
   - 配置自动备份策略
   - 测试备份恢复流程

5. **监控和告警**
   - 配置 CPU/内存/磁盘告警
   - 设置日志聚合系统

## 故障排除

### 服务无法启动

```bash
# 查看日志
docker-compose logs auth-service
docker-compose logs instance-service

# 检查端口占用
netstat -tlnp | grep 3001
```

### 数据库连接失败

```bash
# 测试数据库连接
docker-compose exec postgres pg_isready

# 查看数据库状态
docker-compose exec postgres psql -U postgres -c "\l"
```

## 产品路线图

### Phase 1 - 核心功能 (Week 1-4)
- [x] Monorepo 项目结构
- [x] 认证授权服务
- [x] 实例管理服务
- [x] Web 控制台基础功能

### Phase 2 - 增强功能 (Week 5-8)
- [ ] 资源监控和告警
- [ ] 审计日志完整实现
- [ ] 批量操作优化
- [ ] 性能测试和优化

### Phase 3 - K8s 支持 (Week 9-12)
- [ ] Helm Chart 完善
- [ ] 自动扩缩容
- [ ] 服务网格集成
- [ ] 多集群管理

### Phase 4 - SaaS 模式 (Week 13-16)
- [ ] 计费系统集成
- [ ] 自助服务门户
- [ ] 多区域部署
- [ ] SLA 监控

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

MIT License

## 联系方式

- 官网：https://openclaw.io
- 邮箱：team@openclaw.io
- 文档：https://docs.openclaw.io
