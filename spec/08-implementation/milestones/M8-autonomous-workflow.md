# Milestone 8: Autonomous Workflow

## Cíl

Implementovat plně autonomní workflow s documentation-first přístupem, HITL checkpointy a automatickou validací kvality.

## Scope

### In Scope
- Documentation-first pipeline
- Automatická generace specifikací
- HITL checkpoint systém
- Quality gates (build, test, lint, coverage)
- Automatická detekce a oprava chyb
- Task decomposition engine
- Retry a recovery mechanismy

### Out of Scope
- Cloud parallelization (M9)
- Multi-repository support
- Custom validation plugins

## Tasks

| ID | Task | Popis | Závislosti |
|----|------|-------|------------|
| M8.1 | Task Decomposer | Engine pro rozklad komplexních úkolů | - |
| M8.2 | Spec Generator | Automatická generace dokumentace | M8.1 |
| M8.3 | HITL Checkpoints | Checkpoint systém s notifikacemi | - |
| M8.4 | Quality Validator | Build/test/lint/coverage validace | - |
| M8.5 | Auto-Fix Engine | Automatická detekce a oprava chyb | M8.4 |
| M8.6 | Workflow Engine | Orchestrace doc-first pipeline | M8.1-M8.5 |
| M8.7 | Recovery System | Retry, rollback, checkpoint restore | M8.3 |
| M8.8 | CLI Integration | Nové CLI příkazy a flagy | M8.6 |

## Deliverables

### 1. Task Decomposition Engine (M8.1)

```typescript
// packages/core/src/autonomous/task-decomposer.ts
export class TaskDecomposer {
  async decompose(task: Task): Promise<TaskGraph> {
    // Analýza úkolu pomocí AI
    const analysis = await this.analyzeTask(task);

    // Identifikace subtasků
    const subtasks = await this.identifySubtasks(analysis);

    // Vytvoření dependency grafu
    const graph = this.buildDependencyGraph(subtasks);

    // Optimalizace pro paralelizaci
    return this.optimizeForParallel(graph);
  }

  private async identifySubtasks(analysis: TaskAnalysis): Promise<Subtask[]> {
    const phases = [
      { type: 'spec', description: 'Vytvoření specifikace' },
      { type: 'impl', description: 'Implementace kódu' },
      { type: 'test', description: 'Napsání testů' },
      { type: 'validate', description: 'Validace kvality' },
    ];

    return phases.map(phase => ({
      ...phase,
      dependencies: this.resolveDependencies(phase, analysis),
      parallelizable: phase.type !== 'validate',
    }));
  }
}
```

### 2. Documentation-First Pipeline (M8.2, M8.6)

```typescript
// packages/core/src/autonomous/doc-first-pipeline.ts
export class DocFirstPipeline {
  async execute(task: Task): Promise<TaskResult> {
    // Phase 1: Generování specifikace
    const spec = await this.generateSpec(task);

    // HITL Checkpoint: Schválení specifikace
    if (this.config.hitl.requireSpecReview) {
      await this.checkpoint('spec-review', spec);
    }

    // Phase 2: Implementace podle specifikace
    const implementation = await this.implement(spec);

    // Phase 3: Validace
    const validation = await this.validate(implementation);

    // Auto-fix pokud selhala validace
    if (!validation.passed) {
      return this.autoFix(implementation, validation);
    }

    return { success: true, artifacts: implementation };
  }
}
```

### 3. HITL Checkpoint System (M8.3)

```typescript
// packages/core/src/checkpoint/checkpoint-manager.ts
export class CheckpointManager {
  async createCheckpoint(
    type: CheckpointType,
    data: CheckpointData
  ): Promise<Checkpoint> {
    // Uložení stavu
    const checkpoint = await this.saveState(type, data);

    // Notifikace uživatele
    await this.notify(checkpoint);

    // Čekání na rozhodnutí
    return this.waitForDecision(checkpoint);
  }

  private async notify(checkpoint: Checkpoint): Promise<void> {
    // WebSocket notifikace do dashboardu
    this.events.emit('checkpoint.created', checkpoint);

    // CLI notifikace
    if (this.config.hitl.cliNotifications) {
      await this.cliNotifier.notify(checkpoint);
    }

    // Externí notifikace (Slack, email)
    if (checkpoint.type === 'critical') {
      await this.externalNotifier.notify(checkpoint);
    }
  }
}
```

### 4. Quality Validator (M8.4)

```typescript
// packages/core/src/quality/quality-validator.ts
export class QualityValidator {
  async validate(task: Task): Promise<ValidationResult> {
    const results: ValidationCheck[] = [];

    // Build check
    if (this.config.quality.requireBuild) {
      results.push(await this.checkBuild(task));
    }

    // Test check
    if (this.config.quality.requireTests) {
      results.push(await this.checkTests(task));
    }

    // Lint check
    if (this.config.quality.requireLint) {
      results.push(await this.checkLint(task));
    }

    // Coverage check
    if (this.config.quality.minCoverage > 0) {
      results.push(await this.checkCoverage(task));
    }

    return {
      passed: results.every(r => r.passed),
      checks: results,
      score: this.calculateScore(results),
    };
  }

  private async checkBuild(task: Task): Promise<ValidationCheck> {
    const result = await this.executor.run('npm run build');
    return {
      name: 'build',
      passed: result.exitCode === 0,
      output: result.output,
      duration: result.duration,
    };
  }
}
```

### 5. Auto-Fix Engine (M8.5)

```typescript
// packages/core/src/autonomous/auto-fix-engine.ts
export class AutoFixEngine {
  async fix(
    validation: ValidationResult,
    context: TaskContext
  ): Promise<FixResult> {
    const failures = validation.checks.filter(c => !c.passed);

    for (const failure of failures) {
      const strategy = this.getFixStrategy(failure);

      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        const fix = await strategy.generateFix(failure, context);
        await this.applyFix(fix);

        // Re-validate
        const result = await this.validator.validate(context.task);
        if (result.passed) {
          return { success: true, attempts: attempt + 1 };
        }

        // Učení z neúspěchu
        context.addFailure(failure, fix);
      }
    }

    // HITL checkpoint pokud auto-fix selže
    return this.escalateToHuman(failures, context);
  }

  private getFixStrategy(failure: ValidationCheck): FixStrategy {
    switch (failure.name) {
      case 'build':
        return new BuildErrorFixStrategy();
      case 'test':
        return new TestFailureFixStrategy();
      case 'lint':
        return new LintFixStrategy();
      case 'coverage':
        return new CoverageFixStrategy();
      default:
        return new GenericFixStrategy();
    }
  }
}
```

### 6. CLI Commands (M8.8)

```bash
# Spuštění v plně autonomním režimu
ado run "feature" --autonomous

# S konkrétním autonomy level
ado run "feature" --autonomy=spec-review

# Zobrazení čekajících checkpointů
ado checkpoints list --pending

# Schválení checkpointu
ado checkpoints approve <id>

# Odmítnutí s feedbackem
ado checkpoints reject <id> --reason "needs more tests"

# Obnovení z checkpointu
ado checkpoints restore <id>

# Zobrazení quality reportu
ado quality report <task-id>

# Opětovné spuštění validace
ado validate <task-id>
```

## Workflow States

```
┌─────────────────────────────────────────────────────────────────┐
│                    Autonomous Workflow FSM                       │
└─────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │   CREATED    │
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │ DECOMPOSING  │
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
              ┌─────────►│   SPEC_GEN   │
              │          └──────┬───────┘
              │                 │
              │                 ▼
              │          ┌──────────────┐
              │          │SPEC_CHECKPOINT│◄─────────┐
              │          └──────┬───────┘          │
              │                 │                   │
              │           approve                 reject
              │                 │                   │
              │                 ▼                   │
              │          ┌──────────────┐          │
              │          │IMPLEMENTING  │──────────┘
              │          └──────┬───────┘
              │                 │
              │                 ▼
              │          ┌──────────────┐
              │          │  VALIDATING  │
              │          └──────┬───────┘
              │                 │
              │         passed  │  failed
              │                 │
              │    ┌────────────┴────────────┐
              │    │                         │
              │    ▼                         ▼
              │ ┌──────────────┐      ┌──────────────┐
              │ │  COMPLETED   │      │  AUTO_FIXING │
              │ └──────────────┘      └──────┬───────┘
              │                              │
              │                       fixed  │  max_retries
              │                              │
              └──────────────────────────────┴───────────────┐
                                                             │
                                                             ▼
                                                      ┌──────────────┐
                                                      │HUMAN_REQUIRED│
                                                      └──────────────┘
```

## Acceptance Criteria

- [ ] Task decomposition vytváří správný dependency graf
- [ ] Specifikace je generována před implementací
- [ ] HITL checkpoint blokuje workflow do rozhodnutí
- [ ] Quality gates běží automaticky po implementaci
- [ ] Auto-fix opraví alespoň 80% běžných chyb
- [ ] Failed auto-fix eskaluje na HITL checkpoint
- [ ] Workflow lze obnovit z libovolného checkpointu
- [ ] CLI zobrazuje real-time progress autonomního běhu
- [ ] Dashboard zobrazuje čekající checkpointy
- [ ] Notifikace fungují pro Slack a email

## Configuration

```yaml
# ado.config.yaml
autonomous:
  enabled: true

  # Úroveň autonomie
  level: spec-review  # autonomous | spec-review | checkpoint | always

  # Documentation-first
  docFirst:
    enabled: true
    specFormat: markdown
    templateDir: .ado/templates

  # HITL nastavení
  hitl:
    requireSpecReview: true
    requireArchDecisions: true
    autoApproveMinor: true
    timeout: 3600  # 1 hodina

    notifications:
      slack:
        enabled: true
        channel: '#ado-checkpoints'
      email:
        enabled: false

  # Quality gates
  quality:
    requireBuild: true
    requireTests: true
    requireLint: true
    minCoverage: 80

  # Auto-fix
  autoFix:
    enabled: true
    maxAttempts: 3
    enabledFor:
      - build
      - lint
      - test
```

## Testing

### Unit Tests
- Task decomposition logic
- Checkpoint state machine
- Quality validator checks
- Auto-fix strategies

### Integration Tests
- Full doc-first pipeline flow
- HITL checkpoint decision flow
- Auto-fix → re-validate loop
- Recovery from checkpoint

### E2E Tests
- Complete autonomous feature development
- Multi-checkpoint workflow
- Failed validation → human escalation

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| AI generates poor specs | Medium | High | Human review checkpoint |
| Auto-fix loops | Medium | Medium | Max retry limit, timeout |
| Checkpoint timeout | Low | Medium | Configurable timeout, notifications |
| Quality gate false positives | Low | Low | Configurable thresholds |

## Timeline

| Week | Focus |
|------|-------|
| 1 | M8.1, M8.3 |
| 2 | M8.2, M8.4 |
| 3 | M8.5, M8.6 |
| 4 | M8.7, M8.8, Testing |

---

## Souvislosti

- [FR-001: Autonomous Execution](../../02-requirements/01-functional/FR-001-autonomous-execution.md)
- [FR-003: Documentation Workflow](../../02-requirements/01-functional/FR-003-documentation-workflow.md)
- [FR-006: HITL Checkpoints](../../02-requirements/01-functional/FR-006-hitl-checkpoints.md)
- [Design: Doc-First Pipeline](../../04-design/02-autonomous-workflow/doc-first-pipeline.md)
- [Design: Task Decomposition](../../04-design/02-autonomous-workflow/task-decomposition.md)
