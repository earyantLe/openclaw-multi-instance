#!/bin/bash

# OpenClaw Enterprise 简单启动脚本（无 Docker 环境）
# 用于开发和测试环境

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 默认端口
AUTH_PORT=${AUTH_PORT:-3001}
INSTANCE_PORT=${INSTANCE_PORT:-3002}
MONITOR_PORT=${MONITOR_PORT:-3003}

# 环境变量
export NODE_ENV=${NODE_ENV:-development}
export LOG_LEVEL=${LOG_LEVEL:-info}
export LOG_DIR=${LOG_DIR:-$ROOT_DIR/logs}
export DB_HOST=${DB_HOST:-localhost}
export DB_PORT=${DB_PORT:-5432}
export DB_NAME=${DB_NAME:-openclaw}
export DB_USER=${DB_USER:-postgres}
export DB_PASSWORD=${DB_PASSWORD:-postgres}
export JWT_SECRET=${JWT_SECRET:-dev-secret-change-in-production}

# 创建日志目录
mkdir -p "$LOG_DIR"

# PID 文件目录
PID_DIR="$ROOT_DIR/.pids"
mkdir -p "$PID_DIR"

# 启动服务
start_service() {
    local name="$1"
    local script="$2"
    local port="$3"
    local log_file="$LOG_DIR/$name.log"
    local pid_file="$PID_DIR/$name.pid"

    if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
        log_warning "$name 已经在运行中 (PID: $(cat "$pid_file"))"
        return 0
    fi

    log_info "启动 $name (端口：$port)..."

    cd "$ROOT_DIR/$script"
    npm start > "$log_file" 2>&1 &
    local pid=$!
    echo $pid > "$pid_file"

    sleep 2

    if kill -0 $pid 2>/dev/null; then
        log_success "$name 已启动 (PID: $pid, 日志：$log_file)"
    else
        log_error "$name 启动失败，查看日志：$log_file"
        return 1
    fi
}

# 停止服务
stop_service() {
    local name="$1"
    local pid_file="$PID_DIR/$name.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            log_info "停止 $name (PID: $pid)..."
            kill $pid
            rm -f "$pid_file"
            log_success "$name 已停止"
        else
            log_warning "$name 进程不存在"
            rm -f "$pid_file"
        fi
    else
        log_warning "$name PID 文件不存在"
    fi
}

# 停止所有服务
stop_all() {
    log_info "停止所有服务..."
    stop_service "auth-service"
    stop_service "instance-service"
    stop_service "monitor-service"
}

# 启动所有服务
start_all() {
    log_info "启动 OpenClaw Enterprise 服务..."
    echo ""

    # 检查数据库
    if command -v psql &> /dev/null; then
        log_info "检查 PostgreSQL 连接..."
        if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
            log_warning "无法连接到 PostgreSQL，服务可能无法正常运行"
        else
            log_success "PostgreSQL 连接正常"
        fi
    else
        log_warning "psql 未安装，跳过数据库检查"
    fi

    echo ""

    # 启动服务
    start_service "auth-service" "apps/auth-service" "$AUTH_PORT" || true
    start_service "instance-service" "apps/instance-service" "$INSTANCE_PORT" || true
    start_service "monitor-service" "apps/monitor-service" "$MONITOR_PORT" || true

    echo ""
    log_info "服务启动完成！"
    echo ""
    echo "服务状态:"
    echo "  Auth Service:     http://localhost:$AUTH_PORT"
    echo "  Instance Service: http://localhost:$INSTANCE_PORT"
    echo "  Monitor Service:  http://localhost:$MONITOR_PORT"
    echo ""
    echo "停止服务：./scripts/start-dev.sh stop"
    echo "查看日志：tail -f logs/*.log"
    echo ""
}

# 查看状态
show_status() {
    echo ""
    echo "服务状态:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for service in auth-service instance-service monitor-service; do
        local pid_file="$PID_DIR/$service.pid"
        if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
            echo -e "  $service: ${GREEN}● Running$(NC) (PID: $(cat "$pid_file"))"
        else
            echo -e "  $service: ${RED}● Stopped${NC}"
        fi
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# 主逻辑
main() {
    local command="${1:-start}"

    case "$command" in
        start)
            start_all
            ;;
        stop)
            stop_all
            ;;
        restart)
            stop_all
            sleep 1
            start_all
            ;;
        status)
            show_status
            ;;
        *)
            echo "用法：$0 {start|stop|restart|status}"
            exit 1
            ;;
    esac
}

main "$@"
