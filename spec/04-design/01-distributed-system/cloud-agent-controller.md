# Cloud Agent Controller Design

## Přehled

Cloud Agent Controller je komponenta zodpovědná za správu vzdálených workerů běžících v cloudové infrastruktuře.

## Responsibilities

1. **Worker Lifecycle Management** - spawning, health monitoring, termination
2. **Task Distribution** - routing úkolů k volným workerům
3. **State Coordination** - synchronizace stavu mezi kontrolérem a workery
4. **Failure Recovery** - detekce a řešení výpadků workerů
5. **Scaling** - horizontální škálování workerů podle zatížení

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLOUD AGENT CONTROLLER                              │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  Worker Spawner  │  │  Health Monitor  │  │  Load Balancer   │          │
│  │                  │  │                  │  │                  │          │
│  │  - K8s adapter   │  │  - Heartbeat     │  │  - Task routing  │          │
│  │  - Docker adapter│  │  - Health checks │  │  - Capability    │          │
│  │  - Coolify adapter│ │  - Dead worker   │  │    matching      │          │
│  │  - EC2 adapter   │  │    detection     │  │  - Rate limit    │          │
│  └────────┬─────────┘  └────────┬─────────┘  │    awareness     │          │
│           │                     │            └────────┬─────────┘          │
│           │                     │                     │                     │
│  ┌────────▼─────────────────────▼─────────────────────▼─────────┐          │
│  │                      Worker Registry                          │          │
│  │                                                               │          │
│  │  workers: Map<WorkerId, WorkerState>                         │          │
│  │  - status: ready | busy | draining | dead                    │          │
│  │  - currentTask: TaskId | null                                │          │
│  │  - capabilities: AgentCapability[]                           │          │
│  │  - metrics: WorkerMetrics                                    │          │
│  └───────────────────────────────────────────────────────────────┘          │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  Scaler          │  │  State Syncer    │  │  Event Emitter   │          │
│  │                  │  │                  │  │                  │          │
│  │  - Auto-scaling  │  │  - Checkpoint    │  │  - Progress      │          │
│  │  - Manual scale  │  │    sync          │  │  - Status        │          │
│  │  - Cooldown      │  │  - State         │  │  - Errors        │          │
│  └──────────────────┘  │    recovery      │  └──────────────────┘          │
│                        └──────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
             ┌──────────┐   ┌──────────┐   ┌──────────┐
             │ Worker 1 │   │ Worker 2 │   │ Worker N │
             └──────────┘   └──────────┘   └──────────┘
```

## Component Details

### Worker Spawner

```typescript
interface WorkerSpawner {
  // Create new worker instance
  spawn(config: WorkerConfig): Promise<WorkerId>;

  // Terminate worker
  terminate(workerId: WorkerId, graceful?: boolean): Promise<void>;

  // Get supported infrastructure
  getSupportedPlatforms(): Platform[];
}

interface WorkerConfig {
  platform: 'kubernetes' | 'docker' | 'coolify' | 'ec2';
  resources: ResourceSpec;
  capabilities: AgentCapability[];
  environment: Record<string, string>;
}

interface ResourceSpec {
  cpu: string;      // e.g., "2" or "2000m"
  memory: string;   // e.g., "4Gi"
  storage?: string; // e.g., "10Gi"
}
```

**Platform Adapters:**

```typescript
// Kubernetes Adapter
class KubernetesSpawner implements WorkerSpawner {
  async spawn(config: WorkerConfig): Promise<WorkerId> {
    const pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: `ado-worker-${generateId()}`,
        labels: { app: 'ado-worker' }
      },
      spec: {
        containers: [{
          name: 'worker',
          image: 'ado-worker:latest',
          resources: {
            limits: {
              cpu: config.resources.cpu,
              memory: config.resources.memory
            }
          },
          env: Object.entries(config.environment).map(([k, v]) => ({
            name: k,
            value: v
          }))
        }]
      }
    };

    await this.k8sApi.createNamespacedPod(this.namespace, pod);
    return pod.metadata.name;
  }
}

// Docker Adapter
class DockerSpawner implements WorkerSpawner {
  async spawn(config: WorkerConfig): Promise<WorkerId> {
    const container = await this.docker.createContainer({
      Image: 'ado-worker:latest',
      Env: Object.entries(config.environment).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: parseMemory(config.resources.memory),
        CpuPeriod: 100000,
        CpuQuota: parseCpu(config.resources.cpu) * 100000
      }
    });

    await container.start();
    return container.id;
  }
}
```

### Health Monitor

```typescript
interface HealthMonitor {
  // Start monitoring a worker
  startMonitoring(workerId: WorkerId): void;

  // Stop monitoring
  stopMonitoring(workerId: WorkerId): void;

  // Get current health status
  getHealth(workerId: WorkerId): Promise<HealthStatus>;

  // Subscribe to health changes
  onHealthChange(callback: (workerId: WorkerId, status: HealthStatus) => void): void;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastHeartbeat: Date;
  metrics: {
    cpuPercent: number;
    memoryPercent: number;
    taskCount: number;
    errorRate: number;
  };
  checks: HealthCheck[];
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  lastCheck: Date;
}
```

**Health Check Flow:**

```
┌─────────────────┐
│ Health Monitor  │
│    (Controller) │
└────────┬────────┘
         │
         │ Every 30s: Heartbeat request
         ▼
┌─────────────────┐
│    Worker       │
│                 │
│  - CPU check    │
│  - Memory check │
│  - Agent check  │
│  - Disk check   │
└────────┬────────┘
         │
         │ Heartbeat response
         ▼
┌─────────────────┐
│ Health Monitor  │
│                 │
│  Update status  │
│  Check thresholds│
│  Emit events    │
└─────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Healthy    Unhealthy
    │         │
    │         ▼
    │    ┌─────────────┐
    │    │ Recovery    │
    │    │ - Restart   │
    │    │ - Replace   │
    │    │ - Reassign  │
    │    └─────────────┘
    ▼
Continue
```

### Load Balancer

```typescript
interface LoadBalancer {
  // Select best worker for task
  selectWorker(task: Task): Promise<WorkerId | null>;

  // Get current load distribution
  getLoadDistribution(): Promise<LoadDistribution>;

  // Rebalance tasks
  rebalance(): Promise<RebalanceResult>;
}

interface LoadDistribution {
  workers: Array<{
    workerId: WorkerId;
    load: number;        // 0-100%
    queueLength: number;
    capabilities: string[];
  }>;
  totalTasks: number;
  averageLoad: number;
}
```

**Selection Algorithm:**

```typescript
async function selectWorker(task: Task): Promise<WorkerId | null> {
  // 1. Filter by capabilities
  const capable = workers.filter(w =>
    task.requiredCapabilities.every(c => w.capabilities.includes(c))
  );

  if (capable.length === 0) return null;

  // 2. Filter by availability
  const available = capable.filter(w =>
    w.status === 'ready' && w.currentTask === null
  );

  if (available.length === 0) {
    // All busy - return least loaded
    return capable.sort((a, b) => a.queueLength - b.queueLength)[0].id;
  }

  // 3. Score and select
  const scored = available.map(w => ({
    worker: w,
    score: calculateScore(w, task)
  }));

  return scored.sort((a, b) => b.score - a.score)[0].worker.id;
}

function calculateScore(worker: WorkerState, task: Task): number {
  let score = 100;

  // Prefer workers with matching capabilities
  const capabilityMatch = task.preferredCapabilities.filter(
    c => worker.capabilities.includes(c)
  ).length;
  score += capabilityMatch * 10;

  // Prefer less loaded workers
  score -= worker.metrics.cpuPercent * 0.3;
  score -= worker.metrics.memoryPercent * 0.2;

  // Prefer workers with subscription access
  if (worker.hasSubscriptionAccess(task.provider)) {
    score += 20;
  }

  return score;
}
```

### Auto-Scaler

```typescript
interface AutoScaler {
  // Configure scaling rules
  configure(config: ScalingConfig): void;

  // Manually scale
  scale(targetCount: number): Promise<void>;

  // Get scaling status
  getStatus(): Promise<ScalingStatus>;
}

interface ScalingConfig {
  minWorkers: number;
  maxWorkers: number;

  scaleUp: {
    queueThreshold: number;  // Scale up when queue > threshold
    cpuThreshold: number;    // Scale up when avg CPU > threshold
    cooldown: number;        // Seconds between scale ups
    increment: number;       // Workers to add
  };

  scaleDown: {
    queueThreshold: number;  // Scale down when queue < threshold
    idleTimeout: number;     // Scale down after idle for N seconds
    cooldown: number;        // Seconds between scale downs
    decrement: number;       // Workers to remove
  };
}
```

**Scaling Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      SCALING DECISION LOOP                       │
│                                                                  │
│  Every 30s:                                                      │
│                                                                  │
│  1. Collect metrics                                              │
│     - Queue length                                               │
│     - Average CPU                                                │
│     - Worker count                                               │
│                                                                  │
│  2. Evaluate rules                                               │
│                                                                  │
│     Queue > scaleUp.threshold?                                   │
│     ├── Yes + cooldown passed → Scale UP                        │
│     └── No                                                       │
│                                                                  │
│     Queue < scaleDown.threshold AND idle > timeout?             │
│     ├── Yes + cooldown passed → Scale DOWN                      │
│     └── No                                                       │
│                                                                  │
│  3. Execute scaling                                              │
│     - Spawn/terminate workers                                    │
│     - Update metrics                                             │
│     - Reset cooldown timer                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Worker Communication Protocol

### Registration

```typescript
// Worker → Controller
interface WorkerRegistration {
  type: 'register';
  workerId: string;
  capabilities: AgentCapability[];
  resources: ResourceSpec;
  version: string;
}

// Controller → Worker
interface RegistrationAck {
  type: 'registration_ack';
  accepted: boolean;
  config?: WorkerRuntimeConfig;
  error?: string;
}
```

### Task Assignment

```typescript
// Controller → Worker
interface TaskAssignment {
  type: 'task_assign';
  taskId: string;
  task: Task;
  checkpoint?: CheckpointData;
}

// Worker → Controller
interface TaskAccepted {
  type: 'task_accepted';
  taskId: string;
  estimatedDuration?: number;
}

// Worker → Controller
interface TaskProgress {
  type: 'task_progress';
  taskId: string;
  progress: number;
  currentStep: string;
  metrics?: TaskMetrics;
}

// Worker → Controller
interface TaskCompleted {
  type: 'task_completed';
  taskId: string;
  result: TaskResult;
  metrics: TaskMetrics;
}
```

### Heartbeat

```typescript
// Worker → Controller
interface Heartbeat {
  type: 'heartbeat';
  workerId: string;
  timestamp: string;
  status: WorkerStatus;
  metrics: WorkerMetrics;
  currentTask?: string;
}

// Controller → Worker
interface HeartbeatAck {
  type: 'heartbeat_ack';
  timestamp: string;
  commands?: WorkerCommand[];
}
```

---

## Souvislosti

- [FR-002: Distributed Orchestration](../../02-requirements/01-functional/FR-002-distributed-orchestration.md)
- [Architecture: Container Diagram](../../03-architecture/02-container-diagram.md)
- [Design: Remote Execution](./remote-execution.md)
