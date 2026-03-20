#!/usr/bin/env node

/**
 * OpenClaw 资源监控器
 * 监控所有实例的 CPU、内存、磁盘使用情况
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');
const MONITOR_LOG = path.join(__dirname, 'resource-monitor.log');

// 配置
const CONFIG = {
    checkInterval: 60000,        // 检查间隔（毫秒）
    logResources: true,          // 记录资源日志
    alertOnHighCPU: 90,          // CPU 告警阈值（%）
    alertOnHighMemory: 90,       // 内存告警阈值（%）
    alertOnHighDisk: 1000,       // 磁盘告警阈值（MB）
    historySize: 100             // 历史记录条数
};

// 资源历史记录
const resourceHistory = new Map();

// 日志函数
function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    process.stdout.write(line);

    try {
        if (fs.existsSync(MONITOR_LOG) && fs.statSync(MONITOR_LOG).size > 1024 * 1024) {
            fs.copyFileSync(MONITOR_LOG, MONITOR_LOG + '.old');
            fs.unlinkSync(MONITOR_LOG);
        }
        fs.appendFileSync(MONITOR_LOG, line);
    } catch (e) {}
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
        return { instances: [] };
    }
}

// 获取进程资源使用
function getProcessResources(pid) {
    try {
        const output = execSync(`ps -p ${pid} -o %cpu,%mem,rss,vsz,etime --no-headers 2>/dev/null || echo ""`, { encoding: 'utf8' });
        if (!output.trim()) return null;

        const [cpu, mem, rss, vsz, etime] = output.trim().split(/\s+/);
        return {
            cpu: parseFloat(cpu) || 0,
            memory: Math.round((parseInt(rss) || 0) / 1024), // MB
            virtualMemory: Math.round((parseInt(vsz) || 0) / 1024), // MB
            memoryPercent: parseFloat(mem) || 0,
            elapsedTime: etime || 'N/A'
        };
    } catch (e) {
        return null;
    }
}

// 获取目录大小
function getDirectorySize(dirPath) {
    try {
        const output = execSync(`du -sm "${dirPath}" 2>/dev/null || echo "0"`, { encoding: 'utf8' });
        return parseInt(output.trim()) || 0;
    } catch (e) {
        return 0;
    }
}

// 获取日志文件大小
function getLogSize(logDir) {
    let totalSize = 0;
    try {
        if (!fs.existsSync(logDir)) return 0;

        const files = fs.readdirSync(logDir);
        for (const file of files) {
            if (file.endsWith('.log') || file.endsWith('.bak') || file.endsWith('.old')) {
                const filePath = path.join(logDir, file);
                totalSize += fs.statSync(filePath).size;
            }
        }
        return Math.round(totalSize / 1024 / 1024 * 100) / 100; // MB
    } catch (e) {
        return 0;
    }
}

// 监控单个实例
function monitorInstance(instance) {
    const id = instance.id;
    const name = instance.name;
    const status = instance.status;

    const resources = {
        id: id,
        name: name,
        timestamp: Date.now(),
        status: status,
        pid: instance.pid,
        cpu: 0,
        memory: 0,
        memoryPercent: 0,
        virtualMemory: 0,
        diskUsage: 0,
        logSize: 0,
        elapsedTime: 'N/A'
    };

    if (status === 'running' && instance.pid) {
        const procResources = getProcessResources(instance.pid);
        if (procResources) {
            resources.cpu = procResources.cpu;
            resources.memory = procResources.memory;
            resources.memoryPercent = procResources.memoryPercent;
            resources.virtualMemory = procResources.virtualMemory;
            resources.elapsedTime = procResources.elapsedTime;
        }

        if (instance.dir) {
            resources.diskUsage = getDirectorySize(instance.dir);
        }

        if (instance.logDir) {
            resources.logSize = getLogSize(instance.logDir);
        }

        // 检查告警
        if (resources.cpu > CONFIG.alertOnHighCPU) {
            log(`实例 #${id} (${name}) CPU 使用率过高：${resources.cpu.toFixed(1)}%`, 'warn');
        }
        if (resources.memoryPercent > CONFIG.alertOnHighMemory) {
            log(`实例 #${id} (${name}) 内存使用率过高：${resources.memoryPercent.toFixed(1)}%`, 'warn');
        }
        if (resources.diskUsage > CONFIG.alertOnHighDisk) {
            log(`实例 #${id} (${name}) 磁盘使用过多：${resources.diskUsage}MB`, 'warn');
        }
    }

    // 保存历史记录
    if (!resourceHistory.has(id)) {
        resourceHistory.set(id, []);
    }
    const history = resourceHistory.get(id);
    history.push(resources);
    if (history.length > CONFIG.historySize) {
        history.shift();
    }

    return resources;
}

// 获取所有实例资源
function getAllResources() {
    const registry = readRegistry();
    const instances = registry.instances || [];
    const resources = [];

    for (const instance of instances) {
        resources.push(monitorInstance(instance));
    }

    return resources;
}

// 显示资源使用情况
function showResources() {
    const resources = getAllResources();

    console.log('\n=== OpenClaw 资源使用情况 ===\n');

    if (resources.length === 0) {
        console.log('暂无实例');
        return;
    }

    console.log('─'.repeat(100));
    console.log('ID    名称               状态   CPU%    内存 (MB)   内存%    磁盘 (MB)   日志 (MB)   运行时间');
    console.log('─'.repeat(100));

    let totalCPU = 0;
    let totalMemory = 0;
    let totalDisk = 0;
    let totalLog = 0;
    let runningCount = 0;

    for (const r of resources) {
        const statusSymbol = r.status === 'running' ? '✓' : '✗';
        if (r.status === 'running') {
            totalCPU += r.cpu;
            totalMemory += r.memory;
            runningCount++;
        }
        totalDisk += r.diskUsage;
        totalLog += r.logSize;

        const cpuStr = r.status === 'running' ? r.cpu.toFixed(1) : '-';
        const memStr = r.status === 'running' ? String(r.memory) : '-';
        const memPctStr = r.status === 'running' ? r.memoryPercent.toFixed(1) : '-';
        const timeStr = r.status === 'running' ? r.elapsedTime : '-';

        console.log(`${String(r.id).padEnd(6)}${r.name.padEnd(20)}${statusSymbol} ${r.status.padEnd(8)}${String(cpuStr).padEnd(8)}${String(memStr).padEnd(12)}${String(memPctStr).padEnd(9)}${String(r.diskUsage).padEnd(12)}${String(r.logSize).padEnd(12)}${timeStr}`);
    }

    console.log('─'.repeat(100));
    console.log(`总计：${resources.length} 个实例，${runningCount} 个运行中`);
    console.log(`CPU: ${totalCPU.toFixed(1)}% | 内存：${totalMemory}MB | 磁盘：${totalDisk}MB | 日志：${totalLog.toFixed(2)}MB\n`);
}

// 导出 JSON
function exportJSON(outputFile) {
    const resources = getAllResources();
    const exportData = {
        timestamp: new Date().toISOString(),
        config: CONFIG,
        instances: resources
    };

    fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
    log(`资源数据已导出：${outputFile}`);
}

// 主监控循环
function runMonitor() {
    log('资源监控器启动', 'info');
    log(`检查间隔：${CONFIG.checkInterval / 1000}秒`);

    setInterval(() => {
        const resources = getAllResources();

        if (CONFIG.logResources) {
            const running = resources.filter(r => r.status === 'running');
            const totalCPU = running.reduce((sum, r) => sum + r.cpu, 0);
            const totalMemory = running.reduce((sum, r) => sum + r.memory, 0);

            log(`监控检查 - 运行实例：${running.length}, 总 CPU: ${totalCPU.toFixed(1)}%, 总内存：${totalMemory}MB`);
        }
    }, CONFIG.checkInterval);
}

// 显示历史趋势
function showHistory() {
    console.log('\n=== 资源使用历史趋势 ===\n');

    if (resourceHistory.size === 0) {
        console.log('暂无历史数据');
        return;
    }

    for (const [id, history] of resourceHistory.entries()) {
        if (history.length === 0) continue;

        console.log(`实例 #${id} (${history[0].name}):`);
        console.log('  最近 5 次记录:');

        const recent = history.slice(-5);
        for (const r of recent) {
            const time = new Date(r.timestamp).toLocaleTimeString();
            console.log(`    ${time} - CPU: ${r.cpu.toFixed(1)}%, 内存：${r.memory}MB, 磁盘：${r.diskUsage}MB`);
        }
        console.log('');
    }
}

// 命令行
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
    case 'start':
        runMonitor();
        break;

    case 'status':
    case 'show':
        showResources();
        break;

    case 'history':
        showHistory();
        break;

    case 'export':
        exportJSON(args[0] || 'resources.json');
        break;

    case 'config':
        console.log('监控配置:');
        console.log(JSON.stringify(CONFIG, null, 2));
        break;

    case 'help':
    default:
        console.log(`
OpenClaw 资源监控器

用法：node resource-monitor.js <command> [options]

命令:
  start       启动监控（后台运行）
  status      显示资源使用情况
  history     显示历史趋势
  export      导出 JSON 数据
  config      显示监控配置
  help        显示帮助

示例:
  node resource-monitor.js status     # 查看资源使用
  node resource-monitor.js start &    # 后台启动监控
  node resource-monitor.js export     # 导出数据到 JSON
`);
}
