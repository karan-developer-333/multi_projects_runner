# API Endpoints Documentation

This document lists all the API endpoints available in the Project Runner Server.

## Base URL
All API endpoints are prefixed with `/api` unless otherwise noted.

## Unified Project Routes

All project operations use a single unique key (`key`) to identify projects. The key is typically the project folder name.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Deploy a new project |
| GET | `/api/projects/:key` | Get project details |
| PUT | `/api/projects/:key` | Update project (files, name, config) |
| DELETE | `/api/projects/:key` | Delete project |
| GET | `/api/projects/:key/status` | Get server status |
| POST | `/api/projects/:key/start` | Start project |
| POST | `/api/projects/:key/stop` | Stop project |
| POST | `/api/projects/:key/restart` | Restart project |
| GET | `/api/projects/:key/logs` | Get project logs |
| GET | `/api/projects/:key/progress` | Get real-time progress (SSE) |
| POST | `/api/projects/stop-all` | Stop all projects |

---

## Endpoint Details

### GET /api/projects

List all projects in the system (both file system and deployed).

**Response:**
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "key": "my-app",
        "name": "My App",
        "status": "running",
        "language": "nodejs",
        "isStreamlit": false,
        "tunnelUrl": "https://abc123.trycloudflare.com",
        "localUrl": "http://localhost:3001",
        "isDeployed": true,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

### POST /api/projects

Deploy a new project.

**Request Body:**
```json
{
  "name": "my-app",
  "files": {
    "package.json": "{\"name\":\"app\",\"scripts\":{\"start\":\"node index.js\"}}",
    "index.js": "console.log('Hello World');"
  },
  "language": "nodejs",
  "config": {}
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "name": "my-app",
    "language": "nodejs"
  },
  "message": "Project deployed successfully"
}
```

---

### GET /api/projects/:key

Get detailed information about a specific project.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "name": "My App",
    "language": "nodejs",
    "isStreamlit": false,
    "files": ["package.json", "index.js"],
    "status": "running",
    "tunnelUrl": "https://abc123.trycloudflare.com",
    "localUrl": "http://localhost:3001",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### PUT /api/projects/:key

Update an existing project (files, name, or config).

**Request Body:**
```json
{
  "name": "Updated Name",
  "files": {
    "index.js": "console.log('Updated');"
  },
  "config": { "key": "value" }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app"
  },
  "message": "Project updated successfully"
}
```

---

### DELETE /api/projects/:key

Delete a project (stops if running, removes files and store data).

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app"
  },
  "message": "Project deleted successfully"
}
```

---

### GET /api/projects/:key/status

Get the current server status of a project.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "status": "running",
    "running": true,
    "port": 3001,
    "tunnelUrl": "https://abc123.trycloudflare.com",
    "localUrl": "http://localhost:3001",
    "pid": 12345,
    "tunnelProvider": "cloudflare"
  }
}
```

---

### POST /api/projects/:key/start

Start a project (if not already running).

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "language": "nodejs",
    "status": "running",
    "port": 3001,
    "tunnelUrl": "https://abc123.trycloudflare.com",
    "localUrl": "http://localhost:3001"
  },
  "message": "Project started successfully"
}
```

If already running:
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "status": "running",
    "port": 3001,
    "tunnelUrl": "https://abc123.trycloudflare.com",
    "localUrl": "http://localhost:3001"
  },
  "message": "Project already running"
}
```

---

### POST /api/projects/:key/stop

Stop a running project.

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "success": true,
    "message": "Project stopped (you can restart anytime)"
  }
}
```

---

### POST /api/projects/:key/restart

Restart a project (stop then start).

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "status": "running",
    "port": 3002,
    "tunnelUrl": "https://def456.trycloudflare.com",
    "localUrl": "http://localhost:3002"
  },
  "message": "Project restarted successfully"
}
```

---

### GET /api/projects/:key/logs

Get project startup logs.

**Query Parameters:**
- `lines` (optional): Number of log lines to return (default: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "key": "my-app",
    "logs": "Installing dependencies...\nStarting server...\nServer running on port 3001",
    "lineCount": 3
  }
}
```

---

### GET /api/projects/:key/progress

Get real-time progress updates during project startup using Server-Sent Events (SSE).

**Response Content-Type:** `text/event-stream`

**Event Types:**

1. **Connection established:**
```json
data: {"type":"connected","key":"my-app","timestamp":1640995200000}
```

2. **Progress update:**
```json
data: {"type":"progress","stage":"detecting","message":"Detecting project configuration...","progress":5}
data: {"type":"progress","stage":"installing","message":"Setting up project environment...","progress":10}
data: {"type":"progress","stage":"starting","message":"Starting development server...","progress":75}
data: {"type":"progress","stage":"ready","message":"Project is live!","progress":100}
```

3. **Log message:**
```json
data: {"type":"log","message":"Installing npm packages...","source":"stdout"}
```

4. **Error:**
```json
data: {"type":"error","message":"Setup failed: npm install failed","details":{}}
```

5. **Complete:**
```json
data: {"type":"complete","success":true,"port":3001,"tunnelUrl":"https://abc123.trycloudflare.com","status":"running"}
```

**JavaScript Example:**
```javascript
const eventSource = new EventSource('/api/projects/my-app/progress');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
  
  if (data.type === 'complete') {
    console.log('Project ready:', data.tunnelUrl);
    eventSource.close();
  }
};
```

---

### POST /api/projects/stop-all

Stop all running projects.

**Response:**
```json
{
  "success": true,
  "data": {},
  "message": "All projects stopped"
}
```

---

## Legacy Endpoints (Deprecated)

The following endpoints are deprecated and should be migrated to the unified routes:

| Old Endpoint | New Endpoint |
|--------------|---------------|
| GET `/projects` | GET `/api/projects` |
| GET `/projects/:id` | POST `/api/projects/:key/start` |
| GET `/projects/:id/status` | GET `/api/projects/:key/status` |
| GET `/projects/:id/progress` | GET `/api/projects/:key/progress` |
| POST `/projects/:id/stop` | POST `/api/projects/:key/stop` |
| POST `/projects/:id/restart` | POST `/api/projects/:key/restart` |
| POST `/api/deploy` | POST `/api/projects` |
| GET `/api/deployed` | GET `/api/projects` |
| GET `/api/deployed/:folder` | GET `/api/projects/:key` |
| POST `/api/deployed/:folder/start` | POST `/api/projects/:key/start` |
| PUT `/api/deployed/:folder` | PUT `/api/projects/:key` |
| DELETE `/api/deployed/:folder` | DELETE `/api/projects/:key` |

---

## Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health status |

**Response:**
```json
{
  "status": "ok",
  "uptime": 123.456,
  "memory": {
    "rss": 12345678,
    "heapTotal": 1234567,
    "heapUsed": 123456,
    "external": 12345
  },
  "environment": "development"
}
```