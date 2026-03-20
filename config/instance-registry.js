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
