#!/bin/bash

# OpenClaw 实例备份还原工具
# 支持备份实例配置、数据，以及还原操作

set -e

# 配置
OPENCLAW_BASE_DIR="${HOME}/.openclaw"
INSTANCES_DIR="${OPENCLAW_BASE_DIR}/instances"
BACKUP_DIR="${OPENCLAW_BASE_DIR}/backups"
REGISTRY_FILE="${INSTANCES_DIR}/registry.json"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 初始化备份目录
init_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_info "创建备份目录：$BACKUP_DIR"
    fi
}

# 获取实例信息
get_instance() {
    local id=$1
    if [ ! -f "$REGISTRY_FILE" ]; then
        return 1
    fi
    python3 -c "
import json
with open('$REGISTRY_FILE') as f:
    data = json.load(f)
for i in data.get('instances', []):
    if i['id'] == $id:
        print(json.dumps(i))
        break
" 2>/dev/null
}

# 备份实例
backup_instance() {
    local id=$1
    local backup_name=$2

    if [ -z "$id" ]; then
        log_error "请提供实例 ID"
        echo "用法：$0 backup <instance_id> [backup_name]"
        return 1
    fi

    init_backup_dir

    local instance=$(get_instance $id)
    if [ -z "$instance" ]; then
        log_error "实例 $id 不存在"
        return 1
    fi

    local instance_dir=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('dir',''))")
    local instance_name=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))")

    if [ -z "$backup_name" ]; then
        backup_name="${instance_name}_$(date +%Y%m%d_%H%M%S)"
    fi

    local backup_path="${BACKUP_DIR}/${backup_name}"

    log_info "备份实例 $id ($instance_name)..."
    log_info "备份路径：$backup_path"

    # 检查实例是否运行
    local status=$(echo "$instance" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))")
    if [ "$status" = "running" ]; then
        log_warning "实例正在运行，备份可能不完整"
    fi

    # 创建备份
    mkdir -p "$backup_path"

    # 备份配置
    if [ -d "${instance_dir}/config" ]; then
        cp -r "${instance_dir}/config" "$backup_path/"
        log_success "配置已备份"
    fi

    # 备份数据
    if [ -d "${instance_dir}/data" ] && [ "$(ls -A ${instance_dir}/data 2>/dev/null)" ]; then
        cp -r "${instance_dir}/data" "$backup_path/"
        log_success "数据已备份"
    fi

    # 备份工作空间
    if [ -d "${instance_dir}/workspace" ] && [ "$(ls -A ${instance_dir}/workspace 2>/dev/null)" ]; then
        cp -r "${instance_dir}/workspace" "$backup_path/"
        log_success "工作空间已备份"
    fi

    # 保存实例元数据
    echo "$instance" | python3 -c "
import sys,json
data = json.load(sys.stdin)
data['backupAt'] = '$(date -Iseconds)'
data['backupPath'] = '$backup_path'
print(json.dumps(data, indent=2))
" > "$backup_path/instance.json"

    # 创建备份清单
    cat > "$backup_path/manifest.json" <<EOF
{
  "backupName": "${backup_name}",
  "instanceId": ${id},
  "instanceName": "${instance_name}",
  "backupAt": "$(date -Iseconds)",
  "status": "$status",
  "items": [
    $([ -d "$backup_path/config" ] && echo '"config",')
    $([ -d "$backup_path/data" ] && echo '"data",')
    $([ -d "$backup_path/workspace" ] && echo '"workspace",')
    "instance.json",
    "manifest.json"
  ]
}
EOF

    # 压缩备份
    if command -v tar &> /dev/null; then
        log_info "压缩备份..."
        cd "$BACKUP_DIR"
        tar -czf "${backup_name}.tar.gz" "$backup_name"
        rm -rf "$backup_path"
        backup_path="${BACKUP_DIR}/${backup_name}.tar.gz"
        log_success "备份完成：$backup_path"
    else
        log_success "备份完成：$backup_path"
    fi

    log_info "备份大小：$(du -sh "$backup_path" | cut -f1)"
}

# 列出备份
list_backups() {
    init_backup_dir

    log_info "可用备份:"
    echo ""

    local count=0
    for backup in "$BACKUP_DIR"/*.tar.gz "$BACKUP_DIR"/*/; do
        if [ -e "$backup" ]; then
            local name=$(basename "$backup" .tar.gz)
            local size=$(du -sh "$backup" 2>/dev/null | cut -f1)
            local date=""

            if [ -f "${backup%/}/manifest.json" ]; then
                date=$(python3 -c "import json; print(json.load(open('${backup%/}/manifest.json')).get('backupAt','未知'))" 2>/dev/null)
            elif [ -f "$backup" ]; then
                date=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1)
            fi

            printf "  %-30s %-10s %s\n" "$name" "$size" "$date"
            count=$((count + 1))
        fi
    done

    if [ $count -eq 0 ]; then
        echo "  暂无备份"
    fi
    echo ""
    log_info "共 $count 个备份"
}

# 还原备份
restore_instance() {
    local backup_name=$1
    local target_id=$2

    if [ -z "$backup_name" ]; then
        log_error "请提供备份名称"
        echo "用法：$0 restore <backup_name> [target_instance_id]"
        return 1
    fi

    local backup_path="${BACKUP_DIR}/${backup_name}"

    # 如果是 .tar.gz 文件，先解压
    if [ -f "${backup_path}.tar.gz" ]; then
        log_info "解压备份..."
        cd "$BACKUP_DIR"
        tar -xzf "${backup_name}.tar.gz"
        backup_path="${BACKUP_DIR}/${backup_name}"
    fi

    if [ ! -d "$backup_path" ]; then
        log_error "备份不存在：$backup_path"
        return 1
    fi

    # 读取备份元数据
    if [ ! -f "${backup_path}/instance.json" ]; then
        log_error "备份元数据不存在"
        return 1
    fi

    local instance_data=$(cat "${backup_path}/instance.json")
    local original_id=$(echo "$instance_data" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',0))")
    local original_name=$(echo "$instance_data" | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))")

    # 确定目标 ID
    if [ -z "$target_id" ]; then
        # 自动分配新 ID
        if [ -f "$REGISTRY_FILE" ]; then
            target_id=$(python3 -c "
import json
with open('$REGISTRY_FILE') as f:
    data = json.load(f)
ids = [i['id'] for i in data.get('instances', [])]
print(max(ids) + 1 if ids else 1)
")
        else
            target_id=1
        fi
    fi

    log_info "还原备份：$backup_name"
    log_info "原始实例：#$original_id ($original_name)"
    log_info "目标实例：#$target_id"

    # 创建新实例目录
    local new_base="${INSTANCES_DIR}/${target_id}"
    local new_config="${new_base}/config"
    local new_data="${new_base}/data"
    local new_logs="${new_base}/logs"
    local new_workspace="${new_base}/workspace"

    mkdir -p "$new_config" "$new_data" "$new_logs" "$new_workspace"

    # 还原文件
    if [ -d "${backup_path}/config" ]; then
        cp -r "${backup_path}/config/"* "$new_config/"
        log_success "配置已还原"
    fi

    if [ -d "${backup_path}/data" ]; then
        cp -r "${backup_path}/data/"* "$new_data/"
        log_success "数据已还原"
    fi

    if [ -d "${backup_path}/workspace" ]; then
        cp -r "${backup_path}/workspace/"* "$new_workspace/"
        log_success "工作空间已还原"
    fi

    # 更新配置文件中的 ID
    if [ -f "${new_config}/config.json" ]; then
        python3 -c "
import json
with open('${new_config}/config.json') as f:
    data = json.load(f)
data['instanceId'] = $target_id
data['restoredAt'] = '$(date -Iseconds)'
with open('${new_config}/config.json', 'w') as f:
    json.dump(data, f, indent=2)
"
    fi

    # 更新 .env 文件
    cat > "${new_base}/.env" <<EOF
OPENCLAW_PORT=18789
OPENCLAW_INSTANCE_ID=${target_id}
OPENCLAW_INSTANCE_NAME=${original_name}_restored
OPENCLAW_CONFIG_DIR=${new_config}
OPENCLAW_DATA_DIR=${new_data}
OPENCLAW_LOG_DIR=${new_logs}
OPENCLAW_WORKSPACE=${new_workspace}
EOF

    # 添加到注册表
    if [ ! -f "$REGISTRY_FILE" ]; then
        echo '{"instances":[]}' > "$REGISTRY_FILE"
    fi

    python3 -c "
import json
with open('$REGISTRY_FILE') as f:
    data = json.load(f)

new_instance = {
    'id': $target_id,
    'name': '${original_name}_restored',
    'port': 18789,
    'dir': '$new_base',
    'configDir': '$new_config',
    'logDir': '$new_logs',
    'dataDir': '$new_data',
    'workspace': '$new_workspace',
    'status': 'stopped',
    'pid': None,
    'createdAt': '$(date -Iseconds)',
    'restoredFrom': '$backup_name'
}

data['instances'].append(new_instance)
with open('$REGISTRY_FILE', 'w') as f:
    json.dump(data, f, indent=2)
"

    log_success "还原完成!"
    log_info "新实例 ID: $target_id"
    log_info "新实例名称：${original_name}_restored"
    log_info ""
    log_info "运行 '$0 start $target_id' 启动实例"
}

# 删除备份
delete_backup() {
    local backup_name=$1

    if [ -z "$backup_name" ]; then
        log_error "请提供备份名称"
        return 1
    fi

    local backup_path="${BACKUP_DIR}/${backup_name}"

    if [ -f "${backup_path}.tar.gz" ]; then
        rm -f "${backup_path}.tar.gz"
        log_success "备份已删除：${backup_path}.tar.gz"
    elif [ -d "$backup_path" ]; then
        rm -rf "$backup_path"
        log_success "备份已删除：$backup_path"
    else
        log_error "备份不存在：$backup_name"
        return 1
    fi
}

# 显示帮助
show_help() {
    echo ""
    echo -e "${BLUE}OpenClaw 备份还原工具${NC}"
    echo ""
    echo "用法：$0 <command> [arguments]"
    echo ""
    echo "命令:"
    echo "  backup <id> [name]     备份实例"
    echo "  list                   列出所有备份"
    echo "  restore <name> [id]    还原备份"
    echo "  delete <name>          删除备份"
    echo "  help                   显示帮助"
    echo ""
    echo "示例:"
    echo "  $0 backup 1              备份实例 1"
    echo "  $0 backup 1 my-backup    备份实例 1 并命名"
    echo "  $0 list                  列出所有备份"
    echo "  $0 restore my-backup     还原备份到新实例"
    echo "  $0 delete my-backup      删除备份"
    echo ""
}

# 主程序
main() {
    local command=$1
    shift || true

    case "$command" in
        backup)
            backup_instance "$@"
            ;;
        list)
            list_backups
            ;;
        restore)
            restore_instance "$@"
            ;;
        delete)
            delete_backup "$@"
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
