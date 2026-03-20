// 端口分配器
const path = require('path');

const REGISTRY_FILE = path.join(process.env.HOME, '.openclaw/instances/registry.json');
const DEFAULT_PORT = 18789;

function readRegistry() {
    const fs = require('fs');
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
    getUsedPorts,
    DEFAULT_PORT
};
