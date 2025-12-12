# Documentation-First Pipeline Design

## Přehled

Documentation-First Pipeline je workflow engine, který zajišťuje, že před každou implementací existuje specifikace. Tento design popisuje architekturu a flow tohoto pipeline.

## Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DOCUMENTATION-FIRST PIPELINE                            │
│                                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐ │
│  │ 1. INPUT │ → │ 2. ANALYZE│ → │ 3. SPEC  │ → │ 4. IMPL  │ → │ 5. VALID │ │
│  │          │   │          │   │  GEN     │   │          │   │          │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘ │
│       │              │              │              │              │        │
│       │              │              │              │              │        │
│       ▼              ▼              ▼              ▼              ▼        │
│  User prompt   Task type      Spec doc      Code +       Quality         │
│               Complexity     HITL review    Tests        Report          │
│               Dependencies                                                │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Stage 1: Input Processing

```typescript
interface InputProcessor {
  process(input: UserInput): Promise<ProcessedInput>;
}

interface UserInput {
  prompt: string;
  context?: {
    projectId: string;
    repositoryPath: string;
    existingFiles?: string[];
  };
  options?: {
    taskType?: TaskType;
    skipSpec?: boolean;
    hitlPolicy?: HITLPolicy;
  };
}

interface ProcessedInput {
  normalizedPrompt: string;
  detectedIntent: Intent;
  entities: Entity[];
  relatedFiles: string[];
  suggestedTaskType: TaskType;
}
```

**Processing Steps:**

1. **Normalize prompt** - odstranění zbytečných znaků, normalizace whitespace
2. **Extract intent** - co uživatel chce dosáhnout
3. **Entity extraction** - identifikace klíčových entit (soubory, funkce, moduly)
4. **Context enrichment** - přidání relevantního kontextu z projektu

## Stage 2: Task Analysis

```typescript
interface TaskAnalyzer {
  analyze(input: ProcessedInput): Promise<TaskAnalysis>;
}

interface TaskAnalysis {
  taskType: TaskType;
  complexity: 'trivial' | 'simple' | 'medium' | 'complex';
  estimatedDuration: number;  // minutes
  estimatedCost: number;      // USD
  requiresSpec: boolean;
  subtasks: SubtaskPlan[];
  dependencies: Dependency[];
  risks: Risk[];
}

type TaskType =
  | 'greenfield'    // New project/app
  | 'feature'       // New feature in existing code
  | 'bugfix'        // Fix a bug
  | 'refactor'      // Improve existing code
  | 'test'          // Write tests
  | 'docs'          // Write documentation
  | 'trivial';      // Simple change (typo, format)
```

**Complexity Heuristics:**

```typescript
function determineComplexity(analysis: TaskAnalysis): Complexity {
  let score = 0;

  // File count
  if (analysis.affectedFiles.length > 10) score += 3;
  else if (analysis.affectedFiles.length > 5) score += 2;
  else if (analysis.affectedFiles.length > 1) score += 1;

  // New vs modify
  if (analysis.newFilesRequired > 5) score += 3;
  else if (analysis.newFilesRequired > 2) score += 2;

  // Dependencies
  if (analysis.dependencies.length > 5) score += 2;
  else if (analysis.dependencies.length > 2) score += 1;

  // Task type
  if (analysis.taskType === 'greenfield') score += 3;
  if (analysis.taskType === 'refactor') score += 2;

  // Map score to complexity
  if (score <= 1) return 'trivial';
  if (score <= 3) return 'simple';
  if (score <= 6) return 'medium';
  return 'complex';
}
```

## Stage 3: Specification Generation

```typescript
interface SpecGenerator {
  generate(analysis: TaskAnalysis): Promise<Specification>;
}

interface Specification {
  id: string;
  version: string;
  createdAt: Date;

  // Metadata
  title: string;
  taskType: TaskType;
  complexity: Complexity;

  // Content sections
  sections: {
    goal: string;
    scope: {
      inScope: string[];
      outOfScope: string[];
    };
    technicalDesign: {
      architecture?: string;
      dataModels?: DataModel[];
      apiDesign?: APIDesign[];
      components?: Component[];
    };
    acceptanceCriteria: AcceptanceCriterion[];
    testPlan: TestPlan;
    risks: Risk[];
  };

  // Artifacts
  diagrams?: Diagram[];
  codeExamples?: CodeExample[];
}

interface AcceptanceCriterion {
  id: string;
  description: string;
  testable: boolean;
  testStrategy?: 'unit' | 'integration' | 'e2e' | 'manual';
}
```

**Spec Generation Flow:**

```
TaskAnalysis
     │
     ▼
┌─────────────────────────────────────────┐
│         SPEC GENERATION AGENT           │
│                                         │
│  Context:                               │
│  - Project structure                    │
│  - Existing patterns                    │
│  - Related code                         │
│  - Task analysis                        │
│                                         │
│  Output:                                │
│  - Structured spec document            │
│  - Diagrams (if needed)                │
│  - Code examples                       │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│         SPEC VALIDATION                 │
│                                         │
│  - Schema validation                    │
│  - Completeness check                   │
│  - Consistency check                    │
│  - Feasibility check                    │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│         HITL CHECKPOINT                 │
│         (if configured)                 │
│                                         │
│  Options:                               │
│  - Approve                              │
│  - Modify                               │
│  - Reject                               │
└─────────────────────────────────────────┘
     │
     ▼
Approved Specification
```

**Spec Template:**

```markdown
# SPEC-{{id}}: {{title}}

## Metadata
- **ID:** SPEC-{{id}}
- **Type:** {{taskType}}
- **Complexity:** {{complexity}}
- **Created:** {{date}}
- **Author:** ADO (auto-generated)
- **Status:** {{status}}

## Goal
{{goal}}

## Scope

### In Scope
{{#each inScope}}
- {{this}}
{{/each}}

### Out of Scope
{{#each outOfScope}}
- {{this}}
{{/each}}

## Technical Design

### Architecture
{{architecture}}

### Data Models
{{#each dataModels}}
#### {{name}}
```typescript
{{schema}}
```
{{/each}}

### API Design
{{#each apiDesign}}
#### {{method}} {{path}}
- **Input:** {{input}}
- **Output:** {{output}}
{{/each}}

## Acceptance Criteria
{{#each criteria}}
- [ ] **AC-{{id}}:** {{description}}
  - Test strategy: {{testStrategy}}
{{/each}}

## Test Plan

### Unit Tests
{{unitTests}}

### Integration Tests
{{integrationTests}}

## Risks
{{#each risks}}
- **{{severity}}:** {{description}}
  - Mitigation: {{mitigation}}
{{/each}}
```

## Stage 4: Implementation

```typescript
interface Implementer {
  implement(spec: Specification): AsyncGenerator<ImplementationEvent>;
}

interface ImplementationEvent {
  type: 'progress' | 'file_created' | 'file_modified' | 'checkpoint' | 'complete';
  data: unknown;
}

interface ImplementationPlan {
  steps: ImplementationStep[];
  parallelizable: boolean;
  estimatedDuration: number;
}

interface ImplementationStep {
  id: string;
  name: string;
  description: string;
  agentHint?: string;  // Which agent is best for this
  dependencies: string[];
  artifacts: string[];  // Expected output files
}
```

**Implementation Flow:**

```
Specification
     │
     ▼
┌─────────────────────────────────────────┐
│       IMPLEMENTATION PLANNER            │
│                                         │
│  - Break into steps                     │
│  - Identify dependencies                │
│  - Assign to agents                     │
│  - Create execution plan                │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│       STEP EXECUTOR                     │
│                                         │
│  For each step:                         │
│  1. Prepare context (spec + prev work)  │
│  2. Select agent                        │
│  3. Execute                             │
│  4. Validate output                     │
│  5. Update state                        │
└─────────────────────────────────────────┘
     │
     ├── Step 1: Create models ────────┐
     │                                  │
     ├── Step 2: Create services ──────┤ (parallel if no deps)
     │                                  │
     ├── Step 3: Create API ───────────┤
     │                                  │
     └── Step 4: Create tests ─────────┘
                    │
                    ▼
            Implementation Complete
```

## Stage 5: Validation

```typescript
interface Validator {
  validate(implementation: Implementation, spec: Specification): Promise<ValidationResult>;
}

interface ValidationResult {
  passed: boolean;
  score: number;  // 0-100

  checks: {
    build: CheckResult;
    tests: CheckResult;
    lint: CheckResult;
    typecheck: CheckResult;
    coverage: CheckResult;
    criteria: CriteriaCheckResult;
  };

  issues: ValidationIssue[];
  suggestions: string[];
}

interface CriteriaCheckResult {
  total: number;
  passed: number;
  failed: AcceptanceCriterion[];
  mapping: Map<string, string>;  // criterion ID → test ID
}
```

**Validation Flow:**

```
Implementation + Specification
            │
            ▼
   ┌─────────────────┐
   │  Build Check    │ ──► Build output
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │  Lint Check     │ ──► Lint report
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │  Type Check     │ ──► Type errors
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │  Test Check     │ ──► Test results + coverage
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ Criteria Check  │ ──► Criteria mapping
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐
   │ Aggregate       │ ──► Final report
   │ Results         │
   └────────┬────────┘
            │
       ┌────┴────┐
       │         │
    Passed    Failed
       │         │
       ▼         ▼
   Complete   Remediation
              (retry or HITL)
```

## Auto-Remediation

```typescript
interface Remediator {
  canRemediate(issue: ValidationIssue): boolean;
  remediate(issue: ValidationIssue): Promise<RemediationResult>;
}

interface RemediationResult {
  success: boolean;
  changes: FileChange[];
  message: string;
}
```

**Remediation Strategies:**

| Issue Type | Strategy |
|------------|----------|
| Lint error | Auto-fix |
| Test failure | Analyze + fix |
| Build error | Analyze + fix |
| Type error | Add types/fix |
| Coverage low | Generate more tests |
| Criteria unmet | Implement missing |

**Remediation Flow:**

```
Validation Failed
       │
       ▼
┌─────────────────────────────────────────┐
│         REMEDIATION ENGINE              │
│                                         │
│  For each issue:                        │
│  1. Can auto-fix? → Try auto-fix        │
│  2. Simple fix? → Agent fix             │
│  3. Complex? → HITL escalation          │
└─────────────────────────────────────────┘
       │
       ├── Fixed → Re-validate
       │
       └── Cannot fix → HITL Checkpoint
```

---

## Configuration

```yaml
pipeline:
  stages:
    input:
      enrichContext: true
      maxContextSize: 50000

    analysis:
      complexityThreshold: "medium"  # Skip spec for simpler

    spec:
      required: true
      template: "./templates/spec.md"
      outputDir: "./docs/specs"
      hitlReview: true

    implementation:
      maxParallel: 5
      checkpointInterval: 30

    validation:
      build: { required: true }
      tests: { required: true, minCoverage: 80 }
      lint: { required: true }
      typecheck: { required: true }
      criteriaMapping: true

    remediation:
      enabled: true
      maxAttempts: 3
      autoFixLint: true
      autoFixTests: true
```

---

## Souvislosti

- [FR-001: Autonomous Execution](../../02-requirements/01-functional/FR-001-autonomous-execution.md)
- [FR-003: Documentation Workflow](../../02-requirements/01-functional/FR-003-documentation-workflow.md)
- [ADR-002: Documentation-First](../../03-architecture/06-decisions/ADR-002-documentation-first.md)
