# FR-003: Documentation-First Workflow

## Přehled

ADO musí implementovat documentation-first přístup, kde každý významný úkol začíná vytvořením technické specifikace a dokumentace, která slouží jako kontext pro implementaci a jako trvalý záznam pro budoucí údržbu.

## Požadavky

### FR-003.1: Automatická generace specifikace

**Popis:** Systém automaticky vytvoří technickou specifikaci pro každý task.

**Akceptační kritéria:**
- [ ] Analyzuje prompt a vytvoří strukturovanou specifikaci
- [ ] Specifikace obsahuje všechny povinné sekce
- [ ] Formát je konzistentní (markdown)
- [ ] Uloženo do konfigurovaného adresáře
- [ ] Verzování specifikací

**Povinné sekce specifikace:**
1. **Název a ID** - Jednoznačná identifikace
2. **Cíl** - Co má být dosaženo
3. **Scope** - Co je a není součástí
4. **Technický návrh** - Architektura, komponenty
5. **Datové modely** - Schémata, typy
6. **API design** - Endpointy, kontrakty (pokud relevantní)
7. **Acceptance criteria** - Měřitelná kritéria úspěchu
8. **Test plán** - Jak bude testováno
9. **Rizika** - Identifikovaná rizika a mitigace

**Příklad výstupu:**
```markdown
# SPEC-001: User Authentication API

## Metadata
- **ID:** SPEC-001
- **Created:** 2025-01-15
- **Author:** ADO (auto-generated)
- **Status:** Draft

## Cíl
Implementovat REST API pro autentizaci uživatelů pomocí JWT tokenů.

## Scope

### In Scope
- User registration endpoint
- Login/logout endpoints
- JWT token generation and validation
- Password hashing (bcrypt)
- Refresh token mechanism

### Out of Scope
- OAuth/SSO integration
- Two-factor authentication
- Password reset flow

## Technický návrh

### Komponenty
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Routes     │────▶│  Services   │────▶│  Database   │
│  /auth/*    │     │  AuthService│     │  users      │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Datový model
```typescript
interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## API Design

### POST /auth/register
- Input: `{ email: string, password: string }`
- Output: `{ user: User, token: string }`

### POST /auth/login
- Input: `{ email: string, password: string }`
- Output: `{ token: string, refreshToken: string }`

## Acceptance Criteria
- [ ] User can register with email/password
- [ ] User can login and receive JWT
- [ ] Invalid credentials return 401
- [ ] Passwords are hashed with bcrypt
- [ ] JWT expires after configured time

## Test Plan
- Unit tests for AuthService
- Integration tests for endpoints
- Security tests for token validation

## Rizika
- **R1:** Weak password policy → Implement validation
- **R2:** Token theft → Short expiry + refresh tokens
```

### FR-003.2: HITL review specifikace

**Popis:** Uživatel může volitelně reviewovat a upravit specifikaci před implementací.

**Akceptační kritéria:**
- [ ] Checkpoint po vytvoření specifikace (konfigurabilní)
- [ ] CLI zobrazí specifikaci pro review
- [ ] Uživatel může approve/reject/modify
- [ ] Modifikace se ukládají a verzují
- [ ] Při reject se task ukončí s důvodem

**Interakce:**
```bash
$ ado run "Create auth API"

📝 Specification generated: SPEC-001

Do you want to review the specification before implementation?
[Y]es / [N]o / [V]iew

> V

[Zobrazí se specifikace]

Actions:
[A]pprove / [M]odify / [R]eject

> A

✓ Specification approved. Starting implementation...
```

### FR-003.3: Specifikace jako kontext

**Popis:** Specifikace je automaticky použita jako kontext pro implementační agenty.

**Akceptační kritéria:**
- [ ] Agent obdrží specifikaci jako součást promptu
- [ ] Kontext obsahuje relevantní sekce pro daný subtask
- [ ] Postupně se přidávají výstupy předchozích subtasků
- [ ] Omezení velikosti kontextu (summarizace)

**Context building:**
```typescript
interface TaskContext {
  specification: string;
  previousOutputs: SubtaskOutput[];
  projectContext: string;  // CLAUDE.md apod.
  relevantFiles: string[];
}

// Pro každý subtask
const context = buildContext({
  spec: fullSpec,
  currentSubtask: subtask,
  completedSubtasks: completed,
  maxTokens: 50000
});
```

### FR-003.4: Aktualizace dokumentace

**Popis:** Po dokončení implementace je dokumentace automaticky aktualizována.

**Akceptační kritéria:**
- [ ] README.md aktualizován o nové features
- [ ] API dokumentace synchronizována s kódem
- [ ] Specifikace označena jako implementovaná
- [ ] Changelog aktualizován
- [ ] JSDoc/TSDoc generován pro nový kód

**Aktualizace flow:**
```
Implementation complete
        │
        ▼
┌───────────────────┐
│ Update README.md  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Generate API docs │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Update CHANGELOG  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Mark spec as done │
└───────────────────┘
```

### FR-003.5: Dokumentační templates

**Popis:** Systém používá konfigurovatelné templates pro generování dokumentace.

**Akceptační kritéria:**
- [ ] Default templates pro různé typy úkolů
- [ ] Custom templates v projektu
- [ ] Template variables pro dynamický obsah
- [ ] Validace template struktury

**Template příklad:**
```markdown
# {{title}}

## Metadata
- **ID:** {{id}}
- **Type:** {{type}}
- **Created:** {{date}}
- **Author:** ADO

## Overview
{{#if description}}
{{description}}
{{else}}
[Auto-generated from prompt]
{{/if}}

## Technical Design
{{technical_design}}

## Acceptance Criteria
{{#each criteria}}
- [ ] {{this}}
{{/each}}

{{#if risks}}
## Risks
{{#each risks}}
- **{{name}}:** {{description}} → {{mitigation}}
{{/each}}
{{/if}}
```

### FR-003.6: Dokumentace jako validace

**Popis:** Acceptance criteria ze specifikace slouží jako základ pro validaci.

**Akceptační kritéria:**
- [ ] Parser extrahuje acceptance criteria ze spec
- [ ] Kritéria jsou mapována na testy
- [ ] Report ukazuje splnění kritérií
- [ ] Nesplněná kritéria blokují dokončení

**Validace flow:**
```
Specification
     │
     ▼
Extract acceptance criteria
     │
     ▼
Map to test results
     │
     ▼
┌─────────────────────────────────────┐
│ Criteria Validation Report          │
├─────────────────────────────────────┤
│ ✓ User can register                 │
│ ✓ User can login                    │
│ ✓ Invalid credentials return 401   │
│ ✗ Passwords hashed with bcrypt     │ ← Blocking
│ ✓ JWT expires after config time    │
└─────────────────────────────────────┘
```

---

## Konfigurace

```yaml
documentation:
  enabled: true

  specification:
    required: true
    outputDir: "./docs/specs"
    template: "./templates/spec.md"
    reviewRequired: true  # HITL checkpoint

  templates:
    feature: "./templates/feature-spec.md"
    bugfix: "./templates/bugfix-spec.md"
    refactor: "./templates/refactor-spec.md"

  updates:
    readme: true
    changelog: true
    apiDocs: true
    jsdoc: true

  validation:
    mapCriteriaToTests: true
    blockOnUnmetCriteria: true
```

---

## Souvislosti

- [FR-001: Autonomous Execution](./FR-001-autonomous-execution.md)
- [Principles: Documentation-First](../../01-vision/02-principles.md)
- [Design: Doc-First Pipeline](../../04-design/02-autonomous-workflow/doc-first-pipeline.md)
