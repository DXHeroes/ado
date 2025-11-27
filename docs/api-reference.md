# API Reference

REST API documentation for ADO orchestrator.

## Base URL

```
http://localhost:8080/api
```

Production:
```
https://ado.example.com/api
```

## Authentication

Currently, ADO uses local authentication. Future versions will support:
- API Keys
- JWT tokens
- OAuth2

## Endpoints

### Dashboard

#### GET /api/dashboard/stats

Get dashboard statistics.

**Response:**
```json
{
  "activeTasks": 5,
  "completedToday": 23,
  "apiCost24h": 12.45,
  "avgDuration": 42.5,
  "recentAlerts": [
    {
      "message": "Rate limit reached for claude-code",
      "time": "2025-11-26T14:30:00Z"
    }
  ]
}
```

#### GET /api/dashboard/usage-history

Get usage history for charts.

**Query Parameters:**
- `period` - `7d` (default), `30d`, `90d`

**Response:**
```json
{
  "taskVolume": [
    { "date": "2025-11-20", "count": 45 },
    { "date": "2025-11-21", "count": 52 }
  ],
  "providerUsage": [
    { "provider": "claude-code", "count": 120 },
    { "provider": "gemini-cli", "count": 85 }
  ],
  "costTrend": [
    { "date": "2025-11-20", "subscription": 0, "api": 2.45 },
    { "date": "2025-11-21", "subscription": 0, "api": 3.12 }
  ]
}
```

### Tasks

#### GET /api/tasks

List all tasks.

**Query Parameters:**
- `status` - Filter by status: `running`, `completed`, `failed`, `pending`
- `provider` - Filter by provider ID
- `limit` - Max results (default: 50)
- `offset` - Pagination offset

**Response:**
```json
[
  {
    "id": "task-123",
    "prompt": "Implement user authentication",
    "provider": "claude-code",
    "status": "completed",
    "startedAt": "2025-11-26T14:00:00Z",
    "completedAt": "2025-11-26T14:05:30Z",
    "duration": 330,
    "cost": 0.05,
    "accessMode": "subscription"
  }
]
```

#### GET /api/tasks/:taskId

Get task details.

**Response:**
```json
{
  "id": "task-123",
  "prompt": "Implement user authentication",
  "provider": "claude-code",
  "status": "completed",
  "startedAt": "2025-11-26T14:00:00Z",
  "completedAt": "2025-11-26T14:05:30Z",
  "duration": 330,
  "cost": 0.05,
  "accessMode": "subscription",
  "events": [
    {
      "type": "task.started",
      "timestamp": "2025-11-26T14:00:00Z",
      "data": { "provider": "claude-code" }
    },
    {
      "type": "task.completed",
      "timestamp": "2025-11-26T14:05:30Z",
      "data": { "duration": 330 }
    }
  ]
}
```

#### POST /api/tasks

Create a new task.

**Request:**
```json
{
  "prompt": "Add unit tests for auth module",
  "projectKey": "my-project",
  "repositoryPath": "/path/to/repo",
  "preferredProviders": ["claude-code"],
  "allowApiFailover": true,
  "maxApiCostUsd": 5.0
}
```

**Response:**
```json
{
  "id": "task-456",
  "status": "pending",
  "createdAt": "2025-11-26T15:00:00Z"
}
```

#### POST /api/tasks/:taskId/pause

Pause a running task.

**Response:**
```json
{
  "id": "task-123",
  "status": "paused"
}
```

#### POST /api/tasks/:taskId/resume

Resume a paused task.

**Request:**
```json
{
  "humanInput": {
    "decision": "approve",
    "message": "Looks good, continue"
  }
}
```

**Response:**
```json
{
  "id": "task-123",
  "status": "running"
}
```

#### POST /api/tasks/:taskId/cancel

Cancel a task.

**Response:**
```json
{
  "id": "task-123",
  "status": "cancelled"
}
```

### Providers

#### GET /api/providers

List all providers.

**Response:**
```json
[
  {
    "id": "claude-code",
    "name": "Claude Code",
    "enabled": true,
    "accessModes": [
      {
        "mode": "subscription",
        "enabled": true,
        "priority": 1
      },
      {
        "mode": "api",
        "enabled": true,
        "priority": 10
      }
    ],
    "rateLimits": {
      "requestsPerDay": 500,
      "tokensPerDay": 5000000
    },
    "capabilities": {
      "codeGeneration": true,
      "codeReview": true,
      "refactoring": true,
      "testing": true,
      "documentation": true,
      "debugging": true
    },
    "usage": {
      "requestsToday": 127,
      "tokensToday": 450000
    }
  }
]
```

#### GET /api/providers/:providerId

Get provider details.

**Response:**
```json
{
  "id": "claude-code",
  "name": "Claude Code",
  "enabled": true,
  "status": "available",
  "rateLimitStatus": {
    "isLimited": false,
    "remainingRequests": 373,
    "remainingTokens": 4550000,
    "resetsAt": "2025-11-27T00:00:00Z"
  }
}
```

#### PATCH /api/providers/:providerId

Update provider configuration.

**Request:**
```json
{
  "enabled": false
}
```

**Response:**
```json
{
  "id": "claude-code",
  "enabled": false
}
```

### Reports

#### GET /api/reports/costs

Get cost report.

**Query Parameters:**
- `period` - `today`, `week`, `month`, `year`
- `provider` - Filter by provider ID
- `accessMode` - Filter by access mode

**Response:**
```json
{
  "period": "week",
  "totalCost": 45.23,
  "breakdown": [
    {
      "provider": "claude-code",
      "accessMode": "api",
      "cost": 25.50,
      "requestCount": 450,
      "inputTokens": 1200000,
      "outputTokens": 850000
    },
    {
      "provider": "gemini-cli",
      "accessMode": "api",
      "cost": 19.73,
      "requestCount": 320,
      "inputTokens": 980000,
      "outputTokens": 650000
    }
  ]
}
```

#### GET /api/reports/usage

Get usage report.

**Query Parameters:**
- `period` - `today`, `week`, `month`, `year`

**Response:**
```json
{
  "period": "week",
  "totalTasks": 145,
  "completedTasks": 132,
  "failedTasks": 13,
  "avgDuration": 42.5,
  "providerBreakdown": [
    {
      "provider": "claude-code",
      "taskCount": 89,
      "avgDuration": 38.2,
      "successRate": 0.95
    }
  ]
}
```

### Configuration

#### GET /api/config

Get current configuration.

**Response:**
```json
{
  "version": "1.1",
  "project": {
    "id": "my-project"
  },
  "routing": {
    "strategy": "subscription-first",
    "apiFallback": {
      "enabled": true,
      "maxCostPerTask": 10.0
    }
  }
}
```

#### PATCH /api/config

Update configuration.

**Request:**
```json
{
  "routing": {
    "apiFallback": {
      "maxCostPerTask": 25.0
    }
  }
}
```

## WebSocket API

### Task Events Stream

Connect to receive real-time task events.

**Endpoint:**
```
ws://localhost:8080/api/tasks/:taskId/events
```

**Events:**
```json
{
  "type": "task.started",
  "taskId": "task-123",
  "timestamp": "2025-11-26T14:00:00Z",
  "data": { "provider": "claude-code" }
}

{
  "type": "task.progress",
  "taskId": "task-123",
  "timestamp": "2025-11-26T14:02:00Z",
  "data": { "message": "Analyzing codebase..." }
}

{
  "type": "task.completed",
  "taskId": "task-123",
  "timestamp": "2025-11-26T14:05:30Z",
  "data": { "duration": 330, "cost": 0.05 }
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Provider has reached rate limit",
    "details": {
      "provider": "claude-code",
      "resetsAt": "2025-11-27T00:00:00Z"
    }
  }
}
```

### Error Codes

- `INVALID_REQUEST` - Malformed request
- `NOT_FOUND` - Resource not found
- `RATE_LIMIT_EXCEEDED` - Rate limit hit
- `PROVIDER_UNAVAILABLE` - Provider not available
- `COST_LIMIT_EXCEEDED` - Cost limit exceeded
- `TASK_FAILED` - Task execution failed
- `INTERNAL_ERROR` - Server error

## Rate Limiting

API endpoints are rate limited:

- 1000 requests per minute per IP
- Rate limit headers included in responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1732636800
```

## Pagination

List endpoints support pagination:

```
GET /api/tasks?limit=50&offset=100
```

Response includes pagination info:

```json
{
  "data": [...],
  "pagination": {
    "limit": 50,
    "offset": 100,
    "total": 523,
    "hasMore": true
  }
}
```

## Next Steps

- [Configuration Reference](./configuration.md)
- [Dashboard Guide](../packages/dashboard/README.md)
- [Deployment Guide](./deployment.md)
