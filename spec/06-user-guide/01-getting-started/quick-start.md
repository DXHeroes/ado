# Quick Start Guide

## Přehled

Tento průvodce vás provede prvním použitím ADO od instalace po první dokončený úkol.

## Předpoklady

- **Node.js 22+** - `node --version`
- **pnpm** - `pnpm --version`
- **Git** - `git --version`
- Alespoň jeden AI agent nainstalovaný:
  - Claude Code (`claude --version`)
  - Gemini CLI (`gemini --version`)
  - Cursor CLI (`cursor --version`)

## Krok 1: Instalace

```bash
# Globální instalace
pnpm add -g @dxheroes/ado

# Nebo pomocí npx
npx @dxheroes/ado --help
```

Ověření instalace:
```bash
ado --version
# ADO v2.0.0
```

## Krok 2: Inicializace projektu

Přejděte do svého projektu a inicializujte ADO:

```bash
cd /path/to/your/project

ado init
```

Průvodce se vás zeptá na:
1. **Název projektu** - identifikátor pro ADO
2. **Providers** - které AI agenty chcete používat
3. **HITL policy** - úroveň lidské kontroly

Výsledek: vytvoří se `ado.config.yaml`:

```yaml
version: "2.0"

project:
  id: "my-project"

providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription
        priority: 1
        enabled: true

hitl:
  defaultPolicy: "spec-review"
```

## Krok 3: Konfigurace providerů

Interaktivní konfigurace providerů:

```bash
ado config providers
```

Nebo ruční editace `ado.config.yaml`:

```yaml
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
            requestsPerDay: 500

  gemini-cli:
    enabled: true
    contextFile: "GEMINI.md"
    accessModes:
      - mode: subscription
        priority: 2
        enabled: true
```

## Krok 4: První úkol

Spusťte svůj první úkol:

```bash
ado run "Přidej endpoint GET /health který vrátí status: ok"
```

### Co se stane:

1. **Analýza úkolu**
   ```
   ⏳ Analyzuji úkol...
   📋 Typ: feature (simple)
   🎯 Provider: claude-code (subscription)
   ```

2. **Generování specifikace**
   ```
   📝 Generuji specifikaci...

   ═══════════════════════════════════════════════
   SPEC: Health Check Endpoint

   Cíl: Přidat health check endpoint

   Scope:
   - GET /health endpoint
   - Response: { status: "ok" }

   Acceptance Criteria:
   - [ ] Endpoint responds to GET /health
   - [ ] Returns JSON { status: "ok" }
   - [ ] Returns 200 status code
   ═══════════════════════════════════════════════

   Approve specification? [Y/n/v]
   ```

3. **Implementace**
   ```
   ✓ Specifikace schválena
   🔨 Implementuji...

   ▶ Creating src/routes/health.ts
   ▶ Updating src/routes/index.ts
   ▶ Creating tests/health.test.ts
   ```

4. **Validace**
   ```
   🧪 Validuji výstup...

   ✓ Build passed
   ✓ Tests passed (3/3)
   ✓ Lint passed
   ✓ Coverage: 100%
   ```

5. **Dokončení**
   ```
   ═══════════════════════════════════════════════
   ✅ Úkol dokončen!

   Změny:
   + src/routes/health.ts (new)
   M src/routes/index.ts
   + tests/health.test.ts (new)

   Specifikace: docs/specs/SPEC-001-health-endpoint.md

   Čas: 2m 34s | Náklady: $0.00 (subscription)
   ═══════════════════════════════════════════════
   ```

## Krok 5: Kontrola výsledku

```bash
# Zobrazení změn
git diff

# Spuštění testů
pnpm test

# Spuštění aplikace
pnpm dev
curl http://localhost:3000/health
# {"status":"ok"}
```

## Základní příkazy

```bash
# Spuštění úkolu
ado run "popis úkolu"

# Status běžících úkolů
ado status

# Historie úkolů
ado history

# Konfigurace
ado config show
ado config providers

# Nápověda
ado --help
ado run --help
```

## Pokročilé možnosti

```bash
# Specifikace providera
ado run "task" --provider claude-code

# Bez API fallbacku
ado run "task" --no-api-fallback

# Nastavení max nákladů
ado run "task" --max-cost 5.00

# Přeskočení HITL review
ado run "task" --autonomous

# Verbose výstup
ado run "task" --verbose
```

## Další kroky

- [Koncepty: Autonomous Mode](../02-core-concepts/autonomous-mode.md)
- [Koncepty: Documentation-First](../02-core-concepts/doc-first-workflow.md)
- [Use Cases: Feature Development](../03-use-cases/feature-development.md)
- [Konfigurace: Reference](../05-configuration/config-reference.md)

---

## Troubleshooting

### "No providers available"

Zkontrolujte, že máte nainstalovaného alespoň jednoho agenta:
```bash
which claude
which gemini
```

### "Rate limited"

ADO automaticky přepne na jiného providera. Pokud jsou všichni rate-limited:
```bash
ado status --providers  # Zobrazí status providerů
```

### "Build failed"

ADO se pokusí o auto-fix. Pokud selže:
```bash
ado retry --task-id <id>  # Opakovat s posledním checkpointem
```

---

*Pro detailní dokumentaci navštivte [docs.ado.dev](https://docs.ado.dev)*
