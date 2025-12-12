# Common Issues & Solutions

## Přehled

Řešení běžných problémů při používání ADO.

## Instalace a Setup

### "Command not found: ado"

**Příčina:** ADO není v PATH

**Řešení:**
```bash
# Zkontrolujte instalaci
npm list -g @dxheroes/ado

# Přidejte do PATH
export PATH="$PATH:$(npm root -g)/../bin"

# Nebo reinstalujte
npm uninstall -g @dxheroes/ado
npm install -g @dxheroes/ado
```

### "No providers available"

**Příčina:** Žádný AI agent není nainstalován nebo dostupný

**Řešení:**
```bash
# Zkontrolujte dostupnost
ado providers list

# Nainstalujte Claude Code
npm install -g @anthropic-ai/claude-code
claude auth login

# Nebo Gemini CLI
npm install -g @google/gemini-cli
gemini auth login

# Ověřte
ado providers list
```

### "Configuration file not found"

**Příčina:** Chybí `ado.config.yaml`

**Řešení:**
```bash
# Inicializujte ADO v projektu
ado init

# Nebo vytvořte minimální konfiguraci
cat > ado.config.yaml << 'EOF'
version: "2.0"
project:
  id: "my-project"
providers:
  claude-code:
    enabled: true
EOF
```

## Providers

### "Claude Code: Rate limited"

**Příčina:** Dosažen limit subscription

**Řešení:**
```bash
# Zkontrolujte status
ado providers status claude-code

# Možnosti:
# 1. Počkejte na reset (zobrazí se čas)
# 2. Přepněte na jiného providera
ado run "task" --provider gemini-cli

# 3. Povolte API fallback
ado run "task" --allow-api-fallback
```

### "Authentication failed"

**Příčina:** Neplatné nebo expirované credentials

**Řešení:**
```bash
# Claude Code
claude auth logout
claude auth login

# Gemini CLI
gemini auth logout
gemini auth login

# Ověřte
claude auth status
```

### "Provider not responding"

**Příčina:** Síťový problém nebo service outage

**Řešení:**
```bash
# Zkontrolujte konektivitu
curl -I https://api.anthropic.com
curl -I https://generativelanguage.googleapis.com

# Zkontrolujte status služeb
# https://status.anthropic.com
# https://status.cloud.google.com

# Retry s timeout
ado run "task" --timeout 300
```

## Execution

### "Task stuck at 0%"

**Příčina:** Agent se nespustil nebo čeká na input

**Řešení:**
```bash
# Zkontrolujte status
ado status --task task-123

# Zobrazit logy
ado logs task-123 --verbose

# Restartujte úkol
ado cancel task-123
ado run "task" --retry
```

### "Build failed"

**Příčina:** Chyba v generovaném kódu

**Řešení:**
```bash
# ADO se pokusí o auto-fix
# Pokud selže, máte možnosti:

# 1. Retry s více kontextem
ado retry task-123 --feedback "Build error: [chybová zpráva]"

# 2. Manuální oprava + pokračování
# Opravte kód ručně
ado resume task-123

# 3. Rollback na checkpoint
ado checkpoint restore cp-456
```

### "Tests failing"

**Příčina:** Testy neodpovídají implementaci

**Řešení:**
```bash
# Nechte ADO opravit
# (automaticky se pokusí při validaci)

# Nebo poskytněte feedback
ado retry task-123 --feedback "
Test failure: UserService.create should return user object
Expected: { id, email, name }
Actual: { id, email }
"

# Snižte požadavky na coverage (dočasně)
ado run "task" --quality-coverage 70
```

### "Lint errors"

**Příčina:** Kód nesplňuje lint pravidla

**Řešení:**
```bash
# ADO automaticky spustí --fix
# Pokud to nestačí:

# 1. Povolte více warnings
ado run "task" --quality-lint-warnings 10

# 2. Specifikujte lint pravidla v promptu
ado run "task. Use single quotes, no semicolons."
```

## HITL & Checkpoints

### "HITL timeout - task paused"

**Příčina:** Neodpověděli jste na HITL checkpoint včas

**Řešení:**
```bash
# Zobrazit čekající rozhodnutí
ado hitl pending

# Rozhodnout
ado hitl approve cp-123
# nebo
ado hitl reject cp-123

# Pokračovat v úkolu
ado resume task-456
```

### "Cannot restore checkpoint"

**Příčina:** Checkpoint expiroval nebo je poškozený

**Řešení:**
```bash
# Zobrazit dostupné checkpointy
ado checkpoints list --task task-123

# Zkuste starší checkpoint
ado checkpoint restore cp-122

# Pokud žádný není dostupný
ado run "task" --from-scratch
```

### "HITL notification not received"

**Příčina:** Notifikace nejsou nakonfigurované

**Řešení:**
```yaml
# ado.config.yaml
hitl:
  notifications:
    email: true
    slack: true
    webhook: "https://hooks.example.com/ado"
```

```bash
# Test notifikací
ado config test-notifications
```

## Performance

### "Task taking too long"

**Příčina:** Složitý úkol, pomalý provider, nebo problém

**Řešení:**
```bash
# Zkontrolujte průběh
ado status --task task-123

# Zvažte rozdělení úkolu
ado cancel task-123
ado run "část 1 úkolu"
ado run "část 2 úkolu"

# Nebo použijte více workerů
ado run "task" --workers 3 --remote
```

### "High API costs"

**Příčina:** Fallback na API místo subscription

**Řešení:**
```bash
# Zkontrolujte které mode se používá
ado status --task task-123

# Zakažte API fallback
ado run "task" --no-api-fallback

# Nastavte cost limit
ado run "task" --max-cost 5.00

# Preferujte subscription
# ado.config.yaml
providers:
  claude-code:
    accessModes:
      - mode: subscription
        priority: 1
      - mode: api
        priority: 10  # Nízká priorita
        enabled: false  # Nebo úplně vypnout
```

### "Memory issues"

**Příčina:** Velký projekt nebo mnoho souběžných úkolů

**Řešení:**
```bash
# Omezte souběžnost
ado config set limits.maxConcurrentTasks 2

# Vyčistěte cache
ado cache clear

# Restartujte ADO daemon
ado daemon restart
```

## Git & Version Control

### "Git conflict detected"

**Příčina:** Změny v repo během běhu úkolu

**Řešení:**
```bash
# ADO automaticky vytvoří worktree
# Pokud přesto nastane konflikt:

# 1. Stash lokální změny
git stash

# 2. Pull změny
git pull

# 3. Obnovte checkpoint
ado checkpoint restore cp-123

# 4. Pokračujte
ado resume task-456
```

### "Cannot create worktree"

**Příčina:** Git worktree problém

**Řešení:**
```bash
# Vyčistěte worktrees
git worktree prune

# Zkontrolujte existující
git worktree list

# Odstraňte poškozené
rm -rf .ado/workspaces/*
git worktree prune
```

## Remote Execution

### "Cannot connect to remote workers"

**Příčina:** Síťový nebo konfigurační problém

**Řešení:**
```bash
# Zkontrolujte konektivitu
ado workers ping

# Ověřte konfiguraci
ado config show remote

# Zkontrolujte credentials
kubectl get pods -n ado-system
```

### "Worker crashed"

**Příčina:** OOM, timeout, nebo bug

**Řešení:**
```bash
# Zkontrolujte logy workeru
ado workers logs worker-123

# Task se automaticky přeřadí
# Pokud ne:
ado task reassign task-123

# Zvyšte resources pro workery
# v Kubernetes values.yaml
```

## Quick Diagnostics

```bash
# Kompletní diagnostika
ado doctor

# Výstup:
# ✓ ADO version: 2.0.0
# ✓ Node.js: 22.0.0
# ✓ Git: 2.42.0
# ✓ Config: valid
#
# Providers:
# ✓ claude-code: available (subscription)
# ✓ gemini-cli: available (subscription)
# ✗ cursor-cli: not found
#
# System:
# ✓ Disk space: 45GB free
# ✓ Memory: 8GB available
# ✓ Network: connected
#
# Recommendations:
# - Install cursor-cli for additional provider
```

---

## Souvislosti

- [Error Codes](./error-codes.md)
- [Installation](../01-getting-started/installation.md)
- [Configuration](../01-getting-started/configuration.md)
