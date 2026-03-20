# OpenClaw Enterprise API Documentation

## Base URLs

| Service | URL | Description |
|---------|-----|-------------|
| Gateway | http://localhost:8080 | NGINX reverse proxy |
| Auth Service | http://localhost:3001 | Authentication & RBAC |
| Instance Service | http://localhost:3002 | Instance management |
| Monitor Service | http://localhost:3003 | Resources & audit logs |

## Authentication

All API requests (except login/register) require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Obtaining a Token

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password",
    "tenantId": "your-tenant-id"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Admin User",
    "roles": ["admin"]
  }
}
```

---

## Authentication API

### POST /api/auth/register

Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure-password",
  "name": "User Name",
  "tenantId": "tenant-uuid"
}
```

**Response (201):**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "User Name"
}
```

---

### POST /api/auth/login

Login and obtain JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure-password",
  "tenantId": "tenant-uuid"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "User Name",
    "roles": ["member"]
  }
}
```

---

### GET /api/auth/me

Get current user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "User Name",
  "tenantId": "tenant-uuid",
  "createdAt": "2026-03-20T10:00:00.000Z"
}
```

---

### POST /api/auth/refresh

Refresh JWT token.

**Headers:**
```
Authorization: Bearer <current-token>
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Tenant API

### POST /api/tenants

Create a new tenant (requires admin permissions).

**Request:**
```json
{
  "name": "My Organization",
  "slug": "my-org",
  "plan": "professional",
  "adminEmail": "admin@example.com",
  "adminPassword": "secure-password",
  "adminName": "Admin User"
}
```

**Response (201):**
```json
{
  "id": "tenant-uuid",
  "name": "My Organization",
  "slug": "my-org",
  "plan": "professional",
  "maxInstances": 50,
  "createdAt": "2026-03-20T10:00:00.000Z"
}
```

---

### GET /api/tenants/:id

Get tenant by ID.

**Response (200):**
```json
{
  "id": "tenant-uuid",
  "name": "My Organization",
  "slug": "my-org",
  "plan": "professional",
  "maxInstances": 50,
  "settings": {},
  "createdAt": "2026-03-20T10:00:00.000Z"
}
```

---

## Instance API

### GET /api/instances

List all instances for current tenant.

**Response (200):**
```json
[
  {
    "id": "instance-uuid",
    "tenantId": "tenant-uuid",
    "name": "instance-api",
    "profile": "instance_1",
    "port": 18790,
    "workspace": "~/.openclaw/instances/1/workspace",
    "status": "running",
    "pid": 12345,
    "config": {},
    "createdAt": "2026-03-20T10:00:00.000Z",
    "updatedAt": "2026-03-20T10:00:00.000Z"
  }
]
```

---

### POST /api/instances

Create a new instance.

**Request:**
```json
{
  "name": "instance-api",
  "port": 18790,
  "workspace": "~/projects/api"
}
```

**Response (201):**
```json
{
  "id": "instance-uuid",
  "tenantId": "tenant-uuid",
  "name": "instance-api",
  "profile": "instance_2",
  "port": 18790,
  "workspace": "~/projects/api",
  "status": "stopped",
  "createdAt": "2026-03-20T10:00:00.000Z"
}
```

---

### POST /api/instances/:id/start

Start an instance.

**Response (200):**
```json
{
  "status": "success",
  "message": "Instance started"
}
```

---

### POST /api/instances/:id/stop

Stop an instance.

**Response (200):**
```json
{
  "status": "success",
  "message": "Instance stopped"
}
```

---

### POST /api/instances/:id/restart

Restart an instance.

**Response (200):**
```json
{
  "status": "success",
  "message": "Instance restarted"
}
```

---

### DELETE /api/instances/:id

Delete an instance.

**Query Parameters:**
- `force` (boolean): Force delete running instance

**Response (200):**
```json
{
  "status": "success",
  "message": "Instance deleted"
}
```

---

### POST /api/instances/:id/backup

Create a backup of an instance.

**Request:**
```json
{
  "name": "my-backup-20260320"
}
```

**Response (201):**
```json
{
  "id": "backup-uuid",
  "tenantId": "tenant-uuid",
  "instanceId": "instance-uuid",
  "name": "my-backup-20260320",
  "path": "~/.openclaw/backups/my-backup-20260320.tar.gz",
  "size": 1048576,
  "status": "completed",
  "createdAt": "2026-03-20T10:00:00.000Z"
}
```

---

## Resource API

### GET /api/resources/stats

Get resource usage statistics for all instances.

**Response (200):**
```json
{
  "summary": {
    "totalInstances": 5,
    "runningInstances": 3,
    "totalCPU": 45.5,
    "totalMemory": 128.3,
    "totalDisk": 5368709120,
    "avgCPU": 9.1,
    "avgMemory": 25.66
  },
  "instances": [
    {
      "instanceId": "instance-uuid",
      "cpu": 12.5,
      "memory": 45.2,
      "disk": 1073741824,
      "timestamp": "2026-03-20T10:00:00.000Z"
    }
  ]
}
```

---

### GET /api/resources/limits

Get resource limits and quota for current tenant.

**Response (200):**
```json
{
  "plan": "professional",
  "limits": {
    "maxInstances": 50,
    "maxCPU": 400,
    "maxMemory": 50,
    "maxDisk": 200
  },
  "usage": {
    "instances": 5,
    "cpu": 45.5,
    "memory": 2.5,
    "disk": 5.0
  },
  "quota": {
    "instancesUsed": 5,
    "instancesRemaining": 45
  }
}
```

---

### GET /api/instances/:id/resources

Get real-time resource usage for a specific instance.

**Response (200):**
```json
{
  "instanceId": "instance-uuid",
  "cpu": 12.5,
  "memory": 45.2,
  "disk": 1073741824,
  "timestamp": "2026-03-20T10:00:00.000Z"
}
```

---

### GET /api/instances/:id/resources/history

Get resource usage history for an instance.

**Response (200):**
```json
[
  {
    "instanceId": "instance-uuid",
    "cpu": 12.5,
    "memory": 45.2,
    "disk": 1073741824,
    "timestamp": "2026-03-20T10:00:00.000Z"
  },
  {
    "instanceId": "instance-uuid",
    "cpu": 10.2,
    "memory": 42.1,
    "disk": 1073741824,
    "timestamp": "2026-03-20T09:59:00.000Z"
  }
]
```

---

### POST /api/logs/cleanup

Trigger log cleanup for tenant instances.

**Request:**
```json
{
  "days": 7,
  "maxSize": 100
}
```

**Response (200):**
```json
{
  "results": [
    {
      "instanceId": "instance-uuid",
      "status": "success"
    }
  ]
}
```

---

## Audit Log API

### GET /api/audit-logs

Get audit logs for current tenant.

**Query Parameters:**
- `limit` (number, default: 100): Number of records to return
- `instanceId` (string): Filter by instance ID
- `action` (string): Filter by action type

**Response (200):**
```json
[
  {
    "id": "audit-uuid",
    "tenantId": "tenant-uuid",
    "userId": "user-uuid",
    "action": "instance:create",
    "resource": "instance",
    "resourceId": "instance-uuid",
    "details": {},
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "createdAt": "2026-03-20T10:00:00.000Z"
  }
]
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Invalid request parameters"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "Permission denied: instances:create"
}
```

### 404 Not Found
```json
{
  "error": "Instance not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| /api/auth/* | 10 requests/minute |
| /api/instances/* | 100 requests/minute |
| /api/resources/* | 60 requests/minute |
| /api/audit-logs | 30 requests/minute |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1679313600
```

---

## CLI Usage

```bash
# Login
npm run cli -- login admin@example.com password tenant-uuid

# List instances
npm run cli -- instances

# Create instance
npm run cli -- create my-instance 18790

# Start instance
npm run cli -- start 1

# Stop instance
npm run cli -- stop 1

# View resources
npm run cli -- resources

# Health check
npm run cli -- health

# Interactive mode
npm run cli
```
