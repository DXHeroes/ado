# FR-001: Plně autonomní provádění úkolů

## Přehled

ADO musí být schopen přijmout úkol v přirozeném jazyce a autonomně ho provést až do úplného dokončení, včetně dokumentace, implementace, testování a validace.

## Požadavky

### FR-001.1: Přijetí úkolu

**Popis:** Systém přijme úkol ve formě přirozeného jazyka.

**Akceptační kritéria:**
- [ ] CLI příkaz `ado run "<prompt>"` přijme libovolný textový popis
- [ ] Podporuje víceřádkový vstup
- [ ] Podporuje vstup ze souboru (`ado run --file task.md`)
- [ ] Validuje, že prompt není prázdný
- [ ] Ukládá originální prompt pro audit

**Příklad:**
```bash
ado run "Vytvoř REST API pro správu uživatelů s autentizací pomocí JWT"
```

### FR-001.2: Automatická dekompozice úkolu

**Popis:** Systém automaticky rozloží komplexní úkol na menší podúkoly.

**Akceptační kritéria:**
- [ ] Analyzuje prompt a identifikuje jednotlivé části
- [ ] Vytvoří strukturovaný plán s podúkoly
- [ ] Určí závislosti mezi podúkoly
- [ ] Identifikuje paralelizovatelné části
- [ ] Odhadne náročnost každého podúkolu

**Výstup dekompozice:**
```yaml
task:
  id: "task-001"
  prompt: "Vytvoř REST API pro správu uživatelů s JWT"
  subtasks:
    - id: "subtask-001"
      name: "Vytvoření specifikace"
      type: "documentation"
      dependencies: []
      parallelizable: false
    - id: "subtask-002"
      name: "Implementace User modelu"
      type: "implementation"
      dependencies: ["subtask-001"]
      parallelizable: true
    - id: "subtask-003"
      name: "Implementace JWT autentizace"
      type: "implementation"
      dependencies: ["subtask-001"]
      parallelizable: true
    - id: "subtask-004"
      name: "Implementace API endpointů"
      type: "implementation"
      dependencies: ["subtask-002", "subtask-003"]
      parallelizable: false
    - id: "subtask-005"
      name: "Psaní testů"
      type: "testing"
      dependencies: ["subtask-004"]
      parallelizable: true
```

### FR-001.3: Generování dokumentace před implementací

**Popis:** Před každou implementací systém vytvoří technickou specifikaci.

**Akceptační kritéria:**
- [ ] Generuje markdown specifikaci pro každý významný úkol
- [ ] Specifikace obsahuje: cíl, scope, technický návrh, acceptance criteria
- [ ] Ukládá specifikaci do definovaného adresáře
- [ ] Specifikace je použita jako kontext pro implementační agenty

**Struktura specifikace:**
```markdown
# Feature: [Název]

## Cíl
[Co má být dosaženo]

## Scope
### In scope
- [Co je součástí]

### Out of scope
- [Co není součástí]

## Technický návrh
[Architektura, datové modely, API]

## Acceptance criteria
- [ ] [Kritérium 1]
- [ ] [Kritérium 2]

## Test plán
[Jak bude testováno]
```

### FR-001.4: Autonomní implementace

**Popis:** Systém implementuje kód podle specifikace bez lidské intervence.

**Akceptační kritéria:**
- [ ] Vybírá optimálního agenta pro daný typ úkolu
- [ ] Předává agentovi specifikaci jako kontext
- [ ] Monitoruje průběh implementace
- [ ] Zpracovává mezivýstupy a upravuje plán podle potřeby
- [ ] Řeší chyby a problémy automaticky (retry, fallback)

### FR-001.5: Automatické testování

**Popis:** Systém automaticky generuje a spouští testy.

**Akceptační kritéria:**
- [ ] Generuje unit testy pro nový kód
- [ ] Generuje integration testy kde relevantní
- [ ] Spouští existující test suite
- [ ] Při selhání testu se pokouší o opravu
- [ ] Reportuje coverage

### FR-001.6: Validace výstupu

**Popis:** Systém validuje, že výstup splňuje všechny quality gates.

**Akceptační kritéria:**
- [ ] Build musí projít
- [ ] Všechny testy musí projít
- [ ] Lint nesmí mít errory
- [ ] Type check musí projít
- [ ] Coverage musí splnit práh (konfigurabilní)

### FR-001.7: Dokončení a reporting

**Popis:** Systém oznámí dokončení a poskytne souhrn.

**Akceptační kritéria:**
- [ ] Vytvoří PR/commit s popisem změn
- [ ] Aktualizuje dokumentaci
- [ ] Generuje report o provedené práci
- [ ] Notifikuje uživatele o dokončení

**Výstupní report:**
```markdown
# Task Completed: Vytvoř REST API pro správu uživatelů

## Souhrn
- Vytvořeny 4 nové soubory
- Modifikováno 2 existující soubory
- 12 nových testů, 100% pass rate
- Coverage: 87%

## Změny
- `src/models/user.ts` - User model
- `src/auth/jwt.ts` - JWT utilities
- `src/routes/users.ts` - API endpoints
- `tests/users.test.ts` - Unit testy

## Použití AI
- Provider: Claude Code (subscription)
- Celkový čas: 18 minut
- Náklady: $0.00 (subscription)

## Další kroky
- [ ] Review PR #123
- [ ] Deploy to staging
```

---

## Konfigurace

```yaml
autonomous:
  enabled: true

  decomposition:
    maxSubtasks: 20
    minSubtaskSize: "small"  # small, medium, large

  documentation:
    required: true
    template: "./templates/spec.md"
    outputDir: "./docs/specs"

  validation:
    buildRequired: true
    testsRequired: true
    lintRequired: true
    minCoverage: 80

  completion:
    createPR: true
    updateDocs: true
    notify: ["slack"]
```

---

## Souvislosti

- [FR-003: Documentation Workflow](./FR-003-documentation-workflow.md)
- [FR-005: Quality Assurance](./FR-005-quality-assurance.md)
- [FR-006: HITL Checkpoints](./FR-006-hitl-checkpoints.md)
- [Design: Autonomous Workflow](../../04-design/02-autonomous-workflow/doc-first-pipeline.md)
