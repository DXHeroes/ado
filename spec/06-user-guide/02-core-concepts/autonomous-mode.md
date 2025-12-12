# Autonomous Mode

## Přehled

Autonomous mode je klíčová vlastnost ADO, která umožňuje AI agentům pracovat samostatně na úkolech s minimální nebo žádnou lidskou intervencí.

## Jak funguje autonomie

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTONOMOUS WORKFLOW                          │
│                                                                  │
│   User                                                          │
│     │                                                           │
│     │  "Přidej autentizaci do API"                             │
│     ▼                                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      ADO                                  │  │
│  │                                                          │  │
│  │  1. Analýza → 2. Specifikace → 3. Implementace          │  │
│  │        ▼            ▼                ▼                   │  │
│  │    [AUTO]     [HITL/AUTO]        [AUTO]                 │  │
│  │                                                          │  │
│  │  4. Validace → 5. Review → 6. Finalizace               │  │
│  │        ▼           ▼              ▼                      │  │
│  │    [AUTO]     [HITL/AUTO]     [AUTO]                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│     │                                                           │
│     ▼                                                           │
│   Výsledek: Funkční, otestovaný kód                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Úrovně autonomie

ADO nabízí 4 úrovně autonomie, které můžete konfigurovat podle potřeby:

### 1. Full Autonomous

Plně autonomní režim bez jakékoliv lidské kontroly.

```yaml
hitl:
  defaultPolicy: "autonomous"
```

**Charakteristiky:**
- Žádné checkpointy
- Nejrychlejší provedení
- Vhodné pro jednoduché, dobře definované úkoly

**Příklad použití:**
```bash
ado run "Přidej endpoint GET /health" --autonomous
```

### 2. Spec Review (doporučeno)

Lidská kontrola pouze při schvalování specifikace.

```yaml
hitl:
  defaultPolicy: "spec-review"
```

**Charakteristiky:**
- Jeden checkpoint před implementací
- Dobrá rovnováha mezi rychlostí a kontrolou
- Výchozí nastavení

**Příklad:**
```bash
ado run "Implementuj uživatelskou autentizaci"
# → Zobrazí specifikaci
# → Čeká na schválení
# → Pokračuje autonomně
```

### 3. Checkpoint Mode

Lidská kontrola na všech klíčových bodech.

```yaml
hitl:
  defaultPolicy: "checkpoint"
```

**Charakteristiky:**
- Checkpointy na specifikaci, architektuře, validaci
- Větší kontrola nad procesem
- Pomalejší, ale bezpečnější

### 4. Always Approve

Schválení před každou významnou akcí.

```yaml
hitl:
  defaultPolicy: "always"
```

**Charakteristiky:**
- Maximální kontrola
- Nejpomalejší
- Pro kritické nebo citlivé změny

## Fáze autonomního workflow

### Fáze 1: Analýza

ADO analyzuje úkol a určuje jeho typ a rozsah.

```
⏳ Analyzuji úkol...

📋 Analýza:
├── Typ: feature
├── Složitost: moderate
├── Rozsah: multi-file
├── Odhadovaný čas: 15-30 min
└── Provider: claude-code (subscription)
```

**Co se děje:**
- Parsování promptu
- Klasifikace typu úkolu
- Analýza existujícího kódu
- Výběr vhodného providera

### Fáze 2: Specifikace

Vytvoření detailní specifikace před implementací.

```
📝 Generuji specifikaci...

═══════════════════════════════════════════════════════════════
SPEC-001: User Authentication

Cíl: Implementovat JWT autentizaci pro REST API

Scope:
- POST /auth/register - registrace uživatele
- POST /auth/login - přihlášení, vrací JWT
- POST /auth/logout - odhlášení (invalidace tokenu)
- Middleware pro ověření JWT na chráněných endpointech

Acceptance Criteria:
- [ ] User can register with email/password
- [ ] User can login and receive JWT token
- [ ] Protected endpoints require valid JWT
- [ ] Tokens expire after 24 hours
- [ ] Passwords are hashed with bcrypt

Technical Approach:
- bcrypt pro hashování hesel
- jsonwebtoken pro JWT
- Prisma pro databázové operace

Files to create/modify:
- src/routes/auth.ts (new)
- src/middleware/auth.ts (new)
- src/services/auth.service.ts (new)
- prisma/schema.prisma (modify)
═══════════════════════════════════════════════════════════════

Approve specification? [Y/n/e/v]
```

**Možnosti:**
- `Y` - Schválit a pokračovat
- `n` - Zamítnout
- `e` - Editovat specifikaci
- `v` - Zobrazit více detailů

### Fáze 3: Implementace

Autonomní implementace podle specifikace.

```
🔨 Implementuji...

Progress:
├── [✓] Setup (prisma schema)           100%
├── [✓] Auth service                    100%
├── [▶] Auth routes                      45%
├── [⏸] Auth middleware                   0%
└── [⏸] Tests                             0%

Current: Creating src/routes/auth.ts
Provider: claude-code (subscription)
Tokens: 12,450 / 5,000,000 daily
```

**Co se děje:**
- Vytváření/modifikace souborů
- Průběžná validace syntaxe
- Automatické checkpointy

### Fáze 4: Validace

Automatická kontrola kvality výstupu.

```
🧪 Validuji...

Build:
✓ TypeScript compilation successful
✓ No type errors

Tests:
✓ 12 tests passed
✓ Coverage: 87%

Lint:
✓ No errors
⚠ 2 warnings (unused imports)

Integration:
✓ API endpoints responding
✓ Auth flow working
```

**Co se kontroluje:**
- Build úspěšný
- Testy projdou
- Coverage splňuje minimum
- Lint bez chyb

### Fáze 5: Finalizace

Závěrečné úpravy a dokumentace.

```
📄 Finalizuji...

├── [✓] Generating API documentation
├── [✓] Updating CHANGELOG
├── [✓] Creating spec file
└── [✓] Committing changes

Commit: feat(auth): add JWT authentication
```

## Konfigurace autonomního chování

### Per-task konfigurace

```bash
# Plně autonomní
ado run "task" --autonomous

# S review specifikace
ado run "task" --hitl spec-review

# S checkpointy
ado run "task" --hitl checkpoint
```

### Globální konfigurace

```yaml
# ado.config.yaml
hitl:
  defaultPolicy: "spec-review"

  checkpoints:
    specification: true
    architecture: true
    implementation: false
    validation: false

  timeout:
    duration: 3600        # 1 hodina
    action: "pause"       # Co se stane při timeout
```

## Auto-recovery

ADO automaticky řeší běžné problémy:

### Build failures

```
❌ Build failed: Cannot find module 'bcrypt'

🔄 Auto-fix: Installing missing dependency...
   pnpm add bcrypt

✓ Build successful
```

### Test failures

```
❌ Test failed: Expected 200, received 401

🔄 Auto-fix: Analyzing failure...
   Issue: Missing auth header in test
   Fixing test file...

✓ Tests passed
```

### Lint errors

```
⚠ Lint: 3 errors

🔄 Auto-fix: Running lint --fix
   Fixed 3 issues

✓ Lint passed
```

## Monitoring autonomního běhu

### Real-time progress

```bash
ado status

# Task: task-123
# Status: running
# Phase: implementation
# Progress: 67%
# Duration: 8m 34s
# Provider: claude-code
# Cost: $0.00 (subscription)
```

### Připojení k běžícímu úkolu

```bash
ado attach task-123

# Streamuje output v reálném čase
```

### Historie

```bash
ado history

# ID        STATUS     TYPE     DURATION  COST
# task-123  completed  feature  12m 34s   $0.00
# task-122  completed  bugfix   5m 12s    $0.00
# task-121  failed     feature  8m 45s    $0.00
```

## Best Practices

### 1. Jasné prompty

```bash
# ❌ Špatně - příliš vágní
ado run "Vylepši kód"

# ✓ Dobře - konkrétní
ado run "Refaktoruj UserService - extrahuj validační logiku do samostatné třídy"
```

### 2. Správná úroveň autonomie

```bash
# Pro jednoduché úkoly
ado run "Přidej /health endpoint" --autonomous

# Pro komplexní úkoly
ado run "Implementuj platební systém" --hitl checkpoint
```

### 3. Nastavení limitů

```yaml
limits:
  maxTaskDuration: 3600    # Max 1 hodina
  maxCost: 10.00           # Max $10 za úkol
  maxRetries: 3            # Max 3 pokusy
```

### 4. Quality gates

```yaml
quality:
  test:
    minCoverage: 80        # Vyžadovat 80% coverage
  lint:
    maxErrors: 0           # Žádné lint errory
```

---

## Souvislosti

- [Checkpoints & HITL](./checkpoints-hitl.md)
- [Doc-First Workflow](./doc-first-workflow.md)
- [FR-001: Autonomous Execution](../../02-requirements/01-functional/FR-001-autonomous-execution.md)
