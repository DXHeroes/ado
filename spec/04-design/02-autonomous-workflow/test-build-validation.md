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

## Language-Specific Quality Gates

### TypeScript

```typescript
// packages/core/src/validation/languages/typescript-validator.ts
export class TypeScriptValidator implements LanguageValidator {
  async validate(context: TaskContext): Promise<LanguageValidationResult> {
    const gates = [
      { name: 'typecheck', command: 'npx tsc --noEmit', parallel: true },
      { name: 'lint', command: 'npx eslint . --ext .ts,.tsx', parallel: true },
      { name: 'format', command: 'npx prettier --check .', parallel: true },
      { name: 'test', command: 'npx vitest run || npx jest', parallel: false },
    ];

    // Run parallel gates first
    const parallelGates = gates.filter(g => g.parallel);
    const sequentialGates = gates.filter(g => !g.parallel);

    const parallelResults = await Promise.all(
      parallelGates.map(g => this.runGate(g, context))
    );

    // Run sequential gates if parallel passed
    const allParallelPassed = parallelResults.every(r => r.passed);
    if (!allParallelPassed) {
      return { passed: false, results: parallelResults };
    }

    const sequentialResults = [];
    for (const gate of sequentialGates) {
      const result = await this.runGate(gate, context);
      sequentialResults.push(result);
      if (!result.passed) break; // Stop on first failure
    }

    return {
      passed: [...parallelResults, ...sequentialResults].every(r => r.passed),
      results: [...parallelResults, ...sequentialResults],
      coverage: await this.getCoverage(context),
    };
  }

  private async getCoverage(context: TaskContext): Promise<number> {
    // Parse coverage from coverage-summary.json or vitest output
    const summaryPath = path.join(context.workspacePath, 'coverage/coverage-summary.json');
    if (await fileExists(summaryPath)) {
      const summary = JSON.parse(await readFile(summaryPath, 'utf-8'));
      return summary.total.lines.pct;
    }
    return 0;
  }
}

// Quality gate thresholds
export const TypeScriptThresholds = {
  coverage: {
    lines: 80,
    branches: 80,
    functions: 80,
    statements: 80,
  },
  lint: {
    maxErrors: 0,
    maxWarnings: 10, // Warnings allowed, errors not
  },
};
```

### Python

```typescript
// packages/core/src/validation/languages/python-validator.ts
export class PythonValidator implements LanguageValidator {
  async validate(context: TaskContext): Promise<LanguageValidationResult> {
    const gates = [
      // Type checking (parallel)
      {
        name: 'typecheck',
        command: 'mypy --strict . || pyright',
        parallel: true,
      },
      // Linting (parallel) - Ruff is all-in-one linter
      {
        name: 'lint',
        command: 'ruff check . --select ALL',
        parallel: true,
      },
      // Formatting (parallel)
      {
        name: 'format',
        command: 'ruff format --check .',
        parallel: true,
      },
      // Tests (sequential, after parallel gates pass)
      {
        name: 'test',
        command: 'pytest --cov --cov-report=json',
        parallel: false,
      },
    ];

    return await this.runGatesStrategy(gates, context);
  }

  private async getCoverage(context: TaskContext): Promise<number> {
    // Parse coverage.json from pytest-cov
    const coveragePath = path.join(context.workspacePath, 'coverage.json');
    if (await fileExists(coveragePath)) {
      const coverage = JSON.parse(await readFile(coveragePath, 'utf-8'));
      return coverage.totals.percent_covered;
    }
    return 0;
  }

  private parseErrors(output: string): StructuredError[] {
    // Parse mypy/pyright errors
    // Format: file.py:10: error: Message [error-code]
    const errors: StructuredError[] = [];
    const regex = /^(.+):(\d+):(?:(\d+):)?\s+(error|warning):\s+(.+?)(?:\s+\[(.+?)\])?$/gm;

    let match;
    while ((match = regex.exec(output)) !== null) {
      errors.push({
        tool: 'mypy',
        type: 'typecheck',
        file: match[1],
        line: parseInt(match[2]),
        column: match[3] ? parseInt(match[3]) : undefined,
        message: match[5],
        code: match[6],
        severity: match[4] as 'error' | 'warning',
        context: this.getLineContext(match[1], parseInt(match[2])),
      });
    }

    return errors;
  }
}

// Quality gate thresholds
export const PythonThresholds = {
  coverage: {
    lines: 80,
    branches: 70, // Python branches harder to cover
  },
  lint: {
    maxErrors: 0,
    maxWarnings: 0, // Ruff --select ALL is strict
  },
  typecheck: {
    strictMode: true, // mypy --strict
  },
};
```

### Go

```typescript
// packages/core/src/validation/languages/go-validator.ts
export class GoValidator implements LanguageValidator {
  async validate(context: TaskContext): Promise<LanguageValidationResult> {
    const gates = [
      // Build (parallel)
      {
        name: 'build',
        command: 'go build ./...',
        parallel: true,
      },
      // Lint (parallel)
      {
        name: 'lint',
        command: 'golangci-lint run',
        parallel: true,
      },
      // Format check (parallel)
      {
        name: 'format',
        command: 'gofmt -l .',
        parallel: true,
      },
      // Tests with coverage (sequential)
      {
        name: 'test',
        command: 'go test -v -race -coverprofile=coverage.out ./...',
        parallel: false,
      },
    ];

    return await this.runGatesStrategy(gates, context);
  }

  private async getCoverage(context: TaskContext): Promise<number> {
    // Parse coverage.out
    const result = await exec('go tool cover -func=coverage.out', {
      cwd: context.workspacePath,
    });

    // Last line: total:   (statements)   82.5%
    const match = result.stdout.match(/total:\s+\(statements\)\s+([\d.]+)%/);
    return match ? parseFloat(match[1]) : 0;
  }

  private parseErrors(output: string, tool: string): StructuredError[] {
    const errors: StructuredError[] = [];

    if (tool === 'build') {
      // Go build errors: file.go:10:5: message
      const regex = /^(.+\.go):(\d+):(\d+):\s+(.+)$/gm;
      let match;
      while ((match = regex.exec(output)) !== null) {
        errors.push({
          tool: 'go build',
          type: 'build',
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          message: match[4],
          severity: 'error',
        });
      }
    } else if (tool === 'format') {
      // gofmt outputs file names of incorrectly formatted files
      const files = output.trim().split('\n').filter(Boolean);
      for (const file of files) {
        errors.push({
          tool: 'gofmt',
          type: 'format',
          file,
          message: 'File not formatted with gofmt',
          severity: 'error',
        });
      }
    }

    return errors;
  }
}

// Quality gate thresholds
export const GoThresholds = {
  coverage: {
    statements: 80,
  },
  lint: {
    maxIssues: 0,
  },
  format: {
    enforceGofmt: true,
  },
};
```

### Rust

```typescript
// packages/core/src/validation/languages/rust-validator.ts
export class RustValidator implements LanguageValidator {
  async validate(context: TaskContext): Promise<LanguageValidationResult> {
    const gates = [
      // Type check (parallel)
      {
        name: 'check',
        command: 'cargo check --all-targets',
        parallel: true,
      },
      // Lint (parallel) - clippy with deny warnings
      {
        name: 'lint',
        command: 'cargo clippy --all-targets -- -D warnings',
        parallel: true,
      },
      // Format check (parallel)
      {
        name: 'format',
        command: 'cargo fmt --check',
        parallel: true,
      },
      // Tests with coverage (sequential)
      {
        name: 'test',
        command: 'cargo test',
        parallel: false,
      },
      // Coverage via tarpaulin (sequential, optional)
      {
        name: 'coverage',
        command: 'cargo tarpaulin --out Json',
        parallel: false,
        optional: true,
      },
    ];

    return await this.runGatesStrategy(gates, context);
  }

  private async getCoverage(context: TaskContext): Promise<number> {
    // Parse tarpaulin JSON output
    const coveragePath = path.join(context.workspacePath, 'tarpaulin-report.json');
    if (await fileExists(coveragePath)) {
      const report = JSON.parse(await readFile(coveragePath, 'utf-8'));
      return report.coverage; // Overall percentage
    }
    return 0;
  }

  private parseErrors(output: string, tool: string): StructuredError[] {
    const errors: StructuredError[] = [];

    // Rust compiler errors: error[E0308]: message --> file.rs:10:5
    const regex = /^(error|warning)\[([^\]]+)\]:\s*(.+?)\n\s*-->\s*(.+):(\d+):(\d+)/gm;

    let match;
    while ((match = regex.exec(output)) !== null) {
      errors.push({
        tool: tool === 'check' ? 'rustc' : 'clippy',
        type: tool,
        file: match[4],
        line: parseInt(match[5]),
        column: parseInt(match[6]),
        message: match[3],
        code: match[2],
        severity: match[1] as 'error' | 'warning',
      });
    }

    return errors;
  }
}

// Quality gate thresholds
export const RustThresholds = {
  coverage: {
    lines: 80,
  },
  lint: {
    denyWarnings: true, // -D warnings
  },
  format: {
    enforceRustfmt: true,
  },
};
```

### Java

```typescript
// packages/core/src/validation/languages/java-validator.ts
export class JavaValidator implements LanguageValidator {
  async validate(context: TaskContext): Promise<LanguageValidationResult> {
    // Detect build system
    const buildSystem = await this.detectBuildSystem(context);

    const gates = buildSystem === 'maven'
      ? this.getMavenGates()
      : this.getGradleGates();

    return await this.runGatesStrategy(gates, context);
  }

  private getMavenGates(): QualityGate[] {
    return [
      // Compile (parallel)
      {
        name: 'compile',
        command: 'mvn clean compile',
        parallel: true,
      },
      // Checkstyle (parallel)
      {
        name: 'lint',
        command: 'mvn checkstyle:check',
        parallel: true,
      },
      // SpotBugs (parallel)
      {
        name: 'bugs',
        command: 'mvn spotbugs:check',
        parallel: true,
      },
      // Tests (sequential)
      {
        name: 'test',
        command: 'mvn test',
        parallel: false,
      },
      // Coverage via JaCoCo (sequential)
      {
        name: 'coverage',
        command: 'mvn jacoco:check',
        parallel: false,
      },
    ];
  }

  private getGradleGates(): QualityGate[] {
    return [
      // Compile (parallel)
      {
        name: 'compile',
        command: './gradlew compileJava',
        parallel: true,
      },
      // Checkstyle (parallel)
      {
        name: 'lint',
        command: './gradlew checkstyleMain',
        parallel: true,
      },
      // SpotBugs (parallel)
      {
        name: 'bugs',
        command: './gradlew spotbugsMain',
        parallel: true,
      },
      // Tests (sequential)
      {
        name: 'test',
        command: './gradlew test',
        parallel: false,
      },
      // Coverage (sequential)
      {
        name: 'coverage',
        command: './gradlew jacocoTestCoverageVerification',
        parallel: false,
      },
    ];
  }

  private async getCoverage(context: TaskContext): Promise<number> {
    // Parse JaCoCo XML report
    const reportPath = path.join(
      context.workspacePath,
      'target/site/jacoco/jacoco.xml'
    );

    if (await fileExists(reportPath)) {
      const xml = await readFile(reportPath, 'utf-8');
      // Parse XML and extract coverage percentage
      const match = xml.match(/<counter type="LINE".*?covered="(\d+)".*?missed="(\d+)"/);
      if (match) {
        const covered = parseInt(match[1]);
        const missed = parseInt(match[2]);
        return Math.round((covered / (covered + missed)) * 100);
      }
    }

    return 0;
  }
}

// Quality gate thresholds
export const JavaThresholds = {
  coverage: {
    line: 80,
    branch: 70,
    instruction: 80,
  },
  checkstyle: {
    maxViolations: 0,
  },
  spotbugs: {
    maxBugs: 0,
    includeFilterFile: 'spotbugs-include.xml',
  },
};
```

## Structured Error Feedback

```typescript
// packages/core/src/validation/error-feedback.ts
export interface StructuredError {
  // Tool metadata
  tool: string; // 'tsc', 'eslint', 'mypy', 'cargo clippy', etc.
  type: 'typecheck' | 'lint' | 'test' | 'build' | 'format' | 'coverage';

  // Location
  file: string;
  line?: number;
  column?: number;

  // Error details
  message: string;
  code?: string; // Error code like 'TS2345', 'E0308'
  severity: 'error' | 'warning';

  // Context for AI
  context?: string; // Surrounding code lines
  suggestion?: string; // Auto-fix suggestion if available
}

export class ErrorFeedbackFormatter {
  /**
   * Format errors for AI consumption
   * CRITICAL: This format helps AI understand and fix issues effectively
   */
  format(
    errors: StructuredError[],
    iteration: number,
    maxIterations: number
  ): string {
    const grouped = this.groupByFile(errors);

    let feedback = `# Validation Failed (Iteration ${iteration}/${maxIterations})\n\n`;

    // Summary
    feedback += `## Summary\n\n`;
    feedback += `- Total errors: ${errors.length}\n`;
    feedback += `- Files affected: ${Object.keys(grouped).length}\n`;
    feedback += `- Error types: ${this.countByType(errors)}\n\n`;

    // Detailed errors by file
    feedback += `## Errors by File\n\n`;

    for (const [file, fileErrors] of Object.entries(grouped)) {
      feedback += `### ${file}\n\n`;

      for (const error of fileErrors) {
        feedback += `**[${error.tool}] ${error.type} ${error.severity}**\n`;
        feedback += `- Location: Line ${error.line}${error.column ? `:${error.column}` : ''}\n`;
        if (error.code) {
          feedback += `- Code: ${error.code}\n`;
        }
        feedback += `- Message: ${error.message}\n`;

        if (error.context) {
          feedback += `\n\`\`\`\n${error.context}\n\`\`\`\n`;
        }

        if (error.suggestion) {
          feedback += `\n**Suggestion:** ${error.suggestion}\n`;
        }

        feedback += `\n`;
      }
    }

    // Positive signal: which checks passed
    feedback += `## Passed Checks\n\n`;
    feedback += this.getPassedChecks();
    feedback += `\n`;

    // Iteration budget
    const remaining = maxIterations - iteration;
    feedback += `## Budget\n\n`;
    feedback += `- Iterations remaining: ${remaining}\n`;
    feedback += `- Escalation at: ${maxIterations} iterations or 3 identical errors\n\n`;

    return feedback;
  }

  private groupByFile(errors: StructuredError[]): Record<string, StructuredError[]> {
    const grouped: Record<string, StructuredError[]> = {};

    for (const error of errors) {
      if (!grouped[error.file]) {
        grouped[error.file] = [];
      }
      grouped[error.file].push(error);
    }

    return grouped;
  }

  private countByType(errors: StructuredError[]): string {
    const counts = errors.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
  }
}
```

## Stuck Detection

```typescript
// packages/core/src/validation/stuck-detector.ts
export class StuckDetector {
  private errorHistory: string[][] = []; // Per iteration

  /**
   * Detect if agent is stuck (same error 3+ times)
   * Threshold from OpenHands research
   */
  detectStuck(currentErrors: StructuredError[]): boolean {
    const errorSignature = this.computeErrorSignature(currentErrors);
    this.errorHistory.push(errorSignature);

    if (this.errorHistory.length < 3) {
      return false;
    }

    // Check last 3 iterations
    const lastThree = this.errorHistory.slice(-3);

    // Exact match: same errors 3 times
    const exactMatch = lastThree.every(
      (signature, i) =>
        i === 0 || this.areSignaturesEqual(signature, lastThree[i - 1])
    );

    if (exactMatch) {
      return true;
    }

    // Semantic similarity: ~90% same errors
    const similarity = this.computeSimilarity(lastThree[0], lastThree[2]);
    return similarity > 0.9;
  }

  private computeErrorSignature(errors: StructuredError[]): string[] {
    return errors.map(e => {
      // Create signature: file:line:type:message
      return `${e.file}:${e.line}:${e.type}:${e.message}`;
    });
  }

  private areSignaturesEqual(sig1: string[], sig2: string[]): boolean {
    if (sig1.length !== sig2.length) return false;

    const sorted1 = [...sig1].sort();
    const sorted2 = [...sig2].sort();

    return sorted1.every((s, i) => s === sorted2[i]);
  }

  private computeSimilarity(sig1: string[], sig2: string[]): number {
    const set1 = new Set(sig1);
    const set2 = new Set(sig2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Get escalation recommendation
   */
  getEscalationStrategy(iteration: number): EscalationStrategy {
    if (iteration < 3) {
      return {
        action: 'retry',
        reason: 'Early iteration, retry with prompt variation',
      };
    }

    if (iteration < 5) {
      return {
        action: 'different_approach',
        reason: 'Multiple failures, try different implementation approach',
      };
    }

    if (iteration < 7) {
      return {
        action: 'partial_completion',
        reason: 'Extended failures, accept partial completion with TODOs',
      };
    }

    return {
      action: 'human_escalation',
      reason: 'Stuck state detected, escalate to human with detailed context',
    };
  }
}
```

## Parallel Execution Strategy

```typescript
// packages/core/src/validation/parallel-executor.ts
export class ParallelGateExecutor {
  /**
   * Execute quality gates with optimal parallelization
   *
   * Strategy:
   * - Run independent gates in parallel (typecheck, lint, format)
   * - Run dependent gates sequentially (test after build)
   * - Stop early if critical gates fail
   */
  async executeGates(
    gates: QualityGate[],
    context: TaskContext
  ): Promise<GateExecutionResult> {
    const parallelGates = gates.filter(g => g.parallel);
    const sequentialGates = gates.filter(g => !g.parallel);

    console.log(`Executing ${parallelGates.length} gates in parallel...`);

    const startTime = Date.now();

    // Phase 1: Parallel execution
    const parallelResults = await Promise.allSettled(
      parallelGates.map(gate => this.executeGate(gate, context))
    );

    const parallelPassed = parallelResults.every(
      r => r.status === 'fulfilled' && r.value.passed
    );

    if (!parallelPassed) {
      return {
        passed: false,
        results: this.extractResults(parallelResults),
        duration: Date.now() - startTime,
        phase: 'parallel',
      };
    }

    // Phase 2: Sequential execution
    console.log(`Parallel gates passed, executing ${sequentialGates.length} sequential gates...`);

    const sequentialResults = [];

    for (const gate of sequentialGates) {
      const result = await this.executeGate(gate, context);
      sequentialResults.push(result);

      if (!result.passed && !gate.optional) {
        // Stop on first critical failure
        break;
      }
    }

    const allResults = [
      ...this.extractResults(parallelResults),
      ...sequentialResults,
    ];

    return {
      passed: allResults.every(r => r.passed || r.optional),
      results: allResults,
      duration: Date.now() - startTime,
      phase: 'complete',
    };
  }

  private async executeGate(
    gate: QualityGate,
    context: TaskContext
  ): Promise<GateResult> {
    const startTime = Date.now();

    try {
      const result = await exec(gate.command, {
        cwd: context.workspacePath,
        timeout: gate.timeout || 300000,
      });

      const passed = result.exitCode === 0;

      return {
        name: gate.name,
        passed,
        duration: Date.now() - startTime,
        errors: passed ? [] : this.parseErrors(result.stderr, gate.name),
        optional: gate.optional || false,
      };
    } catch (error) {
      return {
        name: gate.name,
        passed: false,
        duration: Date.now() - startTime,
        errors: [{ message: error.message, severity: 'error' }],
        optional: gate.optional || false,
      };
    }
  }
}
```

## Configuration per Language

```yaml
# ado.config.yaml
validation:
  # Language detection (auto-detect from files)
  languageDetection:
    enabled: true
    primaryLanguage: auto  # or typescript, python, go, rust, java

  # TypeScript quality gates
  typescript:
    typecheck:
      enabled: true
      command: npx tsc --noEmit
      parallel: true
    lint:
      enabled: true
      command: npx eslint . --ext .ts,.tsx
      parallel: true
    format:
      enabled: true
      command: npx prettier --check .
      parallel: true
    test:
      enabled: true
      command: npx vitest run || npx jest
      parallel: false
    coverage:
      enabled: true
      threshold: 80

  # Python quality gates
  python:
    typecheck:
      enabled: true
      command: mypy --strict . || pyright
      parallel: true
    lint:
      enabled: true
      command: ruff check . --select ALL
      parallel: true
    format:
      enabled: true
      command: ruff format --check .
      parallel: true
    test:
      enabled: true
      command: pytest --cov --cov-report=json
      parallel: false
    coverage:
      enabled: true
      threshold: 80

  # Go quality gates
  go:
    build:
      enabled: true
      command: go build ./...
      parallel: true
    lint:
      enabled: true
      command: golangci-lint run
      parallel: true
    format:
      enabled: true
      command: gofmt -l .
      parallel: true
    test:
      enabled: true
      command: go test -v -race -coverprofile=coverage.out ./...
      parallel: false
    coverage:
      enabled: true
      threshold: 80

  # Rust quality gates
  rust:
    check:
      enabled: true
      command: cargo check --all-targets
      parallel: true
    lint:
      enabled: true
      command: cargo clippy --all-targets -- -D warnings
      parallel: true
    format:
      enabled: true
      command: cargo fmt --check
      parallel: true
    test:
      enabled: true
      command: cargo test
      parallel: false
    coverage:
      enabled: true
      command: cargo tarpaulin --out Json
      threshold: 80
      optional: true  # tarpaulin not always installed

  # Java quality gates
  java:
    buildSystem: auto  # maven or gradle
    compile:
      enabled: true
      parallel: true
    checkstyle:
      enabled: true
      parallel: true
    spotbugs:
      enabled: true
      parallel: true
    test:
      enabled: true
      parallel: false
    coverage:
      enabled: true
      threshold: 80
      tool: jacoco

  # Iteration settings
  iteration:
    maxAttempts: 10
    stuckDetection:
      enabled: true
      threshold: 3  # Same error 3 times → stuck
      similarity: 0.9  # 90% similar errors → stuck
```

---

## Souvislosti

- [FR-005: Quality Assurance](../../02-requirements/01-functional/FR-005-quality-assurance.md)
- [Doc-First Pipeline](./doc-first-pipeline.md)
- [Task Decomposition](./task-decomposition.md)
- [Temporal Workflows](./temporal-workflows.md)
- [M8: Autonomous Workflow](../../08-implementation/milestones/M8-autonomous-workflow.md)
