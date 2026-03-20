#!/bin/bash

# OpenClaw 管理面板快速启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_PANEL_DIR="${SCRIPT_DIR}/../admin-panel"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  OpenClaw 管理面板${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查依赖
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}警告：Node.js 未安装，请确保已安装 Node.js >= 22${NC}"
    exit 1
fi

# 检查依赖包
if [ ! -d "${ADMIN_PANEL_DIR}/node_modules" ]; then
    echo -e "${BLUE}安装依赖包...${NC}"
    cd "$ADMIN_PANEL_DIR"
    npm install --silent
fi

# 检查是否已在运行
PID_FILE="${ADMIN_PANEL_DIR}/.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 $PID 2>/dev/null; then
        echo -e "${GREEN}管理面板已在运行 (PID: $PID)${NC}"
        echo ""
        echo "访问地址：http://localhost:3000"
        echo "停止服务：kill $PID"
        exit 0
    fi
fi

# 启动服务
echo -e "${BLUE}启动管理面板...${NC}"
cd "$ADMIN_PANEL_DIR"
nohup node server.js > .log 2>&1 &
echo $! > .pid

sleep 2

if [ -f .pid ]; then
    PID=$(cat .pid)
    if kill -0 $PID 2>/dev/null; then
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  管理面板已启动成功!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo "  访问地址：http://localhost:3000"
        echo "  健康检查：http://localhost:3000/api/health"
        echo "  系统信息：http://localhost:3000/api/system"
        echo ""
        echo "  进程 ID: $PID"
        echo "  日志文件：${ADMIN_PANEL_DIR}/.log"
        echo "  停止服务：kill $PID"
        echo ""
    else
        echo -e "${YELLOW}启动失败，请查看日志：${ADMIN_PANEL_DIR}/.log${NC}"
        exit 1
    fi
fi
