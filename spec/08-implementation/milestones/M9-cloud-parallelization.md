# Milestone 9: Cloud Parallelization

## Cíl

Implementovat plnou podporu pro paralelní spouštění AI agentů v cloudové infrastruktuře s automatickým škálováním a efektivním využitím zdrojů.

## Scope

### In Scope
- Parallel task execution engine
- Git worktree isolation pro paralelní práci
- Auto-scaling worker pool (Kubernetes HPA)
- Resource optimization a load balancing
- Multi-provider parallel execution
- Work stealing a task redistribution
- Cost-aware scheduling
- Dashboard pro vizualizaci paralelních úkolů

### Out of Scope
- Multi-region deployment
- Custom cloud provider plugins
- Spot instance management (future)

## Tasks

| ID | Task | Popis | Závislosti |
|----|------|-------|------------|
| M9.1 | Parallel Scheduler | Scheduler pro paralelní úkoly | M7.* |
| M9.2 | Worktree Manager | Git worktree isolation | - |
| M9.3 | Worker Pool | Dynamický pool workerů | M7.5 |
| M9.4 | Auto-Scaler | Kubernetes HPA integrace | M9.3 |
| M9.5 | Load Balancer | Distribuce úkolů mezi workery | M9.3 |
| M9.6 | Work Stealing | Redistribuce při nerovnoměrném zatížení | M9.5 |
| M9.7 | Cost Optimizer | Cost-aware scheduling | M9.5 |
| M9.8 | Merge Coordinator | Koordinace merge paralelních změn | M9.2 |
| M9.9 | Dashboard Views | Vizualizace paralelního běhu | M9.* |

## Deliverables

### 1. Parallel Task Scheduler (M9.1)

```typescript
// packages/core/src/parallel/parallel-scheduler.ts
export class ParallelScheduler {
  async scheduleParallel(
    graph: TaskGraph,
    workers: Worker[]
  ): Promise<ScheduleResult> {
    // Identifikace paralelizovatelných větví
    const parallelBranches = this.identifyParallelBranches(graph);

    // Odhad resource requirements
    const requirements = await this.estimateRequirements(parallelBranches);

    // Cost-aware optimization
    const optimized = this.optimizeForCost(parallelBranches, requirements);

    // Přiřazení k workerům
    return this.assignToWorkers(optimized, workers);
  }

  private identifyParallelBranches(graph: TaskGraph): ParallelBranch[] {
    const branches: ParallelBranch[] = [];

    // Topologické třídění
    const sorted = this.topologicalSort(graph);

    // Identifikace nezávislých větví
    for (const node of sorted) {
      if (this.canRunInParallel(node, branches)) {
        branches.push(this.createBranch(node));
      }
    }

    return branches;
  }

  private optimizeForCost(
    branches: ParallelBranch[],
    requirements: ResourceRequirements
  ): OptimizedSchedule {
    // Prioritizace subscription workerů
    const subscriptionFirst = this.prioritizeSubscription(branches);

    // Balancování mezi rychlostí a cenou
    return this.balance(subscriptionFirst, {
      maxCost: this.config.limits.maxCost,
      maxDuration: this.config.limits.maxDuration,
    });
  }
}
```

### 2. Git Worktree Manager (M9.2)

```typescript
// packages/core/src/parallel/worktree-manager.ts
export class WorktreeManager {
  async createIsolatedWorktree(
    taskId: string,
    baseBranch: string
  ): Promise<Worktree> {
    const worktreePath = path.join(this.workspacesDir, taskId);

    // Vytvoření worktree
    await this.git.worktree.add({
      path: worktreePath,
      branch: `ado/${taskId}`,
      startPoint: baseBranch,
    });

    // Registrace worktree
    const worktree: Worktree = {
      id: taskId,
      path: worktreePath,
      branch: `ado/${taskId}`,
      baseBranch,
      status: 'active',
    };

    await this.registry.register(worktree);

    return worktree;
  }

  async cleanup(taskId: string): Promise<void> {
    const worktree = await this.registry.get(taskId);

    // Odstranění worktree
    await this.git.worktree.remove({
      path: worktree.path,
      force: true,
    });

    // Smazání větve
    await this.git.branch.delete({
      branch: worktree.branch,
      force: true,
    });

    await this.registry.unregister(taskId);
  }
}
```

### 3. Worker Pool Management (M9.3, M9.4)

```typescript
// packages/core/src/parallel/worker-pool.ts
export class WorkerPool {
  private workers: Map<string, Worker> = new Map();
  private scaler: AutoScaler;

  async ensureCapacity(required: number): Promise<void> {
    const current = this.getAvailableWorkers().length;

    if (current < required) {
      await this.scaleUp(required - current);
    }
  }

  private async scaleUp(count: number): Promise<void> {
    const promises = Array(count)
      .fill(null)
      .map(() => this.spawnWorker());

    const workers = await Promise.all(promises);

    for (const worker of workers) {
      this.workers.set(worker.id, worker);
      this.events.emit('worker.added', worker);
    }
  }

  async scaleDown(count: number): Promise<void> {
    const idle = this.getIdleWorkers();
    const toRemove = idle.slice(0, count);

    for (const worker of toRemove) {
      await this.terminateWorker(worker);
    }
  }
}

// packages/core/src/parallel/auto-scaler.ts
export class AutoScaler {
  async evaluate(): Promise<ScalingDecision> {
    const metrics = await this.collectMetrics();

    // Queue-based scaling
    if (metrics.queueLength > this.config.scaleUpThreshold) {
      return {
        action: 'scale_up',
        count: Math.ceil(metrics.queueLength / this.config.tasksPerWorker),
      };
    }

    // Utilization-based scaling
    if (metrics.avgUtilization < this.config.scaleDownThreshold) {
      return {
        action: 'scale_down',
        count: this.calculateExcessWorkers(metrics),
      };
    }

    return { action: 'none' };
  }
}
```

### 4. Load Balancer (M9.5)

```typescript
// packages/core/src/parallel/load-balancer.ts
export class LoadBalancer {
  async assignTask(task: Task): Promise<Worker> {
    const eligibleWorkers = await this.getEligibleWorkers(task);

    if (eligibleWorkers.length === 0) {
      throw new NoAvailableWorkersError(task);
    }

    // Výběr podle strategie
    return this.selectWorker(eligibleWorkers, task);
  }

  private selectWorker(workers: Worker[], task: Task): Worker {
    switch (this.config.strategy) {
      case 'least_loaded':
        return this.leastLoaded(workers);

      case 'round_robin':
        return this.roundRobin(workers);

      case 'capability_match':
        return this.capabilityMatch(workers, task);

      case 'cost_optimized':
        return this.costOptimized(workers, task);

      default:
        return workers[0];
    }
  }

  private costOptimized(workers: Worker[], task: Task): Worker {
    // Prefer subscription-based workers
    const subscription = workers.filter(w =>
      w.accessMode === 'subscription'
    );

    if (subscription.length > 0) {
      return this.leastLoaded(subscription);
    }

    // Fall back to cheapest API worker
    return workers.sort((a, b) =>
      a.costPerTask - b.costPerTask
    )[0];
  }
}
```

### 5. Work Stealing (M9.6)

```typescript
// packages/core/src/parallel/work-stealer.ts
export class WorkStealer {
  async rebalance(): Promise<void> {
    const workers = await this.pool.getWorkers();

    // Identifikace nerovnováhy
    const { overloaded, underloaded } = this.analyzeLoad(workers);

    if (overloaded.length === 0 || underloaded.length === 0) {
      return;
    }

    // Přesun úkolů
    for (const source of overloaded) {
      const stealable = await this.getStealableTasks(source);

      for (const task of stealable) {
        const target = this.selectTarget(underloaded);
        await this.migrateTask(task, source, target);
      }
    }
  }

  private async getStealableTasks(worker: Worker): Promise<Task[]> {
    const tasks = await worker.getQueuedTasks();

    // Pouze úkoly, které ještě nezačaly
    return tasks.filter(t =>
      t.status === 'queued' &&
      !t.hasAffinity // Není vázán na konkrétní worker
    );
  }
}
```

### 6. Merge Coordinator (M9.8)

```typescript
// packages/core/src/parallel/merge-coordinator.ts
export class MergeCoordinator {
  async mergeParallelResults(
    branches: ParallelBranch[]
  ): Promise<MergeResult> {
    // Seřazení podle závislostí
    const sorted = this.topologicalSort(branches);

    const results: BranchMergeResult[] = [];

    for (const branch of sorted) {
      // Pokus o merge
      const result = await this.mergeBranch(branch);

      if (result.hasConflicts) {
        // Automatické řešení konfliktů
        const resolved = await this.autoResolve(result.conflicts);

        if (!resolved.success) {
          // HITL checkpoint pro manuální řešení
          await this.checkpoint('merge-conflict', {
            branch,
            conflicts: resolved.remaining,
          });
        }
      }

      results.push(result);
    }

    // Validace finálního stavu
    return this.validateMergedState(results);
  }

  private async autoResolve(
    conflicts: Conflict[]
  ): Promise<ResolveResult> {
    const resolved: Conflict[] = [];
    const remaining: Conflict[] = [];

    for (const conflict of conflicts) {
      // Jednodušší konflikty řeší AI
      if (this.isAutoResolvable(conflict)) {
        const resolution = await this.aiResolve(conflict);
        await this.applyResolution(resolution);
        resolved.push(conflict);
      } else {
        remaining.push(conflict);
      }
    }

    return {
      success: remaining.length === 0,
      resolved,
      remaining,
    };
  }
}
```

### 7. CLI Commands (M9.9)

```bash
# Spuštění s paralelizací
ado run "feature" --parallel --workers 5

# Automatické škálování
ado run "feature" --parallel --auto-scale

# Nastavení limitu nákladů
ado run "feature" --parallel --max-cost 10

# Status paralelních úkolů
ado parallel status

# Zobrazení worktrees
ado worktrees list

# Vyčištění worktrees
ado worktrees cleanup

# Manuální rebalance
ado workers rebalance

# Škálování worker poolu
ado workers scale 10
```

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Parallel Execution Architecture                  │
└──────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   CLI/API   │
                              └──────┬──────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │  Parallel   │
                              │  Scheduler  │
                              └──────┬──────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
             ┌───────────┐    ┌───────────┐    ┌───────────┐
             │ Worktree  │    │   Load    │    │   Auto    │
             │  Manager  │    │ Balancer  │    │  Scaler   │
             └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
                   │                │                │
                   │                ▼                │
                   │         ┌───────────┐          │
                   │         │  Worker   │◄─────────┘
                   │         │   Pool    │
                   │         └─────┬─────┘
                   │               │
                   │    ┌──────────┼──────────┐
                   │    │          │          │
                   │    ▼          ▼          ▼
                   │ ┌──────┐  ┌──────┐  ┌──────┐
                   │ │Worker│  │Worker│  │Worker│
                   │ │  1   │  │  2   │  │  N   │
                   │ └──┬───┘  └──┬───┘  └──┬───┘
                   │    │         │         │
                   │    │         │         │
                   ▼    ▼         ▼         ▼
             ┌───────────────────────────────────┐
             │         Git Worktrees             │
             │                                   │
             │  ┌─────────┐ ┌─────────┐ ┌─────┐ │
             │  │worktree1│ │worktree2│ │ ... │ │
             │  └─────────┘ └─────────┘ └─────┘ │
             └───────────────────────────────────┘
                              │
                              ▼
                       ┌───────────┐
                       │   Merge   │
                       │Coordinator│
                       └───────────┘
```

## Kubernetes Resources

```yaml
# Worker HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ado-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ado-worker
  minReplicas: 2
  maxReplicas: 50
  metrics:
    # Queue-based scaling
    - type: External
      external:
        metric:
          name: ado_task_queue_length
        target:
          type: AverageValue
          averageValue: "5"
    # CPU-based scaling
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 5
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 120

---
# Worker Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ado-worker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ado-worker
  template:
    spec:
      containers:
        - name: worker
          image: ghcr.io/dxheroes/ado/worker:latest
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 8Gi
          env:
            - name: WORKER_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
          volumeMounts:
            - name: workspaces
              mountPath: /app/workspaces
      volumes:
        - name: workspaces
          persistentVolumeClaim:
            claimName: ado-workspaces
```

## Acceptance Criteria

- [ ] Paralelní úkoly běží současně na více workerech
- [ ] Každý paralelní úkol má izolovaný git worktree
- [ ] Auto-scaling reaguje na délku fronty
- [ ] Load balancer distribuuje úkoly rovnoměrně
- [ ] Work stealing přesouvá úkoly při nerovnováze
- [ ] Merge coordinator zvládne běžné konflikty automaticky
- [ ] Složité merge konflikty eskalují na HITL
- [ ] Cost optimizer preferuje subscription workery
- [ ] Dashboard zobrazuje paralelní průběh v reálném čase
- [ ] `ado parallel status` zobrazuje stav všech paralelních úkolů
- [ ] Worktrees jsou automaticky čištěny po dokončení

## Configuration

```yaml
# ado.config.yaml
parallel:
  enabled: true

  # Maximální paralelní úkoly
  maxParallel: 10

  # Worker pool
  pool:
    minWorkers: 2
    maxWorkers: 20
    idleTimeout: 300  # 5 minut

  # Auto-scaling
  autoScale:
    enabled: true
    scaleUpThreshold: 5  # Queue length
    scaleDownThreshold: 20  # % utilization
    cooldown: 60  # seconds

  # Load balancing
  loadBalancer:
    strategy: cost_optimized  # least_loaded | round_robin | cost_optimized

  # Work stealing
  workStealing:
    enabled: true
    rebalanceInterval: 30  # seconds
    threshold: 0.3  # 30% load difference

  # Git worktrees
  worktrees:
    baseDir: /app/workspaces
    cleanupAfter: 3600  # 1 hodina po dokončení
    maxWorktrees: 50

# Resource limits
limits:
  maxCost: 100  # USD per task
  maxDuration: 7200  # 2 hodiny
  maxWorkers: 50
```

## Testing

### Unit Tests
- Parallel scheduler logic
- Worktree operations
- Load balancer strategies
- Work stealing algorithm

### Integration Tests
- Worker pool scaling
- Task distribution
- Merge coordinator flow
- Auto-scaler decisions

### E2E Tests
- Full parallel feature development
- Scale up/down scenarios
- Worker failure recovery
- Multi-branch merge

### Performance Tests
- Throughput at different parallelism levels
- Scaling latency
- Worktree creation/cleanup time

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Merge conflicts | High | Medium | Auto-resolve, HITL fallback |
| Resource contention | Medium | High | Resource quotas, priority queues |
| Runaway costs | Medium | High | Cost limits, alerts |
| Worker failures | Medium | Medium | Health checks, task reassignment |
| Git worktree limits | Low | Medium | Cleanup policy, monitoring |

## Timeline

| Week | Focus |
|------|-------|
| 1 | M9.1, M9.2 |
| 2 | M9.3, M9.4 |
| 3 | M9.5, M9.6, M9.7 |
| 4 | M9.8, M9.9, Testing |

---

## Souvislosti

- [FR-004: Cloud Parallelization](../../02-requirements/01-functional/FR-004-cloud-parallelization.md)
- [NFR-002: Scalability](../../02-requirements/02-non-functional/NFR-002-scalability.md)
- [Architecture: Container Diagram](../../03-architecture/02-container-diagram.md)
- [Design: Kubernetes Deployment](../../04-design/03-cloud-infrastructure/kubernetes-deployment.md)
- [Operations: Capacity Planning](../../07-operations/03-scaling/capacity-planning.md)
