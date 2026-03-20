#!/usr/bin/env node

/**
 * OpenClaw 实例分组管理工具
 * 支持创建组、添加实例到组、批量操作组内实例
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');
const GROUPS_FILE = path.join(process.env.HOME, '.openclaw/instances/groups.json');

// 确保基础目录存在
const baseDir = path.dirname(GROUPS_FILE);
if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
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

// 读取分组
function readGroups() {
    try {
        if (!fs.existsSync(GROUPS_FILE)) {
            return { groups: {} };
        }
        const data = fs.readFileSync(GROUPS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { groups: {} };
    }
}

// 保存分组
function saveGroups(data) {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify(data, null, 2));
}

// 创建分组
function createGroup(name, description = '') {
    const groupsData = readGroups();

    if (groupsData.groups[name]) {
        console.log(`错误：分组 '${name}' 已存在`);
        return false;
    }

    groupsData.groups[name] = {
        name: name,
        description: description,
        instances: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    saveGroups(groupsData);
    console.log(`分组 '${name}' 创建成功`);
    return true;
}

// 删除分组
function deleteGroup(name) {
    const groupsData = readGroups();

    if (!groupsData.groups[name]) {
        console.log(`错误：分组 '${name}' 不存在`);
        return false;
    }

    delete groupsData.groups[name];
    saveGroups(groupsData);
    console.log(`分组 '${name}' 已删除`);
    return true;
}

// 添加实例到分组
function addInstanceToGroup(groupName, instanceId) {
    const groupsData = readGroups();
    const registry = readRegistry();

    if (!groupsData.groups[groupName]) {
        console.log(`错误：分组 '${groupName}' 不存在`);
        return false;
    }

    // 验证实例是否存在
    const instanceExists = registry.instances.some(i => i.id === parseInt(instanceId));
    if (!instanceExists) {
        console.log(`错误：实例 ${instanceId} 不存在`);
        return false;
    }

    const group = groupsData.groups[groupName];
    if (group.instances.includes(parseInt(instanceId))) {
        console.log(`实例 ${instanceId} 已在分组中`);
        return false;
    }

    group.instances.push(parseInt(instanceId));
    group.updatedAt = new Date().toISOString();
    saveGroups(groupsData);

    console.log(`实例 ${instanceId} 已添加到分组 '${groupName}'`);
    return true;
}

// 从分组移除实例
function removeInstanceFromGroup(groupName, instanceId) {
    const groupsData = readGroups();

    if (!groupsData.groups[groupName]) {
        console.log(`错误：分组 '${groupName}' 不存在`);
        return false;
    }

    const group = groupsData.groups[groupName];
    const index = group.instances.indexOf(parseInt(instanceId));

    if (index === -1) {
        console.log(`实例 ${instanceId} 不在分组中`);
        return false;
    }

    group.instances.splice(index, 1);
    group.updatedAt = new Date().toISOString();
    saveGroups(groupsData);

    console.log(`实例 ${instanceId} 已从分组 '${groupName}' 移除`);
    return true;
}

// 列出分组
function listGroups() {
    const groupsData = readGroups();
    const registry = readRegistry();

    const groupNames = Object.keys(groupsData.groups);

    if (groupNames.length === 0) {
        console.log('暂无分组');
        return;
    }

    console.log('\n=== OpenClaw 实例分组 ===\n');
    console.log('─'.repeat(70));
    console.log('分组名称            实例数   描述                    创建时间');
    console.log('─'.repeat(70));

    for (const name of groupNames) {
        const group = groupsData.groups[name];
        const description = (group.description || '-').substring(0, 24);
        const createdAt = new Date(group.createdAt).toLocaleDateString();

        console.log(`${name.padEnd(20)}${String(group.instances.length).padEnd(9)}${description.padEnd(26)}${createdAt}`);
    }

    console.log('─'.repeat(70));
    console.log(`共 ${groupNames.length} 个分组\n`);
}

// 显示分组详情
function showGroup(name) {
    const groupsData = readGroups();
    const registry = readRegistry();

    if (!groupsData.groups[name]) {
        console.log(`错误：分组 '${name}' 不存在`);
        return;
    }

    const group = groupsData.groups[name];

    console.log(`\n=== 分组：${name} ===\n`);
    console.log(`描述：${group.description || '-'}`);
    console.log(`创建时间：${new Date(group.createdAt).toLocaleString()}`);
    console.log(`更新时间：${new Date(group.updatedAt).toLocaleString()}`);
    console.log(`实例数：${group.instances.length}`);
    console.log('');

    if (group.instances.length > 0) {
        console.log('实例列表:');
        console.log('─'.repeat(70));
        console.log('ID    名称               端口   状态      PID');
        console.log('─'.repeat(70));

        for (const instanceId of group.instances) {
            const instance = registry.instances.find(i => i.id === instanceId);
            if (instance) {
                const statusSymbol = instance.status === 'running' ? '✓' : '✗';
                const pidStr = instance.pid || 'N/A';
                console.log(`${String(instance.id).padEnd(6)}${instance.name.padEnd(20)}${String(instance.port).padEnd(8)}${statusSymbol} ${instance.status.padEnd(10)}${pidStr}`);
            } else {
                console.log(`${String(instanceId).padEnd(6)}[已删除]`);
            }
        }

        console.log('─'.repeat(70));
    } else {
        console.log('该分组暂无实例');
    }

    console.log('');
}

// 批量操作分组内实例
function batchOperation(name, operation) {
    const groupsData = readGroups();
    const registry = readRegistry();

    if (!groupsData.groups[name]) {
        console.log(`错误：分组 '${name}' 不存在`);
        return false;
    }

    const managerScript = path.join(__dirname, '../deploy-core/instance-manager.sh');
    const group = groupsData.groups[name];
    const results = [];

    console.log(`\n对分组 '${name}' 执行 ${operation} 操作...\n`);

    for (const instanceId of group.instances) {
        const instance = registry.instances.find(i => i.id === instanceId);

        if (!instance) {
            console.log(`  跳过实例 ${instanceId}: 不存在`);
            continue;
        }

        try {
            execSync(`bash "${managerScript}" ${operation} ${instanceId}`, {
                cwd: instance.dir,
                stdio: 'pipe'
            });
            console.log(`  ✓ 实例 ${instanceId} (${instance.name}) ${operation} 成功`);
            results.push({ id: instanceId, name: instance.name, success: true });
        } catch (e) {
            console.log(`  ✗ 实例 ${instanceId} (${instance.name}) ${operation} 失败`);
            results.push({ id: instanceId, name: instance.name, success: false, error: e.message });
        }
    }

    console.log('');
    const successCount = results.filter(r => r.success).length;
    console.log(`操作完成：${successCount}/${group.instances.length} 成功`);

    return true;
}

// 清理无效分组（删除已不存在的实例）
function cleanupGroups() {
    const groupsData = readGroups();
    const registry = readRegistry();
    const validIds = registry.instances.map(i => i.id);

    let cleaned = 0;

    for (const name of Object.keys(groupsData.groups)) {
        const group = groupsData.groups[name];
        const beforeLength = group.instances.length;
        group.instances = group.instances.filter(id => validIds.includes(id));

        if (group.instances.length < beforeLength) {
            console.log(`分组 '${name}': 清理 ${beforeLength - group.instances.length} 个无效实例`);
            group.updatedAt = new Date().toISOString();
            cleaned++;
        }
    }

    saveGroups(groupsData);
    console.log(`\n清理完成，${cleaned} 个分组被更新`);
}

// 显示帮助
function showHelp() {
    console.log(`
OpenClaw 实例分组管理工具

用法：node group-manager.js <command> [options]

命令:
  create <name> [desc]           创建分组
  delete <name>                  删除分组
  add <group> <instance_id>      添加实例到分组
  remove <group> <instance_id>   从分组移除实例
  list                           列出所有分组
  show <name>                    显示分组详情
  start <name>                   批量启动分组内实例
  stop <name>                    批量停止分组内实例
  restart <name>                 批量重启分组内实例
  cleanup                        清理无效分组
  help                           显示帮助

示例:
  node group-manager.js create production "生产环境实例"
  node group-manager.js add production 1
  node group-manager.js add production 2
  node group-manager.js show production
  node group-manager.js start production
  node group-manager.js list
`);
}

// 主程序
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
    case 'create':
        createGroup(args[0], args.slice(1).join(' '));
        break;

    case 'delete':
        deleteGroup(args[0]);
        break;

    case 'add':
        addInstanceToGroup(args[0], args[1]);
        break;

    case 'remove':
        removeInstanceFromGroup(args[0], args[1]);
        break;

    case 'list':
        listGroups();
        break;

    case 'show':
        showGroup(args[0]);
        break;

    case 'start':
        batchOperation(args[0], 'start');
        break;

    case 'stop':
        batchOperation(args[0], 'stop');
        break;

    case 'restart':
        batchOperation(args[0], 'restart');
        break;

    case 'cleanup':
        cleanupGroups();
        break;

    case 'help':
    default:
        showHelp();
}
