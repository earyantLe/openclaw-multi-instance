#!/usr/bin/env node

/**
 * OpenClaw Enterprise API Client
 * CLI tool for interacting with OpenClaw APIs
 */

const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE = process.env.OPENCLAW_API_URL || 'http://localhost:3002';
const AUTH_BASE = process.env.OPENCLAW_AUTH_URL || 'http://localhost:3001';
const CONFIG_FILE = path.join(process.env.HOME || '', '.openclaw', 'config.json');

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
    return { token: null, tenantId: null };
}

// Save config
function saveConfig(config) {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Create API client
function createApiClient() {
    const config = loadConfig();

    const client = axios.create({
        baseURL: API_BASE,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    // Add auth token to requests
    client.interceptors.request.use((config) => {
        if (config.token) {
            config.headers.Authorization = `Bearer ${config.token}`;
        }
        return config;
    });

    // Handle auth errors
    client.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response?.status === 401) {
                logError('Authentication failed. Please login again.');
                logout();
            }
            return Promise.reject(error);
        }
    );

    client.defaults.token = config.token;
    return client;
}

// Auth commands
async function login(email, password, tenantId) {
    try {
        logInfo(`Logging in to ${AUTH_BASE}...`);

        const response = await axios.post(`${AUTH_BASE}/api/auth/login`, {
            email,
            password,
            tenantId
        });

        const { token, user } = response.data;

        saveConfig({ token, tenantId, user });
        logSuccess('Login successful!');
        logInfo(`Welcome, ${user.name} (${user.email})`);

        return { token, user };
    } catch (error) {
        logError(`Login failed: ${error.response?.data?.error || error.message}`);
        throw error;
    }
}

async function logout() {
    saveConfig({ token: null, tenantId: null });
    logSuccess('Logged out successfully');
}

async function whoami() {
    const config = loadConfig();
    if (!config.token) {
        logWarning('Not logged in');
        return null;
    }

    try {
        const client = createApiClient();
        const response = await client.get(`${AUTH_BASE}/api/auth/me`);
        logInfo(`Logged in as: ${response.data.name} (${response.data.email})`);
        logInfo(`Tenant: ${response.data.tenantId}`);
        return response.data;
    } catch (error) {
        logError(`Failed to get user info: ${error.message}`);
        logout();
        return null;
    }
}

// Instance commands
async function listInstances() {
    try {
        const client = createApiClient();
        const response = await client.get('/api/instances');

        if (response.data.length === 0) {
            logInfo('No instances found');
            return;
        }

        console.log('\n' + '─'.repeat(80));
        console.log(`${colors.cyan}ID    Name                 Port     Status      Profile${colors.reset}`);
        console.log('─'.repeat(80));

        for (const instance of response.data) {
            const statusColor = instance.status === 'running' ? colors.green : colors.yellow;
            console.log(
                `${instance.id.toString().padEnd(5)} ` +
                `${instance.name.padEnd(20)} ` +
                `${instance.port.toString().padEnd(8)} ` +
                `${statusColor}${instance.status.padEnd(11)}${colors.reset} ` +
                `${instance.profile}`
            );
        }

        console.log('─'.repeat(80));
        logInfo(`Total: ${response.data.length} instance(s)`);
    } catch (error) {
        logError(`Failed to list instances: ${error.response?.data?.error || error.message}`);
    }
}

async function getInstance(id) {
    try {
        const client = createApiClient();
        const response = await client.get(`/api/instances/${id}`);

        console.log('\n' + '─'.repeat(40));
        console.log(`${colors.cyan}Instance Details: #${response.data.id}${colors.reset}`);
        console.log('─'.repeat(40));
        console.log(`Name:       ${response.data.name}`);
        console.log(`Profile:    ${response.data.profile}`);
        console.log(`Port:       ${response.data.port}`);
        console.log(`Status:     ${response.data.status}`);
        console.log(`Workspace:  ${response.data.workspace || 'N/A'}`);
        console.log(`PID:        ${response.data.pid || 'N/A'}`);
        console.log(`Created:    ${new Date(response.data.createdAt).toLocaleString()}`);
        console.log('─'.repeat(40) + '\n');
    } catch (error) {
        logError(`Failed to get instance: ${error.response?.data?.error || error.message}`);
    }
}

async function createInstance(name, port, workspace) {
    try {
        const client = createApiClient();
        const response = await client.post('/api/instances', {
            name,
            port,
            workspace
        });

        logSuccess('Instance created successfully!');
        await getInstance(response.data.id);
    } catch (error) {
        logError(`Failed to create instance: ${error.response?.data?.error || error.message}`);
    }
}

async function startInstance(id) {
    try {
        const client = createApiClient();
        await client.post(`/api/instances/${id}/start`);
        logSuccess(`Instance ${id} started`);
    } catch (error) {
        logError(`Failed to start instance: ${error.response?.data?.error || error.message}`);
    }
}

async function stopInstance(id) {
    try {
        const client = createApiClient();
        await client.post(`/api/instances/${id}/stop`);
        logSuccess(`Instance ${id} stopped`);
    } catch (error) {
        logError(`Failed to stop instance: ${error.response?.data?.error || error.message}`);
    }
}

async function restartInstance(id) {
    try {
        const client = createApiClient();
        await client.post(`/api/instances/${id}/restart`);
        logSuccess(`Instance ${id} restarted`);
    } catch (error) {
        logError(`Failed to restart instance: ${error.response?.data?.error || error.message}`);
    }
}

async function deleteInstance(id, force = false) {
    try {
        const client = createApiClient();
        await client.delete(`/api/instances/${id}`, {
            params: { force }
        });
        logSuccess(`Instance ${id} deleted`);
    } catch (error) {
        logError(`Failed to delete instance: ${error.response?.data?.error || error.message}`);
    }
}

// Backup commands
async function listBackups() {
    try {
        const client = createApiClient();
        const response = await client.get('/api/backups');

        if (response.data.length === 0) {
            logInfo('No backups found');
            return;
        }

        console.log('\n' + '─'.repeat(70));
        console.log(`${colors.cyan}Name                           Size       Status     Created${colors.reset}`);
        console.log('─'.repeat(70));

        for (const backup of response.data) {
            const statusColor = backup.status === 'completed' ? colors.green :
                               backup.status === 'failed' ? colors.red : colors.yellow;
            console.log(
                `${backup.name.padEnd(30)} ` +
                `${(backup.size / 1024 / 1024).toFixed(2).padStart(8)} MB ` +
                `${statusColor}${backup.status.padEnd(10)}${colors.reset} ` +
                `${new Date(backup.createdAt).toLocaleDateString()}`
            );
        }

        console.log('─'.repeat(70));
    } catch (error) {
        logError(`Failed to list backups: ${error.response?.data?.error || error.message}`);
    }
}

async function createBackup(instanceId, name) {
    try {
        const client = createApiClient();
        const response = await client.post(`/api/instances/${instanceId}/backup`, { name });
        logSuccess(`Backup created: ${response.data.name}`);
    } catch (error) {
        logError(`Failed to create backup: ${error.response?.data?.error || error.message}`);
    }
}

async function restoreBackup(name) {
    try {
        const client = createApiClient();
        await client.post(`/api/backups/${name}/restore`);
        logSuccess(`Backup ${name} restored`);
    } catch (error) {
        logError(`Failed to restore backup: ${error.response?.data?.error || error.message}`);
    }
}

async function deleteBackup(name) {
    try {
        const client = createApiClient();
        await client.delete(`/api/backups/${name}`);
        logSuccess(`Backup ${name} deleted`);
    } catch (error) {
        logError(`Failed to delete backup: ${error.response?.data?.error || error.message}`);
    }
}

// Health check
async function healthCheck() {
    try {
        const client = createApiClient();
        const [authHealth, instanceHealth] = await Promise.all([
            client.get(`${AUTH_BASE}/health`),
            client.get('/health')
        ]);

        console.log('\n' + '─'.repeat(40));
        console.log(`${colors.cyan}Service Health Status${colors.reset}`);
        console.log('─'.repeat(40));

        const authStatus = authHealth.data.status === 'ok' ?
                          `${colors.green}● Running${colors.reset}` :
                          `${colors.red}● Down${colors.reset}`;
        const instanceStatus = instanceHealth.data.status === 'ok' ?
                              `${colors.green}● Running${colors.reset}` :
                              `${colors.red}● Down${colors.reset}`;

        console.log(`Auth Service:     ${authStatus}`);
        console.log(`Instance Service: ${instanceStatus}`);
        console.log('─'.repeat(40) + '\n');
    } catch (error) {
        logError(`Health check failed: ${error.message}`);
    }
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
        rl.question(`${colors.green}[openclaw]${colors.reset} ${user}> `, (input) => {
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
                case 'backups':
                    listBackups();
                    break;
                case 'backup':
                    if (args[1]) createBackup(args[1], args[2]);
                    else logError('Please provide instance ID');
                    break;
                case 'restore':
                    if (args[1]) restoreBackup(args[1]);
                    else logError('Please provide backup name');
                    break;
                case 'health':
                    healthCheck();
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

${colors.yellow}Backup Management:${colors.reset}
  backups                              List all backups
  backup <instanceId> [name]           Create backup
  restore <backupName>                 Restore backup
  delete <backupName>                  Delete backup

${colors.yellow}System:${colors.reset}
  health                               Check service health
  help, ?                              Show this help
  exit, quit                           Exit interactive mode
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
        case 'backups':
            listBackups();
            break;
        case 'backup':
            if (args[1]) createBackup(args[1], args[2]);
            break;
        case 'restore':
            if (args[1]) restoreBackup(args[1]);
            break;
        case 'health':
            healthCheck();
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
