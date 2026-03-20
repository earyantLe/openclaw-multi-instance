#!/usr/bin/env node

/**
 * OpenClaw 实例配置模板管理工具
 * 支持创建、应用、删除配置模板
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '../config/templates');
const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');

// 确保模板目录存在
if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// 默认模板
const DEFAULT_TEMPLATES = {
    'default': {
        name: '默认配置',
        description: 'OpenClaw 默认配置',
        config: {
            logLevel: 'info',
            maxLogSize: '10MB',
            maxLogFiles: 5,
            enableCors: true,
            sessionTimeout: 3600
        }
    },
    'production': {
        name: '生产环境',
        description: '适用于生产环境的优化配置',
        config: {
            logLevel: 'warn',
            maxLogSize: '50MB',
            maxLogFiles: 10,
            enableCors: false,
            sessionTimeout: 7200,
            enableCache: true,
            cacheSize: 1024
        }
    },
    'development': {
        name: '开发环境',
        description: '适用于开发调试的配置',
        config: {
            logLevel: 'debug',
            maxLogSize: '20MB',
            maxLogFiles: 3,
            enableCors: true,
            sessionTimeout: 1800,
            enableDebug: true,
            hotReload: true
        }
    },
    'low-memory': {
        name: '低内存模式',
        description: '适用于内存受限环境的配置',
        config: {
            logLevel: 'warn',
            maxLogSize: '5MB',
            maxLogFiles: 2,
            enableCors: true,
            sessionTimeout: 1800,
            maxWorkers: 1,
            enableCache: false
        }
    }
};

// 初始化默认模板
function initDefaultTemplates() {
    for (const [name, template] of Object.entries(DEFAULT_TEMPLATES)) {
        const templatePath = path.join(TEMPLATES_DIR, `${name}.json`);
        if (!fs.existsSync(templatePath)) {
            fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
            console.log(`创建默认模板：${name}`);
        }
    }
}

// 列出所有模板
function listTemplates() {
    const files = fs.readdirSync(TEMPLATES_DIR);
    const templates = [];

    for (const file of files) {
        if (file.endsWith('.json')) {
            try {
                const template = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8'));
                templates.push({
                    name: file.replace('.json', ''),
                    displayName: template.name || file.replace('.json', ''),
                    description: template.description || ''
                });
            } catch (e) {
                templates.push({
                    name: file.replace('.json', ''),
                    displayName: file.replace('.json', ''),
                    description: '读取失败',
                    error: true
                });
            }
        }
    }

    return templates;
}

// 获取模板详情
function getTemplate(name) {
    const templatePath = path.join(TEMPLATES_DIR, `${name}.json`);
    if (!fs.existsSync(templatePath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
}

// 创建模板
function createTemplate(name, displayName, description, config) {
    const templatePath = path.join(TEMPLATES_DIR, `${name}.json`);
    const template = {
        name: displayName || name,
        description: description || '',
        config: config || {},
        createdAt: new Date().toISOString()
    };
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
    return template;
}

// 删除模板
function deleteTemplate(name) {
    const templatePath = path.join(TEMPLATES_DIR, `${name}.json`);
    if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
        return true;
    }
    return false;
}

// 应用模板到实例
function applyTemplate(instanceId, templateName) {
    const template = getTemplate(templateName);
    if (!template) {
        return { success: false, error: '模板不存在' };
    }

    const registryPath = REGISTRY_FILE;
    if (!fs.existsSync(registryPath)) {
        return { success: false, error: '注册表不存在' };
    }

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const instance = registry.instances?.find(i => i.id === parseInt(instanceId));

    if (!instance) {
        return { success: false, error: '实例不存在' };
    }

    const configPath = path.join(instance.dir, 'config', 'config.json');
    if (!fs.existsSync(configPath)) {
        return { success: false, error: '实例配置文件不存在' };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.template = templateName;
    config.templateAppliedAt = new Date().toISOString();
    config = { ...config, ...template.config };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return { success: true, config };
}

// 命令行界面
function printHelp() {
    console.log(`
OpenClaw 配置模板管理工具

用法：node template-manager.js <command> [options]

命令:
  init                    初始化默认模板
  list                    列出所有模板
  show <name>             显示模板详情
  create <name>           创建新模板
  delete <name>           删除模板
  apply <instance> <tmpl> 应用模板到实例
  help                    显示帮助

示例:
  node template-manager.js init
  node template-manager.js list
  node template-manager.js show production
  node template-manager.js apply 1 production
`);
}

// 主程序
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
    case 'init':
        initDefaultTemplates();
        console.log('默认模板初始化完成');
        break;

    case 'list':
        const templates = listTemplates();
        console.log('\n可用模板:');
        console.log('─'.repeat(50));
        for (const t of templates) {
            const status = t.error ? ' [损坏]' : '';
            console.log(`  ${t.name.padEnd(20)} ${t.displayName}${status}`);
            if (t.description) console.log(`    └─ ${t.description}`);
        }
        console.log('');
        break;

    case 'show':
        if (!args[0]) {
            console.log('请指定模板名称');
            break;
        }
        const template = getTemplate(args[0]);
        if (template) {
            console.log('\n模板详情:');
            console.log(JSON.stringify(template, null, 2));
        } else {
            console.log('模板不存在');
        }
        break;

    case 'create':
        if (!args[0]) {
            console.log('请指定模板名称');
            break;
        }
        createTemplate(args[0], args[1] || args[0], args[2] || '', {});
        console.log(`模板 ${args[0]} 创建成功`);
        break;

    case 'delete':
        if (!args[0]) {
            console.log('请指定模板名称');
            break;
        }
        if (deleteTemplate(args[0])) {
            console.log(`模板 ${args[0]} 已删除`);
        } else {
            console.log('模板不存在');
        }
        break;

    case 'apply':
        if (!args[0] || !args[1]) {
            console.log('请指定实例 ID 和模板名称');
            break;
        }
        const result = applyTemplate(parseInt(args[0]), args[1]);
        if (result.success) {
            console.log('模板应用成功');
            console.log(JSON.stringify(result.config, null, 2));
        } else {
            console.log('应用失败:', result.error);
        }
        break;

    case 'help':
    default:
        printHelp();
}
