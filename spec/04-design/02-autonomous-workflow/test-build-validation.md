# Test & Build Validation

## Přehled

Design systému pro automatickou validaci kvality výstupu - testy, build, lint, coverage a další quality gates.

## Architektura validace

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Validation Pipeline                                   │
└─────────────────────────────────────────────────────────────────────────────┘

     Implementation Complete
              │
              ▼
     ┌────────────────┐
     │  Pre-Validation│
     │   (Quick Check)│
     └───────┬────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          Parallel Validation                                │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │    Build     │  │    Lint      │  │    Test      │  │   Coverage   │   │
│  │   Validator  │  │  Validator   │  │  Validator   │  │  Validator   │   │
│  │              │  │              │  │              │  │              │   │
│  │ TypeScript   │  │ Biome/ESLint │  │ Vitest/Jest  │  │ c8/Istanbul  │   │
│  │ tsc --noEmit │  │ biome check  │  │ npm test     │  │ coverage %   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │            │
│         └─────────────────┴────────┬────────┴─────────────────┘            │
│                                    │                                       │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     │
                                     ▼
                            ┌────────────────┐
                            │   Aggregator   │
                            │                │
                            │ Combine Results│
                            │ Calculate Score│
                            └───────┬────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                    All Passed            Some Failed
                         │                     │
                         ▼                     ▼
                  ┌────────────┐        ┌────────────┐
                  │  Complete  │        │  Auto-Fix  │
                  │   Task     │        │   Engine   │
                  └────────────┘        └────────────┘
```

## Komponenty

### 1. Validation Orchestrator

```typescript
// packages/core/src/validation/validation-orchestrator.ts
export class ValidationOrchestrator {
  private validators: Map<string, Validator> = new Map();

  constructor(config: ValidationConfig) {
    // Register validators based on config
    if (config.requireBuild) {
      this.validators.set('build', new BuildValidator(config.build));
    }
    if (config.requireLint) {
      this.validators.set('lint', new LintValidator(config.lint));
    }
    if (config.requireTests) {
      this.validators.set('test', new TestValidator(config.test));
    }
    if (config.minCoverage > 0) {
      this.validators.set('coverage', new CoverageValidator(config.coverage));
    }
  }

  async validate(context: TaskContext): Promise<ValidationResult> {
    const startTime = Date.now();

    // Pre-validation quick checks
    const preCheck = await this.preValidate(context);
    if (!preCheck.canProceed) {
      return {
        passed: false,
        checks: [preCheck.result],
        duration: Date.now() - startTime,
        score: 0,
      };
    }

    // Run validators in parallel
    const results = await Promise.all(
      Array.from(this.validators.entries()).map(async ([name, validator]) => {
        const result = await validator.validate(context);
        return { name, result };
      })
    );

    // Aggregate results
    const checks = results.map(r => ({
      name: r.name,
      ...r.result,
    }));

    const passed = checks.every(c => c.passed);
    const score = this.calculateScore(checks);

    return {
      passed,
      checks,
      duration: Date.now() - startTime,
      score,
    };
  }

  private async preValidate(context: TaskContext): Promise<PreValidationResult> {
    // Check if package.json exists
    const hasPackageJson = await this.fileExists(
      path.join(context.workspacePath, 'package.json')
    );

    if (!hasPackageJson) {
      return {
        canProceed: false,
        result: {
          name: 'pre-check',
          passed: false,
          message: 'No package.json found',
        },
      };
    }

    // Check if node_modules exists, run install if needed
    const hasNodeModules = await this.fileExists(
      path.join(context.workspacePath, 'node_modules')
    );

    if (!hasNodeModules) {
      await this.runInstall(context);
    }

    return { canProceed: true };
  }

  private calculateScore(checks: ValidationCheck[]): number {
    const weights: Record<string, number> = {
      build: 30,
      lint: 20,
      test: 35,
      coverage: 15,
    };

    let totalWeight = 0;
    let weightedScore = 0;

    for (const check of checks) {
      const weight = weights[check.name] || 10;
      totalWeight += weight;
      weightedScore += check.passed ? weight : 0;
    }

    return Math.round((weightedScore / totalWeight) * 100);
  }
}
```

### 2. Build Validator

```typescript
// packages/core/src/validation/validators/build-validator.ts
export class BuildValidator implements Validator {
  constructor(private config: BuildValidatorConfig) {}

  async validate(context: TaskContext): Promise<ValidatorResult> {
    const startTime = Date.now();

    try {
      // Detect build system
      const buildCommand = await this.detectBuildCommand(context);

      // Run build
      const result = await this.executor.run(buildCommand, {
        cwd: context.workspacePath,
        timeout: this.config.timeout || 300000, // 5 min default
        env: {
          NODE_ENV: 'production',
          CI: 'true',
        },
      });

      const passed = result.exitCode === 0;

      return {
        passed,
        message: passed ? 'Build successful' : 'Build failed',
        output: result.output,
        errors: passed ? [] : this.parseErrors(result.output),
        duration: Date.now() - startTime,
        metadata: {
          command: buildCommand,
          exitCode: result.exitCode,
        },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Build error: ${error.message}`,
        errors: [{ message: error.message }],
        duration: Date.now() - startTime,
      };
    }
  }

  private async detectBuildCommand(context: TaskContext): Promise<string> {
    const packageJson = await this.readPackageJson(context);

    // Check for build script
    if (packageJson.scripts?.build) {
      return 'npm run build';
    }

    // Check for TypeScript
    if (packageJson.devDependencies?.typescript || packageJson.dependencies?.typescript) {
      return 'npx tsc --noEmit';
    }

    // Default to type check only
    return 'npx tsc --noEmit';
  }

  private parseErrors(output: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // TypeScript error pattern
    const tsErrorRegex = /(.+)\((\d+),(\d+)\): error TS(\d+): (.+)/g;
    let match;

    while ((match = tsErrorRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: `TS${match[4]}`,
        message: match[5],
        severity: 'error',
      });
    }

    return errors;
  }
}
```

### 3. Test Validator

```typescript
// packages/core/src/validation/validators/test-validator.ts
export class TestValidator implements Validator {
  constructor(private config: TestValidatorConfig) {}

  async validate(context: TaskContext): Promise<ValidatorResult> {
    const startTime = Date.now();

    try {
      // Detect test framework
      const testCommand = await this.detectTestCommand(context);

      // Run tests with JSON reporter for parsing
      const result = await this.executor.run(testCommand, {
        cwd: context.workspacePath,
        timeout: this.config.timeout || 600000, // 10 min default
        env: {
          CI: 'true',
          FORCE_COLOR: '0',
        },
      });

      // Parse test results
      const testResults = this.parseTestResults(result.output, context);

      const passed = result.exitCode === 0 && testResults.failed === 0;

      return {
        passed,
        message: this.formatMessage(testResults),
        output: result.output,
        errors: testResults.failures.map(f => ({
          file: f.file,
          message: f.message,
          severity: 'error',
        })),
        duration: Date.now() - startTime,
        metadata: {
          total: testResults.total,
          passed: testResults.passed,
          failed: testResults.failed,
          skipped: testResults.skipped,
        },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Test error: ${error.message}`,
        errors: [{ message: error.message }],
        duration: Date.now() - startTime,
      };
    }
  }

  private async detectTestCommand(context: TaskContext): Promise<string> {
    const packageJson = await this.readPackageJson(context);

    // Check for test script
    if (packageJson.scripts?.test) {
      // Vitest
      if (packageJson.devDependencies?.vitest) {
        return 'npx vitest run --reporter=json';
      }
      // Jest
      if (packageJson.devDependencies?.jest) {
        return 'npx jest --json --outputFile=test-results.json';
      }
      // Default
      return 'npm test';
    }

    throw new Error('No test script found in package.json');
  }

  private formatMessage(results: TestResults): string {
    if (results.failed === 0) {
      return `All ${results.passed} tests passed`;
    }
    return `${results.failed}/${results.total} tests failed`;
  }
}
```

### 4. Lint Validator

```typescript
// packages/core/src/validation/validators/lint-validator.ts
export class LintValidator implements Validator {
  constructor(private config: LintValidatorConfig) {}

  async validate(context: TaskContext): Promise<ValidatorResult> {
    const startTime = Date.now();

    try {
      // Detect linter
      const lintCommand = await this.detectLintCommand(context);

      // Run linter
      const result = await this.executor.run(lintCommand, {
        cwd: context.workspacePath,
        timeout: this.config.timeout || 120000, // 2 min default
      });

      // Parse lint results
      const lintResults = this.parseLintResults(result.output, context);

      // Determine pass/fail based on config
      const passed = this.config.allowWarnings
        ? lintResults.errors === 0
        : lintResults.errors === 0 && lintResults.warnings === 0;

      return {
        passed,
        message: this.formatMessage(lintResults),
        output: result.output,
        errors: lintResults.issues.map(i => ({
          file: i.file,
          line: i.line,
          column: i.column,
          message: i.message,
          severity: i.severity,
          rule: i.rule,
        })),
        duration: Date.now() - startTime,
        metadata: {
          errors: lintResults.errors,
          warnings: lintResults.warnings,
          fixable: lintResults.fixable,
        },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Lint error: ${error.message}`,
        errors: [{ message: error.message }],
        duration: Date.now() - startTime,
      };
    }
  }

  private async detectLintCommand(context: TaskContext): Promise<string> {
    const packageJson = await this.readPackageJson(context);

    // Check for lint script
    if (packageJson.scripts?.lint) {
      return 'npm run lint -- --format json';
    }

    // Check for Biome
    if (packageJson.devDependencies?.['@biomejs/biome']) {
      return 'npx biome check --reporter=json .';
    }

    // Check for ESLint
    if (packageJson.devDependencies?.eslint) {
      return 'npx eslint --format json .';
    }

    throw new Error('No linter configured');
  }
}
```

### 5. Coverage Validator

```typescript
// packages/core/src/validation/validators/coverage-validator.ts
export class CoverageValidator implements Validator {
  constructor(private config: CoverageValidatorConfig) {}

  async validate(context: TaskContext): Promise<ValidatorResult> {
    const startTime = Date.now();

    try {
      // Run tests with coverage
      const coverageCommand = await this.detectCoverageCommand(context);

      const result = await this.executor.run(coverageCommand, {
        cwd: context.workspacePath,
        timeout: this.config.timeout || 600000,
      });

      // Parse coverage report
      const coverage = await this.parseCoverageReport(context);

      const passed = coverage.total >= this.config.minCoverage;

      return {
        passed,
        message: `Coverage: ${coverage.total}% (minimum: ${this.config.minCoverage}%)`,
        output: result.output,
        errors: passed ? [] : [{
          message: `Coverage ${coverage.total}% is below minimum ${this.config.minCoverage}%`,
          severity: 'error',
        }],
        duration: Date.now() - startTime,
        metadata: {
          lines: coverage.lines,
          branches: coverage.branches,
          functions: coverage.functions,
          statements: coverage.statements,
          total: coverage.total,
        },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Coverage error: ${error.message}`,
        errors: [{ message: error.message }],
        duration: Date.now() - startTime,
      };
    }
  }

  private async parseCoverageReport(context: TaskContext): Promise<CoverageReport> {
    // Try to read coverage-summary.json
    const summaryPath = path.join(
      context.workspacePath,
      'coverage',
      'coverage-summary.json'
    );

    const summary = await this.readJson(summaryPath);
    const total = summary.total;

    return {
      lines: total.lines.pct,
      branches: total.branches.pct,
      functions: total.functions.pct,
      statements: total.statements.pct,
      total: Math.round(
        (total.lines.pct + total.branches.pct + total.functions.pct + total.statements.pct) / 4
      ),
    };
  }
}
```

## Auto-Fix Engine

```typescript
// packages/core/src/validation/auto-fix-engine.ts
export class AutoFixEngine {
  private fixStrategies: Map<string, FixStrategy> = new Map([
    ['build', new BuildFixStrategy()],
    ['lint', new LintFixStrategy()],
    ['test', new TestFixStrategy()],
    ['coverage', new CoverageFixStrategy()],
  ]);

  async fix(
    validationResult: ValidationResult,
    context: TaskContext
  ): Promise<FixResult> {
    const failedChecks = validationResult.checks.filter(c => !c.passed);

    for (const check of failedChecks) {
      const strategy = this.fixStrategies.get(check.name);
      if (!strategy) continue;

      for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
        // Generate fix
        const fix = await strategy.generateFix(check, context);

        // Apply fix
        await this.applyFix(fix, context);

        // Re-validate this specific check
        const revalidation = await this.revalidate(check.name, context);

        if (revalidation.passed) {
          this.logger.info(`Fixed ${check.name} on attempt ${attempt + 1}`);
          break;
        }

        // Learn from failure for next attempt
        context.addAttempt(check.name, { fix, result: revalidation });
      }
    }

    // Final validation
    return this.orchestrator.validate(context);
  }
}

// Fix strategies
export class LintFixStrategy implements FixStrategy {
  async generateFix(check: ValidationCheck, context: TaskContext): Promise<Fix> {
    // Try auto-fix first
    if (check.metadata?.fixable > 0) {
      return {
        type: 'command',
        command: 'npm run lint -- --fix',
      };
    }

    // Use AI to fix unfixable issues
    return {
      type: 'ai',
      prompt: this.buildFixPrompt(check, context),
    };
  }

  private buildFixPrompt(check: ValidationCheck, context: TaskContext): string {
    return `Fix the following lint errors:

${check.errors.map(e => `- ${e.file}:${e.line} - ${e.message} (${e.rule})`).join('\n')}

Rules to follow:
1. Fix only the reported issues
2. Don't change unrelated code
3. Maintain existing code style`;
  }
}

export class TestFixStrategy implements FixStrategy {
  async generateFix(check: ValidationCheck, context: TaskContext): Promise<Fix> {
    const failures = check.errors;

    return {
      type: 'ai',
      prompt: `Fix the following test failures:

${failures.map(f => `Test: ${f.file}
Error: ${f.message}`).join('\n\n')}

Context:
- Look at the test expectations
- Check if the implementation is wrong or the test is wrong
- Fix the implementation if the test expectations are correct
- Fix the test if the implementation is correct and test is outdated`,
    };
  }
}
```

## Konfigurace

```yaml
# ado.config.yaml
validation:
  # Build validation
  build:
    enabled: true
    timeout: 300000  # 5 min
    failOnWarnings: false

  # Lint validation
  lint:
    enabled: true
    timeout: 120000  # 2 min
    allowWarnings: true
    autoFix: true

  # Test validation
  test:
    enabled: true
    timeout: 600000  # 10 min
    minPassRate: 100  # All tests must pass
    allowSkipped: true

  # Coverage validation
  coverage:
    enabled: true
    minCoverage: 80
    perFile: false
    thresholds:
      lines: 80
      branches: 70
      functions: 80
      statements: 80

  # Auto-fix settings
  autoFix:
    enabled: true
    maxAttempts: 3
    enabledFor:
      - lint
      - test
      - build

  # Custom validators
  custom:
    - name: security
      command: npm audit --audit-level=high
      failOnError: true
    - name: types
      command: npx tsc --noEmit
      failOnError: true
```

## Validační report

```typescript
interface ValidationReport {
  taskId: string;
  timestamp: Date;
  duration: number;
  passed: boolean;
  score: number;

  checks: {
    build: {
      passed: boolean;
      duration: number;
      errors: number;
    };
    lint: {
      passed: boolean;
      duration: number;
      errors: number;
      warnings: number;
      fixed: number;
    };
    test: {
      passed: boolean;
      duration: number;
      total: number;
      passed: number;
      failed: number;
      skipped: number;
    };
    coverage: {
      passed: boolean;
      lines: number;
      branches: number;
      functions: number;
      statements: number;
      total: number;
    };
  };

  autoFix: {
    attempted: boolean;
    successful: boolean;
    attempts: number;
    fixedIssues: string[];
  };

  artifacts: {
    testReport: string;
    coverageReport: string;
    lintReport: string;
  };
}
```

## CLI Commands

```bash
# Manuální validace
ado validate

# Validace s auto-fix
ado validate --fix

# Pouze konkrétní validátor
ado validate --only build,test

# Přeskočení validátorů
ado validate --skip lint

# Zobrazení detailního reportu
ado validate --verbose

# Export reportu
ado validate --report json > validation-report.json
```

## Metriky

```prometheus
# Validation metrics
ado_validation_duration_seconds{check} histogram
ado_validation_passed_total{check} counter
ado_validation_failed_total{check} counter
ado_validation_score gauge

# Auto-fix metrics
ado_autofix_attempts_total{check} counter
ado_autofix_success_total{check} counter
ado_autofix_duration_seconds histogram

# Coverage metrics
ado_coverage_percent{type} gauge
```

---

## Souvislosti

- [FR-005: Quality Assurance](../../02-requirements/01-functional/FR-005-quality-assurance.md)
- [Doc-First Pipeline](./doc-first-pipeline.md)
- [Task Decomposition](./task-decomposition.md)
- [M8: Autonomous Workflow](../../08-implementation/milestones/M8-autonomous-workflow.md)
