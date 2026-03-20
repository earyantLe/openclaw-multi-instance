#!/usr/bin/env node

/**
 * OpenClaw 进程监控器
 * 监控所有实例的运行状态，支持自动重启
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');
const MONITOR_LOG = path.join(__dirname, 'monitor.log');

// 配置
const CONFIG = {
    checkInterval: 30000,        // 检查间隔（毫秒）
    autoRestart: true,           // 自动重启
    maxRestarts: 3,              // 最大重启次数
    restartCooldown: 60000,      // 重启冷却时间（毫秒）
    logMaxSize: 1024 * 1024,     // 日志最大大小（1MB）
    alertOnCrash: true           // 崩溃时告警
};

// 日志函数
function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    process.stdout.write(line);

    // 写入日志文件
    try {
        if (fs.existsSync(MONITOR_LOG) && fs.statSync(MONITOR_LOG).size > CONFIG.logMaxSize) {
            fs.copyFileSync(MONITOR_LOG, MONITOR_LOG + '.old');
            fs.unlinkSync(MONITOR_LOG);
        }
        fs.appendFileSync(MONITOR_LOG, line);
    } catch (e) {
        // 忽略日志写入错误
    }
}

// 读取注册表
function readRegistry() {
    try {
        if (!fs.existsSync(REGISTRY_FILE)) {
            return { instances: [] };
        }
        const data = fs.readFileSync(REGISTRY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        log('读取注册表失败：' + e.message, 'error');
        return { instances: [] };
    }
}

// 检查进程是否运行
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

// 检查端口是否被监听
function isPortListening(port) {
    try {
        execSync(`ss -tlnp | grep :${port}`, { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

// 实例监控状态
const instanceState = new Map();

// 监控单个实例
function monitorInstance(instance) {
    const id = instance.id;
    const name = instance.name;
    const pid = instance.pid;
    const port = instance.port;
    const status = instance.status;

    if (status !== 'running') {
        return;
    }

    let state = instanceState.get(id) || {
        restarts: 0,
        lastRestart: 0,
        lastCheck: Date.now()
    };

    // 检查进程状态
    let isRunning = false;
    if (pid && isProcessRunning(pid)) {
        isRunning = true;
    }

    // 如果进程有 PID 但不运行，检查端口
    if (!isRunning && isPortListening(port)) {
        isRunning = true;
        log(`实例 #${id} (${name}) 进程 ID 无效但端口 ${port} 正在监听`, 'warn');
    }

    if (isRunning) {
        state.lastCheck = Date.now();
        instanceState.set(id, state);
        return;
    }

    // 进程未运行
    log(`实例 #${id} (${name}) 进程未运行!`, 'error');

    if (CONFIG.autoRestart) {
        const now = Date.now();

        // 检查冷却时间
        if (now - state.lastRestart < CONFIG.restartCooldown) {
            log(`实例 #${id} (${name}) 在冷却期内，跳过重启`, 'warn');
            state.restarts++;
            instanceState.set(id, state);
            return;
        }

        // 检查最大重启次数
        if (state.restarts >= CONFIG.maxRestarts) {
            log(`实例 #${id} (${name}) 已达到最大重启次数 (${CONFIG.maxRestarts})，不再重启`, 'error');
            if (CONFIG.alertOnCrash) {
                log(`⚠️  实例 #${id} (${name}) 可能已崩溃，需要人工干预!`, 'error');
            }
            return;
        }

        // 执行重启
        log(`正在重启实例 #${id} (${name})... (重启次数：${state.restarts + 1})`, 'info');

        try {
            const managerScript = path.join(__dirname, '../deploy-core/instance-manager.sh');
            execSync(`bash "${managerScript}" restart ${id}`, {
                cwd: instance.dir,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            log(`实例 #${id} (${name}) 重启成功`, 'success');

            state.restarts++;
            state.lastRestart = now;
            instanceState.set(id, state);
        } catch (e) {
            log(`实例 #${id} (${name}) 重启失败：${e.message}`, 'error');
            state.restarts++;
            instanceState.set(id, state);
        }
    }
}

// 主监控循环
function runMonitor() {
    log('进程监控器启动', 'info');
    log(`检查间隔：${CONFIG.checkInterval / 1000}秒，自动重启：${CONFIG.autoRestart}`);

    setInterval(() => {
        const registry = readRegistry();
        const instances = registry.instances || [];

        if (instances.length === 0) {
            return;
        }

        for (const instance of instances) {
            try {
                monitorInstance(instance);
            } catch (e) {
                log(`监控实例 #${instance.id} 失败：${e.message}`, 'error');
            }
        }

        // 清理长时间未检查的实例状态
        const now = Date.now();
        for (const [id, state] of instanceState.entries()) {
            if (now - state.lastCheck > CONFIG.checkInterval * 10) {
                instanceState.delete(id);
            }
        }
    }, CONFIG.checkInterval);
}

// 显示状态
function showStatus() {
    console.log('\n=== OpenClaw 进程监控状态 ===\n');

    const registry = readRegistry();
    const instances = registry.instances || [];

    if (instances.length === 0) {
        console.log('暂无实例');
        return;
    }

    console.log('实例状态:');
    console.log('─'.repeat(70));
    console.log('ID    名称               端口   状态      PID        监控状态');
    console.log('─'.repeat(70));

    for (const instance of instances) {
        const state = instanceState.get(instance.id);
        let monitorStatus = '-';

        if (instance.status === 'running') {
            if (state && state.restarts > 0) {
                monitorStatus = `重启${state.restarts}次`;
            } else {
                monitorStatus = '正常';
            }
        }

        const pidStr = instance.pid || 'N/A';
        const statusColor = instance.status === 'running' ? '✓' : '✗';

        console.log(`${String(instance.id).padEnd(6)}${instance.name.padEnd(20)}${String(instance.port).padEnd(8)}${statusColor} ${instance.status.padEnd(10)}${String(pidStr).padEnd(12)}${monitorStatus}`);
    }

    console.log('─'.repeat(70));
    console.log(`总计：${instances.length} 个实例，${instances.filter(i => i.status === 'running').length} 个运行中\n`);
}

// 命令行
const command = process.argv[2];

switch (command) {
    case 'start':
        runMonitor();
        break;

    case 'status':
        showStatus();
        break;

    case 'config':
        console.log('监控配置:');
        console.log(JSON.stringify(CONFIG, null, 2));
        break;

    case 'help':
    default:
        console.log(`
OpenClaw 进程监控器

用法：node process-monitor.js <command>

命令:
  start       启动监控（后台运行）
  status      显示监控状态
  config      显示监控配置
  help        显示帮助

示例:
  node process-monitor.js start &    # 后台启动监控
  node process-monitor.js status     # 查看状态
`);
}
