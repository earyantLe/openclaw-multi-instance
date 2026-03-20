#!/bin/bash

# OpenClaw 多实例管理器 - 脚本部署版本
# 支持 create/start/stop/restart/delete/list/status 命令

set -e

# 配置
OPENCLAW_BASE_DIR="${HOME}/.openclaw"
INSTANCES_DIR="${OPENCLAW_BASE_DIR}/instances"
REGISTRY_FILE="${OPENCLAW_BASE_DIR}/instances/registry.json"
DEFAULT_PORT=18789
NODE_MIN_VERSION=22
SCRIPT_VERSION="1.1.0"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# JSON 处理工具（优先使用 jq，否则使用 python3）
if command -v jq &> /dev/null; then
    JSON_TOOL="jq"
elif command -v python3 &> /dev/null; then
    JSON_TOOL="python3"
else
    echo "错误：需要安装 jq 或 python3 来处理 JSON"
    exit 1
fi

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

log_debug() {
    if [ "${DEBUG:-0}" = "1" ]; then
        echo -e "${CYAN}[DEBUG]${NC} $1"
    fi
}

# 版本信息
show_version() {
    echo "OpenClaw 多实例管理器 v${SCRIPT_VERSION}"
}

# JSON 处理函数
json_read() {
    local json="$1"
    local query="$2"

    if [ "$JSON_TOOL" = "jq" ]; then
        echo "$json" | jq -r "$query" 2>/dev/null
    else
        echo "$json" | python3 -c "import sys,json; data=json.load(sys.stdin); print($query)" 2>/dev/null
    fi
}

json_read_array() {
    local json="$1"
    local query="$2"

    if [ "$JSON_TOOL" = "jq" ]; then
        echo "$json" | jq -c "$query" 2>/dev/null
    else
        echo "$json" | python3 -c "import sys,json; data=json.load(sys.stdin); [print(x) for x in $query]" 2>/dev/null
    fi
}

# 检查 Node.js 版本
check_node_version() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装，请安装 Node.js >= ${NODE_MIN_VERSION}"
        return 1
    fi

    local version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$version" -lt "$NODE_MIN_VERSION" ]; then
        log_error "Node.js 版本过低：$(node -v)，需要 >= ${NODE_MIN_VERSION}.x"
        return 1
    fi

    log_info "Node.js 版本检查通过：$(node -v)"
    return 0
}

# 初始化注册表
init_registry() {
    if [ ! -f "$REGISTRY_FILE" ]; then
        echo '{"instances":[]}' > "$REGISTRY_FILE"
        log_info "初始化实例注册表：$REGISTRY_FILE"
    fi
}

# 读取注册表
read_registry() {
    if [ ! -f "$REGISTRY_FILE" ]; then
        echo "[]"
        return
    fi
    cat "$REGISTRY_FILE" | python3 -c "import sys,json; data=json.load(sys.stdin); print(json.dumps(data.get('instances', [])))" 2>/dev/null || echo "[]"
}

# 保存注册表
save_registry() {
    local instances_json="$1"
    echo "{\"instances\":${instances_json}}" | python3 -c "import sys,json; data=json.load(sys.stdin); print(json.dumps(data, indent=2))" > "$REGISTRY_FILE"
}

# 获取下一个可用 ID
get_next_id() {
    local instances=$(read_registry)
    local max_id=0
    for id in $(echo "$instances" | python3 -c "import sys,json; [print(i['id']) for i in json.load(sys.stdin)]" 2>/dev/null); do
        if [ "$id" -gt "$max_id" ]; then
            max_id=$id
        fi
    done
    echo $((max_id + 1))
}

# 获取下一个可用端口
get_next_port() {
    local instances=$(read_registry)
    local max_port=$DEFAULT_PORT
    for port in $(echo "$instances" | python3 -c "import sys,json; [print(i['port']) for i in json.load(sys.stdin)]" 2>/dev/null); do
        if [ "$port" -gt "$max_port" ]; then
            max_port=$port
        fi
    done
    echo $((max_port + 1))
}

# 检查端口是否被占用
check_port_available() {
    local port=$1

    # 检查系统端口占用
    if command -v ss &> /dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
            return 1
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
            return 1
        fi
    fi

    # 检查是否在注册表中被占用
    local instances=$(read_registry)
    if echo "$instances" | grep -q "\"port\":${port}" 2>/dev/null; then
        return 1
    fi

    return 0
}

# 检查实例是否存在
check_instance_exists() {
    local id=$1
    local instances=$(read_registry)

    if [ "$JSON_TOOL" = "jq" ]; then
        echo "$instances" | jq -e ".[] | select(.id == $id)" > /dev/null 2>&1
    else
        echo "$instances" | python3 -c "import sys,json; instances=json.load(sys.stdin); exit(0 if any(i['id']==$id for i in instances) else 1)" 2>/dev/null
    fi
    return $?
}

# 获取实例信息
get_instance() {
    local id=$1
    local instances=$(read_registry)

    if [ "$JSON_TOOL" = "jq" ]; then
        echo "$instances" | jq -c ".[] | select(.id == $id)" 2>/dev/null
    else
        echo "$instances" | python3 -c "import sys,json; instances=json.load(sys.stdin); print(json.dumps(next((i for i in instances if i['id']==$id), {})))" 2>/dev/null
    fi
}

# 获取实例字段
get_instance_field() {
    local id=$1
    local field=$2
    local instance=$(get_instance $id)

    if [ "$JSON_TOOL" = "jq" ]; then
        echo "$instance" | jq -r ".$field // empty" 2>/dev/null
    else
        echo "$instance" | python3 -c "import sys,json; i=json.load(sys.stdin); print(i.get('$field',''))" 2>/dev/null
    fi
}

# 创建实例
create_instance() {
    local name="$1"
    local port="$2"
    local workspace="$3"

    if [ -z "$name" ]; then
        log_error "请提供实例名称"
        echo "用法：$0 create <name> [port] [workspace]"
        return 1
    fi

    init_registry

    # 检查名称是否已存在
    local instances=$(read_registry)
    if [ "$JSON_TOOL" = "jq" ]; then
        if echo "$instances" | jq -e ".[] | select(.name == \"$name\")" > /dev/null 2>&1; then
            log_error "实例名称 '$name' 已存在"
            return 1
        fi
    else
        if echo "$instances" | python3 -c "import sys,json; instances=json.load(sys.stdin); exit(0 if any(i['name']=='$name' for i in instances) else 1)" 2>/dev/null; then
            log_error "实例名称 '$name' 已存在"
            return 1
        fi
    fi

    local id=$(get_next_id)
    local auto_port=${port:-$(get_next_port)}

    # 确保端口可用
    while ! check_port_available $auto_port; do
        auto_port=$((auto_port + 1))
    done

    local instance_dir="${INSTANCES_DIR}/${id}"
    local config_dir="${instance_dir}/config"
    local log_dir="${instance_dir}/logs"
    local data_dir="${instance_dir}/data"
    local workspace_dir=${workspace:-"${instance_dir}/workspace"}

    # 创建目录
    mkdir -p "$config_dir" "$log_dir" "$data_dir" "$workspace_dir"

    # 创建配置文件
    cat > "${config_dir}/config.json" <<EOF
{
  "instanceId": ${id},
  "instanceName": "${name}",
  "port": ${auto_port},
  "workspace": "${workspace_dir}",
  "createdAt": "$(date -Iseconds)"
}
EOF

    # 创建 .env 文件
    cat > "${instance_dir}/.env" <<EOF
OPENCLAW_PORT=${auto_port}
OPENCLAW_INSTANCE_ID=${id}
OPENCLAW_INSTANCE_NAME=${name}
OPENCLAW_CONFIG_DIR=${config_dir}
OPENCLAW_DATA_DIR=${data_dir}
OPENCLAW_LOG_DIR=${log_dir}
OPENCLAW_WORKSPACE=${workspace_dir}
EOF

    # 更新注册表
    if [ "$JSON_TOOL" = "jq" ]; then
        local tmp_file=$(mktemp)
        jq ".instances += [{
            \"id\": $id,
            \"name\": \"$name\",
            \"port\": $auto_port,
            \"dir\": \"$instance_dir\",
            \"configDir\": \"$config_dir\",
            \"logDir\": \"$log_dir\",
            \"dataDir\": \"$data_dir\",
            \"workspace\": \"$workspace_dir\",
            \"status\": \"stopped\",
            \"pid\": null,
            \"createdAt\": \"$(date -Iseconds)\"
        }]" "$REGISTRY_FILE" > "$tmp_file" && mv "$tmp_file" "$REGISTRY_FILE"
    else
        save_registry "$(echo "$instances" | python3 -c "
import sys,json
instances=json.load(sys.stdin)
instances.append({'id':$id,'name':'$name','port':$auto_port,'dir':'$instance_dir','configDir':'$config_dir','logDir':'$log_dir','dataDir':'$data_dir','workspace':'$workspace_dir','status':'stopped','createdAt':'$(date -Iseconds)'})
print(json.dumps(instances))
")"
    fi

    log_success "实例创建成功!"
    log_info "实例 ID: $id"
    log_info "实例名称：$name"
    log_info "端口：$auto_port"
    log_info "目录：$instance_dir"
    log_info ""
    log_info "运行 '$0 start $id' 启动实例"
}

# 启动实例
start_instance() {
    local id=$1

    if [ -z "$id" ]; then
        log_error "请提供实例 ID"
        echo "用法：$0 start <id>"
        return 1
    fi

    init_registry

    if ! check_instance_exists $id; then
        log_error "实例 $id 不存在"
        return 1
    fi

    local status=$(get_instance_field $id status)
    local dir=$(get_instance_field $id dir)
    local port=$(get_instance_field $id port)
    local name=$(get_instance_field $id name)

    if [ "$status" = "running" ]; then
        log_warning "实例 $id ($name) 已在运行中"
        return 0
    fi

    # 检查端口是否可用
    if ! check_port_available $port; then
        log_error "端口 $port 被占用，无法启动实例"
        return 1
    fi

    log_info "启动实例 $id ($name)..."

    # 启动 OpenClaw Gateway (使用 --profile 实现实例隔离)
    cd "$dir"
    export $(cat .env | xargs)

    # 使用 profile 模式启动，每个实例有独立的状态和配置
    local profile_name="instance_${id}"

    # 后台运行 openclaw gateway
    if command -v openclaw &> /dev/null; then
        # 使用 profile 模式启动，实例隔离在 ~/.openclaw-instance_<id>
        # 使用 --allow-unconfigured 允许未配置启动，使用 local 模式
        openclaw --profile "$profile_name" gateway --port $port --allow-unconfigured > "$dir/logs/openclaw.log" 2>&1 &
        local pid=$!
        echo $pid > "$dir/openclaw.pid"
        log_success "实例 $id 已启动 (PID: $pid)"
    elif command -v npx &> /dev/null; then
        # 尝试使用 npx 运行 openclaw
        npx openclaw --profile "$profile_name" gateway --port $port --allow-unconfigured > "$dir/logs/openclaw.log" 2>&1 &
        local pid=$!
        echo $pid > "$dir/openclaw.pid"
        log_success "实例 $id 已启动 (npx 模式，PID: $pid)"
    else
        log_warning "openclaw 命令未找到，创建模拟进程（测试模式）"
        # 模拟进程用于测试
        node -e "setInterval(()=>{},1000)" > "$dir/logs/openclaw.log" 2>&1 &
        local pid=$!
        echo $pid > "$dir/openclaw.pid"
        log_success "实例 $id 已启动 (模拟模式，PID: $pid)"
    fi

    sleep 1

    # 更新状态
    local instances=$(read_registry)
    local actual_pid=$(cat "$dir/openclaw.pid" 2>/dev/null || echo "null")

    if [ "$JSON_TOOL" = "jq" ]; then
        local tmp_file=$(mktemp)
        jq "(.instances[] | select(.id == $id) | .status) = \"running\" | (.instances[] | select(.id == $id) | .pid) = $actual_pid" "$REGISTRY_FILE" > "$tmp_file" && mv "$tmp_file" "$REGISTRY_FILE"
    else
        save_registry "$(echo "$instances" | python3 -c "
import sys,json
instances=json.load(sys.stdin)
for i in instances:
    if i['id']==$id:
        i['status']='running'
        i['pid']=$actual_pid
        break
print(json.dumps(instances))
")"
    fi
}

# 停止实例
stop_instance() {
    local id=$1

    if [ -z "$id" ]; then
        log_error "请提供实例 ID"
        echo "用法：$0 stop <id>"
        return 1
    fi

    init_registry

    if ! check_instance_exists $id; then
        log_error "实例 $id 不存在"
        return 1
    fi

    local status=$(get_instance_field $id status)
    local dir=$(get_instance_field $id dir)
    local name=$(get_instance_field $id name)

    if [ "$status" = "stopped" ]; then
        log_warning "实例 $id ($name) 已停止"
        return 0
    fi

    log_info "停止实例 $id ($name)..."

    # 停止进程
    if [ -f "$dir/openclaw.pid" ]; then
        local pid=$(cat "$dir/openclaw.pid")
        if kill -0 $pid 2>/dev/null; then
            kill $pid
            log_success "实例 $id 已停止 (PID: $pid)"
        else
            log_warning "进程 $pid 不存在"
        fi
        rm -f "$dir/openclaw.pid"
    else
        # 尝试通过端口查找并停止进程
        local port=$(get_instance_field $id port)
        if command -v lsof &> /dev/null; then
            local pid=$(lsof -ti:$port 2>/dev/null | head -1)
            if [ -n "$pid" ]; then
                kill $pid 2>/dev/null
                log_success "实例 $id 已停止 (通过端口 $port 找到进程)"
            else
                log_warning "未找到监听端口 $port 的进程"
            fi
        else
            log_warning "未找到 PID 文件"
        fi
    fi

    sleep 1

    # 更新状态
    local instances=$(read_registry)

    if [ "$JSON_TOOL" = "jq" ]; then
        local tmp_file=$(mktemp)
        jq "(.instances[] | select(.id == $id) | .status) = \"stopped\" | (.instances[] | select(.id == $id) | .pid) = null" "$REGISTRY_FILE" > "$tmp_file" && mv "$tmp_file" "$REGISTRY_FILE"
    else
        save_registry "$(echo "$instances" | python3 -c "
import sys,json
instances=json.load(sys.stdin)
for i in instances:
    if i['id']==$id:
        i['status']='stopped'
        i['pid']=None
        break
print(json.dumps(instances))
")"
    fi
}

# 重启实例
restart_instance() {
    local id=$1
    stop_instance $id
    sleep 1
    start_instance $id
}

# 删除实例
delete_instance() {
    local id=$1
    local force=${2:-false}

    if [ -z "$id" ]; then
        log_error "请提供实例 ID"
        echo "用法：$0 delete <id> [--force]"
        return 1
    fi

    init_registry

    if ! check_instance_exists $id; then
        log_error "实例 $id 不存在"
        return 1
    fi

    local status=$(get_instance_field $id status)
    local dir=$(get_instance_field $id dir)
    local name=$(get_instance_field $id name)

    if [ "$status" = "running" ] && [ "$force" = false ]; then
        log_error "实例 $id 正在运行，请先停止或添加 --force 参数"
        return 1
    fi

    # 停止实例
    if [ "$status" = "running" ]; then
        stop_instance $id
    fi

    # 删除目录
    log_info "删除实例 $id ($name) 目录：$dir"
    rm -rf "$dir"

    # 更新注册表
    local instances=$(read_registry)

    if [ "$JSON_TOOL" = "jq" ]; then
        local tmp_file=$(mktemp)
        jq "del(.instances[] | select(.id == $id))" "$REGISTRY_FILE" > "$tmp_file" && mv "$tmp_file" "$REGISTRY_FILE"
    else
        save_registry "$(echo "$instances" | python3 -c "
import sys,json
instances=json.load(sys.stdin)
instances=[i for i in instances if i['id']!=$id]
print(json.dumps(instances))
")"
    fi

    log_success "实例 $id 已删除"
}

# 列出所有实例
list_instances() {
    init_registry

    local instances=$(read_registry)
    local count

    if [ "$JSON_TOOL" = "jq" ]; then
        count=$(echo "$instances" | jq 'length')
    else
        count=$(echo "$instances" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
    fi

    if [ "$count" -eq 0 ]; then
        log_info "暂无实例"
        return 0
    fi

    echo ""
    printf "${BLUE}%-5s %-20s %-8s %-10s %-12s %s${NC}\n" "ID" "名称" "端口" "状态" "PID" "创建时间"
    printf "%s\n" "-----------------------------------------------------------------------------"

    if [ "$JSON_TOOL" = "jq" ]; then
        echo "$instances" | jq -r '.[] | "\(.id) \(.name) \(.port) \(.status) \(.pid // "N/A") \(.createdAt)"' | while read -r id name port status pid createdAt; do
            if [ "$status" = "running" ]; then
                printf "%-5s %-20s %-8s ${GREEN}%-10s${NC} %-12s %s\n" "$id" "$name" "$port" "$status" "$pid" "$createdAt"
            else
                printf "%-5s %-20s %-8s ${YELLOW}%-10s${NC} %-12s %s\n" "$id" "$name" "$port" "$status" "$pid" "$createdAt"
            fi
        done
    else
        echo "$instances" | python3 -c "
import sys,json
instances=json.load(sys.stdin)
for i in sorted(instances, key=lambda x: x['id']):
    status_color = '\033[0;32m' if i['status']=='running' else '\033[1;33m'
    pid = i.get('pid', 'N/A')
    print(f\"{i['id']:<5} {i['name']:<20} {i['port']:<8} {status_color}{i['status']:<10}\033[0m {str(pid):<12} {i['createdAt']}\")
"
    fi

    echo ""
    log_info "共 $count 个实例"
}

# 查看实例状态
status_instance() {
    local id=$1

    if [ -z "$id" ]; then
        log_error "请提供实例 ID"
        echo "用法：$0 status <id>"
        return 1
    fi

    init_registry

    if ! check_instance_exists $id; then
        log_error "实例 $id 不存在"
        return 1
    fi

    local instance=$(get_instance $id)

    echo ""
    log_info "实例详情 (#${id}):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ "$JSON_TOOL" = "jq" ]; then
        echo "$instance" | jq -r '
" ID        : \(.id)
 名称      : \(.name)
 端口      : \(.port)
 状态      : \(.status)
 目录      : \(.dir)
 配置目录  : \(.configDir)
 日志目录  : \(.logDir)
 数据目录  : \(.dataDir)
 工作空间  : \(.workspace)
 创建时间  : \(.createdAt)
 PID       : \(.pid // "N/A")"'
    else
        echo "$instance" | python3 -c "
import sys,json
i=json.load(sys.stdin)
print(f''' ID        : {i['id']}
 名称      : {i['name']}
 端口      : {i['port']}
 状态      : {i['status']}
 目录      : {i['dir']}
 配置目录  : {i['configDir']}
 日志目录  : {i['logDir']}
 数据目录  : {i['dataDir']}
 工作空间  : {i['workspace']}
 创建时间  : {i['createdAt']}
 PID       : {i.get('pid', 'N/A')}''')
"
    fi

    # 检查进程是否真的在运行
    if [ "$(get_instance_field $id status)" = "running" ]; then
        local pid=$(get_instance_field $id pid)
        local port=$(get_instance_field $id port)

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        if [ -n "$pid" ] && kill -0 $pid 2>/dev/null; then
            log_success "进程运行正常 (PID: $pid)"
        elif command -v ss &> /dev/null && ss -tlnp 2>/dev/null | grep -q ":${port} "; then
            log_success "端口 $port 正在监听"
        else
            log_warning "进程可能未运行，但状态仍为 running"
        fi
    fi

    echo ""
}

# 查看实例日志
logs_instance() {
    local id=$1
    local lines=${2:-50}

    if [ -z "$id" ]; then
        log_error "请提供实例 ID"
        echo "用法：$0 logs <id> [lines]"
        return 1
    fi

    init_registry

    if ! check_instance_exists $id; then
        log_error "实例 $id 不存在"
        return 1
    fi

    local instance=$(get_instance $id)
    local log_file=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('logDir','') + '/openclaw.log')")

    if [ -f "$log_file" ]; then
        tail -n $lines "$log_file"
    else
        log_warning "日志文件不存在：$log_file"
    fi
}

# 显示帮助
show_help() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   OpenClaw 多实例管理器 v${SCRIPT_VERSION}${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════╝${NC}"
    echo ""
    echo "用法：$0 <command> [arguments]"
    echo ""
    echo "命令:"
    echo "  create <name> [port] [workspace]  创建新实例"
    echo "  start <id>                        启动实例"
    echo "  stop <id>                         停止实例"
    echo "  restart <id>                      重启实例"
    echo "  delete <id> [--force]             删除实例"
    echo "  list                              列出所有实例"
    echo "  status <id>                       查看实例详情"
    echo "  logs <id> [lines]                 查看实例日志"
    echo "  check                             检查环境"
    echo "  version                           显示版本"
    echo "  help                              显示帮助"
    echo ""
    echo "示例:"
    echo "  $0 create instance1              创建名为 instance1 的实例"
    echo "  $0 start 1                       启动 ID 为 1 的实例"
    echo "  $0 list                          列出所有实例"
    echo "  $0 logs 1 100                    查看实例 1 的最后 100 行日志"
    echo "  $0 status 1                      查看实例 1 的详细状态"
    echo "  $0 delete 1 --force              强制删除实例 1"
    echo ""
    echo "环境变量:"
    echo "  DEBUG=1                          启用调试模式"
    echo ""
}

# 检查环境
check_env() {
    log_info "检查环境..."
    echo ""

    check_node_version
    local node_ok=$?

    echo ""
    if [ $node_ok -eq 0 ]; then
        log_success "环境检查通过"
    else
        log_error "环境检查失败"
        return 1
    fi
}

# 主函数
main() {
    local command=$1
    shift || true

    case "$command" in
        create)
            create_instance "$@"
            ;;
        start)
            start_instance "$@"
            ;;
        stop)
            stop_instance "$@"
            ;;
        restart)
            restart_instance "$@"
            ;;
        delete)
            delete_instance "$@"
            ;;
        list|ls)
            list_instances
            ;;
        status)
            status_instance "$@"
            ;;
        logs)
            logs_instance "$@"
            ;;
        check)
            check_env
            ;;
        version|--version|-v)
            show_version
            ;;
        help|--help|-h|"")
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
