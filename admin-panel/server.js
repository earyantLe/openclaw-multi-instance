// OpenClaw 管理面板服务器
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.OPENCLAW_ADMIN_PORT || 3000;
const MANAGER_SCRIPT = path.join(__dirname, '../../deploy-core/instance-manager.sh');

// 注册表文件路径
const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 请求日志中间件
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// 工具函数
function readRegistry() {
    try {
        if (!fs.existsSync(REGISTRY_FILE)) {
            // 初始化注册表
            const dir = path.dirname(REGISTRY_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(REGISTRY_FILE, '{"instances":[]}');
        }
        const data = fs.readFileSync(REGISTRY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('读取注册表失败:', e.message);
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

function checkPortAvailable(port) {
    const instances = getInstances();
    return !instances.some(i => i.port === port);
}

function getNextPort() {
    const instances = getInstances();
    const usedPorts = instances.map(i => i.port);
    let port = 18789;
    while (usedPorts.includes(port)) {
        port++;
    }
    return port;
}

function getNextId() {
    const instances = getInstances();
    if (instances.length === 0) return 1;
    return Math.max(...instances.map(i => i.id)) + 1;
}

function executeCommand(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, {
            cwd: options.cwd || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...options.env }
        });
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', data => stdout += data.toString());
        proc.stderr.on('data', data => stderr += data.toString());

        proc.on('close', code => {
            resolve({ code, stdout, stderr });
        });

        proc.on('error', reject);
    });
}

function ensureInstanceDir(instance) {
    const dirs = [instance.dir, instance.configDir, instance.logDir, instance.dataDir, instance.workspace];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

// API 路由

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.1.0'
    });
});

// 批量操作 - 全部启动
app.post('/api/batch/start-all', async (req, res) => {
    try {
        const instances = getInstances();
        const stopped = instances.filter(i => i.status === 'stopped');
        const results = [];

        for (const instance of stopped) {
            try {
                await executeCommand('bash', [MANAGER_SCRIPT, 'start', String(instance.id)], {
                    cwd: instance.dir
                });
                results.push({ id: instance.id, name: instance.name, success: true });
            } catch (e) {
                results.push({ id: instance.id, name: instance.name, success: false, error: e.message });
            }
        }

        // 更新所有状态
        const registry = readRegistry();
        results.forEach(r => {
            if (r.success) {
                const idx = registry.instances.findIndex(i => i.id === r.id);
                if (idx !== -1) {
                    registry.instances[idx].status = 'running';
                }
            }
        });
        writeRegistry(registry);

        log_success(`批量启动：${results.filter(r => r.success).length}/${stopped.length} 成功`);
        res.json({ success: true, message: `已启动 ${results.filter(r => r.success).length}/${stopped.length} 个实例`, results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 批量操作 - 全部停止
app.post('/api/batch/stop-all', async (req, res) => {
    try {
        const instances = getInstances();
        const running = instances.filter(i => i.status === 'running');
        const results = [];

        for (const instance of running) {
            try {
                await executeCommand('bash', [MANAGER_SCRIPT, 'stop', String(instance.id)], {
                    cwd: instance.dir
                });
                results.push({ id: instance.id, name: instance.name, success: true });
            } catch (e) {
                results.push({ id: instance.id, name: instance.name, success: false, error: e.message });
            }
        }

        // 更新所有状态
        const registry = readRegistry();
        results.forEach(r => {
            if (r.success) {
                const idx = registry.instances.findIndex(i => i.id === r.id);
                if (idx !== -1) {
                    registry.instances[idx].status = 'stopped';
                }
            }
        });
        writeRegistry(registry);

        log_success(`批量停止：${results.length} 个实例`);
        res.json({ success: true, message: `已停止 ${results.length} 个实例`, results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 批量操作 - 全部重启
app.post('/api/batch/restart-all', async (req, res) => {
    try {
        const instances = getInstances();
        const running = instances.filter(i => i.status === 'running');
        const results = [];

        for (const instance of running) {
            try {
                await executeCommand('bash', [MANAGER_SCRIPT, 'restart', String(instance.id)], {
                    cwd: instance.dir
                });
                results.push({ id: instance.id, name: instance.name, success: true });
            } catch (e) {
                results.push({ id: instance.id, name: instance.name, success: false, error: e.message });
            }
        }

        log_success(`批量重启：${results.length} 个实例`);
        res.json({ success: true, message: `已重启 ${results.length} 个实例`, results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取系统信息
app.get('/api/system', (req, res) => {
    try {
        const instances = getInstances();
        const os = require('os');

        res.json({
            success: true,
            data: {
                platform: os.platform(),
                nodeVersion: process.version,
                uptime: process.uptime(),
                memory: {
                    total: Math.round(os.totalmem() / 1024 / 1024),
                    free: Math.round(os.freemem() / 1024 / 1024)
                },
                instances: {
                    total: instances.length,
                    running: instances.filter(i => i.status === 'running').length,
                    stopped: instances.filter(i => i.status === 'stopped').length
                }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取所有实例
app.get('/api/instances', (req, res) => {
    try {
        const instances = getInstances();
        res.json({ success: true, data: instances });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取单个实例
app.get('/api/instances/:id', (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }
        res.json({ success: true, data: instance });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 创建实例
app.post('/api/instances', async (req, res) => {
    try {
        const { name, port, workspace } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: '实例名称不能为空' });
        }

        const instances = getInstances();

        // 检查名称是否已存在
        if (instances.some(i => i.name === name)) {
            return res.status(400).json({ success: false, error: '实例名称已存在' });
        }

        // 分配端口
        const assignPort = port || getNextPort();
        if (!checkPortAvailable(assignPort)) {
            return res.status(400).json({ success: false, error: '端口已被占用' });
        }

        // 创建实例目录
        const baseDir = path.join(process.env.HOME, '.openclaw/instances');
        const nextId = getNextId();
        const instanceDir = path.join(baseDir, String(nextId));
        const configDir = path.join(instanceDir, 'config');
        const logDir = path.join(instanceDir, 'logs');
        const dataDir = path.join(instanceDir, 'data');
        const workspaceDir = workspace || path.join(instanceDir, 'workspace');

        // 创建目录
        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(logDir, { recursive: true });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.mkdirSync(workspaceDir, { recursive: true });

        // 创建配置文件
        const config = {
            instanceId: nextId,
            instanceName: name,
            port: assignPort,
            workspace: workspaceDir,
            createdAt: new Date().toISOString()
        };
        fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config, null, 2));

        // 创建 .env 文件
        const envContent = `OPENCLAW_PORT=${assignPort}
OPENCLAW_INSTANCE_ID=${nextId}
OPENCLAW_INSTANCE_NAME=${name}
OPENCLAW_CONFIG_DIR=${configDir}
OPENCLAW_DATA_DIR=${dataDir}
OPENCLAW_LOG_DIR=${logDir}
OPENCLAW_WORKSPACE=${workspaceDir}
`;
        fs.writeFileSync(path.join(instanceDir, '.env'), envContent);

        // 添加到注册表
        const newInstance = {
            id: nextId,
            name: name,
            port: assignPort,
            dir: instanceDir,
            configDir: configDir,
            logDir: logDir,
            dataDir: dataDir,
            workspace: workspaceDir,
            status: 'stopped',
            pid: null,
            createdAt: new Date().toISOString()
        };

        const registry = readRegistry();
        registry.instances.push(newInstance);
        writeRegistry(registry);

        log_success("实例创建成功：" + name);
        res.status(201).json({ success: true, data: newInstance });
    } catch (e) {
        console.error('创建实例失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 启动实例
app.post('/api/instances/:id/start', async (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        if (instance.status === 'running') {
            return res.status(400).json({ success: false, error: '实例已在运行中' });
        }

        // 确保目录存在
        ensureInstanceDir(instance);

        // 执行启动脚本
        const result = await executeCommand('bash', [MANAGER_SCRIPT, 'start', String(instance.id)], {
            cwd: instance.dir
        });

        if (result.code !== 0 && result.stderr) {
            console.log('启动脚本返回:', result.stderr);
        }

        // 更新状态
        const registry = readRegistry();
        const idx = registry.instances.findIndex(i => i.id === instance.id);
        if (idx !== -1) {
            registry.instances[idx].status = 'running';
            // 读取 PID 文件
            const pidFile = path.join(instance.dir, 'openclaw.pid');
            if (fs.existsSync(pidFile)) {
                registry.instances[idx].pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
            }
            writeRegistry(registry);
        }

        log_success("实例启动：" + instance.name);
        res.json({ success: true, message: '实例启动成功' });
    } catch (e) {
        console.error('启动实例失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 停止实例
app.post('/api/instances/:id/stop', async (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        if (instance.status === 'stopped') {
            return res.status(400).json({ success: false, error: '实例已停止' });
        }

        // 执行停止脚本
        await executeCommand('bash', [MANAGER_SCRIPT, 'stop', String(instance.id)], {
            cwd: instance.dir
        });

        // 更新状态
        const registry = readRegistry();
        const idx = registry.instances.findIndex(i => i.id === instance.id);
        if (idx !== -1) {
            registry.instances[idx].status = 'stopped';
            registry.instances[idx].pid = null;
            writeRegistry(registry);
        }

        log_success("实例停止：" + instance.name);
        res.json({ success: true, message: '实例已停止' });
    } catch (e) {
        console.error('停止实例失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 重启实例
app.post('/api/instances/:id/restart', async (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        // 执行重启脚本
        await executeCommand('bash', [MANAGER_SCRIPT, 'restart', String(instance.id)], {
            cwd: instance.dir
        });

        // 更新状态
        const registry = readRegistry();
        const idx = registry.instances.findIndex(i => i.id === instance.id);
        if (idx !== -1) {
            registry.instances[idx].status = 'running';
            writeRegistry(registry);
        }

        log_success("实例重启：" + instance.name);
        res.json({ success: true, message: '实例已重启' });
    } catch (e) {
        console.error('重启实例失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 删除实例
app.delete('/api/instances/:id', async (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        // 如果实例在运行，先停止
        if (instance.status === 'running') {
            await executeCommand('bash', [MANAGER_SCRIPT, 'stop', String(instance.id)], {
                cwd: instance.dir
            });
        }

        // 删除目录
        await new Promise((resolve, reject) => {
            exec(`rm -rf "${instance.dir}"`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // 从注册表移除
        const registry = readRegistry();
        registry.instances = registry.instances.filter(i => i.id !== instance.id);
        writeRegistry(registry);

        log_success("实例删除：" + instance.name);
        res.json({ success: true, message: '实例已删除' });
    } catch (e) {
        console.error('删除实例失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取实例日志
app.get('/api/instances/:id/logs', (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        const logFile = path.join(instance.logDir, 'openclaw.log');
        const lines = parseInt(req.query.lines) || 50;

        if (!fs.existsSync(logFile)) {
            return res.json({ success: true, data: { logs: '', exists: false, message: '日志文件不存在' } });
        }

        exec(`tail -n ${lines} "${logFile}"`, (err, stdout, stderr) => {
            if (err) {
                res.json({ success: true, data: { logs: stderr || stdout, exists: true } });
            } else {
                res.json({ success: true, data: { logs: stdout, exists: true } });
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取实例状态（实时检查）
app.get('/api/instances/:id/status', (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        // 检查进程是否真的在运行
        let actualStatus = instance.status;
        let portStatus = 'unknown';

        if (instance.status === 'running' && instance.pid) {
            try {
                process.kill(instance.pid, 0);
                portStatus = 'pid-active';
            } catch (e) {
                actualStatus = 'stopped';
                // 更新状态
                const registry = readRegistry();
                const idx = registry.instances.findIndex(i => i.id === instance.id);
                if (idx !== -1) {
                    registry.instances[idx].status = 'stopped';
                    writeRegistry(registry);
                }
            }
        }

        // 检查端口
        const { execSync } = require('child_process');
        try {
            execSync(`ss -tlnp | grep :${instance.port}`, { stdio: 'pipe' });
            portStatus = 'listening';
        } catch (e) {
            portStatus = 'not-listening';
        }

        res.json({
            success: true,
            data: {
                ...instance,
                status: actualStatus,
                health: actualStatus === 'running' && portStatus === 'listening' ? 'healthy' : 'degraded',
                portStatus
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取实例配置
app.get('/api/instances/:id/config', (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        const configFile = path.join(instance.configDir, 'config.json');
        if (!fs.existsSync(configFile)) {
            return res.status(404).json({ success: false, error: '配置文件不存在' });
        }

        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        res.json({ success: true, data: config });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 更新实例配置
app.post('/api/instances/:id/config', async (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        if (instance.status === 'running') {
            return res.status(400).json({ success: false, error: '请先停止实例再修改配置' });
        }

        const { workspace } = req.body;
        const configFile = path.join(instance.configDir, 'config.json');

        if (!fs.existsSync(configFile)) {
            return res.status(404).json({ success: false, error: '配置文件不存在' });
        }

        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (workspace) config.workspace = workspace;
        config.updatedAt = new Date().toISOString();

        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

        // 更新 .env 文件
        const envContent = `OPENCLAW_PORT=${instance.port}
OPENCLAW_INSTANCE_ID=${instance.id}
OPENCLAW_INSTANCE_NAME=${instance.name}
OPENCLAW_CONFIG_DIR=${instance.configDir}
OPENCLAW_DATA_DIR=${instance.dataDir}
OPENCLAW_LOG_DIR=${instance.logDir}
OPENCLAW_WORKSPACE=${workspace || instance.workspace}
`;
        fs.writeFileSync(path.join(instance.dir, '.env'), envContent);

        log_success(`配置更新：${instance.name}`);
        res.json({ success: true, message: '配置已更新', data: config });
    } catch (e) {
        console.error('更新配置失败:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 清空日志
app.post('/api/instances/:id/logs/clear', (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        const logFile = path.join(instance.logDir, 'openclaw.log');
        if (fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, '');
            log_success(`日志清空：${instance.name}`);
        }

        res.json({ success: true, message: '日志已清空' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取实例资源使用情况
app.get('/api/instances/:id/resources', (req, res) => {
    try {
        const instance = getInstanceById(req.params.id);
        if (!instance) {
            return res.status(404).json({ success: false, error: '实例不存在' });
        }

        const resources = {
            pid: instance.pid,
            cpu: 0,
            memory: 0,
            diskUsage: 0,
            logSize: 0
        };

        if (instance.pid && instance.status === 'running') {
            try {
                // 获取进程资源使用情况
                const { execSync } = require('child_process');

                // CPU 和内存使用
                try {
                    const psOutput = execSync(`ps -p ${instance.pid} -o %cpu,%mem,rss,vsz --no-headers 2>/dev/null || echo "0 0 0 0"`, { encoding: 'utf8' });
                    const [cpu, mem, rss, vsz] = psOutput.trim().split(/\s+/).map(Number);
                    resources.cpu = cpu || 0;
                    resources.memory = Math.round((rss || 0) / 1024); // MB
                    resources.virtualMemory = Math.round((vsz || 0) / 1024); // MB
                } catch (e) {
                    // 忽略 PS 命令错误
                }

                // 磁盘使用
                try {
                    const duOutput = execSync(`du -sm "${instance.dir}" 2>/dev/null || echo "0"`, { encoding: 'utf8' });
                    resources.diskUsage = parseInt(duOutput.trim()) || 0;
                } catch (e) {
                    // 忽略 DU 命令错误
                }
            } catch (e) {
                // 忽略错误
            }
        }

        // 日志文件大小
        const logFile = path.join(instance.logDir, 'openclaw.log');
        if (fs.existsSync(logFile)) {
            resources.logSize = Math.round(fs.statSync(logFile).size / 1024 / 1024 * 100) / 100; // MB
        }

        res.json({ success: true, data: resources });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 获取所有实例资源统计
app.get('/api/resources/stats', (req, res) => {
    try {
        const instances = getInstances();
        const stats = {
            totalInstances: instances.length,
            runningInstances: instances.filter(i => i.status === 'running').length,
            totalCPU: 0,
            totalMemory: 0,
            totalDisk: 0,
            totalLogSize: 0
        };

        const { execSync } = require('child_process');

        for (const instance of instances) {
            if (instance.status === 'running' && instance.pid) {
                try {
                    const psOutput = execSync(`ps -p ${instance.pid} -o %cpu,%mem,rss --no-headers 2>/dev/null || echo "0 0 0"`, { encoding: 'utf8' });
                    const [cpu, mem, rss] = psOutput.trim().split(/\s+/).map(Number);
                    stats.totalCPU += cpu || 0;
                    stats.totalMemory += Math.round((rss || 0) / 1024);
                } catch (e) {
                    // 忽略
                }
            }

            // 磁盘使用
            try {
                const duOutput = execSync(`du -sm "${instance.dir}" 2>/dev/null || echo "0"`, { encoding: 'utf8' });
                stats.totalDisk += parseInt(duOutput.trim()) || 0;
            } catch (e) {
                // 忽略
            }

            // 日志文件大小
            const logFile = path.join(instance.logDir, 'openclaw.log');
            if (fs.existsSync(logFile)) {
                stats.totalLogSize += Math.round(fs.statSync(logFile).size / 1024 / 1024 * 100) / 100;
            }
        }

        stats.totalCPU = Math.round(stats.totalCPU * 100) / 100;
        stats.totalMemory = Math.round(stats.totalMemory);
        stats.totalDisk = Math.round(stats.totalDisk);
        stats.totalLogSize = Math.round(stats.totalLogSize * 100) / 100;

        res.json({ success: true, data: stats });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 日志自动清理
app.post('/api/logs/cleanup', (req, res) => {
    try {
        const { maxAge = 7, maxSize = 50 } = req.body; // 默认保留 7 天，最大 50MB
        const instances = getInstances();
        const results = { cleaned: 0, rotated: 0, errors: [] };

        for (const instance of instances) {
            const logFile = path.join(instance.logDir, 'openclaw.log');

            if (!fs.existsSync(logFile)) continue;

            try {
                const stats = fs.statSync(logFile);
                const sizeMB = stats.size / 1024 / 1024;
                const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);

                // 如果超过最大大小，轮转日志
                if (sizeMB > maxSize) {
                    const backupFile = `${logFile}.${Date.now()}.bak`;
                    fs.renameSync(logFile, backupFile);
                    fs.writeFileSync(logFile, '');
                    results.rotated++;
                    log_success(`日志轮转：${instance.name} (${sizeMB.toFixed(2)}MB)`);
                }
                // 如果超过最大年龄，删除旧备份
                else if (ageDays > maxAge) {
                    // 检查是否有备份文件
                    const logDir = instance.logDir;
                    const files = fs.readdirSync(logDir);
                    for (const file of files) {
                        if (file.endsWith('.bak') || file.endsWith('.old')) {
                            const filePath = path.join(logDir, file);
                            const fileStats = fs.statSync(filePath);
                            const fileAgeDays = (Date.now() - fileStats.mtimeMs) / (1000 * 60 * 60 * 24);
                            if (fileAgeDays > maxAge) {
                                fs.unlinkSync(filePath);
                                results.cleaned++;
                            }
                        }
                    }
                }
            } catch (e) {
                results.errors.push(`${instance.name}: ${e.message}`);
            }
        }

        res.json({ success: true, message: '日志清理完成', data: results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 实时日志（SSE）
app.get('/api/instances/:id/logs/stream', (req, res) => {
    const instance = getInstanceById(req.params.id);
    if (!instance) {
        return res.status(404).json({ success: false, error: '实例不存在' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const logFile = path.join(instance.logDir, 'openclaw.log');

    if (!fs.existsSync(logFile)) {
        res.write(`data: ${JSON.stringify({ type: 'info', message: '日志文件不存在' })}\n\n`);
        return res.end();
    }

    let position = fs.statSync(logFile).size;

    const streamInterval = setInterval(() => {
        try {
            const stats = fs.statSync(logFile);
            if (stats.size > position) {
                const stream = fs.createReadStream(logFile, {
                    start: position,
                    end: stats.size - 1
                });

                let newData = '';
                stream.on('data', chunk => {
                    newData += chunk.toString();
                });

                stream.on('end', () => {
                    position = stats.size;
                    res.write(`data: ${JSON.stringify({ type: 'log', content: newData })}\n\n`);
                });
            }
        } catch (e) {
            // 忽略错误
        }
    }, 1000);

    res.on('close', () => {
        clearInterval(streamInterval);
        res.end();
    });
});

// 日志函数
function log_success(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SUCCESS] ${message}`);
}

function log_error(message) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`);
}

// 404 处理
app.use((req, res) => {
    res.status(404).json({ success: false, error: '接口不存在' });
});

// 错误处理
app.use((err, req, res, next) => {
    log_error(err.message);
    res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
});

// 启动服务器
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('  OpenClaw 管理面板已启动');
    console.log('========================================');
    console.log(`  访问地址：http://localhost:${PORT}`);
    console.log(`  健康检查：http://localhost:${PORT}/api/health`);
    console.log(`  系统信息：http://localhost:${PORT}/api/system`);
    console.log('========================================\n');
});
