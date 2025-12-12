# Component Diagram: Distributed Controller

## Přehled

C4 Level 3 diagram komponent Distributed Controlleru - centrální komponenty pro řízení vzdálených workerů.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Distributed Controller                               │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          Control Plane                                   ││
│  │                                                                          ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ ││
│  │  │   Worker     │  │   Health     │  │   Load       │  │  Scaling    │ ││
│  │  │   Registry   │  │   Monitor    │  │  Balancer    │  │  Manager    │ ││
│  │  │              │  │              │  │              │  │             │ ││
│  │  │ - Register   │  │ - Heartbeat  │  │ - Assign     │  │ - Scale up  │ ││
│  │  │ - Unregister │  │ - Timeout    │  │ - Rebalance  │  │ - Scale down│ ││
│  │  │ - Lookup     │  │ - Alert      │  │ - Prioritize │  │ - Metrics   │ ││
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ ││
│  │         │                 │                 │                 │        ││
│  │         └────────────┬────┴────────┬────────┴────────┬────────┘        ││
│  │                      │             │                 │                 ││
│  └──────────────────────┼─────────────┼─────────────────┼─────────────────┘│
│                         │             │                 │                  │
│  ┌──────────────────────┼─────────────┼─────────────────┼─────────────────┐│
│  │                      ▼             ▼                 ▼                 ││
│  │                   State Manager                                        ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │                                                                    │ ││
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ ││
│  │  │  │   Worker     │  │    Task      │  │     Event                │ │ ││
│  │  │  │   State      │  │   State      │  │    Publisher             │ │ ││
│  │  │  │              │  │              │  │                          │ │ ││
│  │  │  │ PostgreSQL   │  │ PostgreSQL   │  │ Redis Pub/Sub            │ │ ││
│  │  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ ││
│  │  │                                                                    │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Communication Layer                             ││
│  │                                                                          ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ ││
│  │  │   Worker     │  │    Task      │  │   Stream     │  │   Admin     │ ││
│  │  │   Protocol   │  │   Protocol   │  │   Protocol   │  │   Protocol  │ ││
│  │  │              │  │              │  │              │  │             │ ││
│  │  │ - Register   │  │ - Assign     │  │ - Subscribe  │  │ - Status    │ ││
│  │  │ - Heartbeat  │  │ - Progress   │  │ - Publish    │  │ - Scale     │ ││
│  │  │ - Report     │  │ - Complete   │  │ - Broadcast  │  │ - Config    │ ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Komponenty

### 1. Worker Registry

Spravuje registraci a vyhledávání workerů.

```typescript
// packages/core/src/distributed/worker-registry.ts
export class WorkerRegistry {
  private workers: Map<string, WorkerRecord> = new Map();

  async register(worker: WorkerRegistration): Promise<WorkerRecord> {
    const record: WorkerRecord = {
      id: worker.id,
      hostname: worker.hostname,
      capabilities: worker.capabilities,
      resources: worker.resources,
      status: 'idle',
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      metadata: worker.metadata,
    };

    // Store in memory
    this.workers.set(worker.id, record);

    // Persist to PostgreSQL
    await this.db.workers.upsert({
      where: { id: worker.id },
      create: record,
      update: record,
    });

    // Notify other components
    this.events.emit('worker.registered', record);

    return record;
  }

  async unregister(workerId: string, reason: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // Reassign tasks if any
    if (worker.currentTask) {
      await this.taskManager.reassign(worker.currentTask);
    }

    // Remove from registry
    this.workers.delete(workerId);

    // Update database
    await this.db.workers.update({
      where: { id: workerId },
      data: { status: 'offline', unregisteredAt: new Date() },
    });

    // Notify
    this.events.emit('worker.unregistered', { workerId, reason });
  }

  async findByCapabilities(
    requirements: CapabilityRequirements
  ): Promise<WorkerRecord[]> {
    return Array.from(this.workers.values()).filter(worker =>
      this.matchesCapabilities(worker, requirements)
    );
  }
}
```

### 2. Health Monitor

Monitoruje zdraví workerů pomocí heartbeatů.

```typescript
// packages/core/src/distributed/health-monitor.ts
export class HealthMonitor {
  private readonly HEARTBEAT_INTERVAL = 10000; // 10s
  private readonly TIMEOUT_THRESHOLD = 30000;  // 30s

  async start(): Promise<void> {
    // Check worker health periodically
    setInterval(() => this.checkAllWorkers(), this.HEARTBEAT_INTERVAL);
  }

  async processHeartbeat(heartbeat: WorkerHeartbeat): Promise<void> {
    const worker = await this.registry.get(heartbeat.workerId);
    if (!worker) {
      throw new WorkerNotFoundError(heartbeat.workerId);
    }

    // Update last heartbeat
    await this.registry.updateHeartbeat(heartbeat.workerId, {
      timestamp: new Date(),
      metrics: heartbeat.metrics,
      status: heartbeat.status,
    });

    // Check for anomalies
    if (heartbeat.metrics.cpuUsage > 90) {
      this.events.emit('worker.high_cpu', {
        workerId: heartbeat.workerId,
        cpuUsage: heartbeat.metrics.cpuUsage,
      });
    }

    if (heartbeat.metrics.memoryUsage > 85) {
      this.events.emit('worker.high_memory', {
        workerId: heartbeat.workerId,
        memoryUsage: heartbeat.metrics.memoryUsage,
      });
    }
  }

  private async checkAllWorkers(): Promise<void> {
    const workers = await this.registry.getAll();
    const now = Date.now();

    for (const worker of workers) {
      const timeSinceHeartbeat = now - worker.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > this.TIMEOUT_THRESHOLD) {
        await this.handleUnhealthyWorker(worker, 'heartbeat_timeout');
      }
    }
  }

  private async handleUnhealthyWorker(
    worker: WorkerRecord,
    reason: string
  ): Promise<void> {
    // Mark as unhealthy
    await this.registry.updateStatus(worker.id, 'unhealthy');

    // Alert
    this.events.emit('worker.unhealthy', { worker, reason });

    // After grace period, unregister
    setTimeout(async () => {
      const current = await this.registry.get(worker.id);
      if (current?.status === 'unhealthy') {
        await this.registry.unregister(worker.id, reason);
      }
    }, 60000); // 1 minute grace period
  }
}
```

### 3. Load Balancer

Distribuuje úkoly mezi workery.

```typescript
// packages/core/src/distributed/load-balancer.ts
export class LoadBalancer {
  async assignTask(task: Task): Promise<WorkerAssignment> {
    // 1. Find eligible workers
    const candidates = await this.registry.findByCapabilities(
      task.requirements
    );

    if (candidates.length === 0) {
      throw new NoEligibleWorkersError(task);
    }

    // 2. Filter by status
    const available = candidates.filter(w =>
      w.status === 'idle' || w.status === 'busy' && w.queueSize < 3
    );

    if (available.length === 0) {
      // Queue for later
      await this.queue.enqueue(task);
      return { queued: true };
    }

    // 3. Score and select
    const scored = available.map(worker => ({
      worker,
      score: this.calculateScore(worker, task),
    }));

    const best = scored.sort((a, b) => b.score - a.score)[0];

    // 4. Assign
    return this.assign(task, best.worker);
  }

  private calculateScore(worker: WorkerRecord, task: Task): number {
    let score = 100;

    // Subscription preference (+50)
    if (worker.accessMode === 'subscription') {
      score += 50;
    }

    // Lower load preference (+0-30)
    score += (1 - worker.utilization) * 30;

    // Provider match (+20)
    if (task.preferredProvider === worker.providerId) {
      score += 20;
    }

    // Recent success rate (+0-20)
    score += worker.successRate * 20;

    return score;
  }

  async rebalance(): Promise<RebalanceResult> {
    const workers = await this.registry.getAll();

    // Calculate load distribution
    const loads = workers.map(w => ({
      worker: w,
      load: w.currentTasks.length,
    }));

    const avgLoad = loads.reduce((s, l) => s + l.load, 0) / loads.length;

    // Find imbalanced workers
    const overloaded = loads.filter(l => l.load > avgLoad * 1.5);
    const underloaded = loads.filter(l => l.load < avgLoad * 0.5);

    // Move tasks
    const moves: TaskMove[] = [];
    for (const source of overloaded) {
      const movable = await this.getMovableTasks(source.worker);

      for (const task of movable) {
        const target = underloaded.find(t =>
          t.worker.capabilities.includes(task.requiredCapability)
        );

        if (target) {
          moves.push({ task, from: source.worker, to: target.worker });
        }
      }
    }

    // Execute moves
    for (const move of moves) {
      await this.moveTask(move);
    }

    return { moves };
  }
}
```

### 4. Scaling Manager

Řídí automatické škálování worker poolu.

```typescript
// packages/core/src/distributed/scaling-manager.ts
export class ScalingManager {
  private readonly config: ScalingConfig;

  async evaluate(): Promise<ScalingDecision> {
    const metrics = await this.collectMetrics();

    // Scale up conditions
    if (this.shouldScaleUp(metrics)) {
      const count = this.calculateScaleUpCount(metrics);
      return { action: 'scale_up', count, reason: this.getScaleUpReason(metrics) };
    }

    // Scale down conditions
    if (this.shouldScaleDown(metrics)) {
      const count = this.calculateScaleDownCount(metrics);
      return { action: 'scale_down', count, reason: this.getScaleDownReason(metrics) };
    }

    return { action: 'none' };
  }

  private shouldScaleUp(metrics: ClusterMetrics): boolean {
    return (
      // High queue length
      metrics.queueLength > this.config.scaleUpQueueThreshold ||
      // High average utilization
      metrics.avgUtilization > this.config.scaleUpUtilizationThreshold ||
      // No idle workers and pending tasks
      (metrics.idleWorkers === 0 && metrics.pendingTasks > 0)
    );
  }

  private shouldScaleDown(metrics: ClusterMetrics): boolean {
    return (
      // Low utilization for extended period
      metrics.avgUtilization < this.config.scaleDownUtilizationThreshold &&
      metrics.lowUtilizationDuration > this.config.scaleDownDelay &&
      // More than minimum workers
      metrics.totalWorkers > this.config.minWorkers &&
      // No pending tasks
      metrics.queueLength === 0
    );
  }

  async scaleUp(count: number): Promise<ScaleResult> {
    const spawned: WorkerRecord[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const worker = await this.spawner.spawn({
          providerId: this.selectProvider(),
          resources: this.config.workerResources,
        });
        spawned.push(worker);
      } catch (error) {
        this.logger.error('Failed to spawn worker', { error });
      }
    }

    return { requested: count, spawned: spawned.length, workers: spawned };
  }

  async scaleDown(count: number): Promise<ScaleResult> {
    // Select workers to terminate (prefer idle, oldest first)
    const candidates = await this.registry.getAll();
    const toTerminate = candidates
      .filter(w => w.status === 'idle')
      .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())
      .slice(0, count);

    for (const worker of toTerminate) {
      await this.spawner.terminate(worker.id);
    }

    return { requested: count, terminated: toTerminate.length };
  }
}
```

### 5. State Manager

Spravuje distribuovaný stav.

```typescript
// packages/core/src/distributed/state-manager.ts
export class StateManager {
  private readonly db: PrismaClient;
  private readonly redis: Redis;
  private readonly eventBus: EventBus;

  async getWorkerState(workerId: string): Promise<WorkerState> {
    // Try cache first
    const cached = await this.redis.get(`worker:${workerId}:state`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fall back to database
    const state = await this.db.workerState.findUnique({
      where: { workerId },
    });

    // Cache for next time
    if (state) {
      await this.redis.setex(
        `worker:${workerId}:state`,
        60,
        JSON.stringify(state)
      );
    }

    return state;
  }

  async updateWorkerState(
    workerId: string,
    update: Partial<WorkerState>
  ): Promise<WorkerState> {
    // Update database
    const state = await this.db.workerState.update({
      where: { workerId },
      data: {
        ...update,
        updatedAt: new Date(),
        version: { increment: 1 },
      },
    });

    // Invalidate cache
    await this.redis.del(`worker:${workerId}:state`);

    // Publish change event
    await this.eventBus.publish('worker.state.changed', {
      workerId,
      state,
    });

    return state;
  }

  async getTaskState(taskId: string): Promise<TaskState> {
    return this.db.taskState.findUnique({
      where: { taskId },
      include: {
        checkpoints: true,
        subtasks: true,
      },
    });
  }
}
```

### 6. Communication Protocols

```typescript
// packages/core/src/distributed/protocols/worker-protocol.ts
export interface WorkerProtocol {
  // Registration
  register(registration: WorkerRegistration): Promise<WorkerRecord>;
  unregister(workerId: string, reason: string): Promise<void>;

  // Heartbeat
  heartbeat(heartbeat: WorkerHeartbeat): Promise<void>;

  // Task lifecycle
  assignTask(workerId: string, task: Task): Promise<void>;
  reportProgress(workerId: string, progress: TaskProgress): Promise<void>;
  completeTask(workerId: string, result: TaskResult): Promise<void>;
  failTask(workerId: string, error: TaskError): Promise<void>;
}

// packages/core/src/distributed/protocols/stream-protocol.ts
export interface StreamProtocol {
  // Subscriptions
  subscribe(taskId: string, clientId: string): Promise<Subscription>;
  unsubscribe(subscriptionId: string): Promise<void>;

  // Publishing
  publish(taskId: string, event: StreamEvent): Promise<void>;
  broadcast(event: SystemEvent): Promise<void>;
}
```

## Data Flow

```
                                    ┌─────────────────┐
                                    │   CLI / API     │
                                    └────────┬────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          Distributed Controller                             │
│                                                                             │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│   │  Worker  │◄──►│  Health  │◄──►│   Load   │◄──►│ Scaling  │            │
│   │ Registry │    │ Monitor  │    │ Balancer │    │ Manager  │            │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘            │
│        │               │               │               │                   │
│        └───────────────┴───────┬───────┴───────────────┘                   │
│                                │                                           │
│                                ▼                                           │
│                        ┌──────────────┐                                   │
│                        │    State     │                                   │
│                        │   Manager    │                                   │
│                        └──────┬───────┘                                   │
│                               │                                           │
└───────────────────────────────┼───────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
             ┌──────────┐           ┌──────────┐
             │PostgreSQL│           │  Redis   │
             │ (State)  │           │(Pub/Sub) │
             └──────────┘           └──────────┘
                                          │
                                          ▼
             ┌──────────────────────────────────────────┐
             │              Workers (K8s/Docker)        │
             │                                          │
             │  ┌────────┐  ┌────────┐  ┌────────┐     │
             │  │Worker 1│  │Worker 2│  │Worker N│     │
             │  └────────┘  └────────┘  └────────┘     │
             └──────────────────────────────────────────┘
```

## Konfigurace

```yaml
# ado.config.yaml
distributed:
  controller:
    # Worker registry
    registry:
      cleanupInterval: 60000
      staleThreshold: 300000

    # Health monitoring
    health:
      heartbeatInterval: 10000
      timeoutThreshold: 30000
      unhealthyGracePeriod: 60000

    # Load balancing
    loadBalancer:
      strategy: weighted_round_robin
      rebalanceInterval: 30000
      maxTasksPerWorker: 5

    # Auto-scaling
    scaling:
      enabled: true
      minWorkers: 2
      maxWorkers: 50
      scaleUpQueueThreshold: 10
      scaleUpUtilizationThreshold: 80
      scaleDownUtilizationThreshold: 20
      scaleDownDelay: 300000
      cooldownPeriod: 60000
```

---

## Souvislosti

- [Orchestrator Core](./orchestrator-core.md)
- [Design: Cloud Agent Controller](../../04-design/01-distributed-system/cloud-agent-controller.md)
- [Design: State Synchronization](../../04-design/01-distributed-system/state-synchronization.md)
- [M7: Distributed Control](../../08-implementation/milestones/M7-distributed-control.md)
