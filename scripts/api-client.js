#!/usr/bin/env node

/**
 * OpenClaw Enterprise API Client
 * CLI tool for interacting with OpenClaw APIs
 * Supports both legacy admin-panel API and new enterprise API
 */

const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration - Support both legacy and enterprise API
const LEGACY_API_BASE = process.env.OPENCLAW_LEGACY_API_URL || 'http://localhost:3000/api';
const ENTERPRISE_API_BASE = process.env.OPENCLAW_API_URL || 'http://localhost:3002';
const AUTH_BASE = process.env.OPENCLAW_AUTH_URL || 'http://localhost:3001';
const CONFIG_FILE = path.join(process.env.HOME || '', '.openclaw', 'cli-config.json');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(color, message) {
    console.log(`${color}${message}${colors.reset}`);
}

function logInfo(message) { log(colors.blue, `[INFO] ${message}`); }
function logSuccess(message) { log(colors.green, `[SUCCESS] ${message}`); }
function logError(message) { log(colors.red, `[ERROR] ${message}`); }
function logWarning(message) { log(colors.yellow, `[WARNING] ${message}`); }

// Load saved config
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        logWarning('Failed to load config file');
    }
    return { token: null, tenantId: null, apiMode: 'auto' };
}

// Save config
function saveConfig(config) {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Detect API mode
async function detectApiMode() {
    try {
        // Try legacy API first
        const response = await axios.get(`${LEGACY_API_BASE}/instances`, { timeout: 2000 });
        if (response.data && response.data.success !== undefined) {
            return 'legacy';
        }
    } catch (e) {
        // Legacy API not available, try enterprise API
    }

    try {
        const response = await axios.get(`${ENTERPRISE_API_BASE}/api/instances`, { timeout: 2000 });
        if (response.data && Array.isArray(response.data)) {
            return 'enterprise';
        }
    } catch (e) {
        // Enterprise API not available
    }

    return 'none';
}

// Get API base URL based on mode
function getApiBase(mode) {
    if (mode === 'legacy') {
        return LEGACY_API_BASE;
    }
    return `${ENTERPRISE_API_BASE}/api`;
}

// Create API client
function createApiClient(mode = 'auto') {
    const config = loadConfig();
    let apiMode = mode === 'auto' ? config.apiMode : mode;

    const client = axios.create({
        baseURL: getApiBase(apiMode),
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 10000
    });

    // Add auth token to requests
    client.interceptors.request.use((req) => {
        if (config.token) {
            req.headers.Authorization = `Bearer ${config.token}`;
        }
        return req;
    });

    return { client, apiMode };
}

// Instance commands - Support both API modes
async function listInstances() {
    try {
        let apiMode = loadConfig().apiMode;
        if (apiMode === 'auto') {
            apiMode = await detectApiMode();
        }

        if (apiMode === 'none') {
            logError('No API available. Please start the services first.');
            logInfo('Try: npm run docker:up  or  ./scripts/start-dev.sh start');
            return;
        }

        const { client } = createApiClient(apiMode);
        const response = await client.get('/instances');

        let instances;
        if (apiMode === 'legacy') {
            instances = response.data.data || [];
        } else {
            instances = response.data || [];
        }

        if (instances.length === 0) {
            logInfo('No instances found');
            return;
        }

        console.log('\n' + '─'.repeat(80));
        console.log(`${colors.cyan}ID    Name                 Port     Status      Profile${colors.reset}`);
        console.log('─'.repeat(80));

        for (const instance of instances) {
            const statusColor = instance.status === 'running' ? colors.green : colors.yellow;
            const profile = instance.profile || `instance_${instance.id}`;
            console.log(
                `${String(instance.id).padEnd(5)} ` +
                `${String(instance.name).padEnd(20)} ` +
                `${String(instance.port).padEnd(8)} ` +
                `${statusColor}${String(instance.status).padEnd(11)}${colors.reset} ` +
                `${profile}`
            );
        }

        console.log('─'.repeat(80));
        logInfo(`Total: ${instances.length} instance(s) | API Mode: ${apiMode}`);
    } catch (error) {
        logError(`Failed to list instances: ${error.message}`);
        logInfo('Make sure the services are running: npm run docker:up');
    }
}

async function getInstance(id) {
    try {
        let apiMode = loadConfig().apiMode;
        if (apiMode === 'auto') {
            apiMode = await detectApiMode();
        }

        const { client } = createApiClient(apiMode);
        const response = await client.get(`/instances/${id}`);

        const data = apiMode === 'legacy' ? response.data.data : response.data;

        console.log('\n' + '─'.repeat(40));
        console.log(`${colors.cyan}Instance Details: #${data.id}${colors.reset}`);
        console.log('─'.repeat(40));
        console.log(`Name:       ${data.name}`);
        console.log(`Profile:    ${data.profile || `instance_${data.id}`}`);
        console.log(`Port:       ${data.port}`);
        console.log(`Status:     ${data.status}`);
        console.log(`Workspace:  ${data.workspace || 'N/A'}`);
        console.log(`PID:        ${data.pid || 'N/A'}`);
        console.log(`Created:    ${new Date(data.createdAt).toLocaleString()}`);
        console.log('─'.repeat(40) + '\n');
    } catch (error) {
        logError(`Failed to get instance: ${error.message}`);
    }
}

async function createInstance(name, port, workspace) {
    try {
        let apiMode = loadConfig().apiMode;
        if (apiMode === 'auto') {
            apiMode = await detectApiMode();
        }

        const { client } = createApiClient(apiMode);
        const response = await client.post('/instances', { name, port, workspace });

        const data = apiMode === 'legacy' ? response.data.data : response.data;
        logSuccess(`Instance created: ${data.name} (ID: ${data.id}, Port: ${data.port})`);
    } catch (error) {
        logError(`Failed to create instance: ${error.message}`);
    }
}

async function startInstance(id) {
    try {
        let apiMode = loadConfig().apiMode;
        if (apiMode === 'auto') {
            apiMode = await detectApiMode();
        }

        const { client } = createApiClient(apiMode);

        if (apiMode === 'legacy') {
            await client.post(`/instances/${id}/start`);
        } else {
            await client.post(`/instances/${id}/start`);
        }

        logSuccess(`Instance ${id} started`);
    } catch (error) {
        logError(`Failed to start instance: ${error.message}`);
    }
}

async function stopInstance(id) {
    try {
        let apiMode = loadConfig().apiMode;
        if (apiMode === 'auto') {
            apiMode = await detectApiMode();
        }

        const { client } = createApiClient(apiMode);
        await client.post(`/instances/${id}/stop`);
        logSuccess(`Instance ${id} stopped`);
    } catch (error) {
        logError(`Failed to stop instance: ${error.message}`);
    }
}

async function restartInstance(id) {
    try {
        let apiMode = loadConfig().apiMode;
        if (apiMode === 'auto') {
            apiMode = await detectApiMode();
        }

        const { client } = createApiClient(apiMode);
        await client.post(`/instances/${id}/restart`);
        logSuccess(`Instance ${id} restarted`);
    } catch (error) {
        logError(`Failed to restart instance: ${error.message}`);
    }
}

async function deleteInstance(id, force = false) {
    try {
        let apiMode = loadConfig().apiMode;
        if (apiMode === 'auto') {
            apiMode = await detectApiMode();
        }

        const { client } = createApiClient(apiMode);
        await client.delete(`/instances/${id}`, {
            params: apiMode === 'enterprise' ? { force } : undefined
        });
        logSuccess(`Instance ${id} deleted`);
    } catch (error) {
        logError(`Failed to delete instance: ${error.message}`);
    }
}

// Auth commands
async function login(email, password, tenantId) {
    try {
        logInfo(`Logging in to ${AUTH_BASE}...`);

        const response = await axios.post(`${AUTH_BASE}/api/auth/login`, {
            email,
            password,
            tenantId
        }, { timeout: 10000 });

        const { token, user } = response.data;

        saveConfig({ token, tenantId, user, apiMode: 'enterprise' });
        logSuccess('Login successful!');
        logInfo(`Welcome, ${user.name} (${user.email})`);
        logInfo(`Tenant: ${tenantId}`);

        return { token, user };
    } catch (error) {
        logError(`Login failed: ${error.response?.data?.error || error.message}`);
        throw error;
    }
}

async function logout() {
    saveConfig({ token: null, tenantId: null, apiMode: 'auto' });
    logSuccess('Logged out successfully');
}

async function whoami() {
    const config = loadConfig();
    if (!config.token) {
        logWarning('Not logged in');
        return null;
    }

    try {
        const response = await axios.get(`${AUTH_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${config.token}` }
        });
        logInfo(`Logged in as: ${response.data.name} (${response.data.email})`);
        logInfo(`Tenant: ${response.data.tenantId}`);
        return response.data;
    } catch (error) {
        logError(`Failed to get user info: ${error.message}`);
        logout();
        return null;
    }
}

// Health check
async function healthCheck() {
    console.log('\n' + '─'.repeat(40));
    console.log(`${colors.cyan}Service Health Status${colors.reset}`);
    console.log('─'.repeat(40));

    const services = [
        { name: 'Legacy Admin Panel', url: LEGACY_API_BASE.replace('/api', '/health') },
        { name: 'Auth Service', url: `${AUTH_BASE}/health` },
        { name: 'Instance Service', url: `${ENTERPRISE_API_BASE}/health` },
        { name: 'Monitor Service', url: 'http://localhost:3003/health' }
    ];

    for (const service of services) {
        try {
            const response = await axios.get(service.url, { timeout: 3000 });
            const status = response.data.status === 'ok' || response.data.success
                ? `${colors.green}● Running${colors.reset}`
                : `${colors.yellow}● Degraded${colors.reset}`;
            console.log(`${service.name.padEnd(22)} ${status}`);
        } catch (error) {
            console.log(`${service.name.padEnd(22)} ${colors.red}● Down${colors.reset}`);
        }
    }

    console.log('─'.repeat(40) + '\n');
}

// Interactive mode
async function interactiveMode() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const prompt = () => {
        const config = loadConfig();
        const user = config.user?.name || 'guest';
        const apiMode = config.apiMode || 'auto';
        rl.question(`${colors.green}[openclaw]${colors.reset} ${user} (${apiMode})> `, (input) => {
            const args = input.trim().split(/\s+/);
            const command = args[0]?.toLowerCase();

            switch (command) {
                case 'login':
                    login(args[1], args[2], args[3]);
                    break;
                case 'logout':
                    logout();
                    break;
                case 'whoami':
                    whoami();
                    break;
                case 'instances':
                case 'ls':
                    listInstances();
                    break;
                case 'instance':
                case 'get':
                    if (args[1]) getInstance(args[1]);
                    else logError('Please provide instance ID');
                    break;
                case 'create':
                    if (args[1]) createInstance(args[1], args[2], args[3]);
                    else logError('Please provide instance name');
                    break;
                case 'start':
                    if (args[1]) startInstance(args[1]);
                    else logError('Please provide instance ID');
                    break;
                case 'stop':
                    if (args[1]) stopInstance(args[1]);
                    else logError('Please provide instance ID');
                    break;
                case 'restart':
                    if (args[1]) restartInstance(args[1]);
                    else logError('Please provide instance ID');
                    break;
                case 'delete':
                    if (args[1]) deleteInstance(args[1], args[2] === '--force');
                    else logError('Please provide instance ID');
                    break;
                case 'health':
                    healthCheck();
                    break;
                case 'detect':
                    (async () => {
                        const mode = await detectApiMode();
                        logInfo(`Detected API mode: ${mode}`);
                        saveConfig({ ...loadConfig(), apiMode: mode });
                    })();
                    break;
                case 'mode':
                    if (args[1] && ['auto', 'legacy', 'enterprise'].includes(args[1])) {
                        saveConfig({ ...loadConfig(), apiMode: args[1] });
                        logInfo(`API mode set to: ${args[1]}`);
                    } else {
                        logInfo(`Current API mode: ${loadConfig().apiMode || 'auto'}`);
                    }
                    break;
                case 'help':
                case '?':
                    showHelp();
                    break;
                case 'exit':
                case 'quit':
                    rl.close();
                    process.exit(0);
                case '':
                    break;
                default:
                    logWarning(`Unknown command: ${command}. Type 'help' for available commands.`);
            }
            prompt();
        });
    };

    prompt();
}

function showHelp() {
    console.log(`
${colors.cyan}OpenClaw Enterprise CLI - Available Commands:${colors.reset}

${colors.yellow}Authentication:${colors.reset}
  login <email> <password> <tenantId>  Login to your account
  logout                               Logout current user
  whoami                               Show current user info

${colors.yellow}Instance Management:${colors.reset}
  instances, ls                        List all instances
  instance <id>                        Get instance details
  create <name> [port] [workspace]     Create new instance
  start <id>                           Start instance
  stop <id>                            Stop instance
  restart <id>                         Restart instance
  delete <id> [--force]                Delete instance

${colors.yellow}System:${colors.reset}
  health                               Check service health
  detect                               Detect available API
  mode [auto|legacy|enterprise]        Show/set API mode
  help, ?                              Show this help
  exit, quit                           Exit interactive mode

${colors.yellow}Examples:${colors.reset}
  openclaw login admin@example.com password tenant-uuid
  openclaw instances
  openclaw create my-instance 18790
  openclaw start 1
  openclaw health
`);
}

// Main entry point
function main() {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase();

    // Non-interactive commands
    switch (command) {
        case 'login':
            login(args[1], args[2], args[3]);
            break;
        case 'logout':
            logout();
            break;
        case 'whoami':
            whoami();
            break;
        case 'instances':
        case 'ls':
            listInstances();
            break;
        case 'instance':
        case 'get':
            if (args[1]) getInstance(args[1]);
            break;
        case 'create':
            if (args[1]) createInstance(args[1], args[2], args[3]);
            break;
        case 'start':
            if (args[1]) startInstance(args[1]);
            break;
        case 'stop':
            if (args[1]) stopInstance(args[1]);
            break;
        case 'restart':
            if (args[1]) restartInstance(args[1]);
            break;
        case 'delete':
            if (args[1]) deleteInstance(args[1], args[2] === '--force');
            break;
        case 'health':
            healthCheck();
            break;
        case 'detect':
            (async () => {
                const mode = await detectApiMode();
                logInfo(`Detected API mode: ${mode}`);
                saveConfig({ ...loadConfig(), apiMode: mode });
            })();
            break;
        case 'mode':
            if (args[1] && ['auto', 'legacy', 'enterprise'].includes(args[1])) {
                saveConfig({ ...loadConfig(), apiMode: args[1] });
                logInfo(`API mode set to: ${args[1]}`);
            } else {
                logInfo(`Current API mode: ${loadConfig().apiMode || 'auto'}`);
            }
            break;
        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;
        case '--version':
        case '-v':
            console.log('OpenClaw Enterprise CLI v2.0.0');
            break;
        default:
            // Interactive mode
            interactiveMode();
    }
}

main();
