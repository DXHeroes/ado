# Merge Conflict Resolution Design

## Přehled

Architektonický design pro AI-powered řešení merge konfliktů při paralelní práci více agentů - s automatickou resolution rate 80%+ a inteligentní eskalací komplex konfliktů.

## Proč AI-Powered Resolution?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│            Conflict Resolution Approach Comparison                           │
└─────────────────────────────────────────────────────────────────────────────┘

                    Manual Only      Git Auto-Merge    AI-Powered
                    ───────────      ──────────────    ──────────
Success Rate        100% (human)     ~40%              80-90%
Speed               Slow (hours)     Fast (seconds)    Fast (seconds)
Requires Human      Always           On conflicts      Only complex
Handles Complex     Yes              No                Partial
Cost                High             Free              Low (API)

Real-world Metrics (reconcile-ai, GitKraken AI, rizzler):
- 80-90% automatic resolution rate
- <5% incorrect auto-resolutions (caught by tests)
- 95% reduction in manual conflict resolution time
- Works best with good test coverage
```

## Conflict Resolution Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  AI-Powered Conflict Resolution Flow                         │
└─────────────────────────────────────────────────────────────────────────────┘

Parallel Agent Work
       │
       ├─ Agent 1: feature/auth    (branch: agent/ado/feature/1-auth)
       ├─ Agent 2: feature/api     (branch: agent/ado/feature/2-api)
       └─ Agent 3: bugfix/payment  (branch: agent/ado/bugfix/3-payment)
       │
       ▼
Merge to main
       │
       ├─ No conflicts ────────────────────────► Merge successful ✓
       │
       └─ Conflicts detected
              │
              ▼
       ┌──────────────────────────────────────┐
       │    Conflict Classification           │
       │                                      │
       │  • Trivial (whitespace, imports)    │
       │  • Simple (non-overlapping logic)   │
       │  • Complex (overlapping logic)      │
       │  • Critical (security, business)    │
       └──────────────┬───────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
   Trivial       Simple         Complex/Critical
        │             │             │
        ▼             ▼             ▼
   Git Auto     AI Resolution   Human Escalation
        │             │             │
        └─────────────┴─────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │  Validation      │
            │  • Run tests     │
            │  • Check coverage│
            │  • Quality gates │
            └────────┬─────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   Tests Pass  Tests Fail   Coverage Drop
        │            │            │
        ▼            ▼            ▼
    Merge ✓     Retry AI    Escalate to Human
```

## Conflict Classifier

```typescript
// packages/core/src/conflict/conflict-classifier.ts
export type ConflictComplexity = 'trivial' | 'simple' | 'complex' | 'critical';

export interface ConflictClassification {
  complexity: ConflictComplexity;
  reason: string;
  autoResolvable: boolean;
  requiresHuman: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export class ConflictClassifier {
  /**
   * Classify conflict complexity
   */
  classify(conflict: GitConflict): ConflictClassification {
    // Critical conflicts → always human
    if (this.isCriticalFile(conflict.filePath)) {
      return {
        complexity: 'critical',
        reason: 'Security or business-critical file',
        autoResolvable: false,
        requiresHuman: true,
        riskLevel: 'high',
      };
    }

    // Trivial conflicts → git auto-merge
    if (this.isTrivialConflict(conflict)) {
      return {
        complexity: 'trivial',
        reason: 'Whitespace, imports, or formatting only',
        autoResolvable: true,
        requiresHuman: false,
        riskLevel: 'low',
      };
    }

    // Complex conflicts → AI with validation
    if (this.isComplexConflict(conflict)) {
      return {
        complexity: 'complex',
        reason: 'Overlapping business logic or data structures',
        autoResolvable: true, // Try AI, but verify carefully
        requiresHuman: false, // Unless AI fails
        riskLevel: 'medium',
      };
    }

    // Simple conflicts → AI resolution
    return {
      complexity: 'simple',
      reason: 'Non-overlapping logic changes',
      autoResolvable: true,
      requiresHuman: false,
      riskLevel: 'low',
    };
  }

  private isCriticalFile(filePath: string): boolean {
    const criticalPatterns = [
      /auth|authentication|authorization/i,
      /security|crypto|encrypt/i,
      /payment|billing|checkout/i,
      /schema|migration|database/i,
      /\.env|config|secrets/i,
    ];

    return criticalPatterns.some(pattern => pattern.test(filePath));
  }

  private isTrivialConflict(conflict: GitConflict): boolean {
    const { ours, theirs, base } = conflict.content;

    // Whitespace-only changes
    if (this.isWhitespaceOnly(ours, base) || this.isWhitespaceOnly(theirs, base)) {
      return true;
    }

    // Import statement conflicts
    if (this.isImportConflict(conflict)) {
      return true;
    }

    // Formatting conflicts (detected by linter)
    if (this.isFormattingConflict(conflict)) {
      return true;
    }

    return false;
  }

  private isComplexConflict(conflict: GitConflict): boolean {
    const { ours, theirs } = conflict.content;

    // Function signature changes on both sides
    if (this.hasFunctionSignatureChanges(ours) && this.hasFunctionSignatureChanges(theirs)) {
      return true;
    }

    // Data structure changes
    if (this.hasDataStructureChanges(ours) && this.hasDataStructureChanges(theirs)) {
      return true;
    }

    // Control flow changes
    if (this.hasControlFlowChanges(ours) && this.hasControlFlowChanges(theirs)) {
      return true;
    }

    return false;
  }
}
```

## AI Resolution Strategy

```typescript
// packages/core/src/conflict/ai-resolver.ts
export class AIConflictResolver {
  constructor(
    private llm: LiteLLMClient,
    private testRunner: TestRunner
  ) {}

  /**
   * Resolve conflict using AI
   */
  async resolve(conflict: GitConflict): Promise<ResolutionResult> {
    // Classify conflict
    const classification = new ConflictClassifier().classify(conflict);

    if (!classification.autoResolvable) {
      return {
        success: false,
        reason: classification.reason,
        requiresHuman: true,
      };
    }

    // Try AI resolution
    const resolution = await this.generateResolution(conflict, classification);

    // Validate resolution
    const validation = await this.validateResolution(conflict, resolution);

    if (!validation.passed) {
      // Retry with more context
      const retryResolution = await this.retryWithMoreContext(
        conflict,
        classification,
        validation.errors
      );

      const retryValidation = await this.validateResolution(conflict, retryResolution);

      if (!retryValidation.passed) {
        return {
          success: false,
          reason: 'AI resolution failed validation',
          requiresHuman: true,
          attemptedResolution: retryResolution,
        };
      }

      return {
        success: true,
        resolution: retryResolution,
        validation: retryValidation,
      };
    }

    return {
      success: true,
      resolution,
      validation,
    };
  }

  private async generateResolution(
    conflict: GitConflict,
    classification: ConflictClassification
  ): Promise<string> {
    const prompt = this.buildResolutionPrompt(conflict, classification);

    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.getResolutionSystemPrompt(),
      },
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.2, // Low temperature for deterministic output
      maxTokens: 4000,
    });

    return this.extractResolvedCode(response.content);
  }

  private buildResolutionPrompt(
    conflict: GitConflict,
    classification: ConflictComplexity
  ): string {
    return `Resolve the following merge conflict:

**File:** ${conflict.filePath}
**Complexity:** ${classification.complexity}

**Base version (common ancestor):**
\`\`\`
${conflict.content.base}
\`\`\`

**Our changes (branch A):**
\`\`\`
${conflict.content.ours}
\`\`\`

**Their changes (branch B):**
\`\`\`
${conflict.content.theirs}
\`\`\`

**Context:**
- File type: ${conflict.fileType}
- Lines in conflict: ${conflict.linesInConflict}
- Surrounding code: ${conflict.surroundingContext}

**Resolution Strategy:**
1. Analyze both changes and understand intent
2. Combine both changes if they are compatible
3. If incompatible, prefer the change that:
   - Maintains backward compatibility
   - Has better error handling
   - Follows existing patterns
4. Preserve all functionality from both sides if possible
5. Add comments explaining the merge if complex

**Output:**
Provide only the resolved code, no explanations.`;
  }

  private getResolutionSystemPrompt(): string {
    return `You are an expert at resolving merge conflicts in code.

Your goal: Combine both sets of changes intelligently while:
- Preserving all intended functionality
- Maintaining code quality
- Following existing patterns
- Ensuring type safety
- Adding clarifying comments for complex merges

CRITICAL:
- Never delete functionality unless it's clearly superseded
- Prefer combining changes over choosing one side
- Maintain all error handling from both sides
- Keep test coverage at same or higher level`;
  }

  private async validateResolution(
    conflict: GitConflict,
    resolution: string
  ): Promise<ValidationResult> {
    // 1. Apply resolution to file
    await this.applyResolution(conflict.filePath, resolution);

    try {
      // 2. Run type checking
      const typeCheck = await this.runTypeCheck(conflict.filePath);
      if (!typeCheck.passed) {
        return {
          passed: false,
          errors: typeCheck.errors,
        };
      }

      // 3. Run tests
      const testResult = await this.testRunner.runAffectedTests(conflict.filePath);
      if (!testResult.passed) {
        return {
          passed: false,
          errors: testResult.failures.map(f => f.message),
        };
      }

      // 4. Check coverage didn't drop
      const coverage = await this.getCoverage(conflict.filePath);
      if (coverage < conflict.originalCoverage) {
        return {
          passed: false,
          errors: [`Coverage dropped from ${conflict.originalCoverage}% to ${coverage}%`],
        };
      }

      return {
        passed: true,
        coverage,
      };
    } finally {
      // Restore original file if validation failed
      // (will be done by caller based on result)
    }
  }

  private async retryWithMoreContext(
    conflict: GitConflict,
    classification: ConflictClassification,
    previousErrors: string[]
  ): Promise<string> {
    // Get more context from repository
    const extendedContext = await this.getExtendedContext(conflict);

    const prompt = `Previous resolution attempt failed with errors:
${previousErrors.map(e => `- ${e}`).join('\n')}

Try again with extended context:

**Related files:**
${extendedContext.relatedFiles.map(f => `- ${f.path}: ${f.summary}`).join('\n')}

**Similar patterns in codebase:**
${extendedContext.similarPatterns}

**Test expectations:**
${extendedContext.testExpectations}

Now resolve the conflict following the patterns above.`;

    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.getResolutionSystemPrompt(),
      },
      {
        role: 'user',
        content: this.buildResolutionPrompt(conflict, classification),
      },
      {
        role: 'assistant',
        content: previousErrors[0], // Show what went wrong
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    return this.extractResolvedCode(response.content);
  }
}
```

## Strategy-Based Resolution

```typescript
// packages/core/src/conflict/resolution-strategies.ts
export interface ResolutionStrategy {
  name: string;
  canResolve(conflict: GitConflict): boolean;
  resolve(conflict: GitConflict): Promise<string>;
}

/**
 * Import merging strategy
 */
export class ImportMergeStrategy implements ResolutionStrategy {
  name = 'import-merge';

  canResolve(conflict: GitConflict): boolean {
    return conflict.fileType === 'typescript' &&
           conflict.content.ours.includes('import ') &&
           conflict.content.theirs.includes('import ');
  }

  async resolve(conflict: GitConflict): Promise<string> {
    // Parse imports from both sides
    const oursImports = this.parseImports(conflict.content.ours);
    const theirsImports = this.parseImports(conflict.content.theirs);

    // Merge and deduplicate
    const mergedImports = this.mergeImports(oursImports, theirsImports);

    // Sort alphabetically
    const sortedImports = this.sortImports(mergedImports);

    return sortedImports.join('\n');
  }

  private mergeImports(ours: Import[], theirs: Import[]): Import[] {
    const map = new Map<string, Import>();

    // Add ours
    for (const imp of ours) {
      map.set(imp.source, imp);
    }

    // Merge theirs
    for (const imp of theirs) {
      const existing = map.get(imp.source);
      if (existing) {
        // Merge named imports
        existing.names = [...new Set([...existing.names, ...imp.names])];
      } else {
        map.set(imp.source, imp);
      }
    }

    return Array.from(map.values());
  }
}

/**
 * Function merge strategy (non-overlapping changes)
 */
export class FunctionMergeStrategy implements ResolutionStrategy {
  name = 'function-merge';

  canResolve(conflict: GitConflict): boolean {
    return this.hasNonOverlappingFunctionChanges(conflict);
  }

  async resolve(conflict: GitConflict): Promise<string> {
    // Parse function bodies
    const oursFunctions = this.parseFunctions(conflict.content.ours);
    const theirsFunctions = this.parseFunctions(conflict.content.theirs);

    // Merge functions (prefer ours if same signature, otherwise keep both)
    const merged = new Map<string, FunctionNode>();

    for (const fn of oursFunctions) {
      merged.set(fn.signature, fn);
    }

    for (const fn of theirsFunctions) {
      if (!merged.has(fn.signature)) {
        merged.set(fn.signature, fn);
      }
    }

    return Array.from(merged.values())
      .map(fn => fn.code)
      .join('\n\n');
  }
}

/**
 * Data structure merge strategy
 */
export class DataStructureMergeStrategy implements ResolutionStrategy {
  name = 'data-structure-merge';

  canResolve(conflict: GitConflict): boolean {
    return this.hasDataStructureConflict(conflict);
  }

  async resolve(conflict: GitConflict): Promise<string> {
    // Parse type/interface definitions
    const oursTypes = this.parseTypes(conflict.content.ours);
    const theirsTypes = this.parseTypes(conflict.content.theirs);

    // Merge fields (union of all fields)
    const merged = this.mergeTypes(oursTypes, theirsTypes);

    return this.generateTypeCode(merged);
  }

  private mergeTypes(ours: TypeDef, theirs: TypeDef): TypeDef {
    return {
      name: ours.name,
      fields: [
        ...ours.fields,
        ...theirs.fields.filter(
          f => !ours.fields.some(of => of.name === f.name)
        ),
      ],
      methods: [
        ...ours.methods,
        ...theirs.methods.filter(
          m => !ours.methods.some(om => om.signature === m.signature)
        ),
      ],
    };
  }
}
```

## Human Escalation Criteria

```typescript
// packages/core/src/conflict/escalation.ts
export interface EscalationCriteria {
  name: string;
  check(conflict: GitConflict, resolution?: ResolutionResult): boolean;
  reason: string;
}

export const ESCALATION_CRITERIA: EscalationCriteria[] = [
  // 1. Security or business-critical files
  {
    name: 'critical-file',
    check: (conflict) => {
      const critical Patterns = [
        /auth|security|payment|billing/i,
        /schema|migration/i,
        /\.env|config\/production/i,
      ];
      return criticalPatterns.some(p => p.test(conflict.filePath));
    },
    reason: 'Conflict in security or business-critical file',
  },

  // 2. AI resolution failed validation
  {
    name: 'validation-failed',
    check: (_, resolution) => {
      return resolution && !resolution.validation?.passed;
    },
    reason: 'AI resolution failed automated tests',
  },

  // 3. Coverage dropped significantly
  {
    name: 'coverage-drop',
    check: (conflict, resolution) => {
      if (!resolution?.validation) return false;

      const drop = conflict.originalCoverage - resolution.validation.coverage;
      return drop > 5; // More than 5% drop
    },
    reason: 'Test coverage dropped significantly',
  },

  // 4. Complex business logic on both sides
  {
    name: 'complex-business-logic',
    check: (conflict) => {
      const classification = new ConflictClassifier().classify(conflict);
      return classification.complexity === 'complex' &&
             classification.riskLevel === 'high';
    },
    reason: 'Complex business logic changes on both sides',
  },

  // 5. Type system conflicts (breaking changes)
  {
    name: 'type-breaking',
    check: (conflict) => {
      return conflict.fileType === 'typescript' &&
             (conflict.content.ours.includes('interface ') ||
              conflict.content.ours.includes('type ')) &&
             (conflict.content.theirs.includes('interface ') ||
              conflict.content.theirs.includes('type '));
    },
    reason: 'Incompatible type system changes',
  },

  // 6. Insufficient test coverage for validation
  {
    name: 'insufficient-tests',
    check: (conflict) => {
      return conflict.originalCoverage < 70; // Below 70%
    },
    reason: 'Insufficient test coverage to validate auto-resolution',
  },
];

export function shouldEscalate(
  conflict: GitConflict,
  resolution?: ResolutionResult
): { escalate: boolean; reasons: string[] } {
  const triggeredCriteria = ESCALATION_CRITERIA.filter(c =>
    c.check(conflict, resolution)
  );

  return {
    escalate: triggeredCriteria.length > 0,
    reasons: triggeredCriteria.map(c => c.reason),
  };
}
```

## Human Escalation UI

```
═══════════════════════════════════════════════════════════════
🚨 MERGE CONFLICT REQUIRES HUMAN REVIEW

File: src/services/payment.ts
Conflict complexity: COMPLEX
Risk level: HIGH

Reason: Complex business logic changes on both sides

═══════════════════════════════════════════════════════════════

AGENT 1 CHANGES (feature/stripe-integration):
┌─────────────────────────────────────────────────────────────┐
│ async function processPayment(amount: number) {             │
│   const intent = await stripe.paymentIntents.create({       │
│     amount,                                                  │
│     currency: 'usd',                                         │
│     metadata: { source: 'web' },                             │
│   });                                                        │
│   return intent;                                             │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘

AGENT 2 CHANGES (feature/payment-validation):
┌─────────────────────────────────────────────────────────────┐
│ async function processPayment(                              │
│   amount: number,                                            │
│   customerId: string                                         │
│ ) {                                                          │
│   if (amount < 50) {                                         │
│     throw new Error('Minimum payment $0.50');                │
│   }                                                          │
│   const intent = await stripe.paymentIntents.create({       │
│     amount,                                                  │
│     currency: 'usd',                                         │
│     customer: customerId,                                    │
│   });                                                        │
│   return intent;                                             │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘

AI ATTEMPTED RESOLUTION:
┌─────────────────────────────────────────────────────────────┐
│ async function processPayment(                              │
│   amount: number,                                            │
│   customerId: string                                         │
│ ) {                                                          │
│   if (amount < 50) {                                         │
│     throw new Error('Minimum payment $0.50');                │
│   }                                                          │
│   const intent = await stripe.paymentIntents.create({       │
│     amount,                                                  │
│     currency: 'usd',                                         │
│     customer: customerId,                                    │
│     metadata: { source: 'web' },                             │
│   });                                                        │
│   return intent;                                             │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘

VALIDATION RESULT: ✗ FAILED
- Test failure: TypeError: processPayment() expects 2 arguments, got 1
- Coverage dropped from 85% to 78%

═══════════════════════════════════════════════════════════════

Options:

  [1] ✓ Accept AI resolution (fix tests manually)
  [2] ✎ Edit resolution manually
  [3] ← Choose Agent 1 version
  [4] → Choose Agent 2 version
  [5] ✗ Cancel merge, handle later

Choice [2]:
```

## Configuration

```yaml
# ado.config.yaml
conflict:
  resolution:
    # AI resolution settings
    ai:
      enabled: true
      model: claude-sonnet-4-5-20250929
      maxAttempts: 2
      temperature: 0.2

    # Strategy selection
    strategies:
      - import-merge
      - function-merge
      - data-structure-merge

    # Escalation criteria
    escalation:
      criticalFiles:
        - "**/auth/**"
        - "**/security/**"
        - "**/payment/**"
        - "**/*.schema.ts"
        - "**/migrations/**"

      maxCoverageDrop: 5  # Percent
      minCoverageForAuto: 70  # Percent

    # Validation requirements
    validation:
      runTests: true
      runTypeCheck: true
      requireCoverageMatch: true

    # Retry settings
    retry:
      enabled: true
      withExtendedContext: true
      maxRetries: 1
```

---

## Souvislosti

- [Git Worktree Manager](./git-worktree-manager.md)
- [Test & Build Validation](./test-build-validation.md)
- [Temporal Workflows](./temporal-workflows.md)
- [HITL Checkpoints](../../06-user-guide/02-core-concepts/checkpoints-hitl.md)
- [FR-004: Cloud Parallelization](../../02-requirements/01-functional/FR-004-cloud-parallelization.md)
