# Task Decomposition

## Přehled

Design systému pro automatickou dekompozici komplexních úkolů na menší, paralelizovatelné subtasky.

## Architektura

```
┌─────────────────────────────────────────────────────────────────┐
│                      Task Decomposer                             │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Analyzer  │───▶│  Planner    │───▶│  Validator  │         │
│  │             │    │             │    │             │         │
│  │ - Parse     │    │ - Break down│    │ - Check deps│         │
│  │ - Classify  │    │ - Estimate  │    │ - Verify    │         │
│  │ - Scope     │    │ - Prioritize│    │ - Optimize  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Subtask Graph                          │  │
│  │                                                           │  │
│  │        ┌───┐                                             │  │
│  │        │ 1 │ Setup                                       │  │
│  │        └─┬─┘                                             │  │
│  │          │                                               │  │
│  │    ┌─────┼─────┐                                        │  │
│  │    ▼     ▼     ▼                                        │  │
│  │  ┌───┐ ┌───┐ ┌───┐                                      │  │
│  │  │ 2 │ │ 3 │ │ 4 │ Parallel implementation              │  │
│  │  └─┬─┘ └─┬─┘ └─┬─┘                                      │  │
│  │    └─────┼─────┘                                        │  │
│  │          ▼                                               │  │
│  │        ┌───┐                                             │  │
│  │        │ 5 │ Integration                                 │  │
│  │        └─┬─┘                                             │  │
│  │          ▼                                               │  │
│  │        ┌───┐                                             │  │
│  │        │ 6 │ Validation                                  │  │
│  │        └───┘                                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Task Types & Decomposition Strategies

### 1. Greenfield Project

```typescript
interface GreenfieldDecomposition {
  phases: [
    {
      name: 'setup',
      subtasks: [
        'project_scaffolding',
        'dependency_installation',
        'configuration_setup',
      ],
      parallel: false,
    },
    {
      name: 'core_implementation',
      subtasks: [
        'data_models',
        'business_logic',
        'api_layer',
        'ui_components',  // pokud je UI
      ],
      parallel: true,  // Lze paralelizovat
    },
    {
      name: 'integration',
      subtasks: [
        'wire_components',
        'add_middleware',
        'configure_routing',
      ],
      parallel: false,
    },
    {
      name: 'quality',
      subtasks: [
        'unit_tests',
        'integration_tests',
        'documentation',
      ],
      parallel: true,
    },
    {
      name: 'finalization',
      subtasks: [
        'docker_setup',
        'ci_cd_config',
        'readme',
      ],
      parallel: true,
    },
  ];
}
```

### 2. Feature Development

```typescript
interface FeatureDecomposition {
  phases: [
    {
      name: 'analysis',
      subtasks: [
        'understand_codebase',
        'identify_affected_files',
        'design_approach',
      ],
      parallel: false,
    },
    {
      name: 'implementation',
      subtasks: [
        // Dynamicky generované podle rozsahu
        'implement_component_a',
        'implement_component_b',
        'update_existing_code',
      ],
      parallel: true,
      maxParallel: 3,
    },
    {
      name: 'testing',
      subtasks: [
        'unit_tests',
        'integration_tests',
        'update_existing_tests',
      ],
      parallel: true,
    },
    {
      name: 'documentation',
      subtasks: [
        'update_api_docs',
        'update_changelog',
        'code_comments',
      ],
      parallel: true,
    },
  ];
}
```

### 3. Bug Fix

```typescript
interface BugfixDecomposition {
  phases: [
    {
      name: 'investigation',
      subtasks: [
        'reproduce_bug',
        'identify_root_cause',
        'analyze_impact',
      ],
      parallel: false,  // Sekvenční pro správnou diagnostiku
    },
    {
      name: 'fix',
      subtasks: [
        'implement_fix',
        'add_regression_test',
      ],
      parallel: false,
    },
    {
      name: 'verification',
      subtasks: [
        'run_all_tests',
        'verify_fix',
        'check_side_effects',
      ],
      parallel: true,
    },
  ];
}
```

## Decomposition Engine

```typescript
interface DecompositionEngine {
  decompose(task: Task): Promise<SubtaskGraph>;
  estimate(graph: SubtaskGraph): Promise<Estimation>;
  optimize(graph: SubtaskGraph): Promise<SubtaskGraph>;
}

class AIDecompositionEngine implements DecompositionEngine {
  constructor(
    private agent: AgentAdapter,
    private codebaseAnalyzer: CodebaseAnalyzer
  ) {}

  async decompose(task: Task): Promise<SubtaskGraph> {
    // 1. Analýza kontextu
    const context = await this.analyzeContext(task);

    // 2. Klasifikace úkolu
    const classification = await this.classifyTask(task, context);

    // 3. Generování subtasků pomocí AI
    const subtasks = await this.generateSubtasks(task, classification, context);

    // 4. Vytvoření grafu závislostí
    const graph = this.buildDependencyGraph(subtasks);

    // 5. Validace a optimalizace
    return this.validateAndOptimize(graph);
  }

  private async analyzeContext(task: Task): Promise<TaskContext> {
    const codebase = await this.codebaseAnalyzer.analyze(task.workingDirectory);

    return {
      projectType: codebase.projectType,
      techStack: codebase.techStack,
      structure: codebase.structure,
      existingPatterns: codebase.patterns,
      dependencies: codebase.dependencies,
    };
  }

  private async classifyTask(
    task: Task,
    context: TaskContext
  ): Promise<TaskClassification> {
    // AI klasifikace
    const prompt = `
      Analyze this task and classify it:
      Task: ${task.prompt}
      Project type: ${context.projectType}
      Tech stack: ${context.techStack.join(', ')}

      Classify as:
      - complexity: trivial | simple | moderate | complex
      - type: greenfield | feature | bugfix | refactor | test | docs
      - scope: single-file | multi-file | multi-module | full-project
      - parallelizable: yes | partial | no
    `;

    const result = await this.agent.execute({
      prompt,
      maxTurns: 1,
    });

    return this.parseClassification(result);
  }

  private async generateSubtasks(
    task: Task,
    classification: TaskClassification,
    context: TaskContext
  ): Promise<Subtask[]> {
    const template = this.getDecompositionTemplate(classification);

    const prompt = `
      Break down this task into subtasks:
      Task: ${task.prompt}
      Type: ${classification.type}
      Complexity: ${classification.complexity}

      Project structure:
      ${context.structure}

      Template for this type of task:
      ${JSON.stringify(template)}

      Generate specific subtasks with:
      - name: short identifier
      - description: what needs to be done
      - files: affected files
      - dependencies: which subtasks must complete first
      - estimatedMinutes: time estimate
      - parallelizable: can run in parallel with others
    `;

    const result = await this.agent.execute({
      prompt,
      maxTurns: 3,
    });

    return this.parseSubtasks(result);
  }
}
```

## Subtask Graph

```typescript
interface SubtaskGraph {
  nodes: Map<string, SubtaskNode>;
  edges: Edge[];
  criticalPath: string[];
  parallelGroups: string[][];
}

interface SubtaskNode {
  id: string;
  subtask: Subtask;
  status: SubtaskStatus;

  // Graf informace
  inDegree: number;
  outDegree: number;
  depth: number;

  // Scheduling
  earliestStart: number;
  latestStart: number;
  slack: number;
}

interface Edge {
  from: string;
  to: string;
  type: 'dependency' | 'resource' | 'data';
}

class SubtaskGraphBuilder {
  private nodes = new Map<string, SubtaskNode>();
  private edges: Edge[] = [];

  addSubtask(subtask: Subtask): void {
    this.nodes.set(subtask.id, {
      id: subtask.id,
      subtask,
      status: 'pending',
      inDegree: 0,
      outDegree: 0,
      depth: 0,
      earliestStart: 0,
      latestStart: 0,
      slack: 0,
    });
  }

  addDependency(from: string, to: string): void {
    this.edges.push({ from, to, type: 'dependency' });

    const fromNode = this.nodes.get(from);
    const toNode = this.nodes.get(to);

    if (fromNode && toNode) {
      fromNode.outDegree++;
      toNode.inDegree++;
    }
  }

  build(): SubtaskGraph {
    this.calculateDepths();
    this.calculateCriticalPath();
    this.identifyParallelGroups();

    return {
      nodes: this.nodes,
      edges: this.edges,
      criticalPath: this.criticalPath,
      parallelGroups: this.parallelGroups,
    };
  }

  private calculateCriticalPath(): void {
    // Forward pass
    for (const [id, node] of this.topologicalSort()) {
      const predecessors = this.getPredecessors(id);
      node.earliestStart = predecessors.length > 0
        ? Math.max(...predecessors.map(p =>
            p.earliestStart + p.subtask.estimatedMinutes
          ))
        : 0;
    }

    // Backward pass
    const totalDuration = Math.max(
      ...Array.from(this.nodes.values()).map(n =>
        n.earliestStart + n.subtask.estimatedMinutes
      )
    );

    for (const [id, node] of this.reverseTopologicalSort()) {
      const successors = this.getSuccessors(id);
      node.latestStart = successors.length > 0
        ? Math.min(...successors.map(s => s.latestStart)) - node.subtask.estimatedMinutes
        : totalDuration - node.subtask.estimatedMinutes;

      node.slack = node.latestStart - node.earliestStart;
    }

    // Critical path = nodes with zero slack
    this.criticalPath = Array.from(this.nodes.values())
      .filter(n => n.slack === 0)
      .sort((a, b) => a.earliestStart - b.earliestStart)
      .map(n => n.id);
  }

  private identifyParallelGroups(): void {
    const groups: string[][] = [];
    const depths = new Map<number, string[]>();

    for (const [id, node] of this.nodes) {
      const depth = node.depth;
      if (!depths.has(depth)) {
        depths.set(depth, []);
      }
      depths.get(depth)!.push(id);
    }

    // Skupiny na stejné hloubce mohou běžet paralelně
    for (const [depth, ids] of depths) {
      if (ids.length > 1) {
        groups.push(ids);
      }
    }

    this.parallelGroups = groups;
  }
}
```

## Subtask Scheduler

```typescript
class SubtaskScheduler {
  constructor(
    private graph: SubtaskGraph,
    private workerPool: WorkerPool
  ) {}

  async execute(): AsyncIterable<SubtaskResult> {
    const completed = new Set<string>();
    const running = new Map<string, Promise<SubtaskResult>>();

    while (completed.size < this.graph.nodes.size) {
      // Najdi připravené subtasky
      const ready = this.getReadySubtasks(completed, running);

      // Spusť paralelně
      for (const subtask of ready) {
        const worker = await this.workerPool.acquire();
        const promise = this.executeSubtask(subtask, worker);
        running.set(subtask.id, promise);
      }

      // Počkej na dokončení alespoň jednoho
      if (running.size > 0) {
        const result = await Promise.race(running.values());
        yield result;

        running.delete(result.subtaskId);
        completed.add(result.subtaskId);
      }
    }
  }

  private getReadySubtasks(
    completed: Set<string>,
    running: Map<string, Promise<SubtaskResult>>
  ): Subtask[] {
    const ready: Subtask[] = [];

    for (const [id, node] of this.graph.nodes) {
      if (completed.has(id) || running.has(id)) continue;

      // Zkontroluj závislosti
      const dependencies = this.getDependencies(id);
      const allDependenciesMet = dependencies.every(d => completed.has(d));

      if (allDependenciesMet) {
        ready.push(node.subtask);
      }
    }

    // Seřaď podle priority (critical path first)
    return ready.sort((a, b) => {
      const aOnCritical = this.graph.criticalPath.includes(a.id);
      const bOnCritical = this.graph.criticalPath.includes(b.id);

      if (aOnCritical && !bOnCritical) return -1;
      if (!aOnCritical && bOnCritical) return 1;

      return a.order - b.order;
    });
  }

  private async executeSubtask(
    subtask: Subtask,
    worker: Worker
  ): Promise<SubtaskResult> {
    try {
      const result = await worker.execute({
        subtaskId: subtask.id,
        prompt: subtask.prompt,
        files: subtask.files,
        timeout: subtask.estimatedMinutes * 60 * 1000 * 1.5, // 1.5x buffer
      });

      return {
        subtaskId: subtask.id,
        success: true,
        output: result,
        duration: result.duration,
        filesChanged: result.filesChanged,
      };
    } catch (error) {
      return {
        subtaskId: subtask.id,
        success: false,
        error: error as Error,
      };
    } finally {
      this.workerPool.release(worker);
    }
  }
}
```

## Estimation

```typescript
interface Estimation {
  totalDuration: number;        // Sekvenční čas
  parallelDuration: number;     // S paralelizací
  criticalPathDuration: number;

  costEstimate: {
    min: number;
    expected: number;
    max: number;
  };

  workerRequirements: {
    optimal: number;
    minimum: number;
  };

  confidence: number;           // 0-1
}

class EstimationEngine {
  estimate(graph: SubtaskGraph): Estimation {
    const subtasks = Array.from(graph.nodes.values());

    // Celkový sekvenční čas
    const totalDuration = subtasks.reduce(
      (sum, n) => sum + n.subtask.estimatedMinutes,
      0
    );

    // Čas kritické cesty
    const criticalPathDuration = this.calculateCriticalPathDuration(graph);

    // Optimální počet workerů
    const maxParallel = Math.max(
      ...graph.parallelGroups.map(g => g.length)
    );

    // Cost estimate
    const costPerMinute = 0.05; // Průměrná cena za minutu
    const expectedCost = criticalPathDuration * costPerMinute;

    return {
      totalDuration,
      parallelDuration: criticalPathDuration,
      criticalPathDuration,

      costEstimate: {
        min: expectedCost * 0.7,
        expected: expectedCost,
        max: expectedCost * 1.5,
      },

      workerRequirements: {
        optimal: maxParallel,
        minimum: 1,
      },

      confidence: this.calculateConfidence(subtasks),
    };
  }

  private calculateConfidence(subtasks: SubtaskNode[]): number {
    // Čím více subtasků, tím nižší confidence (více nejistoty)
    const countFactor = Math.max(0, 1 - subtasks.length * 0.02);

    // Čím větší odhadovaný čas, tím nižší confidence
    const totalTime = subtasks.reduce(
      (sum, s) => sum + s.subtask.estimatedMinutes,
      0
    );
    const timeFactor = Math.max(0, 1 - totalTime / 1000);

    return (countFactor + timeFactor) / 2;
  }
}
```

## Integration s HITL

```typescript
class DecompositionHITL {
  async reviewDecomposition(
    task: Task,
    graph: SubtaskGraph,
    estimation: Estimation
  ): Promise<HITLDecision> {
    const checkpoint = await this.checkpointManager.create(task.id, {
      type: 'hitl',
      trigger: 'decomposition_review',
      description: 'Review task decomposition before execution',
    });

    return this.hitlManager.request({
      checkpointId: checkpoint.id,
      taskId: task.id,

      title: 'Review Task Decomposition',
      description: `Task has been decomposed into ${graph.nodes.size} subtasks`,

      context: {
        subtasks: Array.from(graph.nodes.values()).map(n => ({
          name: n.subtask.name,
          description: n.subtask.description,
          estimatedMinutes: n.subtask.estimatedMinutes,
          dependencies: n.subtask.dependencies,
        })),
        estimation: {
          duration: `${estimation.parallelDuration} min`,
          cost: `$${estimation.costEstimate.expected.toFixed(2)}`,
          workers: estimation.workerRequirements.optimal,
        },
        graph: this.visualizeGraph(graph),
      },

      options: [
        {
          id: 'approve',
          label: 'Approve',
          action: 'approve',
          description: 'Start execution with this decomposition',
        },
        {
          id: 'modify',
          label: 'Modify',
          action: 'modify',
          description: 'Request changes to decomposition',
        },
        {
          id: 'reject',
          label: 'Reject',
          action: 'reject',
          description: 'Cancel task',
        },
      ],

      timeout: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      defaultAction: 'approve',
    });
  }
}
```

---

## Souvislosti

- [Doc-First Pipeline](./doc-first-pipeline.md)
- [FR-001: Autonomous Execution](../../02-requirements/01-functional/FR-001-autonomous-execution.md)
- [FR-004: Cloud Parallelization](../../02-requirements/01-functional/FR-004-cloud-parallelization.md)
