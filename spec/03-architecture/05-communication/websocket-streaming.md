# WebSocket Streaming Specification

## Přehled

WebSocket slouží pro real-time streaming dat z workerů do CLI/Dashboard - především output z AI agentů a progress eventy.

## Connection Management

### Connection URL
```
wss://api.ado.example.com/ws
ws://localhost:3001/ws  # Local development
```

### Authentication
```typescript
// Token in query parameter (for WebSocket upgrade)
const ws = new WebSocket('wss://api.ado.example.com/ws?token=<jwt>');

// Or in first message
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: '<jwt>'
  }));
};
```

### Reconnection Strategy
```typescript
const reconnectConfig = {
  initialDelay: 1000,      // 1s
  maxDelay: 30000,         // 30s max
  factor: 2,               // Exponential backoff
  maxRetries: 10,
  jitter: 0.3,             // 30% random jitter
};

// Implementation
class WebSocketClient {
  private retryCount = 0;

  private getRetryDelay(): number {
    const delay = Math.min(
      reconnectConfig.initialDelay * Math.pow(reconnectConfig.factor, this.retryCount),
      reconnectConfig.maxDelay
    );
    const jitter = delay * reconnectConfig.jitter * Math.random();
    return delay + jitter;
  }

  private async reconnect() {
    if (this.retryCount >= reconnectConfig.maxRetries) {
      this.emit('maxRetriesReached');
      return;
    }

    const delay = this.getRetryDelay();
    await sleep(delay);
    this.retryCount++;
    this.connect();
  }
}
```

## Message Protocol

### Message Format
```typescript
interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;       // ISO 8601
  correlationId?: string;  // For request-response
}
```

### Client → Server Messages

#### Subscribe to Task
```json
{
  "type": "subscribe",
  "payload": {
    "channel": "task.progress",
    "taskId": "task-123"
  },
  "timestamp": "2025-01-15T10:30:00Z",
  "correlationId": "sub-001"
}
```

#### Unsubscribe
```json
{
  "type": "unsubscribe",
  "payload": {
    "channel": "task.progress",
    "taskId": "task-123"
  },
  "timestamp": "2025-01-15T10:35:00Z"
}
```

#### Ping (keepalive)
```json
{
  "type": "ping",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Server → Client Messages

#### Subscription Confirmation
```json
{
  "type": "subscribed",
  "payload": {
    "channel": "task.progress",
    "taskId": "task-123"
  },
  "timestamp": "2025-01-15T10:30:00Z",
  "correlationId": "sub-001"
}
```

#### Task Progress Event
```json
{
  "type": "task.progress",
  "payload": {
    "taskId": "task-123",
    "status": "running",
    "progress": 45,
    "currentStep": "Implementing authentication",
    "subtask": {
      "id": "subtask-002",
      "name": "Auth module",
      "progress": 80
    },
    "metrics": {
      "elapsed": 180,
      "estimatedRemaining": 220
    }
  },
  "timestamp": "2025-01-15T10:30:05Z"
}
```

#### Task Output Event
```json
{
  "type": "task.output",
  "payload": {
    "taskId": "task-123",
    "stream": "stdout",
    "data": "Creating file src/auth/jwt.ts...\n",
    "workerId": "worker-1",
    "agentId": "claude-code"
  },
  "timestamp": "2025-01-15T10:30:06Z"
}
```

#### Checkpoint Notification
```json
{
  "type": "checkpoint.pending",
  "payload": {
    "checkpointId": "cp-456",
    "taskId": "task-123",
    "type": "spec_review",
    "title": "Specification Review Required",
    "description": "Please review the generated specification",
    "options": ["approve", "modify", "reject"],
    "timeout": "2025-01-16T10:30:00Z"
  },
  "timestamp": "2025-01-15T10:30:10Z"
}
```

#### Error Event
```json
{
  "type": "error",
  "payload": {
    "code": "SUBSCRIPTION_FAILED",
    "message": "Task not found",
    "details": {
      "taskId": "task-999"
    }
  },
  "timestamp": "2025-01-15T10:30:00Z",
  "correlationId": "sub-002"
}
```

#### Pong (keepalive response)
```json
{
  "type": "pong",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## Event Types

### Task Events
| Event | Trigger | Payload |
|-------|---------|---------|
| `task.created` | Task submitted | Task metadata |
| `task.started` | Execution begins | Worker info |
| `task.progress` | Progress update | Progress %, step |
| `task.output` | Agent output | stdout/stderr chunk |
| `task.subtask.started` | Subtask begins | Subtask info |
| `task.subtask.completed` | Subtask done | Result |
| `task.checkpoint` | Checkpoint created | Checkpoint info |
| `task.completed` | Task finished | Result, metrics |
| `task.failed` | Task failed | Error details |
| `task.cancelled` | Task cancelled | Reason |

### Checkpoint Events
| Event | Trigger | Payload |
|-------|---------|---------|
| `checkpoint.pending` | New checkpoint | Checkpoint details |
| `checkpoint.reminder` | Timeout approaching | Time remaining |
| `checkpoint.resolved` | User decision | Decision, feedback |
| `checkpoint.timeout` | Timeout reached | Auto-action taken |

### System Events
| Event | Trigger | Payload |
|-------|---------|---------|
| `worker.started` | Worker online | Worker info |
| `worker.stopped` | Worker offline | Reason |
| `provider.ratelimited` | Rate limit hit | Provider, reset time |
| `cost.threshold` | Cost limit approaching | Current, threshold |

## Channel Subscriptions

### Available Channels
```typescript
type Channel =
  | `task.${taskId}`           // All events for specific task
  | `task.${taskId}.output`    // Only output for task
  | `task.${taskId}.progress`  // Only progress for task
  | `checkpoints`              // All checkpoint notifications
  | `system`                   // System-wide events
  | `workers`                  // Worker status changes
```

### Subscription Management
```typescript
// Client can subscribe to multiple channels
const subscriptions = new Map<string, Set<WebSocket>>();

function subscribe(ws: WebSocket, channel: string) {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  subscriptions.get(channel)!.add(ws);
}

function broadcast(channel: string, message: WebSocketMessage) {
  const subs = subscriptions.get(channel);
  if (subs) {
    for (const ws of subs) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }
}
```

## Flow Control

### Backpressure Handling
```typescript
interface FlowControl {
  // Server buffers messages if client is slow
  maxBufferSize: 1000,        // Max messages in buffer
  highWaterMark: 800,         // Start dropping when reached
  lowWaterMark: 200,          // Resume normal when below

  // Client can request pause/resume
  pauseOnHighWater: true,
  dropOldestOnOverflow: true,
}
```

### Rate Limiting
```typescript
// Per-connection limits
const rateLimits = {
  messagesPerSecond: 100,
  subscriptionsPerConnection: 50,
  connectionsPerUser: 10,
};
```

## Server Implementation

```typescript
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // Authenticate
  const token = new URL(req.url!, 'http://localhost').searchParams.get('token');
  const user = await authenticate(token);
  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Track connection
  const connection = new Connection(ws, user);
  connections.add(connection);

  // Handle messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMessage(connection, message);
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        payload: { code: 'INVALID_MESSAGE', message: error.message }
      }));
    }
  });

  // Cleanup on close
  ws.on('close', () => {
    connection.cleanup();
    connections.delete(connection);
  });

  // Keepalive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on('close', () => clearInterval(pingInterval));
});
```

## Client Implementation (TypeScript)

```typescript
class ADOWebSocketClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, (event: any) => void>();
  private reconnecting = false;

  async connect(url: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${url}?token=${token}`);

      this.ws.onopen = () => {
        this.reconnecting = false;
        resolve();
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      this.ws.onclose = () => {
        if (!this.reconnecting) {
          this.reconnect();
        }
      };
    });
  }

  subscribe(channel: string, callback: (event: any) => void): () => void {
    this.subscriptions.set(channel, callback);

    this.send({
      type: 'subscribe',
      payload: { channel },
      timestamp: new Date().toISOString()
    });

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(channel);
      this.send({
        type: 'unsubscribe',
        payload: { channel },
        timestamp: new Date().toISOString()
      });
    };
  }

  private handleMessage(message: WebSocketMessage) {
    // Route to appropriate subscription
    const channel = this.getChannelFromMessage(message);
    const callback = this.subscriptions.get(channel);
    if (callback) {
      callback(message.payload);
    }
  }

  private send(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

---

## Souvislosti

- [tRPC API](./trpc-api.md)
- [FR-002: Distributed Orchestration](../../02-requirements/01-functional/FR-002-distributed-orchestration.md)
- [API: WebSocket Events](../../05-api/02-websocket-events/)
