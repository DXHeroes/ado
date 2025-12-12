# Principy návrhu ADO v2

## Základní principy

### 1. Documentation-First

> **"Žádný kód bez specifikace."**

**Pravidlo:** Před každou implementací existuje dokumentace.

**Proč:**
- AI agenti pracují lépe s jasným kontextem
- Dokumentace slouží jako acceptance criteria
- Budoucí údržba je jednodušší
- Auditovatelnost a trackovatelnost

**Implementace:**
- Task pipeline začíná generováním specifikace
- HITL checkpoint po dokumentaci (volitelně)
- Spec je input pro implementační agenty
- Finální dokumentace je součástí deliverables

```
Úkol → [Spec Gen] → Specifikace → [HITL?] → [Implementace] → Výstup + Docs
```

### 2. Autonomie s kontrolními body

> **"Plná autonomie, strategická kontrola."**

**Pravidlo:** ADO pracuje samostatně, ale nabízí kontrolní body na klíčových místech.

**Kdy HITL:**
- Po vytvoření specifikace (validace porozumění)
- Před architektonickými změnami (major decisions)
- Při překročení cost thresholdu
- Při selhání quality gates
- Na explicitní vyžádání

**Kdy NE HITL:**
- Rutinní implementace podle spec
- Minor bugfixy
- Formátování a refaktoring
- Test generation

**Implementace:**
```typescript
type HITLPolicy =
  | 'autonomous'      // Žádná kontrola
  | 'spec-review'     // Kontrola po specifikaci
  | 'major-changes'   // Kontrola velkých změn
  | 'all-changes'     // Kontrola všeho
```

### 3. Kvalita bez kompromisů

> **"Hotovo znamená otestováno a funkční."**

**Pravidlo:** Úkol není dokončen, dokud neprojde všemi quality gates.

**Quality gates:**
1. **Testy** - všechny testy musí projít
2. **Build** - aplikace se musí zbuildovat
3. **Lint** - žádné lint errory (warnings configurable)
4. **Type check** - TypeScript strict mode
5. **Coverage** - konfigurovaný práh (default 80%)

**Implementace:**
```yaml
qualityGates:
  tests:
    required: true
    minCoverage: 80
  build:
    required: true
  lint:
    required: true
    allowWarnings: true
  typecheck:
    required: true
```

### 4. Subscription-First

> **"Využij co máš, než platíš za víc."**

**Pravidlo:** Předplatné se používá přednostně před API.

**Pořadí priorit:**
1. Subscription (Claude MAX, Cursor Pro, etc.)
2. Free tier (pokud dostupný)
3. API (pouze jako fallback)

**Implementace:**
- Rate limit tracking per provider/mode
- Automatic failover při rate limit
- Cost confirmation před API fallback
- Daily cost limits

### 5. Distribuovaná architektura

> **"Lokální ovládání, cloudová síla."**

**Pravidlo:** Stejné rozhraní pro lokální i distribuovaný provoz.

**Módy:**
- **Local** - vše běží na lokálním PC
- **Hybrid** - kontrolér lokálně, workery v cloudu
- **Full cloud** - vše v cloudu, CLI je klient

**Implementace:**
```bash
# Lokální
ado run "task"

# Distribuovaný (stejný příkaz!)
ado run "task" --context cloud --workers 5
```

### 6. Type Safety End-to-End

> **"Typy jsou dokumentace, která se kompiluje."**

**Pravidlo:** Plná typová bezpečnost od CLI po API.

**Technologie:**
- TypeScript strict mode
- tRPC pro type-safe API
- Zod pro runtime validaci
- Automatické generování typů

**Benefity:**
- Chyby odhaleny při kompilaci
- Autokompletace v IDE
- Samodokumentující API

### 7. Observability by Default

> **"Co neměříš, neřídíš."**

**Pravidlo:** Vše je logováno, měřeno a trasovatelné.

**Komponenty:**
- **Logging** - strukturované logy (JSON)
- **Metrics** - OpenTelemetry counters/histograms
- **Tracing** - distribuované trasování
- **Audit** - kdo, co, kdy, proč

**Implementace:**
```typescript
// Každá operace má trace context
const span = tracer.startSpan('task.execute', {
  attributes: {
    'task.id': taskId,
    'provider.id': providerId,
    'access.mode': accessMode
  }
});
```

### 8. Graceful Degradation

> **"Funguj i když něco selže."**

**Pravidlo:** Selhání jedné komponenty nepoloží celý systém.

**Strategie:**
- Automatic failover mezi providery
- Retry s exponential backoff
- Circuit breaker pro opakující se selhání
- Checkpoint/restore pro dlouhé úkoly

**Implementace:**
```
Provider A rate limited → Provider B
Provider B timeout → Retry 3x
All retries failed → Queue for later + Notify user
```

### 9. Jednoduchý začátek, mocné možnosti

> **"5 minut na start, neomezené možnosti."**

**Pravidlo:** Zero-config start, postupné odhalování pokročilých funkcí.

**Progrese:**
1. `ado init` → funguje s defaults
2. `ado run "task"` → automatický provider selection
3. Konfigurace jen když potřeba
4. Pokročilé funkce opt-in

### 10. Community-Friendly

> **"Open source jako základ, ne afterthought."**

**Pravidlo:** Design umožňuje community contributions.

**Aspekty:**
- Plugin systém pro nové adaptéry
- Dokumentovaná interní API
- Contributor guidelines
- Extensible konfigurace

---

## Anti-patterns (čemu se vyhýbat)

### 1. Over-engineering
- **Špatně:** Abstrakce pro jeden use case
- **Správně:** Abstrakce až když jsou 3+ use cases

### 2. Silent failures
- **Špatně:** Selhání bez notifikace
- **Správně:** Explicitní error handling a reporting

### 3. Magic behavior
- **Špatně:** Automatické akce bez vysvětlení
- **Správně:** Transparentní rozhodování s logy

### 4. Config hell
- **Špatně:** 100 povinných options
- **Správně:** Sensible defaults, opt-in complexity

### 5. Vendor lock-in
- **Špatně:** Závislost na jednom cloud provideru
- **Správně:** Abstrakce pro K8s, Docker, Coolify, EC2

---

## Rozhodovací framework

Při architektonických rozhodnutích zvažuj (v tomto pořadí):

1. **Bezpečnost** - Je to bezpečné?
2. **Spolehlivost** - Bude to fungovat?
3. **Jednoduchost** - Je to nejjednodušší řešení?
4. **Výkon** - Je to dostatečně rychlé?
5. **Rozšiřitelnost** - Půjde to rozšířit?

Pokud řešení nesplňuje #1 nebo #2, hledej jiné řešení.
