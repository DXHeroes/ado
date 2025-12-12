# Error Codes Reference

## Přehled

Kompletní seznam chybových kódů ADO s vysvětlením a řešením.

## Error Code Format

```
ADO-[CATEGORY][NUMBER]

Categories:
- CFG: Configuration errors (100-199)
- PRV: Provider errors (200-299)
- TSK: Task errors (300-399)
- CHK: Checkpoint errors (400-499)
- VAL: Validation errors (500-599)
- NET: Network errors (600-699)
- SYS: System errors (700-799)
- SEC: Security errors (800-899)
```

---

## Configuration Errors (CFG)

### ADO-CFG100: Configuration File Not Found

**Zpráva:** `Configuration file not found: ado.config.yaml`

**Příčina:** Chybí konfigurační soubor v aktuálním adresáři.

**Řešení:**
```bash
ado init
# nebo
ado init --defaults
```

---

### ADO-CFG101: Invalid Configuration

**Zpráva:** `Invalid configuration: [details]`

**Příčina:** Konfigurační soubor obsahuje neplatné hodnoty.

**Řešení:**
```bash
# Validace konfigurace
ado config validate

# Zobrazení chyb
ado config validate --verbose

# Reset na výchozí
ado config reset
```

---

### ADO-CFG102: Missing Required Field

**Zpráva:** `Missing required field: [field]`

**Příčina:** Chybí povinné pole v konfiguraci.

**Řešení:**
```yaml
# Přidejte chybějící pole do ado.config.yaml
# Příklad pro project.id:
project:
  id: "my-project"  # Přidejte toto
```

---

### ADO-CFG103: Invalid Provider Configuration

**Zpráva:** `Invalid provider configuration: [provider]`

**Příčina:** Neplatná konfigurace providera.

**Řešení:**
```yaml
providers:
  claude-code:
    enabled: true
    accessModes:
      - mode: subscription  # Musí být 'subscription', 'api', nebo 'local'
        priority: 1         # Musí být 1-10
        enabled: true
```

---

## Provider Errors (PRV)

### ADO-PRV200: No Providers Available

**Zpráva:** `No providers available`

**Příčina:** Žádný AI agent není dostupný.

**Řešení:**
```bash
# Zkontrolujte dostupnost
ado providers list

# Nainstalujte providera
npm install -g @anthropic-ai/claude-code
claude auth login
```

---

### ADO-PRV201: Provider Not Found

**Zpráva:** `Provider not found: [provider]`

**Příčina:** Zadaný provider neexistuje nebo není nainstalován.

**Řešení:**
```bash
# Seznam dostupných providerů
ado providers list

# Použijte dostupného providera
ado run "task" --provider claude-code
```

---

### ADO-PRV202: Provider Authentication Failed

**Zpráva:** `Provider authentication failed: [provider]`

**Příčina:** Neplatné nebo expirované credentials.

**Řešení:**
```bash
# Re-authenticate
claude auth logout
claude auth login

# Ověřte
claude auth status
```

---

### ADO-PRV203: Provider Rate Limited

**Zpráva:** `Provider rate limited: [provider]. Reset in [time]`

**Příčina:** Dosažen limit požadavků.

**Řešení:**
```bash
# Počkejte na reset, nebo:

# Použijte jiného providera
ado run "task" --provider gemini-cli

# Povolte API fallback
ado run "task" --allow-api-fallback
```

---

### ADO-PRV204: Provider Unavailable

**Zpráva:** `Provider unavailable: [provider]`

**Příčina:** Provider service je dočasně nedostupný.

**Řešení:**
```bash
# Zkontrolujte status služby
# https://status.anthropic.com
# https://status.cloud.google.com

# Retry později
ado run "task" --retry-on-error
```

---

### ADO-PRV205: API Key Invalid

**Zpráva:** `Invalid API key for [provider]`

**Příčina:** API klíč je neplatný nebo expirovaný.

**Řešení:**
```bash
# Zkontrolujte env variable
echo $ANTHROPIC_API_KEY

# Nastavte nový klíč
export ANTHROPIC_API_KEY="sk-ant-..."

# Nebo v konfiguraci
# ado.config.yaml
providers:
  claude-code:
    accessModes:
      - mode: api
        api:
          apiKeyEnvVar: "MY_CUSTOM_API_KEY"
```

---

## Task Errors (TSK)

### ADO-TSK300: Task Not Found

**Zpráva:** `Task not found: [taskId]`

**Příčina:** Úkol s daným ID neexistuje.

**Řešení:**
```bash
# Seznam úkolů
ado history

# Použijte správné ID
ado status --task task-correct-id
```

---

### ADO-TSK301: Task Already Running

**Zpráva:** `Task already running: [taskId]`

**Příčina:** Pokus o spuštění již běžícího úkolu.

**Řešení:**
```bash
# Zkontrolujte status
ado status

# Připojte se k běžícímu
ado attach task-123

# Nebo zrušte a spusťte znovu
ado cancel task-123
ado run "task"
```

---

### ADO-TSK302: Task Failed

**Zpráva:** `Task failed: [reason]`

**Příčina:** Úkol selhal během provádění.

**Řešení:**
```bash
# Zobrazit detaily
ado logs task-123

# Retry z posledního checkpointu
ado retry task-123

# Nebo s dodatečným kontextem
ado retry task-123 --feedback "Oprav [konkrétní problém]"
```

---

### ADO-TSK303: Task Timeout

**Zpráva:** `Task timeout after [duration]`

**Příčina:** Úkol překročil maximální dobu běhu.

**Řešení:**
```bash
# Zvyšte timeout
ado run "task" --timeout 7200

# Nebo v konfiguraci
# ado.config.yaml
limits:
  maxTaskDuration: 7200
```

---

### ADO-TSK304: Task Cancelled

**Zpráva:** `Task cancelled: [reason]`

**Příčina:** Úkol byl zrušen uživatelem nebo systémem.

**Řešení:**
```bash
# Spusťte znovu
ado run "task"

# Nebo obnovte z checkpointu
ado checkpoint list --task task-123
ado checkpoint restore cp-456
```

---

### ADO-TSK305: Max Retries Exceeded

**Zpráva:** `Max retries exceeded for task [taskId]`

**Příčina:** Úkol selhal opakovaně.

**Řešení:**
```bash
# Analyzujte chyby
ado logs task-123 --all-attempts

# Upravte prompt nebo přidejte kontext
ado run "upravený prompt s více detaily"

# Zvyšte retry limit
ado run "task" --max-retries 5
```

---

### ADO-TSK306: Cost Limit Exceeded

**Zpráva:** `Cost limit exceeded: $[cost] > $[limit]`

**Příčina:** Úkol překročil cenový limit.

**Řešení:**
```bash
# Zvyšte limit
ado run "task" --max-cost 20.00

# Nebo použijte subscription
ado run "task" --no-api-fallback
```

---

## Checkpoint Errors (CHK)

### ADO-CHK400: Checkpoint Not Found

**Zpráva:** `Checkpoint not found: [checkpointId]`

**Příčina:** Checkpoint neexistuje nebo expiroval.

**Řešení:**
```bash
# Seznam dostupných checkpointů
ado checkpoints list --task task-123

# Použijte existující
ado checkpoint restore cp-existing
```

---

### ADO-CHK401: HITL Timeout

**Zpráva:** `HITL decision timeout for checkpoint [checkpointId]`

**Příčina:** Nebylo rozhodnuto včas.

**Řešení:**
```bash
# Zkontrolujte čekající rozhodnutí
ado hitl pending

# Rozhodněte
ado hitl approve cp-123
# nebo
ado hitl reject cp-123

# Pokračujte v úkolu
ado resume task-456
```

---

### ADO-CHK402: Checkpoint Restore Failed

**Zpráva:** `Failed to restore checkpoint: [reason]`

**Příčina:** Chyba při obnově stavu.

**Řešení:**
```bash
# Zkuste starší checkpoint
ado checkpoints list --task task-123
ado checkpoint restore cp-older

# Nebo začněte znovu
ado run "task" --from-scratch
```

---

## Validation Errors (VAL)

### ADO-VAL500: Build Failed

**Zpráva:** `Build failed: [error]`

**Příčina:** Kompilace kódu selhala.

**Řešení:**
```bash
# ADO se pokusí opravit automaticky
# Pokud selže:

# Zobrazit detaily
ado logs task-123 --validation

# Retry s feedbackem
ado retry task-123 --feedback "Build error: [zpráva]"
```

---

### ADO-VAL501: Tests Failed

**Zpráva:** `Tests failed: [count] failures`

**Příčina:** Některé testy neprojdou.

**Řešení:**
```bash
# Nechte ADO opravit (default)

# Nebo snižte požadavky
ado run "task" --quality-coverage 70

# Nebo přeskočte testy
ado run "task" --skip-tests
```

---

### ADO-VAL502: Coverage Below Threshold

**Zpráva:** `Coverage [actual]% below threshold [required]%`

**Příčina:** Nedostatečné pokrytí testy.

**Řešení:**
```bash
# Snižte požadavek
ado run "task" --quality-coverage 70

# Nebo požádejte o více testů
ado run "task. Přidej testy pro edge cases."
```

---

### ADO-VAL503: Lint Errors

**Zpráva:** `Lint errors: [count]`

**Příčina:** Kód nesplňuje lint pravidla.

**Řešení:**
```bash
# ADO automaticky spouští --fix

# Povolte více chyb
ado run "task" --quality-lint-errors 5

# Specifikujte styl
ado run "task. Použij single quotes."
```

---

## Network Errors (NET)

### ADO-NET600: Connection Timeout

**Zpráva:** `Connection timeout to [service]`

**Příčina:** Síťový problém.

**Řešení:**
```bash
# Zkontrolujte konektivitu
ping api.anthropic.com

# Zvyšte timeout
ado run "task" --network-timeout 60

# Zkontrolujte proxy
echo $HTTP_PROXY
```

---

### ADO-NET601: SSL Certificate Error

**Zpráva:** `SSL certificate error: [details]`

**Příčina:** Problém s certifikátem.

**Řešení:**
```bash
# Aktualizujte CA certificates
# macOS:
brew install ca-certificates

# Linux:
sudo update-ca-certificates

# Zkontrolujte systémový čas
date
```

---

## System Errors (SYS)

### ADO-SYS700: Insufficient Disk Space

**Zpráva:** `Insufficient disk space: [available] < [required]`

**Příčina:** Nedostatek místa na disku.

**Řešení:**
```bash
# Vyčistěte ADO cache
ado cache clear

# Vyčistěte staré workspaces
ado workspace cleanup

# Zkontrolujte místo
df -h
```

---

### ADO-SYS701: Out of Memory

**Zpráva:** `Out of memory`

**Příčina:** Nedostatek RAM.

**Řešení:**
```bash
# Omezte souběžné úkoly
ado config set limits.maxConcurrentTasks 1

# Restartujte ADO
ado daemon restart
```

---

### ADO-SYS702: Git Error

**Zpráva:** `Git error: [details]`

**Příčina:** Problém s Git operací.

**Řešení:**
```bash
# Vyčistěte worktrees
git worktree prune

# Zkontrolujte Git status
git status

# Resetujte ADO workspaces
rm -rf .ado/workspaces
```

---

## Security Errors (SEC)

### ADO-SEC800: Unauthorized

**Zpráva:** `Unauthorized: [reason]`

**Příčina:** Chybějící nebo neplatná autorizace.

**Řešení:**
```bash
# Re-authenticate
ado auth login

# Zkontrolujte permissions
ado auth status
```

---

### ADO-SEC801: Access Denied

**Zpráva:** `Access denied to [resource]`

**Příčina:** Nedostatečná oprávnění.

**Řešení:**
```bash
# Zkontrolujte oprávnění
ado auth permissions

# Kontaktujte administrátora
```

---

## Error Handling v kódu

```typescript
import { ADOError, ErrorCode } from '@dxheroes/ado';

try {
  await ado.run('task');
} catch (error) {
  if (error instanceof ADOError) {
    switch (error.code) {
      case ErrorCode.PRV_RATE_LIMITED:
        console.log(`Rate limited. Reset in ${error.resetIn}s`);
        break;
      case ErrorCode.TSK_FAILED:
        console.log(`Task failed: ${error.message}`);
        break;
      default:
        console.log(`Error ${error.code}: ${error.message}`);
    }
  }
}
```

---

## Souvislosti

- [Common Issues](./common-issues.md)
- [Installation](../01-getting-started/installation.md)
- [Configuration](../01-getting-started/configuration.md)
