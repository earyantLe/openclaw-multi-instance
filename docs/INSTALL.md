# OpenClaw Enterprise 安装指南

## 系统要求

### 最低配置
- CPU: 2 核心
- 内存：4GB
- 磁盘：20GB
- Node.js: >= 22.x
- PostgreSQL: 16+
- Redis: 7+

### 推荐配置
- CPU: 4 核心
- 内存：8GB
- 磁盘：100GB SSD
- Docker: 20+
- Kubernetes: 1.25+ (可选)

## 安装方式

### 方式一：Docker Compose (推荐)

#### 1. 克隆仓库

```bash
git clone https://github.com/openclaw/openclaw-multi-instance.git
cd openclaw-multi-instance
```

#### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，修改以下配置：

```bash
# 数据库密码（必须修改）
DB_PASSWORD=your-secure-password-here

# JWT 密钥（必须修改，使用强随机字符串）
JWT_SECRET=$(openssl rand -base64 32)

# Redis 密码（必须修改）
REDIS_PASSWORD=your-redis-password-here
```

#### 3. 启动服务

```bash
cd deploy/docker
docker-compose up -d
```

#### 4. 验证安装

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 测试健康检查
curl http://localhost:8080/health
```

#### 5. 访问管理面板

打开浏览器访问：http://localhost:8080

默认管理员账号（需要先通过 API 创建）：
- 邮箱：admin@example.com
- 密码：（初始化时设置）

### 方式二：Kubernetes 部署

#### 前置条件
- Kubernetes 集群 1.25+
- Helm 3.0+
- kubectl 已配置

#### 1. 使用 Helm 部署

```bash
# 添加 Helm 仓库（发布后）
helm repo add openclaw https://charts.openclaw.io
helm repo update

# 创建命名空间
kubectl create namespace openclaw

# 安装
helm install openclaw openclaw/openclaw -n openclaw

# 或者使用本地 values 文件
helm install openclaw ./deploy/kubernetes/helm -n openclaw
```

#### 2. 使用 Manifests 部署

```bash
# 应用配置
kubectl apply -f deploy/kubernetes/manifests.yaml

# 查看状态
kubectl get pods -n openclaw

# 查看服务
kubectl get svc -n openclaw
```

#### 3. 配置 Ingress

如果使用 NGINX Ingress Controller，配置如下：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: openclaw-ingress
  namespace: openclaw
spec:
  rules:
    - host: openclaw.yourcompany.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-console
                port:
                  number: 3000
```

### 方式三：源码安装

#### 1. 安装依赖

```bash
# 安装 Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# 安装 Redis
sudo apt-get install -y redis-server
```

#### 2. 配置数据库

```bash
# 创建数据库
sudo -u postgres psql <<EOF
CREATE DATABASE openclaw;
CREATE USER openclaw WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE openclaw TO openclaw;
EOF

# 运行迁移
npm run migrate
```

#### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
```

#### 4. 安装依赖

```bash
npm install
```

#### 5. 构建

```bash
npm run build
```

#### 6. 启动服务

```bash
# 启动所有服务（开发环境）
npm run dev

# 或分别启动
npm run dev:auth    # 认证服务
npm run dev:api     # 实例服务
npm run dev:web     # Web 控制台
```

## 初始化配置

### 创建第一个租户

```bash
curl -X POST http://localhost:3001/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Organization",
    "slug": "my-org",
    "plan": "professional",
    "adminEmail": "admin@example.com",
    "adminPassword": "secure-password",
    "adminName": "Admin User"
  }'
```

### 创建第一个实例

```bash
# 先登录获取 token
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "secure-password",
    "tenantId": "your-tenant-id"
  }' | jq -r '.token')

# 创建实例
curl -X POST http://localhost:3002/api/instances \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "instance-1",
    "port": 18790
  }'
```

## 备份与恢复

### 数据库备份

```bash
# 备份
pg_dump -U postgres openclaw > backup_$(date +%Y%m%d).sql

# 恢复
psql -U postgres openclaw < backup_20260320.sql
```

### 实例备份

```bash
# 备份实例
./scripts/backup.sh backup instance_1 my-backup

# 恢复实例
./scripts/backup.sh restore my-backup
```

## 故障排除

### 服务无法启动

```bash
# 查看日志
docker-compose logs auth-service
docker-compose logs instance-service

# 检查端口占用
netstat -tlnp | grep 3001
netstat -tlnp | grep 3002
```

### 数据库连接失败

```bash
# 测试连接
docker-compose exec postgres pg_isready

# 查看数据库状态
docker-compose exec postgres psql -U postgres -c "\l"
```

### 重置管理员密码

```bash
# 进入数据库
docker-compose exec postgres psql -U postgres openclaw

# 重置密码（使用 bcrypt 哈希）
UPDATE users SET password_hash = '$2b$12$...' WHERE email = 'admin@example.com';
```

## 升级指南

### Docker Compose 升级

```bash
# 拉取最新代码
git pull

# 停止服务
docker-compose down

# 重新构建并启动
docker-compose up -d --build

# 运行迁移（如果有）
docker-compose exec instance-service npm run migrate
```

### Kubernetes 升级

```bash
# Helm 升级
helm upgrade openclaw openclaw/openclaw -n openclaw

# 或者使用新 values
helm upgrade openclaw ./deploy/kubernetes/helm -n openclaw
```

## 卸载

### Docker Compose

```bash
cd deploy/docker
docker-compose down -v  # 删除数据和卷
```

### Kubernetes

```bash
helm uninstall openclaw -n openclaw
kubectl delete namespace openclaw
```

## 获取帮助

- 文档：https://docs.openclaw.io
- 问题反馈：https://github.com/openclaw/openclaw-multi-instance/issues
- 邮件：support@openclaw.io
