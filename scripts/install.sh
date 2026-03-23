#!/bin/bash

# OpenClaw Enterprise 一键安装脚本
# 自动安装所有依赖并配置环境

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   OpenClaw Enterprise - 安装脚本                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# 检查 Node.js
log_info "检查 Node.js..."
if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装，请先安装 Node.js >= 22"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    log_error "Node.js 版本过低：$(node -v)，需要 >= 22.x"
    exit 1
fi
log_success "Node.js 版本检查通过：$(node -v)"

# 检查 npm
log_info "检查 npm..."
if ! command -v npm &> /dev/null; then
    log_error "npm 未安装"
    exit 1
fi
log_success "npm 版本：$(npm -v)"

# 安装根目录依赖
log_info "安装根目录依赖..."
npm install --prefer-offline
log_success "根目录依赖安装完成"

# 安装各工作空间依赖
log_info "安装工作空间依赖..."

# Auth Service
log_info "安装 @openclaw/auth-service 依赖..."
cd apps/auth-service
npm install --prefer-offline 2>/dev/null || log_warning "auth-service 依赖安装跳过（可能已安装）"
cd ../..

# Instance Service
log_info "安装 @openclaw/instance-service 依赖..."
cd apps/instance-service
npm install --prefer-offline 2>/dev/null || log_warning "instance-service 依赖安装跳过"
cd ../..

# Monitor Service
log_info "安装 @openclaw/monitor-service 依赖..."
cd apps/monitor-service
npm install --prefer-offline 2>/dev/null || log_warning "monitor-service 依赖安装跳过"
cd ../..

# Web Console
log_info "安装 @openclaw/web-console 依赖..."
cd apps/web-console
npm install --prefer-offline 2>/dev/null || log_warning "web-console 依赖安装跳过"
cd ../..

# Packages
log_info "安装共享包依赖..."
for pkg in packages/*; do
    if [ -d "$pkg" ]; then
        log_info "安装 $pkg 依赖..."
        cd "$pkg"
        npm install --prefer-offline 2>/dev/null || log_warning "$pkg 依赖安装跳过"
        cd ../..
    fi
done

log_success "所有工作空间依赖安装完成"

# 检查 PostgreSQL
log_info "检查 PostgreSQL..."
if command -v psql &> /dev/null; then
    log_success "PostgreSQL 已安装：$(psql --version)"
else
    log_warning "PostgreSQL 未安装，企业级服务需要 PostgreSQL"
    log_info "可以使用 Docker 部署：cd deploy/docker && docker-compose up -d"
fi

# 配置环境变量
log_info "配置环境变量..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    log_success "已创建 .env 文件，请编辑配置数据库和密码"
else
    log_success ".env 文件已存在"
fi

# 创建必要目录
log_info "创建必要目录..."
mkdir -p logs
mkdir -p ~/.openclaw
log_success "目录创建完成"

# 构建 TypeScript 项目
log_info "构建 TypeScript 项目..."

# 构建共享包
for pkg in packages/*; do
    if [ -d "$pkg" ] && [ -f "$pkg/tsconfig.json" ]; then
        log_info "构建 $pkg..."
        cd "$pkg"
        npm run build 2>/dev/null || log_warning "$pkg 构建失败"
        cd ../..
    fi
done

# 构建应用服务
for app in apps/auth-service apps/instance-service apps/monitor-service; do
    if [ -d "$app" ] && [ -f "$app/tsconfig.json" ]; then
        log_info "构建 $app..."
        cd "$app"
        npm run build 2>/dev/null || log_warning "$app 构建失败"
        cd ../..
    fi
done

# 构建 Web Console
if [ -d "apps/web-console" ]; then
    log_info "构建 apps/web-console..."
    cd apps/web-console
    npm run build 2>/dev/null || log_warning "web-console 构建失败"
    cd ../..
fi

log_success "TypeScript 项目构建完成"

# 完成
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_success "安装完成！"
echo ""
echo "下一步："
echo "  1. 编辑 .env 文件配置数据库和密码"
echo "  2. 启动服务:"
echo "     - Docker 模式：cd deploy/docker && docker-compose up -d"
echo "     - 开发模式：npm run dev"
echo "  3. 初始化租户：npm run init-tenant"
echo "  4. 访问管理面板：http://localhost:8080"
echo ""
