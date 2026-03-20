#!/usr/bin/env node

/**
 * OpenClaw Enterprise Tenant Initialization Script
 * Creates initial tenant and admin user
 */

const axios = require('axios');
const readline = require('readline');

const AUTH_BASE = process.env.OPENCLAW_AUTH_URL || 'http://localhost:3001';

// Colors
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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

async function createTenant() {
    console.log('');
    log(colors.cyan, '╔════════════════════════════════════════════╗');
    log(colors.cyan, '║  OpenClaw Enterprise - Tenant Setup       ║');
    log(colors.cyan, '╚════════════════════════════════════════════╝');
    console.log('');

    logInfo('This script will create your first tenant and admin user.');
    console.log('');

    // Get tenant info
    const tenantName = await question('Organization name: ') || 'My Organization';
    const tenantSlug = await question('Organization slug (e.g., my-org): ') || 'my-org';

    // Get plan
    console.log('');
    console.log('Available plans:');
    console.log('  1. Community (free, up to 10 instances)');
    console.log('  2. Professional ($99/month, up to 50 instances)');
    console.log('  3. Enterprise (custom, up to 200 instances)');
    console.log('');

    const planChoice = await question('Select plan [1/2/3]: ') || '1';
    const planMap = { '1': 'community', '2': 'professional', '3': 'enterprise' };
    const plan = planMap[planChoice] || 'community';

    // Get admin user info
    console.log('');
    logInfo('Creating admin user...');
    const adminEmail = await question('Admin email: ');
    if (!adminEmail) {
        logError('Email is required');
        process.exit(1);
    }

    const adminName = await question('Admin name: ') || 'Admin';
    const adminPassword = await question('Admin password: ');
    if (!adminPassword || adminPassword.length < 8) {
        logError('Password must be at least 8 characters');
        process.exit(1);
    }

    console.log('');
    logInfo('Creating tenant and admin user...');

    try {
        // Create tenant with admin user
        const response = await axios.post(`${AUTH_BASE}/api/tenants`, {
            name: tenantName,
            slug: tenantSlug,
            plan: plan,
            adminEmail: adminEmail,
            adminPassword: adminPassword,
            adminName: adminName
        });

        const tenant = response.data;

        logSuccess('Tenant created successfully!');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(` Tenant ID:   ${colors.cyan}${tenant.id}${colors.reset}`);
        console.log(` Name:        ${tenant.name}`);
        console.log(` Slug:        ${tenant.slug}`);
        console.log(` Plan:        ${colors.yellow}${tenant.plan}${colors.reset}`);
        console.log(` Max Instances: ${tenant.maxInstances}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        // Test login
        logInfo('Testing login...');

        // First, we need to get the tenant ID for login
        // Since we just created it, we'll use the returned ID
        const loginResponse = await axios.post(`${AUTH_BASE}/api/auth/login`, {
            email: adminEmail,
            password: adminPassword,
            tenantId: tenant.id
        });

        const { token, user } = loginResponse.data;

        logSuccess('Login successful!');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(` Token:  ${token.substring(0, 50)}...`);
        console.log(` User:   ${user.name} (${user.email})`);
        console.log(` Roles:  ${user.roles.join(', ')}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        logSuccess('Setup complete!');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Access the web console at http://localhost:8080');
        console.log('  2. Login with your admin credentials');
        console.log('  3. Create your first OpenClaw instance');
        console.log('');

    } catch (error) {
        logError(`Failed to create tenant: ${error.response?.data?.error || error.message}`);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Run setup
createTenant();
