#!/bin/bash

# OpenClaw 健康检查脚本
# 支持检查实例状态、端口、进程，并支持告警通知

set -e

# 配置
OPENCLAW_BASE_DIR="${HOME}/.openclaw"
INSTANCES_DIR="${OPENCLAW_BASE_DIR}/instances"
REGISTRY_FILE="${INSTANCES_DIR}/registry.json"
HEALTH_LOG="${OPENCLAW_BASE_DIR}/health-check.log"

# 告警配置
ALERT_ENABLED=false
ALERT_WEBHOOK=""
ALERT_EMAIL=""
ALERT_ON_RECOVERY=true

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# 发送告警
send_alert() {
    local title="$1"
    local message="$2"
    local level="$3"

    log_warning "告警：${title} - ${message}"

    # Webhook 告警
    if [ "$ALERT_ENABLED" = true ] && [ -n "$ALERT_WEBHOOK" ]; then
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"title\":\"${title}\",\"message\":\"${message}\",\"level\":\"${level}\",\"timestamp\":\"$(date -Iseconds)\"}" \
            || true
    fi

    # 邮件告警（需要配置 mail 命令）
    if [ "$ALERT_ENABLED" = true ] && [ -n "$ALERT_EMAIL" ]; then
        echo "${message}" | mail -s "[OpenClaw] ${title}" "$ALERT_EMAIL" 2>/dev/null || true
    fi
}

# 检查进程是否运行
is_process_running() {
    local pid=$1
    if [ -z "$pid" ]; then
        return 1
    fi
    kill -0 "$pid" 2>/dev/null
    return $?
}

# 检查端口是否监听
is_port_listening() {
    local port=$1
    if command -v ss &> /dev/null; then
        ss -tlnp 2>/dev/null | grep -q ":${port} "
        return $?
    elif command -v netstat &> /dev/null; then
        netstat -tlnp 2>/dev/null | grep -q ":${port} "
        return $?
    fi
    return 1
}

# 检查磁盘空间
check_disk_space() {
    local path="$1"
    local threshold="${2:-90}"

    if [ ! -d "$path" ]; then
        return 0
    fi

    local usage=$(df "$path" 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ -n "$usage" ] && [ "$usage" -gt "$threshold" ]; then
        return 1
    fi
    return 0
}

# 检查内存使用
check_memory_usage() {
    local threshold="${1:-90}"

    if command -v free &> /dev/null; then
        local usage=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')
        if [ "$usage" -gt "$threshold" ]; then
            return 1
        fi
    fi
    return 0
}

# 健康检查单个实例
check_instance_health() {
    local instance="$1"
    local id=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
    local name=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))")
    local port=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('port',0))")
    local status=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
    local pid=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pid','') or '')")
    local dir=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('dir',''))")

    local issues=()
    local health_status="healthy"

    # 检查状态
    if [ "$status" = "running" ]; then
        # 检查进程
        if [ -n "$pid" ] && ! is_process_running "$pid"; then
            issues+=("进程未运行 (PID: $pid)")
            health_status="unhealthy"
        fi

        # 检查端口
        if ! is_port_listening "$port"; then
            issues+=("端口 ${port} 未监听")
            health_status="degraded"
        fi

        # 检查目录
        if [ ! -d "$dir" ]; then
            issues+=("实例目录不存在")
            health_status="unhealthy"
        fi

        # 检查磁盘空间
        if [ -d "$dir" ] && ! check_disk_space "$dir" 80; then
            issues+=("磁盘空间不足 (>80%)")
            health_status="warning"
        fi
    fi

    # 输出结果
    local status_icon="✓"
    if [ "$health_status" = "unhealthy" ]; then
        status_icon="✗"
        log_error "实例 #${id} (${name}): ${health_status}"
        for issue in "${issues[@]}"; do
            echo "       └─ $issue"
        done

        # 发送告警
        if [ ${#issues[@]} -gt 0 ]; then
            send_alert "实例异常" "实例 #${id} (${name}): ${issues[*]}" "critical"
        fi
    elif [ "$health_status" = "degraded" ]; then
        status_icon="!"
        log_warning "实例 #${id} (${name}): ${health_status}"
        for issue in "${issues[@]}"; do
            echo "       └─ $issue"
        done

        if [ "$ALERT_ON_RECOVERY" = true ]; then
            send_alert "实例降级" "实例 #${id} (${name}): ${issues[*]}" "warning"
        fi
    elif [ "$health_status" = "warning" ]; then
        status_icon="!"
        log_warning "实例 #${id} (${name}): ${health_status}"
        for issue in "${issues[@]}"; do
            echo "       └─ $issue"
        done
    else
        log_success "实例 #${id} (${name}): ${health_status}"
    fi

    echo "$health_status"
}

# 系统健康检查
check_system_health() {
    echo ""
    echo -e "${BLUE}=== 系统健康检查 ===${NC}"
    echo ""

    local issues=0

    # CPU 负载
    if command -v uptime &> /dev/null; then
        local load=$(uptime | awk -F'load average:' '{print $2}' | cut -d',' -f1 | tr -d ' ')
        local cpu_count=$(nproc 2>/dev/null || echo "1")
        local load_percent=$(echo "$load $cpu_count" | awk '{printf "%.0f", ($1/$2)*100}')

        if [ "$load_percent" -gt 90 ]; then
            log_error "CPU 负载过高：${load_percent}% (load: $load)"
            ((issues++))
        else
            log_success "CPU 负载正常：${load_percent}% (load: $load)"
        fi
    fi

    # 内存使用
    if command -v free &> /dev/null; then
        local mem_info=$(free -m | awk '/^Mem:/ {printf "%d/%d MB (%.0f%%)", $3, $2, $3/$2*100}')
        local mem_usage=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2*100}')

        if [ "$mem_usage" -gt 90 ]; then
            log_error "内存使用过高：${mem_info}"
            ((issues++))
        else
            log_success "内存使用正常：${mem_info}"
        fi
    fi

    # 磁盘使用
    if command -v df &> /dev/null; then
        local disk_info=$(df -h "$HOME" | tail -1 | awk '{printf "%s/%s (%s)", $3, $2, $5}')
        local disk_usage=$(df "$HOME" | tail -1 | awk '{print $5}' | sed 's/%//')

        if [ "$disk_usage" -gt 90 ]; then
            log_error "磁盘使用过高：${disk_info}"
            ((issues++))
        else
            log_success "磁盘使用正常：${disk_info}"
        fi
    fi

    # Node.js 版本
    if command -v node &> /dev/null; then
        local node_version=$(node -v)
        log_success "Node.js: ${node_version}"
    else
        log_warning "Node.js 未安装"
        ((issues++))
    fi

    # Python 版本
    if command -v python3 &> /dev/null; then
        local python_version=$(python3 --version)
        log_success "Python: ${python_version}"
    else
        log_warning "Python3 未安装"
        ((issues++))
    fi

    return $issues
}

# 主健康检查
run_health_check() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   OpenClaw 健康检查${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════╝${NC}"
    echo ""
    echo "时间：$(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # 系统检查
    check_system_health

    # 实例检查
    echo ""
    echo -e "${BLUE}=== 实例健康检查 ===${NC}"
    echo ""

    if [ ! -f "$REGISTRY_FILE" ]; then
        log_info "实例注册表不存在"
        return 0
    fi

    local instances=$(python3 -c "
import json
with open('$REGISTRY_FILE') as f:
    data = json.load(f)
for i in data.get('instances', []):
    print(json.dumps(i))
" 2>/dev/null)

    if [ -z "$instances" ]; then
        log_info "暂无实例"
        return 0
    fi

    local healthy=0
    local degraded=0
    local unhealthy=0
    local total=0

    while IFS= read -r instance; do
        if [ -n "$instance" ]; then
            local result=$(check_instance_health "$instance")
            case "$result" in
                healthy) ((healthy++)) ;;
                degraded) ((degraded++)) ;;
                unhealthy) ((unhealthy++)) ;;
            esac
            ((total++))
        fi
    done <<< "$instances"

    # 汇总
    echo ""
    echo -e "${BLUE}=== 健康检查汇总 ===${NC}"
    echo ""
    echo "总计实例：$total"
    log_success "健康：$healthy"
    log_warning "降级：$degraded"
    log_error "异常：$unhealthy"

    if [ $unhealthy -gt 0 ]; then
        send_alert "健康检查失败" "$unhealthy/$total 实例异常" "critical"
        return 1
    elif [ $degraded -gt 0 ]; then
        return 0
    fi

    return 0
}

# JSON 输出
output_json() {
    if [ ! -f "$REGISTRY_FILE" ]; then
        echo '{"status":"no_registry","instances":[]}'
        return 0
    fi

    python3 <<EOF
import json
import subprocess
import os

registry_file = '$REGISTRY_FILE'

try:
    with open(registry_file) as f:
        data = json.load(f)
except:
    print(json.dumps({'status': 'error', 'message': 'Cannot read registry'}))
    exit(0)

instances = data.get('instances', [])
results = []

for inst in instances:
    result = {
        'id': inst.get('id'),
        'name': inst.get('name'),
        'port': inst.get('port'),
        'status': inst.get('status'),
        'health': 'healthy',
        'issues': []
    }

    if inst.get('status') == 'running':
        pid = inst.get('pid')
        port = inst.get('port')

        # Check process
        if pid:
            ret = subprocess.run(['kill', '-0', str(pid)], capture_output=True)
            if ret.returncode != 0:
                result['health'] = 'unhealthy'
                result['issues'].append(f'Process not running (PID: {pid})')

        # Check port
        ret = subprocess.run(['ss', '-tlnp'], capture_output=True, text=True)
        if f':{port} ' not in ret.stdout:
            if result['health'] == 'healthy':
                result['health'] = 'degraded'
            result['issues'].append(f'Port {port} not listening')

    results.append(result)

output = {
    'timestamp': subprocess.run(['date', '-Iseconds'], capture_output=True, text=True).stdout.strip(),
    'instances': results,
    'summary': {
        'total': len(results),
        'healthy': sum(1 for r in results if r['health'] == 'healthy'),
        'degraded': sum(1 for r in results if r['health'] == 'degraded'),
        'unhealthy': sum(1 for r in results if r['health'] == 'unhealthy')
    }
}

print(json.dumps(output, indent=2))
EOF
}

# 显示帮助
show_help() {
    echo ""
    echo -e "${BLUE}OpenClaw 健康检查工具${NC}"
    echo ""
    echo "用法：$0 <command> [options]"
    echo ""
    echo "命令:"
    echo "  check         运行健康检查（默认）"
    echo "  json          输出 JSON 格式结果"
    echo "  instances     只检查实例"
    echo "  system        只检查系统"
    echo "  watch         持续监控（每 30 秒）"
    echo "  help          显示帮助"
    echo ""
    echo "选项:"
    echo "  --alert-webhook=<url>   设置告警 Webhook"
    echo "  --alert-email=<email>   设置告警邮箱"
    echo ""
}

# 持续监控
watch_health() {
    log_info "启动持续监控（每 30 秒检查一次，Ctrl+C 停止）..."

    while true; do
        clear
        run_health_check
        echo ""
        log_info "下次检查将在 30 秒后..."
        sleep 30
    done
}

# 主程序
main() {
    local command="${1:-check}"
    shift || true

    # 解析全局选项
    for arg in "$@"; do
        case "$arg" in
            --alert-webhook=*)
                ALERT_ENABLED=true
                ALERT_WEBHOOK="${arg#*=}"
                ;;
            --alert-email=*)
                ALERT_ENABLED=true
                ALERT_EMAIL="${arg#*=}"
                ;;
        esac
    done

    case "$command" in
        check)
            run_health_check
            ;;
        json)
            output_json
            ;;
        instances)
            echo -e "${BLUE}=== 实例健康检查 ===${NC}"
            run_health_check | tail -n +20
            ;;
        system)
            check_system_health
            ;;
        watch)
            watch_health
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令：$command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
