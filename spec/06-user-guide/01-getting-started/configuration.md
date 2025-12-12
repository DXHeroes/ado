# Configuration Guide

## Přehled

Kompletní průvodce konfigurací ADO pomocí `ado.config.yaml`.

## Inicializace konfigurace

```bash
# Interaktivní průvodce
ado init

# S výchozími hodnotami
ado init --defaults

# Pro existující projekt
ado init --existing
```

## Struktura konfiguračního souboru

```yaml
# ado.config.yaml
version: "2.0"

# ═══════════════════════════════════════════════════════════════
# PROJECT
# ═══════════════════════════════════════════════════════════════
project:
  id: "my-project"                    # Unikátní identifikátor
  name: "My Project"                  # Čitelný název
  repository: "https://github.com/..." # Git repository URL

# ═══════════════════════════════════════════════════════════════
# PROVIDERS
# ═══════════════════════════════════════════════════════════════
providers:
  claude-code:
    enabled: true
    contextFile: "CLAUDE.md"
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "max"
          rateLimits:
            requestsPerHour: 100
            tokensPerDay: 5000000

      - mode: api
        priority: 2
        enabled: true
        api:
          model: "claude-sonnet-4-20250514"
          apiKeyEnvVar: "ANTHROPIC_API_KEY"

  gemini-cli:
    enabled: true
    contextFile: "GEMINI.md"
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "advanced"

# ═══════════════════════════════════════════════════════════════
# HITL (Human-in-the-Loop)
# ═══════════════════════════════════════════════════════════════
hitl:
  defaultPolicy: "spec-review"        # autonomous | spec-review | checkpoint | always

  checkpoints:
    specification: true               # Review specifikace
    architecture: true                # Review architektury
    implementation: false             # Review implementace
    validation: false                 # Review validace

  timeout:
    duration: 3600                    # Timeout v sekundách (1 hodina)
    action: "pause"                   # approve | reject | pause

  notifications:
    email: true
    slack: false
    webhook: null

# ═══════════════════════════════════════════════════════════════
# QUALITY
# ═══════════════════════════════════════════════════════════════
quality:
  build:
    required: true
    command: "pnpm build"
    timeout: 300                      # 5 minut

  test:
    required: true
    command: "pnpm test"
    timeout: 600                      # 10 minut
    minCoverage: 80                   # Minimální coverage %

  lint:
    required: true
    command: "pnpm lint"
    maxErrors: 0
    maxWarnings: 10

  typecheck:
    required: true
    command: "pnpm typecheck"

# ═══════════════════════════════════════════════════════════════
# PATHS
# ═══════════════════════════════════════════════════════════════
paths:
  specs: "docs/specs"                 # Kam ukládat specifikace
  workspaces: ".ado/workspaces"       # Pracovní adresáře
  checkpoints: ".ado/checkpoints"     # Checkpointy
  logs: ".ado/logs"                   # Logy

# ═══════════════════════════════════════════════════════════════
# LIMITS
# ═══════════════════════════════════════════════════════════════
limits:
  maxConcurrentTasks: 5
  maxTaskDuration: 3600               # 1 hodina
  maxCost: 10.00                      # USD za úkol
  maxRetries: 3

# ═══════════════════════════════════════════════════════════════
# TELEMETRY
# ═══════════════════════════════════════════════════════════════
telemetry:
  enabled: true
  anonymous: true                     # Anonymizovaná telemetrie
  endpoint: null                      # Custom endpoint (null = default)
```

## Konfigurace providerů

### Claude Code

```yaml
providers:
  claude-code:
    enabled: true
    contextFile: "CLAUDE.md"          # Kontextový soubor

    accessModes:
      # Subscription (priorita 1)
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "max"                 # max | pro | free
          rateLimits:
            requestsPerHour: 100
            requestsPerDay: 1000
            tokensPerDay: 5000000

      # API fallback (priorita 2)
      - mode: api
        priority: 2
        enabled: true
        api:
          model: "claude-sonnet-4-20250514"
          apiKeyEnvVar: "ANTHROPIC_API_KEY"
          maxTokens: 200000
```

### Gemini CLI

```yaml
providers:
  gemini-cli:
    enabled: true
    contextFile: "GEMINI.md"

    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "advanced"
          rateLimits:
            requestsPerHour: 50
            tokensPerDay: 10000000

      - mode: api
        priority: 2
        enabled: true
        api:
          model: "gemini-2.0-flash"
          apiKeyEnvVar: "GOOGLE_AI_API_KEY"
```

### Cursor CLI

```yaml
providers:
  cursor-cli:
    enabled: true

    accessModes:
      - mode: subscription
        priority: 1
        enabled: true
        subscription:
          plan: "pro"
          rateLimits:
            requestsPerHour: 500
```

## HITL Politiky

### autonomous

Plně autonomní režim bez lidské kontroly.

```yaml
hitl:
  defaultPolicy: "autonomous"
  checkpoints:
    specification: false
    architecture: false
    implementation: false
    validation: false
```

**Použití:** Jednoduché, dobře definované úkoly.

### spec-review

Review specifikace před implementací.

```yaml
hitl:
  defaultPolicy: "spec-review"
  checkpoints:
    specification: true
    architecture: false
    implementation: false
    validation: false
```

**Použití:** Většina běžných úkolů. Doporučeno.

### checkpoint

Review na všech klíčových checkpointech.

```yaml
hitl:
  defaultPolicy: "checkpoint"
  checkpoints:
    specification: true
    architecture: true
    implementation: false
    validation: true
```

**Použití:** Komplexní úkoly vyžadující kontrolu.

### always

Schválení před každou akcí.

```yaml
hitl:
  defaultPolicy: "always"
  checkpoints:
    specification: true
    architecture: true
    implementation: true
    validation: true
```

**Použití:** Kritické změny, produkční prostředí.

## Konfigurace kvality

### Přísná konfigurace (doporučeno pro produkci)

```yaml
quality:
  build:
    required: true
    command: "pnpm build"
    timeout: 300

  test:
    required: true
    command: "pnpm test:ci"
    timeout: 600
    minCoverage: 90

  lint:
    required: true
    command: "pnpm lint"
    maxErrors: 0
    maxWarnings: 0

  typecheck:
    required: true
    command: "pnpm typecheck"
```

### Volná konfigurace (pro prototypování)

```yaml
quality:
  build:
    required: true
    command: "pnpm build"

  test:
    required: false

  lint:
    required: false

  typecheck:
    required: false
```

## Environment variables

ADO respektuje následující environment variables:

```bash
# API klíče
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_AI_API_KEY="..."

# Konfigurace ADO
export ADO_CONFIG_PATH="./custom-config.yaml"
export ADO_LOG_LEVEL="debug"
export ADO_TELEMETRY_DISABLED="true"

# Proxy
export HTTP_PROXY="http://proxy:8080"
export HTTPS_PROXY="http://proxy:8080"
```

## Kontextové soubory

### CLAUDE.md

```markdown
# Project Context for Claude Code

## Project Overview
Tento projekt je REST API pro správu TODO položek.

## Tech Stack
- TypeScript 5.x
- Express.js
- PostgreSQL + Prisma
- Vitest pro testy

## Coding Standards
- Používej funkcionální přístup
- Všechny funkce musí mít JSDoc
- Testy pro každou novou funkcionalitu

## Important Files
- src/routes/ - API endpointy
- src/services/ - Business logika
- src/models/ - Prisma modely
```

### GEMINI.md

```markdown
# Project Context for Gemini

## Overview
(podobný obsah jako CLAUDE.md)
```

## CLI konfigurace

### Zobrazení aktuální konfigurace

```bash
ado config show
```

### Interaktivní konfigurace

```bash
# Konfigurace providerů
ado config providers

# Konfigurace HITL
ado config hitl

# Konfigurace kvality
ado config quality
```

### Ruční úprava hodnot

```bash
# Nastavení hodnoty
ado config set hitl.defaultPolicy spec-review

# Získání hodnoty
ado config get hitl.defaultPolicy

# Reset na výchozí
ado config reset hitl
```

## Validace konfigurace

```bash
# Validace konfiguračního souboru
ado config validate

# Výstup:
# ✓ Configuration is valid
#
# Providers:
#   ✓ claude-code: available (subscription)
#   ✓ gemini-cli: available (subscription)
#   ✗ cursor-cli: not found
#
# Quality commands:
#   ✓ pnpm build
#   ✓ pnpm test
#   ✓ pnpm lint
```

## Konfigurace pro různá prostředí

### Development

```yaml
# ado.config.yaml
hitl:
  defaultPolicy: "spec-review"

quality:
  test:
    minCoverage: 70
  lint:
    maxWarnings: 20
```

### CI/CD

```yaml
# ado.config.ci.yaml
hitl:
  defaultPolicy: "autonomous"
  timeout:
    duration: 300
    action: "reject"

quality:
  test:
    minCoverage: 90
  lint:
    maxErrors: 0
    maxWarnings: 0
```

```bash
# Použití v CI
ADO_CONFIG_PATH=ado.config.ci.yaml ado run "task"
```

---

## Souvislosti

- [Installation](./installation.md)
- [Quick Start](./quick-start.md)
- [Config Reference](../05-configuration/config-reference.md)
