# ADR-002: Documentation-First Development Workflow

## Status
**Accepted**

## Context

ADO potřebuje definovat workflow pro autonomní provádění vývojářských úkolů. Existují dva hlavní přístupy:

1. **Code-First:** Začni implementací, dokumentuj až potom
2. **Documentation-First:** Vytvoř specifikaci, pak implementuj podle ní

## Decision

**ADO bude používat Documentation-First workflow jako výchozí přístup.**

Před každou netriviální implementací bude automaticky vytvořena technická specifikace, která slouží jako:
- Kontext pro AI agenty
- Validation criteria
- Trvalý záznam

## Rationale

### Výhody Documentation-First

#### 1. Lepší kontext pro AI agenty

AI agenti pracují lépe s jasným, strukturovaným kontextem:

```
❌ Code-First:
"Implementuj autentizaci"
→ Agent hádá requirements
→ Výsledek nemusí odpovídat očekávání

✅ Doc-First:
"Implementuj podle této specifikace: [detailní spec]"
→ Agent má jasná acceptance criteria
→ Výsledek odpovídá specifikaci
```

#### 2. Validovatelné výstupy

Specifikace obsahuje acceptance criteria, která lze automaticky validovat:

```markdown
## Acceptance Criteria
- [ ] User can register with email/password
- [ ] JWT expires after 1 hour
- [ ] Passwords are hashed with bcrypt
```

→ Tyto body lze mapovat na testy

#### 3. HITL Checkpoint

Specifikace poskytuje přirozený checkpoint pro lidskou kontrolu:

```
User request → Spec generation → [HITL: Review spec] → Implementation
```

Uživatel může:
- Schválit specifikaci
- Upravit specifikaci
- Odmítnout a přeformulovat zadání

#### 4. Trvalý záznam

Specifikace slouží jako dokumentace pro budoucí údržbu:
- Co bylo požadováno
- Jaká rozhodnutí byla učiněna
- Jaké trade-offs byly zvoleny

### Porovnání přístupů

| Aspekt | Code-First | Doc-First |
|--------|------------|-----------|
| Rychlost startu | ✅ Rychlejší | ⚠️ O spec pomalejší |
| Kvalita kontextu | ⚠️ Omezený | ✅ Strukturovaný |
| Validace | ⚠️ Ad-hoc | ✅ Definovaná |
| HITL opportunity | ⚠️ Až při review | ✅ Před implementací |
| Dokumentace | ⚠️ Často chybí | ✅ Automaticky |
| Reprodukovatelnost | ⚠️ Těžká | ✅ Snadná |

### Kdy NE Documentation-First

Pro některé úkoly je doc-first overkill:
- Jednoduchý bugfix
- Typo fix
- Minor refactoring
- Formátování kódu

→ ADO bude mít konfiguraci pro přeskočení spec generace pro triviální úkoly.

## Consequences

### Positive
- ✅ Konzistentní, kvalitní výstupy
- ✅ Přirozené HITL checkpointy
- ✅ Automatická dokumentace
- ✅ Lepší context pro AI agenty
- ✅ Validovatelné acceptance criteria

### Negative
- ⚠️ Delší čas na první výstup
- ⚠️ Overhead pro triviální úkoly
- ⚠️ Nutnost review další artifact (spec)

### Mitigation
- Konfigurovatelné skipování pro triviální úkoly
- Automatické detekce task typu (trivial vs complex)
- Paralelní generace spec a příprava prostředí

## Implementation

### Workflow

```
┌─────────────────┐
│   User Input    │
│   (Prompt)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Task Analysis  │
│  - Complexity?  │
│  - Type?        │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Trivial │──────────────────┐
    └────┬────┘                  │
         │ Complex               │
         ▼                       │
┌─────────────────┐              │
│ Spec Generation │              │
│ - Structure     │              │
│ - Criteria      │              │
│ - Test plan     │              │
└────────┬────────┘              │
         │                       │
         ▼                       │
┌─────────────────┐              │
│ HITL Checkpoint │              │
│ (if configured) │              │
└────────┬────────┘              │
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
           ┌─────────────────┐
           │ Implementation  │
           │ (with spec as   │
           │  context)       │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │   Validation    │
           │ (against spec   │
           │  criteria)      │
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │    Delivery     │
           │ + Doc Update    │
           └─────────────────┘
```

### Configuration

```yaml
documentation:
  workflow: "doc-first"  # doc-first | code-first | auto

  # Auto-detection rules
  autoDetection:
    trivialPatterns:
      - "fix typo"
      - "update readme"
      - "bump version"
    complexPatterns:
      - "implement"
      - "create"
      - "refactor"
      - "add feature"

  # Spec generation
  spec:
    template: "./templates/spec.md"
    outputDir: "./docs/specs"
    required: true  # false = skip spec for trivial

  # HITL
  hitlOnSpec: true  # false = auto-approve specs
```

## References

- [Documentation-Driven Development](https://gist.github.com/zsup/9434452)
- [Spec by Example](https://en.wikipedia.org/wiki/Specification_by_example)
- [Design Documents at Google](https://www.industrialempathy.com/posts/design-docs-at-google/)

---

**Date:** 2025-01
**Authors:** ADO Team
