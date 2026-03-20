#!/bin/bash

# OpenClaw 多实例部署 - 一键安装脚本
# 自动安装依赖、初始化环境、启动管理面板

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "========================================"
echo "  OpenClaw 多实例部署系统"
echo "  一键安装脚本"
echo "========================================"
echo ""

# 检查 Node.js
check_node() {
    log_info "检查 Node.js 安装..."

    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        log_info "请访问 https://nodejs.org/ 安装 Node.js >= 22"
        log_info "或使用 nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        return 1
    fi

    local version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$version" -lt 22 ]; then
        log_error "Node.js 版本过低：$(node -v)，需要 >= 22.x"
        return 1
    fi

    log_success "Node.js 版本：$(node -v)"
}

# 检查 Python3
check_python() {
    log_info "检查 Python3 安装..."

    if ! command -v python3 &> /dev/null; then
        log_error "Python3 未安装"
        log_info "请安装 Python3: sudo apt install python3 (Ubuntu/Debian)"
        return 1
    fi

    log_success "Python3 版本：$(python3 --version)"
}

# 安装管理面板依赖
install_admin_panel() {
    log_info "安装管理面板依赖..."

    local admin_dir="${PROJECT_DIR}/admin-panel"

    if [ -f "${admin_dir}/package.json" ]; then
        cd "$admin_dir"
        npm install
        log_success "管理面板依赖安装完成"
    else
        log_warning "管理面板 package.json 不存在，跳过"
    fi
}

# 初始化目录
init_dirs() {
    log_info "初始化目录结构..."

    local base_dir="${HOME}/.openclaw"
    local instances_dir="${base_dir}/instances"

    mkdir -p "$instances_dir"

    # 初始化注册表
    if [ ! -f "${instances_dir}/registry.json" ]; then
        echo '{"instances":[]}' > "${instances_dir}/registry.json"
        log_info "初始化实例注册表"
    fi

    # 复制实例管理器
    if [ -f "${PROJECT_DIR}/deploy-core/instance-manager.sh" ]; then
        chmod +x "${PROJECT_DIR}/deploy-core/instance-manager.sh"

        # 创建软链接到全局路径
        if [ -w "/usr/local/bin" ]; then
            ln -sf "${PROJECT_DIR}/deploy-core/instance-manager.sh" /usr/local/bin/openclaw-manager
            log_info "创建全局命令：openclaw-manager"
        else
            log_warning "无法创建全局命令，请使用：${PROJECT_DIR}/deploy-core/instance-manager.sh"
        fi
    fi

    log_success "目录初始化完成"
}

# 初始化配置
init_config() {
    log_info "初始化配置..."

    local config_dir="${PROJECT_DIR}/config"

    # 端口分配器
    if [ ! -f "${config_dir}/port-allocator.js" ]; then
        cat > "${config_dir}/port-allocator.js" << 'EOF'
// 端口分配器
const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');
const DEFAULT_PORT = 18789;

function readRegistry() {
    try {
        const data = fs.readFileSync(REGISTRY_FILE, 'utf8');
        return JSON.parse(data).instances || [];
    } catch (e) {
        return [];
    }
}

function getUsedPorts() {
    const instances = readRegistry();
    return instances.map(i => i.port);
}

function getNextPort() {
    const usedPorts = getUsedPorts();
    let port = DEFAULT_PORT;
    while (usedPorts.includes(port)) {
        port++;
    }
    return port;
}

function isPortAvailable(port) {
    const usedPorts = getUsedPorts();
    return !usedPorts.includes(port);
}

module.exports = {
    getNextPort,
    isPortAvailable,
    getUsedPorts
};
EOF
    fi

    # 实例注册表管理
    if [ ! -f "${config_dir}/instance-registry.js" ]; then
        cat > "${config_dir}/instance-registry.js" << 'EOF'
// 实例注册表管理
const fs = require('fs');
const path = require('path');

const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');

function readRegistry() {
    try {
        const data = fs.readFileSync(REGISTRY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { instances: [] };
    }
}

function writeRegistry(data) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

function getInstances() {
    return readRegistry().instances || [];
}

function getInstanceById(id) {
    const instances = getInstances();
    return instances.find(i => i.id === parseInt(id));
}

function getInstanceByName(name) {
    const instances = getInstances();
    return instances.find(i => i.name === name);
}

function addInstance(instance) {
    const registry = readRegistry();
    registry.instances.push(instance);
    writeRegistry(registry);
}

function updateInstance(id, updates) {
    const registry = readRegistry();
    const index = registry.instances.findIndex(i => i.id === parseInt(id));
    if (index !== -1) {
        registry.instances[index] = { ...registry.instances[index], ...updates };
        writeRegistry(registry);
        return true;
    }
    return false;
}

function removeInstance(id) {
    const registry = readRegistry();
    const index = registry.instances.findIndex(i => i.id === parseInt(id));
    if (index !== -1) {
        registry.instances.splice(index, 1);
        writeRegistry(registry);
        return true;
    }
    return false;
}

module.exports = {
    readRegistry,
    writeRegistry,
    getInstances,
    getInstanceById,
    getInstanceByName,
    addInstance,
    updateInstance,
    removeInstance
};
EOF
    fi

    log_success "配置初始化完成"
}

# 启动管理面板
start_admin_panel() {
    log_info "启动管理面板..."

    local admin_dir="${PROJECT_DIR}/admin-panel"

    if [ -f "${admin_dir}/server.js" ]; then
        cd "$admin_dir"

        # 检查是否已经在运行
        if [ -f "${admin_dir}/.pid" ]; then
            local pid=$(cat "${admin_dir}/.pid")
            if kill -0 $pid 2>/dev/null; then
                log_warning "管理面板已在运行 (PID: $pid)"
                read -p "是否重启？(y/N): " confirm
                if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
                    return 0
                fi
                kill $pid
                sleep 1
            fi
        fi

        # 后台启动
        nohup node server.js > "${admin_dir}/.log" 2>&1 &
        echo $! > "${admin_dir}/.pid"

        sleep 2
        log_success "管理面板已启动 (PID: $(cat ${admin_dir}/.pid))"
        log_info "访问地址：http://localhost:3000"
    else
        log_warning "管理面板 server.js 不存在，跳过"
    fi
}

# 显示使用帮助
show_help() {
    echo ""
    echo "========================================"
    echo "  安装完成!"
    echo "========================================"
    echo ""
    echo "使用方法:"
    echo ""
    echo "  实例管理:"
    echo "    openclaw-manager create <name>     创建实例"
    echo "    openclaw-manager start <id>        启动实例"
    echo "    openclaw-manager stop <id>         停止实例"
    echo "    openclaw-manager list              列出实例"
    echo ""
    echo "  管理面板:"
    echo "    访问 http://localhost:3000"
    echo ""
    echo "  停止管理面板:"
    echo "    cd ${PROJECT_DIR}/admin-panel && kill \$(cat .pid)"
    echo ""
}

# 主流程
main() {
    echo ""
    log_info "开始安装..."
    echo ""

    # 检查依赖
    check_node || exit 1
    check_python || exit 1
    echo ""

    # 安装依赖
    install_admin_panel
    echo ""

    # 初始化
    init_dirs
    init_config
    echo ""

    # 启动管理面板
    start_admin_panel
    echo ""

    show_help
}

main "$@"
