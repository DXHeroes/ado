# Spec-Kit Integration Design

## Přehled

Architektonický design pro integraci GitHub Spec-Kit workflow do ADO - documentation-first approach s čtyřfázovým procesem /specify → /plan → /tasks → /implement.

## Proč Spec-Kit?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│            Development Approach Comparison                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                    Code-First       Spec-First        Spec-Kit
                    ──────────       ──────────        ────────
Predictability      Low              Medium            High
Quality             Variable         Good              Excellent
Rework Rate         High (40%)       Medium (20%)      Low (10%)
AI Success Rate     55%              70%               85%+
Review Efficiency   Low              Medium            High

GitHub Spec-Kit Success Metrics (Sept 2025):
- 85% implementation success rate
- 60% reduction in code rework
- 3x faster code reviews
- 40% better test coverage
```

## Spec-Kit Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Four-Phase Spec-Kit Workflow                              │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 1: /specify
┌──────────────────────────────────────┐
│ Input: High-level description        │
│ Output: Detailed specification       │
│                                      │
│ - User stories                       │
│ - Acceptance criteria                │
│ - Edge cases                         │
│ - API contracts (OpenAPI)            │
└──────────────┬───────────────────────┘
               │
               ▼
Phase 2: /plan
┌──────────────────────────────────────┐
│ Input: Specification                 │
│ Output: Technical plan               │
│                                      │
│ - Architecture decisions (ADRs)      │
│ - Component breakdown                │
│ - Database schema                    │
│ - Integration points                 │
└──────────────┬───────────────────────┘
               │
               ▼
Phase 3: /tasks
┌──────────────────────────────────────┐
│ Input: Technical plan                │
│ Output: Executable task list         │
│                                      │
│ - Task breakdown                     │
│ - Dependencies                       │
│ - Test requirements                  │
│ - Review checkpoints                 │
└──────────────┬───────────────────────┘
               │
               ▼
Phase 4: /implement
┌──────────────────────────────────────┐
│ Input: Task list                     │
│ Output: Working code                 │
│                                      │
│ - Code generation                    │
│ - Test generation                    │
│ - Documentation                      │
│ - Quality gates                      │
└──────────────────────────────────────┘
```

## Phase 1: Specification Generation

```typescript
// packages/core/src/spec-kit/specify.ts
export interface SpecificationInput {
  title: string;
  description: string;
  context?: string; // Existing codebase context
  constraints?: string[]; // Technical constraints
  constitution?: Constitution; // Immutable principles
}

export interface Specification {
  id: string;
  title: string;

  // User-facing requirements
  userStories: UserStory[];
  acceptanceCriteria: AcceptanceCriterion[];

  // Technical requirements
  functionalRequirements: FunctionalRequirement[];
  nonFunctionalRequirements: NonFunctionalRequirement[];

  // Edge cases and scenarios
  edgeCases: EdgeCase[];

  // API contracts (if applicable)
  apiContract?: OpenAPISpec;

  // Diagrams
  diagrams?: {
    architecture?: string; // Mermaid diagram
    sequence?: string; // Mermaid sequence diagram
    dataFlow?: string; // Mermaid flowchart
  };
}

export class SpecificationGenerator {
  constructor(
    private llm: LiteLLMClient,
    private constitutionProvider: ConstitutionProvider
  ) {}

  async specify(input: SpecificationInput): Promise<Specification> {
    // Load constitution (immutable principles)
    const constitution = input.constitution || await this.constitutionProvider.load();

    // Generate specification using LLM
    const prompt = this.buildSpecificationPrompt(input, constitution);

    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.getSpecificationSystemPrompt(constitution),
      },
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.3, // Lower temperature for precision
      maxTokens: 8000,
    });

    // Parse structured specification
    const spec = await this.parseSpecification(response.content);

    // Generate OpenAPI if API is involved
    if (this.isAPIFeature(input)) {
      spec.apiContract = await this.generateOpenAPI(spec);
    }

    // Generate diagrams
    spec.diagrams = await this.generateDiagrams(spec);

    return spec;
  }

  private buildSpecificationPrompt(
    input: SpecificationInput,
    constitution: Constitution
  ): string {
    return `# Feature Specification Request

## Description
${input.description}

## Context
${input.context || 'New feature for existing codebase'}

## Constraints
${input.constraints?.map(c => `- ${c}`).join('\n') || 'None specified'}

## Constitution (Immutable Principles)
${constitution.principles.map(p => `- ${p.name}: ${p.description}`).join('\n')}

## Required Output

### 1. User Stories
Write 3-5 user stories following: "As a [user], I want [feature], so that [benefit]"

### 2. Acceptance Criteria
For each user story, define testable acceptance criteria.

### 3. Functional Requirements
List all functional requirements with priority (P0/P1/P2).

### 4. Non-Functional Requirements
Specify performance, security, scalability requirements.

### 5. Edge Cases
Identify potential edge cases and error scenarios.

### 6. API Contract (if applicable)
Define API endpoints, request/response schemas.

Generate the specification in JSON format.`;
  }

  private async generateOpenAPI(spec: Specification): Promise<OpenAPISpec> {
    const prompt = `Generate OpenAPI 3.0 specification for:

${spec.userStories.map(us => `- ${us.story}`).join('\n')}

Requirements:
${spec.functionalRequirements.map(fr => `- ${fr.description}`).join('\n')}

Follow RESTful conventions.
Include request/response schemas with validation.
Add example values.`;

    const response = await this.llm.chat([
      {
        role: 'system',
        content: 'You are an API design expert. Generate OpenAPI 3.0 specifications.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    // Parse and validate OpenAPI spec
    const openapi = JSON.parse(response.content);
    await this.validateOpenAPI(openapi);

    return openapi;
  }
}
```

## Phase 2: Technical Planning

```typescript
// packages/core/src/spec-kit/plan.ts
export interface TechnicalPlan {
  id: string;
  specificationId: string;

  // Architecture decisions
  adrs: ArchitectureDecisionRecord[];

  // Component breakdown
  components: Component[];

  // Data model
  dataModel?: {
    entities: Entity[];
    relationships: Relationship[];
    migrations?: string[];
  };

  // Integration points
  integrations: Integration[];

  // Technology stack
  techStack: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    infrastructure?: string[];
  };

  // Estimates
  estimates: {
    duration: string; // "2-4 hours"
    complexity: 'low' | 'medium' | 'high';
    confidence: number; // 0-100%
  };
}

export class TechnicalPlanner {
  async plan(spec: Specification): Promise<TechnicalPlan> {
    // Analyze existing codebase
    const codebaseContext = await this.analyzeCodebase();

    // Generate architecture decisions
    const adrs = await this.generateADRs(spec, codebaseContext);

    // Break down into components
    const components = await this.breakdownComponents(spec, adrs);

    // Design data model (if needed)
    const dataModel = await this.designDataModel(spec, codebaseContext);

    // Identify integrations
    const integrations = await this.identifyIntegrations(spec, codebaseContext);

    // Estimate effort
    const estimates = await this.estimateEffort(spec, components);

    return {
      id: generateId(),
      specificationId: spec.id,
      adrs,
      components,
      dataModel,
      integrations,
      techStack: await this.determineTechStack(codebaseContext),
      estimates,
    };
  }

  private async generateADRs(
    spec: Specification,
    context: CodebaseContext
  ): Promise<ArchitectureDecisionRecord[]> {
    const decisions = await this.identifyDecisions(spec);

    return Promise.all(
      decisions.map(decision => this.createADR(decision, context))
    );
  }

  private async createADR(
    decision: ArchitectureDecision,
    context: CodebaseContext
  ): Promise<ArchitectureDecisionRecord> {
    const prompt = `Create an Architecture Decision Record (ADR) using MADR template:

## Decision
${decision.question}

## Context
${decision.context}

## Considered Options
${decision.options.map((o, i) => `${i + 1}. ${o.name}`).join('\n')}

## Decision Outcome
Analyze pros/cons and recommend the best option based on:
- Alignment with existing architecture
- Technical feasibility
- Maintainability
- Performance implications

Existing architecture: ${context.architecture}`;

    const response = await this.llm.chat([
      {
        role: 'system',
        content: 'You are a software architect. Create detailed ADRs.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    return this.parseADR(response.content, decision);
  }
}
```

## Phase 3: Task Decomposition

```typescript
// packages/core/src/spec-kit/tasks.ts
export interface ExecutableTask {
  id: string;
  title: string;
  description: string;

  // Dependencies
  dependsOn: string[]; // Task IDs
  blockedBy: string[]; // External dependencies

  // Implementation details
  files: {
    create: string[];
    modify: string[];
    delete: string[];
  };

  // Testing requirements
  tests: {
    unit: string[]; // Test descriptions
    integration: string[];
    e2e?: string[];
  };

  // Review checkpoints
  reviewCheckpoint: 'none' | 'after_implementation' | 'after_tests';

  // Estimates
  estimatedDuration: number; // minutes
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
}

export class TaskDecomposer {
  async decompose(plan: TechnicalPlan): Promise<ExecutableTask[]> {
    const tasks: ExecutableTask[] = [];

    // 1. Data model tasks
    if (plan.dataModel) {
      tasks.push(...await this.createDataModelTasks(plan.dataModel));
    }

    // 2. Component tasks
    for (const component of plan.components) {
      tasks.push(...await this.createComponentTasks(component));
    }

    // 3. Integration tasks
    for (const integration of plan.integrations) {
      tasks.push(...await this.createIntegrationTasks(integration));
    }

    // 4. Test tasks
    tasks.push(...await this.createTestTasks(plan));

    // 5. Documentation tasks
    tasks.push(...await this.createDocumentationTasks(plan));

    // Compute dependencies
    await this.computeDependencies(tasks);

    // Sort topologically
    return this.topologicalSort(tasks);
  }

  private async createComponentTasks(
    component: Component
  ): Promise<ExecutableTask[]> {
    const prompt = `Break down this component into implementable tasks:

Component: ${component.name}
Description: ${component.description}
Responsibility: ${component.responsibility}

For each task, specify:
- What files to create/modify
- What tests are needed
- Estimated duration

Keep tasks small (≤30 minutes each).`;

    const response = await this.llm.chat([
      {
        role: 'system',
        content: 'You are a project manager. Break down work into small, executable tasks.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    return this.parseTasks(response.content, component);
  }

  private topologicalSort(tasks: ExecutableTask[]): ExecutableTask[] {
    // Kahn's algorithm for topological sorting
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    // Build graph
    for (const task of tasks) {
      inDegree.set(task.id, task.dependsOn.length);
      graph.set(task.id, []);
    }

    for (const task of tasks) {
      for (const dep of task.dependsOn) {
        graph.get(dep)?.push(task.id);
      }
    }

    // Sort
    const queue: string[] = [];
    const sorted: ExecutableTask[] = [];

    for (const [id, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const taskId = queue.shift()!;
      const task = tasks.find(t => t.id === taskId)!;
      sorted.push(task);

      for (const nextId of graph.get(taskId) || []) {
        const degree = inDegree.get(nextId)! - 1;
        inDegree.set(nextId, degree);
        if (degree === 0) queue.push(nextId);
      }
    }

    return sorted;
  }
}
```

## Phase 4: Implementation

```typescript
// packages/core/src/spec-kit/implement.ts
export class SpecKitImplementer {
  async implement(tasks: ExecutableTask[]): Promise<ImplementationResult> {
    const results: TaskResult[] = [];

    for (const task of tasks) {
      // Check dependencies
      if (!this.dependenciesMet(task, results)) {
        throw new Error(`Dependencies not met for task ${task.id}`);
      }

      // Execute task
      const result = await this.executeTask(task);
      results.push(result);

      // Review checkpoint
      if (task.reviewCheckpoint !== 'none') {
        const approved = await this.hitlCheckpoint(task, result);
        if (!approved) {
          throw new Error(`Task ${task.id} rejected at checkpoint`);
        }
      }
    }

    return {
      tasks: results,
      summary: this.generateSummary(results),
    };
  }

  private async executeTask(task: ExecutableTask): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      // Generate code for this task
      const codeGeneration = await this.generateCode(task);

      // Run quality gates
      const qualityResult = await this.runQualityGates(task);

      if (!qualityResult.passed) {
        // Iterate to fix issues
        await this.iterateToFix(task, qualityResult);
      }

      return {
        taskId: task.id,
        status: 'completed',
        filesCreated: codeGeneration.created,
        filesModified: codeGeneration.modified,
        testsAdded: codeGeneration.tests,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        taskId: task.id,
        status: 'failed',
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }
}
```

## Constitution Pattern

```typescript
// packages/core/src/spec-kit/constitution.ts
export interface Constitution {
  name: string;
  version: string;

  // Immutable principles applied to every generation
  principles: Principle[];

  // Design system constraints
  designSystem?: {
    colors: string[];
    typography: string[];
    spacing: string[];
  };

  // Architectural patterns
  architecturalPatterns: {
    name: string;
    description: string;
    required: boolean;
  }[];

  // Security requirements
  security: {
    authentication: string;
    authorization: string;
    dataProtection: string[];
  };

  // Code standards
  codeStandards: {
    language: string;
    linter: string;
    formatter: string;
    testFramework: string;
    minCoverage: number;
  }[];
}

export const DEFAULT_CONSTITUTION: Constitution = {
  name: 'ADO Default Constitution',
  version: '1.0.0',

  principles: [
    {
      name: 'Type Safety',
      description: 'All code must be fully typed with no `any` types',
      priority: 'P0',
    },
    {
      name: 'Test Coverage',
      description: 'Minimum 80% test coverage required',
      priority: 'P0',
    },
    {
      name: 'Security First',
      description: 'No hardcoded secrets, validate all inputs, use prepared statements',
      priority: 'P0',
    },
    {
      name: 'Accessibility',
      description: 'WCAG 2.1 AA compliance for all UI components',
      priority: 'P1',
    },
  ],

  architecturalPatterns: [
    {
      name: 'Repository Pattern',
      description: 'Encapsulate data access logic in repository classes',
      required: true,
    },
    {
      name: 'Dependency Injection',
      description: 'Use DI container for managing dependencies',
      required: true,
    },
  ],

  security: {
    authentication: 'JWT with refresh tokens',
    authorization: 'RBAC with permission-based access control',
    dataProtection: [
      'Encrypt sensitive data at rest',
      'Use HTTPS for all communication',
      'Sanitize all user inputs',
    ],
  },

  codeStandards: [
    {
      language: 'typescript',
      linter: 'eslint with typescript-eslint',
      formatter: 'prettier',
      testFramework: 'vitest',
      minCoverage: 80,
    },
  ],
};
```

## ADR Auto-Generation

```typescript
// packages/core/src/spec-kit/adr-generator.ts
export class ADRGenerator {
  /**
   * Auto-generate ADR from significant commits/PRs
   */
  async generateFromCommit(commit: GitCommit): Promise<ArchitectureDecisionRecord | null> {
    // Detect if commit contains architectural decision
    const isArchitecturalChange = await this.detectArchitecturalChange(commit);

    if (!isArchitecturalChange) {
      return null;
    }

    // Extract decision context
    const context = await this.extractContext(commit);

    // Generate ADR using LLM
    const prompt = `Generate Architecture Decision Record (ADR) from this commit:

Commit: ${commit.message}
Files changed: ${commit.files.map(f => f.path).join(', ')}
Diff summary: ${commit.diffSummary}

Use MADR template:
1. Context and Problem Statement
2. Considered Options
3. Decision Outcome
4. Consequences (positive and negative)`;

    const response = await this.llm.chat([
      {
        role: 'system',
        content: 'You are an architect generating ADRs from code changes.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    const adr = this.parseMADR(response.content);

    // Save to docs/adr/
    await this.saveADR(adr);

    return adr;
  }

  private async detectArchitecturalChange(commit: GitCommit): boolean {
    // Heuristics for architectural changes:
    // - New design patterns introduced
    // - Database schema changes
    // - API contract changes
    // - New dependencies added
    // - Security model changes

    const indicators = [
      commit.files.some(f => f.path.includes('schema')),
      commit.files.some(f => f.path.includes('package.json')),
      commit.message.toLowerCase().includes('architecture'),
      commit.message.toLowerCase().includes('design'),
      commit.diffSummary.length > 500, // Large change
    ];

    return indicators.filter(Boolean).length >= 2;
  }
}
```

## Configuration

```yaml
# ado.config.yaml
specKit:
  enabled: true

  # Constitution (immutable principles)
  constitution:
    path: ./constitution.yaml
    enforceInAllPhases: true

  # Phase configuration
  phases:
    specify:
      enabled: true
      requireApproval: true  # HITL checkpoint
      generateOpenAPI: true
      generateDiagrams: true

    plan:
      enabled: true
      requireApproval: true  # HITL checkpoint
      generateADRs: true
      analyzeCodebase: true

    tasks:
      enabled: true
      maxTaskDuration: 30    # minutes
      requireTestsPerTask: true
      topologicalSort: true

    implement:
      enabled: true
      reviewCheckpoints: after_tests  # none, after_implementation, after_tests

  # ADR settings
  adr:
    autoGenerate: true
    path: docs/adr
    template: madr  # or custom
    numbering: sequential

  # OpenAPI settings
  openapi:
    version: "3.0.0"
    outputPath: docs/api
    generateExamples: true
    validateOnGenerate: true
```

---

## Souvislosti

- [Doc-First Pipeline](./doc-first-pipeline.md)
- [Task Decomposition](./task-decomposition.md)
- [Temporal Workflows](./temporal-workflows.md)
- [Quality Gates](./test-build-validation.md)
- [FR-003: Documentation Workflow](../../02-requirements/01-functional/FR-003-documentation-workflow.md)
