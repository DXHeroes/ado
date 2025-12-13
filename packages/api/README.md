# @dxheroes/ado-api

tRPC API server for ADO (Agentic Development Orchestrator) with WebSocket subscriptions.

## Features

- **Type-Safe API** - tRPC procedures with end-to-end type safety
- **Real-Time Updates** - WebSocket subscriptions for task progress
- **Worker Management** - Remote worker registration and health monitoring
- **State Synchronization** - PostgreSQL-backed distributed state
- **OpenTelemetry** - Full observability with traces and metrics

## Installation

```bash
pnpm add @dxheroes/ado-api
```

## Quick Start

### Running the Server

```bash
# Development mode
pnpm --filter @dxheroes/ado-api dev

# Production mode
pnpm --filter @dxheroes/ado-api start

# Custom port
PORT=4000 pnpm --filter @dxheroes/ado-api start
```

Server runs on **http://localhost:4000** by default.

### Environment Variables

```bash
# Server configuration
export PORT=4000
export NODE_ENV=production

# Database (PostgreSQL for distributed state)
export DATABASE_URL="postgresql://user:password@localhost:5432/ado"

# Telemetry
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="ado-api"

# CORS
export CORS_ORIGIN="http://localhost:3000"
```

## API Reference

### tRPC Procedures

#### Task Management

##### `task.submit`

Submit a new task for execution.

```typescript
const result = await client.task.submit.mutate({
  prompt: 'Implement user authentication',
  providerId: 'claude-code', // optional
  validate: true,
  coverage: 80,
});
```

**Input:**
```typescript
{
  prompt: string;
  providerId?: string;
  validate?: boolean;
  coverage?: number;
  remote?: boolean;
  checkpoint?: boolean;
}
```

**Output:**
```typescript
{
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
}
```

##### `task.list`

List all tasks with optional filters.

```typescript
const tasks = await client.task.list.query({
  status: 'running',
  limit: 10,
  offset: 0,
});
```

**Input:**
```typescript
{
  status?: 'pending' | 'running' | 'completed' | 'failed';
  providerId?: string;
  limit?: number;
  offset?: number;
}
```

**Output:**
```typescript
{
  tasks: Array<{
    id: string;
    prompt: string;
    status: string;
    providerId: string;
    createdAt: string;
    completedAt?: string;
    cost?: number;
  }>;
  total: number;
}
```

##### `task.get`

Get details for a specific task.

```typescript
const task = await client.task.get.query({
  taskId: 'task-123',
});
```

**Output:**
```typescript
{
  id: string;
  prompt: string;
  status: string;
  providerId: string;
  progress: number;
  events: Array<{
    type: string;
    data: any;
    timestamp: string;
  }>;
  result?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  metrics: {
    duration: number;
    cost: number;
    tokensUsed: number;
  };
}
```

##### `task.cancel`

Cancel a running task.

```typescript
await client.task.cancel.mutate({
  taskId: 'task-123',
});
```

#### Worker Management

##### `worker.register`

Register a remote worker.

```typescript
const worker = await client.worker.register.mutate({
  providerId: 'claude-code',
  capabilities: ['code-generation', 'testing'],
  metadata: {
    hostname: 'worker-1',
    region: 'us-west-1',
  },
});
```

**Output:**
```typescript
{
  workerId: string;
  registeredAt: string;
}
```

##### `worker.list`

List all registered workers.

```typescript
const workers = await client.worker.list.query({
  status: 'active',
});
```

**Output:**
```typescript
{
  workers: Array<{
    id: string;
    providerId: string;
    status: 'active' | 'idle' | 'offline';
    capabilities: string[];
    currentTask?: string;
    lastHeartbeat: string;
    metadata: Record<string, any>;
  }>;
}
```

##### `worker.heartbeat`

Send worker heartbeat.

```typescript
await client.worker.heartbeat.mutate({
  workerId: 'worker-123',
  status: 'active',
  currentTask: 'task-456',
});
```

##### `worker.unregister`

Unregister a worker.

```typescript
await client.worker.unregister.mutate({
  workerId: 'worker-123',
});
```

#### Cost Management

##### `cost.summary`

Get cost summary across all providers.

```typescript
const summary = await client.cost.summary.query({
  from: '2025-01-01',
  to: '2025-01-31',
});
```

**Output:**
```typescript
{
  total: number;
  byProvider: Record<string, {
    cost: number;
    tasks: number;
    tokensUsed: number;
  }>;
  byDay: Array<{
    date: string;
    cost: number;
  }>;
}
```

##### `cost.forecast`

Get cost forecast based on usage patterns.

```typescript
const forecast = await client.cost.forecast.query({
  days: 30,
});
```

#### Configuration

##### `config.get`

Get current configuration.

```typescript
const config = await client.config.get.query();
```

##### `config.update`

Update configuration.

```typescript
await client.config.update.mutate({
  key: 'providers.claude-code.enabled',
  value: true,
});
```

### WebSocket Subscriptions

#### `task.onProgress`

Subscribe to real-time task progress updates.

```typescript
const subscription = client.task.onProgress.subscribe(
  { taskId: 'task-123' },
  {
    onData: (event) => {
      console.log('Progress:', event.progress);
      console.log('Event:', event.type, event.data);
    },
    onError: (err) => {
      console.error('Subscription error:', err);
    },
  }
);

// Unsubscribe
subscription.unsubscribe();
```

**Event Types:**
- `started` - Task execution started
- `progress` - Progress update (0-100)
- `log` - Log message
- `checkpoint` - Checkpoint reached (HITL)
- `validation` - Quality validation result
- `completed` - Task completed
- `failed` - Task failed

#### `worker.onHeartbeat`

Subscribe to worker heartbeat events.

```typescript
const subscription = client.worker.onHeartbeat.subscribe(
  { workerId: 'worker-123' },
  {
    onData: (heartbeat) => {
      console.log('Heartbeat:', heartbeat.timestamp);
      console.log('Status:', heartbeat.status);
    },
  }
);
```

#### `system.onEvent`

Subscribe to system-wide events.

```typescript
const subscription = client.system.onEvent.subscribe(
  { eventTypes: ['task-completed', 'worker-offline'] },
  {
    onData: (event) => {
      console.log('System event:', event);
    },
  }
);
```

## Client Usage

### TypeScript Client

```typescript
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '@dxheroes/ado-api';

// Create WebSocket client for subscriptions
const wsClient = createWSClient({
  url: 'ws://localhost:4000',
});

// Create tRPC client
const client = createTRPCProxyClient<AppRouter>({
  links: [
    wsLink({
      client: wsClient,
    }),
  ],
});

// Use the client
const task = await client.task.submit.mutate({
  prompt: 'Build authentication system',
});

console.log('Task ID:', task.taskId);

// Subscribe to progress
const sub = client.task.onProgress.subscribe(
  { taskId: task.taskId },
  {
    onData: (event) => console.log(event),
  }
);
```

### React Client (with TanStack Query)

```typescript
import { createTRPCReact } from '@trpc/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppRouter } from '@dxheroes/ado-api';

const trpc = createTRPCReact<AppRouter>();

// In your app
function App() {
  const queryClient = new QueryClient();
  const trpcClient = trpc.createClient({
    links: [
      wsLink({
        client: wsClient,
      }),
    ],
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <TaskList />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

// In your component
function TaskList() {
  const { data: tasks } = trpc.task.list.useQuery({
    status: 'running',
  });

  const submitTask = trpc.task.submit.useMutation();

  return (
    <div>
      <button onClick={() => submitTask.mutate({ prompt: 'Add feature' })}>
        Submit Task
      </button>
      {tasks?.tasks.map((task) => (
        <div key={task.id}>{task.prompt}</div>
      ))}
    </div>
  );
}
```

## Deployment

### Local Development

```bash
# Start PostgreSQL
docker run -d \
  --name ado-postgres \
  -e POSTGRES_DB=ado \
  -e POSTGRES_USER=ado \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:16

# Start API server
pnpm --filter @dxheroes/ado-api dev
```

### Docker

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/api ./packages/api

# Build
RUN pnpm --filter @dxheroes/ado-api build

# Expose port
EXPOSE 4000

# Start server
CMD ["pnpm", "--filter", "@dxheroes/ado-api", "start"]
```

```bash
# Build image
docker build -t ado-api:latest -f packages/api/Dockerfile .

# Run container
docker run -d \
  --name ado-api \
  -p 4000:4000 \
  -e DATABASE_URL="postgresql://ado:password@postgres:5432/ado" \
  ado-api:latest
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ado-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ado-api
  template:
    metadata:
      labels:
        app: ado-api
    spec:
      containers:
      - name: api
        image: dxheroes/ado-api:latest
        ports:
        - containerPort: 4000
        env:
        - name: PORT
          value: "4000"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ado-secrets
              key: database-url
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://otel-collector:4318"
        livenessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 10
          periodSeconds: 30
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: ado-api
spec:
  selector:
    app: ado-api
  ports:
  - port: 4000
    targetPort: 4000
  type: LoadBalancer
```

```bash
# Deploy to Kubernetes
kubectl apply -f deployment.yaml

# Check status
kubectl get pods -l app=ado-api
kubectl logs -l app=ado-api -f
```

### Helm Chart

```bash
# Install with Helm
helm install ado-api ./deploy/helm/ado-api \
  --set postgresql.enabled=true \
  --set replicaCount=3 \
  --set image.tag=latest

# Upgrade
helm upgrade ado-api ./deploy/helm/ado-api

# Uninstall
helm uninstall ado-api
```

## Health Checks

The API server exposes health check endpoints:

### `/health`

Basic health check.

```bash
curl http://localhost:4000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-13T12:00:00Z"
}
```

### `/health/ready`

Readiness check (includes database connectivity).

```bash
curl http://localhost:4000/health/ready
```

Response:
```json
{
  "status": "ready",
  "database": "connected",
  "workers": 5
}
```

## Observability

### OpenTelemetry Integration

The API server automatically exports:
- **Traces**: Request/response traces, database queries
- **Metrics**: Request count, duration, error rate
- **Logs**: Structured logs with correlation IDs

```bash
# View traces in Jaeger
open http://localhost:16686

# View metrics in Prometheus
open http://localhost:9090
```

### Metrics

Available metrics:
- `ado_api_requests_total` - Total API requests
- `ado_api_request_duration_seconds` - Request duration histogram
- `ado_api_errors_total` - Total errors
- `ado_tasks_submitted_total` - Total tasks submitted
- `ado_tasks_completed_total` - Total tasks completed
- `ado_workers_active` - Number of active workers

## Development

```bash
# Install dependencies
pnpm install

# Start development server (with hot reload)
pnpm --filter @dxheroes/ado-api dev

# Build
pnpm --filter @dxheroes/ado-api build

# Run tests
pnpm --filter @dxheroes/ado-api test

# Type checking
pnpm --filter @dxheroes/ado-api typecheck

# Linting
pnpm --filter @dxheroes/ado-api lint
```

## License

MIT © DX Heroes
