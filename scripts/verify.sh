#!/bin/bash

# OpenClaw 快速验证脚本
# 验证所有新增功能是否正常工作

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   OpenClaw 功能验证脚本${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════╝${NC}"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js 未安装${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Node.js 已安装：$(node -v)${NC}"
fi

# 检查 Python3
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}! Python3 未安装，部分功能可能无法使用${NC}"
else
    echo -e "${GREEN}✓ Python3 已安装${NC}"
fi

# 检查必要的脚本文件
echo ""
echo "检查必要的脚本文件..."

files=(
    "deploy-core/instance-manager.sh"
    "admin-panel/server.js"
    "admin-panel/public/index.html"
    "admin-panel/public/js/app.js"
    "scripts/setup.sh"
    "scripts/health-check.sh"
    "scripts/process-monitor.js"
    "scripts/resource-monitor.js"
    "scripts/group-manager.js"
    "scripts/backup.sh"
    "config/template-manager.js"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file${NC}"
    else
        echo -e "${RED}✗ $file (缺失)${NC}"
    fi
done

# 检查管理面板依赖
echo ""
echo "检查管理面板依赖..."
if [ -d "admin-panel/node_modules" ]; then
    echo -e "${GREEN}✓ 管理面板依赖已安装${NC}"
else
    echo -e "${YELLOW}! 管理面板依赖未安装，运行 './scripts/start-admin.sh' 会自动安装${NC}"
fi

# 验证 API 端点（如果管理面板已启动）
echo ""
echo "检查管理面板状态..."
PID_FILE="admin-panel/.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}✓ 管理面板正在运行 (PID: $PID)${NC}"

        # 测试 API
        echo ""
        echo "测试 API 端点..."

        # 健康检查
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ /api/health${NC}"
        else
            echo -e "${YELLOW}! /api/health 无法访问${NC}"
        fi

        # 系统信息
        if curl -s http://localhost:3000/api/system > /dev/null 2>&1; then
            echo -e "${GREEN}✓ /api/system${NC}"
        else
            echo -e "${YELLOW}! /api/system 无法访问${NC}"
        fi

        # 资源统计
        if curl -s http://localhost:3000/api/resources/stats > /dev/null 2>&1; then
            echo -e "${GREEN}✓ /api/resources/stats${NC}"
        else
            echo -e "${YELLOW}! /api/resources/stats 无法访问${NC}"
        fi

        # 实例列表
        if curl -s http://localhost:3000/api/instances > /dev/null 2>&1; then
            echo -e "${GREEN}✓ /api/instances${NC}"
        else
            echo -e "${YELLOW}! /api/instances 无法访问${NC}"
        fi
    else
        echo -e "${YELLOW}! 管理面板已停止 (PID: $PID 无效)${NC}"
    fi
else
    echo -e "${YELLOW}! 管理面板未启动，运行 './scripts/start-admin.sh' 启动${NC}"
fi

# 验证脚本可执行权限
echo ""
echo "检查脚本可执行权限..."
scripts=(
    "deploy-core/instance-manager.sh"
    "scripts/setup.sh"
    "scripts/health-check.sh"
    "scripts/backup.sh"
    "scripts/start-admin.sh"
)

for script in "${scripts[@]}"; do
    if [ -x "$script" ]; then
        echo -e "${GREEN}✓ $script (可执行)${NC}"
    else
        echo -e "${YELLOW}! $script (需要 chmod +x)${NC}"
    fi
done

# 显示功能列表
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   OpenClaw 功能列表${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════╝${NC}"
echo ""
echo "核心功能:"
echo "  - 实例管理 (创建/启动/停止/重启/删除)"
echo "  - 批量操作 (全部启动/停止/重启)"
echo "  - 配置管理 (查看/编辑实例配置)"
echo "  - 日志管理 (查看/下载/清空/自动清理)"
echo ""
echo "高级功能:"
echo "  - 资源监控 (CPU/内存/磁盘使用)"
echo "  - 实例分组 (创建组/批量操作组内实例)"
echo "  - 健康检查 (系统/实例状态检查)"
echo "  - 进程监控 (自动重启崩溃实例)"
echo "  - 配置模板 (应用预设配置)"
echo "  - 备份还原 (实例配置/数据备份)"
echo ""
echo "使用方法:"
echo "  启动管理面板：./scripts/start-admin.sh"
echo "  健康检查：./scripts/health-check.sh"
echo "  资源监控：node scripts/resource-monitor.js status"
echo "  分组管理：node scripts/group-manager.js list"
echo "  实例管理：./deploy-core/instance-manager.sh list"
echo ""
