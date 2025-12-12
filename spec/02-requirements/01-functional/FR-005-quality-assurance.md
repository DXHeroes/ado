# FR-005: Quality Assurance

## Přehled

ADO musí garantovat kvalitu výstupu prostřednictvím automatických quality gates. Úkol není považován za dokončený, dokud neprojde všemi konfigurovatelými kontrolami kvality.

## Požadavky

### FR-005.1: Build validation

**Popis:** Výstup se musí úspěšně zbuildovat.

**Akceptační kritéria:**
- [ ] Automatická detekce build systému (npm, pnpm, yarn, etc.)
- [ ] Spuštění build příkazu
- [ ] Parsování build výstupu pro errory
- [ ] Retry při transient failures
- [ ] Reporting build metrik (čas, velikost)

**Build detection:**
```typescript
interface BuildConfig {
  detect(): Promise<BuildSystem>;
  getBuildCommand(): string;
  parseBuildOutput(output: string): BuildResult;
}

type BuildSystem =
  | { type: 'npm'; command: 'npm run build' }
  | { type: 'pnpm'; command: 'pnpm build' }
  | { type: 'make'; command: 'make' }
  | { type: 'custom'; command: string };
```

### FR-005.2: Test execution

**Popis:** Všechny testy musí projít.

**Akceptační kritéria:**
- [ ] Automatická detekce test frameworku
- [ ] Spuštění test suite
- [ ] Parsování test výsledků
- [ ] Coverage collection
- [ ] Reporting per-test results

**Test report:**
```
Test Results: src/auth/auth.test.ts
─────────────────────────────────────
✓ should register new user (45ms)
✓ should reject duplicate email (12ms)
✓ should login with valid credentials (38ms)
✓ should reject invalid password (8ms)
✗ should refresh token (timeout)
  └── Expected token to be refreshed within 5s

Tests: 4 passed, 1 failed
Coverage: 87% (statements)
```

### FR-005.3: Lint validation

**Popis:** Kód nesmí obsahovat lint errory.

**Akceptační kritéria:**
- [ ] Detekce linteru (ESLint, Biome, etc.)
- [ ] Spuštění lint check
- [ ] Rozlišení error vs warning
- [ ] Auto-fix kde možné
- [ ] Konfigurabilní handling warnings

**Lint konfigurace:**
```yaml
quality:
  lint:
    required: true
    allowWarnings: true  # false = warnings are errors
    autoFix: true
    excludePaths:
      - "node_modules/**"
      - "dist/**"
```

### FR-005.4: Type checking

**Popis:** TypeScript type check musí projít.

**Akceptační kritéria:**
- [ ] Detekce TypeScript projektu
- [ ] Spuštění `tsc --noEmit`
- [ ] Parsování type errors
- [ ] Reporting problémových míst
- [ ] Strict mode enforcement

### FR-005.5: Coverage thresholds

**Popis:** Test coverage musí splnit konfigurovaný práh.

**Akceptační kritéria:**
- [ ] Měření statement coverage
- [ ] Měření branch coverage
- [ ] Měření function coverage
- [ ] Konfigurabilní prahy
- [ ] Per-file a celkový report

**Coverage konfigurace:**
```yaml
quality:
  coverage:
    required: true
    thresholds:
      statements: 80
      branches: 70
      functions: 80
      lines: 80
    excludePaths:
      - "**/*.test.ts"
      - "**/index.ts"
```

### FR-005.6: Security scanning

**Popis:** Kód je skenován na bezpečnostní zranitelnosti.

**Akceptační kritéria:**
- [ ] Dependency vulnerability scan
- [ ] Static code analysis (SAST)
- [ ] Secret detection
- [ ] Severity-based blocking
- [ ] Remediation suggestions

**Security report:**
```
Security Scan Results
─────────────────────────────────────
Dependencies:
  ✗ HIGH: lodash@4.17.20 - Prototype Pollution
    → Upgrade to 4.17.21
  ⚠ MEDIUM: axios@0.21.0 - ReDoS
    → Upgrade to 0.21.1

Code:
  ✗ HIGH: Hardcoded API key detected
    → src/config.ts:15
  ⚠ LOW: console.log in production code
    → src/utils/logger.ts:42

Blocking: 2 HIGH severity issues
```

### FR-005.7: Auto-remediation

**Popis:** Systém se pokusí automaticky opravit quality issues.

**Akceptační kritéria:**
- [ ] Auto-fix lint issues
- [ ] Auto-fix simple test failures
- [ ] Upgrade vulnerable dependencies
- [ ] Remove detected secrets
- [ ] Limit na počet remediation attempts

**Remediation flow:**
```
Quality check failed
        │
        ▼
Analyze failures
        │
        ├── Lint errors → Auto-fix
        │
        ├── Test failures → Analyze + Fix
        │
        ├── Build errors → Analyze + Fix
        │
        └── Security → Auto-upgrade / Remove
        │
        ▼
Re-run quality checks
        │
        ├── Pass → Continue
        │
        └── Fail → HITL or Abort
```

### FR-005.8: Quality gates configuration

**Popis:** Quality gates jsou plně konfigurovatelné per projekt.

**Akceptační kritéria:**
- [ ] Per-project konfigurace
- [ ] Per-task override možnost
- [ ] Různé profily (strict, standard, minimal)
- [ ] Custom checks
- [ ] Conditional gates

**Konfigurace příklad:**
```yaml
quality:
  profile: "strict"  # strict | standard | minimal | custom

  profiles:
    strict:
      build: { required: true }
      tests: { required: true, minCoverage: 90 }
      lint: { required: true, allowWarnings: false }
      typecheck: { required: true, strict: true }
      security: { required: true, blockOnHigh: true }

    standard:
      build: { required: true }
      tests: { required: true, minCoverage: 80 }
      lint: { required: true, allowWarnings: true }
      typecheck: { required: true }
      security: { required: false }

    minimal:
      build: { required: true }
      tests: { required: false }
      lint: { required: false }
      typecheck: { required: false }
      security: { required: false }

  customChecks:
    - name: "No TODO comments"
      command: "grep -r 'TODO' src/ && exit 1 || exit 0"
      required: false
```

### FR-005.9: Quality reporting

**Popis:** Generování komplexního quality reportu.

**Akceptační kritéria:**
- [ ] Agregovaný quality score
- [ ] Per-check detailed results
- [ ] Trend tracking
- [ ] Export formáty (JSON, HTML, Markdown)
- [ ] Integration s CI/CD

**Quality report:**
```markdown
# Quality Report: Task-123

## Summary
**Overall Score: 92/100** ✓ PASSED

## Checks

| Check | Status | Details |
|-------|--------|---------|
| Build | ✓ Pass | 12.3s, 2.1MB |
| Tests | ✓ Pass | 47/47, 87% coverage |
| Lint | ✓ Pass | 0 errors, 3 warnings |
| TypeScript | ✓ Pass | Strict mode |
| Security | ⚠ Warn | 1 medium vulnerability |

## Metrics
- Build time: 12.3s
- Test time: 8.7s
- Coverage: 87%
- Complexity: 12 (average)

## Recommendations
- Address security warning in next iteration
- Consider increasing coverage in `src/utils/`
```

---

## Souvislosti

- [FR-001: Autonomous Execution](./FR-001-autonomous-execution.md)
- [Principles: Quality Without Compromise](../../01-vision/02-principles.md)
- [Design: Test-Build Validation](../../04-design/02-autonomous-workflow/test-build-validation.md)
