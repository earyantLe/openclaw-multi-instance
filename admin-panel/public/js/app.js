// OpenClaw 管理面板前端逻辑

let currentInstanceId = null;
let logsModal = null;
let detailModal = null;
let configModal = null;

// API 基础路径
const API_BASE = '/api';

// 显示提示
function showToast(message, type = 'info') {
    const toastEl = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    toastMessage.textContent = message;

    // 设置颜色
    const header = toastEl.querySelector('.toast-header');
    header.className = 'toast-header';
    if (type === 'success') header.classList.add('bg-success', 'text-white');
    else if (type === 'danger') header.classList.add('bg-danger', 'text-white');
    else if (type === 'warning') header.classList.add('bg-warning');

    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
}

// 加载实例列表
async function loadInstances() {
    try {
        const response = await fetch(`${API_BASE}/instances`);
        const result = await response.json();

        if (!result.success) {
            showToast('加载实例列表失败：' + result.error, 'danger');
            return;
        }

        renderInstances(result.data);
        updateStats(result.data);
        updateLastUpdateTime();
    } catch (error) {
        showToast('加载实例列表失败：' + error.message, 'danger');
        console.error('Load instances error:', error);
    }
}

// 更新最后更新时间
function updateLastUpdateTime() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = '最后更新：' + now.toLocaleTimeString('zh-CN');
}

// 渲染实例列表
function renderInstances(instances) {
    const container = document.getElementById('instancesList');

    if (instances.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="empty-state">
                    <i class="bi bi-inboxes"></i>
                    <h5>暂无实例</h5>
                    <p>创建第一个 OpenClaw 实例开始使用</p>
                    <button class="btn btn-primary mt-3" onclick="document.getElementById('instanceName').focus()">
                        <i class="bi bi-plus-circle"></i> 创建实例
                    </button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = instances.map(instance => `
        <div class="col-md-6 col-lg-4 mb-3">
            <div class="card instance-card">
                <div class="card-header">
                    <span>
                        <i class="bi bi-box"></i> ${escapeHtml(instance.name)}
                        <span class="badge ${instance.status === 'running' ? 'bg-success' : 'bg-secondary'} status-badge float-end">
                            ${instance.status === 'running' ? '<span class="status-indicator status-running"></span>' : ''}${instance.status}
                        </span>
                    </span>
                </div>
                <div class="card-body">
                    <div class="instance-info">
                        <p><i class="bi bi-globe"></i> 端口：<strong>${instance.port}</strong></p>
                        <p><i class="bi bi-folder"></i> ID: <strong>#${instance.id}</strong></p>
                        <p><i class="bi bi-clock"></i> 创建：${formatDate(instance.createdAt)}</p>
                        ${instance.pid ? `<p><i class="bi bi-cpu"></i> PID: <strong>${instance.pid}</strong></p>` : ''}
                    </div>
                    <div class="instance-actions mt-3 d-flex gap-2 flex-wrap">
                        ${instance.status === 'running' ? `
                            <button class="btn btn-warning btn-sm flex-grow-1" onclick="stopInstance(${instance.id})">
                                <i class="bi bi-stop-fill"></i> 停止
                            </button>
                            <button class="btn btn-info btn-sm text-white" onclick="restartInstance(${instance.id})">
                                <i class="bi bi-arrow-clockwise"></i>
                            </button>
                        ` : `
                            <button class="btn btn-success btn-sm flex-grow-1" onclick="startInstance(${instance.id})">
                                <i class="bi bi-play-fill"></i> 启动
                            </button>
                        `}
                        <button class="btn btn-primary btn-sm" onclick="viewLogs(${instance.id})" title="查看日志">
                            <i class="bi bi-file-text"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="viewDetails(${instance.id})" title="查看详情">
                            <i class="bi bi-info-circle"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteInstance(${instance.id})" title="删除">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// 更新统计信息
function updateStats(instances) {
    const total = instances.length;
    const running = instances.filter(i => i.status === 'running').length;
    const stopped = instances.filter(i => i.status === 'stopped').length;

    document.getElementById('totalInstances').textContent = total;
    document.getElementById('runningCount').textContent = running;
    document.getElementById('stoppedCount').textContent = stopped;
}

// 加载系统信息
async function loadSystemInfo() {
    try {
        const response = await fetch(`${API_BASE}/system`);
        const result = await response.json();

        if (result.success) {
            const info = result.data;
            const content = `
                <div class="col-md-6">
                    <h6><i class="bi bi-cpu"></i> 系统</h6>
                    <p><strong>平台:</strong> ${info.platform}</p>
                    <p><strong>Node 版本:</strong> ${info.nodeVersion}</p>
                    <p><strong>运行时间:</strong> ${formatUptime(info.uptime)}</p>
                </div>
                <div class="col-md-6">
                    <h6><i class="bi bi-memory"></i> 内存</h6>
                    <p><strong>总计:</strong> ${info.memory.total} MB</p>
                    <p><strong>空闲:</strong> ${info.memory.free} MB</p>
                    <p><strong>使用:</strong> ${info.memory.total - info.memory.free} MB</p>
                </div>
                <div class="col-12 mt-3">
                    <h6><i class="bi bi-collection"></i> 实例统计</h6>
                    <div class="progress" style="height: 30px;">
                        <div class="progress-bar bg-success" style="width: ${info.instances.total > 0 ? (info.instances.running / info.instances.total * 100) : 0}%">
                            运行中：${info.instances.running}
                        </div>
                        <div class="progress-bar bg-secondary" style="width: ${info.instances.total > 0 ? (info.instances.stopped / info.instances.total * 100) : 0}%">
                            已停止：${info.instances.stopped}
                        </div>
                    </div>
                    <p class="mt-2"><strong>总计:</strong> ${info.instances.total} 个实例</p>
                </div>
            `;
            document.getElementById('systemInfoContent').innerHTML = content;
            document.getElementById('systemInfoCard').style.display = 'block';

            // Hide other tabs
            const instancesTab = document.getElementById('instancesTab');
            const resourcesTab = document.getElementById('resourcesTab');
            if (instancesTab) instancesTab.style.display = 'none';
            if (resourcesTab) resourcesTab.style.display = 'none';
        }
    } catch (error) {
        showToast('加载系统信息失败：' + error.message, 'danger');
    }
}

// 格式化运行时间
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}天 ${hours}小时 ${minutes}分钟`;
    if (hours > 0) return `${hours}小时 ${minutes}分钟`;
    return `${minutes}分钟`;
}

// 创建实例
document.getElementById('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('instanceName').value.trim();
    const port = document.getElementById('instancePort').value;
    const workspace = document.getElementById('instanceWorkspace').value.trim();

    if (!name) {
        showToast('请输入实例名称', 'warning');
        return;
    }

    if (port && (port < 1024 || port > 65535)) {
        showToast('端口必须在 1024-65535 之间', 'warning');
        return;
    }

    const data = { name };
    if (port) data.port = parseInt(port);
    if (workspace) data.workspace = workspace;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> 创建中...';

    try {
        const response = await fetch(`${API_BASE}/instances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showToast(`实例 "${name}" 创建成功`, 'success');
            document.getElementById('createForm').reset();
            loadInstances();
        } else {
            showToast('创建失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('创建失败：' + error.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// 启动实例
async function startInstance(id) {
    const btn = event.target.closest('button');
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/instances/${id}/start`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showToast(`实例 #${id} 启动成功`, 'success');
            setTimeout(loadInstances, 1000);
        } else {
            showToast('启动失败：' + result.error, 'danger');
            btn.disabled = false;
        }
    } catch (error) {
        showToast('启动失败：' + error.message, 'danger');
        btn.disabled = false;
    }
}

// 停止实例
async function stopInstance(id) {
    if (!confirm(`确定要停止实例 #${id} 吗？`)) return;

    const btn = event.target.closest('button');
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/instances/${id}/stop`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showToast(`实例 #${id} 已停止`, 'success');
            setTimeout(loadInstances, 1000);
        } else {
            showToast('停止失败：' + result.error, 'danger');
            btn.disabled = false;
        }
    } catch (error) {
        showToast('停止失败：' + error.message, 'danger');
        btn.disabled = false;
    }
}

// 重启实例
async function restartInstance(id) {
    if (!confirm(`确定要重启实例 #${id} 吗？`)) return;

    const btn = event.target.closest('button');
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/instances/${id}/restart`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showToast(`实例 #${id} 已重启`, 'success');
            setTimeout(loadInstances, 1000);
        } else {
            showToast('重启失败：' + result.error, 'danger');
            btn.disabled = false;
        }
    } catch (error) {
        showToast('重启失败：' + error.message, 'danger');
        btn.disabled = false;
    }
}

// 删除实例
async function deleteInstance(id) {
    if (!confirm(`确定要删除实例 #${id} 吗？此操作不可恢复！`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/instances/${id}`, { method: 'DELETE' });
        const result = await response.json();

        if (result.success) {
            showToast(`实例 #${id} 已删除`, 'success');
            loadInstances();
        } else {
            showToast('删除失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('删除失败：' + error.message, 'danger');
    }
}

// 清空日志
async function clearLogs(id) {
    if (!confirm(`确定要清空实例 #${id} 的日志吗？`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/instances/${id}/logs/clear`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showToast(`实例 #${id} 日志已清空`, 'success');
        } else {
            showToast('清空日志失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('清空日志失败：' + error.message, 'danger');
    }
}

// 批量操作 - 全部启动
async function batchStartAll() {
    if (!confirm('确定要启动所有已停止的实例吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/batch/start-all`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showToast(result.message, 'success');
            setTimeout(loadInstances, 1500);
        } else {
            showToast('批量启动失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('批量启动失败：' + error.message, 'danger');
    }
}

// 批量操作 - 全部停止
async function batchStopAll() {
    if (!confirm('确定要停止所有运行中的实例吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/batch/stop-all`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showToast(result.message, 'success');
            setTimeout(loadInstances, 1500);
        } else {
            showToast('批量停止失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('批量停止失败：' + error.message, 'danger');
    }
}

// 批量操作 - 全部重启
async function batchRestartAll() {
    if (!confirm('确定要重启所有运行中的实例吗？')) return;

    try {
        const response = await fetch(`${API_BASE}/batch/restart-all`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showToast(result.message, 'success');
            setTimeout(loadInstances, 1500);
        } else {
            showToast('批量重启失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('批量重启失败：' + error.message, 'danger');
    }
}

// 查看配置
async function viewConfig(id) {
    currentInstanceId = id;
    const instance = await getInstance(id);

    try {
        const response = await fetch(`${API_BASE}/instances/${id}/config`);
        const result = await response.json();

        if (result.success) {
            const config = result.data;
            document.getElementById('configInstanceName').textContent = instance.name;
            document.getElementById('configInstanceId').value = instance.id;
            document.getElementById('configWorkspace').value = config.workspace || '';
            document.getElementById('configId').value = instance.id;
            document.getElementById('configPort').value = instance.port;
            document.getElementById('configCreatedAt').value = formatDate(config.createdAt);

            configModal = new bootstrap.Modal(document.getElementById('configModal'));
            configModal.show();
        } else {
            showToast('加载配置失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('加载配置失败：' + error.message, 'danger');
    }
}

// 保存配置
async function saveConfig() {
    const id = document.getElementById('configInstanceId').value;
    const workspace = document.getElementById('configWorkspace').value.trim();

    if (!workspace) {
        showToast('工作空间不能为空', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/instances/${id}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace })
        });

        const result = await response.json();

        if (result.success) {
            showToast('配置已保存', 'success');
            configModal.hide();
        } else {
            showToast('保存失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('保存失败：' + error.message, 'danger');
    }
}

// 获取实例详情
async function getInstance(id) {
    const response = await fetch(`${API_BASE}/instances/${id}`);
    const result = await response.json();
    return result.data;
}

// 工具函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncatePath(path, maxLength = 25) {
    if (path.length <= maxLength) return path;
    return '...' + path.slice(-(maxLength - 3));
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 更新时间
function updateTime() {
    document.getElementById('currentTime').textContent = new Date().toLocaleString('zh-CN');
}

// 显示标签页
function showTab(tab) {
    const instancesTab = document.getElementById('instancesTab');
    const resourcesTab = document.getElementById('resourcesTab');

    if (tab === 'instances') {
        if (instancesTab) instancesTab.style.display = 'block';
        if (resourcesTab) resourcesTab.style.display = 'none';
        loadInstances();
    } else if (tab === 'resources') {
        if (instancesTab) instancesTab.style.display = 'none';
        if (resourcesTab) resourcesTab.style.display = 'block';
        loadResources();
    } else if (tab === 'system') {
        if (instancesTab) instancesTab.style.display = 'none';
        if (resourcesTab) resourcesTab.style.display = 'none';
        loadSystemInfo();
    }
}

// 加载资源监控数据
async function loadResources() {
    try {
        const response = await fetch(`${API_BASE}/resources/stats`);
        const result = await response.json();

        if (result.success) {
            const stats = result.data;
            document.getElementById('resRunningInstances').textContent = stats.runningInstances;
            document.getElementById('resTotalInstances').textContent = stats.totalInstances;
            document.getElementById('resTotalCPU').textContent = stats.totalCPU.toFixed(1) + '%';
            document.getElementById('resTotalMemory').textContent = stats.totalMemory;
            document.getElementById('resTotalDisk').textContent = stats.totalDisk;
        }

        // 加载详细数据
        const instancesResponse = await fetch(`${API_BASE}/instances`);
        const instancesResult = await instancesResponse.json();

        if (instancesResult.success) {
            const instances = instancesResult.data;
            const resourcesData = [];

            for (const instance of instances) {
                let resources = {
                    id: instance.id,
                    name: instance.name,
                    status: instance.status,
                    cpu: '-',
                    memory: '-',
                    diskUsage: 0,
                    logSize: 0,
                    pid: instance.pid || 'N/A'
                };

                if (instance.status === 'running') {
                    try {
                        const resResponse = await fetch(`${API_BASE}/instances/${instance.id}/resources`);
                        const resResult = await resResponse.json();
                        if (resResult.success) {
                            resources.cpu = resResult.data.cpu.toFixed(1) + '%';
                            resources.memory = resResult.data.memory + ' MB';
                            resources.diskUsage = resResult.data.diskUsage;
                            resources.logSize = resResult.data.logSize;
                        }
                    } catch (e) {
                        // 忽略单个实例资源加载错误
                    }
                } else {
                    // 已停止的实例，获取磁盘和日志大小
                    try {
                        const resResponse = await fetch(`${API_BASE}/instances/${instance.id}/resources`);
                        const resResult = await resResponse.json();
                        if (resResult.success) {
                            resources.diskUsage = resResult.data.diskUsage;
                            resources.logSize = resResult.data.logSize;
                        }
                    } catch (e) {
                        // 忽略
                    }
                }

                resourcesData.push(resources);
            }

            renderResourcesTable(resourcesData);
        }
    } catch (error) {
        console.error('Load resources error:', error);
    }
}

// 渲染资源表格
function renderResourcesTable(data) {
    const tbody = document.getElementById('resourcesTableBody');

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">暂无实例</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(r => {
        const statusClass = r.status === 'running' ? 'bg-success' : 'bg-secondary';
        return `
            <tr>
                <td><strong>#${r.id}</strong></td>
                <td>${escapeHtml(r.name)}</td>
                <td><span class="badge ${statusClass}">${r.status}</span></td>
                <td>${r.status === 'running' ? r.cpu : '-'}</td>
                <td>${r.status === 'running' ? r.memory : '-'}</td>
                <td>${r.diskUsage} MB</td>
                <td>${r.logSize} MB</td>
                <td>${r.pid}</td>
            </tr>
        `;
    }).join('');
}

// 导出资源数据
async function exportResources() {
    try {
        const response = await fetch(`${API_BASE}/resources/stats`);
        const result = await response.json();

        if (!result.success) {
            showToast('导出失败：' + result.error, 'danger');
            return;
        }

        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `openclaw-resources-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('资源数据已导出', 'success');
    } catch (error) {
        showToast('导出失败：' + error.message, 'danger');
    }
}

// 日志自动清理
async function cleanupLogs() {
    if (!confirm('确定要清理日志吗？超过 7 天的日志备份将被删除，超过 50MB 的日志将被轮转。')) return;

    try {
        const response = await fetch(`${API_BASE}/logs/cleanup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxAge: 7, maxSize: 50 })
        });
        const result = await response.json();

        if (result.success) {
            showToast(`日志清理完成：${result.data.cleaned} 个文件已删除，${result.data.rotated} 个日志已轮转`, 'success');
        } else {
            showToast('清理失败：' + result.error, 'danger');
        }
    } catch (error) {
        showToast('清理失败：' + error.message, 'danger');
    }
}

// 查看日志
async function viewLogs(id) {
    currentInstanceId = id;
    const instance = await getInstance(id);
    document.getElementById('logsInstanceName').textContent = instance.name + ` (端口：${instance.port})`;

    await refreshLogs();

    logsModal = new bootstrap.Modal(document.getElementById('logsModal'));
    logsModal.show();
}

// 刷新日志
async function refreshLogs() {
    if (!currentInstanceId) return;

    const lines = document.getElementById('logLines').value || 100;
    const content = document.getElementById('logsContent');
    content.textContent = '加载中...';

    try {
        const response = await fetch(`${API_BASE}/instances/${currentInstanceId}/logs?lines=${lines}`);
        const result = await response.json();

        if (result.data.exists) {
            content.textContent = result.data.logs || '日志为空';
        } else {
            content.textContent = '日志文件不存在\n\n实例启动后会自动创建日志文件';
        }
    } catch (error) {
        content.textContent = '加载日志失败：' + error.message;
    }
}

// 下载日志
function downloadLogs() {
    const content = document.getElementById('logsContent').textContent;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openclaw-instance-${currentInstanceId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// 查看详情
async function viewDetails(id) {
    currentInstanceId = id;
    const instance = await getInstance(id);

    const content = `
        <table class="table table-sm">
            <tr><th width="100">ID</th><td>${instance.id}</td></tr>
            <tr><th>名称</th><td>${instance.name}</td></tr>
            <tr><th>端口</th><td><span class="badge bg-primary">${instance.port}</span></td></tr>
            <tr><th>状态</th><td><span class="badge ${instance.status === 'running' ? 'bg-success' : 'bg-secondary'}">${instance.status}</span></td></tr>
            <tr><th>PID</th><td>${instance.pid || 'N/A'}</td></tr>
            <tr><th>目录</th><td class="text-muted small">${instance.dir}</td></tr>
            <tr><th>配置目录</th><td class="text-muted small">${instance.configDir}</td></tr>
            <tr><th>日志目录</th><td class="text-muted small">${instance.logDir}</td></tr>
            <tr><th>数据目录</th><td class="text-muted small">${instance.dataDir}</td></tr>
            <tr><th>工作空间</th><td class="text-muted small">${instance.workspace}</td></tr>
            <tr><th>创建时间</th><td>${formatDate(instance.createdAt)}</td></tr>
        </table>
    `;

    document.getElementById('detailContent').innerHTML = content;
    detailModal = new bootstrap.Modal(document.getElementById('detailModal'));
    detailModal.show();
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadInstances();
    updateTime();
    setInterval(updateTime, 1000);

    // 定期刷新实例状态（30 秒）
    setInterval(loadInstances, 30000);

    // 定期刷新资源监控（60 秒）
    setInterval(() => {
        if (document.getElementById('resourcesTab').style.display === 'block') {
            loadResources();
        }
    }, 60000);

    // 监听 Esc 键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            bootstrap.Modal.getInstance(document.getElementById('logsModal'))?.hide();
            bootstrap.Modal.getInstance(document.getElementById('detailModal'))?.hide();
            bootstrap.Modal.getInstance(document.getElementById('configModal'))?.hide();
        }
    });
});
