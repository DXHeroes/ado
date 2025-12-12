# Documentation-First Workflow

## Přehled

Documentation-First (Doc-First) je klíčový princip ADO, který vyžaduje vytvoření specifikace před jakoukoliv implementací. Tento přístup zajišťuje konzistenci, trasovatelnost a kvalitu výstupu.

## Proč Doc-First?

```
Tradiční přístup:              Doc-First přístup:

Prompt → Kód                   Prompt → Specifikace → Review → Kód
                                              ↓
  ❌ Nejasné požadavky                   ✓ Jasné požadavky
  ❌ Těžká validace                      ✓ Měřitelná kritéria
  ❌ Žádná historie                      ✓ Dokumentovaná historie
  ❌ Složitá údržba                      ✓ Snadná údržba
```

## Workflow v praxi

### Krok 1: Zadání úkolu

```bash
ado run "Implementuj systém notifikací s podporou email a push notifikací"
```

### Krok 2: Automatická analýza

ADO analyzuje požadavek a vytváří strukturovanou specifikaci:

```
⏳ Analyzuji požadavek...

📊 Analýza:
├── Typ: feature (complex)
├── Komponenty: 3
├── Odhadovaný rozsah: 8-12 souborů
└── Dependencies: nodemailer, firebase-admin
```

### Krok 3: Generování specifikace

```markdown
# SPEC-045: Notification System

## Metadata
- ID: SPEC-045
- Created: 2025-01-15
- Author: ADO (claude-code)
- Status: Draft

## Cíl
Implementovat systém notifikací podporující email a push notifikace
s možností preference uživatele a retry logiky.

## Scope

### In Scope
- Email notifikace (SMTP via nodemailer)
- Push notifikace (FCM via firebase-admin)
- Uživatelské preference
- Retry logika pro selhané notifikace
- Template systém

### Out of Scope
- SMS notifikace
- In-app notifikace
- Real-time WebSocket notifikace

## Technical Design

### Architecture
\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Notification│────▶│  Channel    │────▶│  Provider   │
│   Service   │     │  Router     │     │  (Email/Push│
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       ▼                                       ▼
┌─────────────┐                         ┌─────────────┐
│   Queue     │                         │   Retry     │
│  (Redis)    │                         │   Handler   │
└─────────────┘                         └─────────────┘
\`\`\`

### Data Models
\`\`\`typescript
interface Notification {
  id: string;
  userId: string;
  type: 'email' | 'push';
  template: string;
  data: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed';
  retryCount: number;
  sentAt?: Date;
  createdAt: Date;
}

interface UserPreferences {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}
\`\`\`

### API Endpoints
- POST /notifications - Odeslat notifikaci
- GET /notifications/:id - Stav notifikace
- GET /users/:id/preferences - Preference uživatele
- PUT /users/:id/preferences - Aktualizace preferencí

## Acceptance Criteria
- [ ] Email notifikace jsou doručeny do 30 sekund
- [ ] Push notifikace jsou doručeny do 5 sekund
- [ ] Selhané notifikace jsou retry 3x s exponential backoff
- [ ] Uživatel může vypnout konkrétní typ notifikací
- [ ] Quiet hours jsou respektovány
- [ ] 95% test coverage

## Files to Create/Modify
- src/services/notification.service.ts (new)
- src/services/email.provider.ts (new)
- src/services/push.provider.ts (new)
- src/routes/notifications.ts (new)
- src/models/notification.ts (new)
- src/queue/notification.queue.ts (new)
- prisma/schema.prisma (modify)
- tests/notification.test.ts (new)

## Dependencies
- nodemailer: ^6.9.0
- firebase-admin: ^11.0.0

## Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Email delivery delays | Medium | Medium | Queue + retry |
| FCM rate limits | Low | High | Rate limiting |

## Estimated Effort
- Implementation: ~45 min
- Testing: ~20 min
- Documentation: ~10 min
- Total: ~75 min
```

### Krok 4: Human Review

```
═══════════════════════════════════════════════════════════════
📋 SPECIFICATION REVIEW

Specifikace byla vygenerována. Prosím zkontrolujte.

Preview: docs/specs/SPEC-045-notification-system.md

Summary:
- 8 souborů k vytvoření/modifikaci
- 2 nové dependencies
- Estimated: 75 min
- Coverage target: 95%

═══════════════════════════════════════════════════════════════

Options:
  [A] Approve - pokračovat s implementací
  [M] Modify - upravit specifikaci
  [V] View - zobrazit celou specifikaci
  [R] Reject - zrušit úkol

Choice [A]:
```

### Krok 5: Implementace podle specifikace

Po schválení ADO implementuje přesně podle specifikace:

```
🔨 Implementuji podle SPEC-045...

Checklist:
├── [✓] NotificationService           ✓ Matches spec
├── [✓] EmailProvider                 ✓ Matches spec
├── [✓] PushProvider                  ✓ Matches spec
├── [▶] Routes                        In progress...
├── [⏸] Queue handler                 Pending
└── [⏸] Tests                         Pending
```

### Krok 6: Validace proti specifikaci

```
🧪 Validuji proti SPEC-045...

Acceptance Criteria:
├── [✓] Email delivery < 30s          PASS (avg: 2.3s)
├── [✓] Push delivery < 5s            PASS (avg: 0.8s)
├── [✓] Retry logic (3x)              PASS
├── [✓] User preferences              PASS
├── [✓] Quiet hours                   PASS
├── [✓] Test coverage 95%             PASS (97%)

All criteria met! ✓
```

## Struktura specifikací

### Adresář pro specifikace

```
project/
├── docs/
│   └── specs/
│       ├── SPEC-001-initial-setup.md
│       ├── SPEC-002-auth-system.md
│       ├── SPEC-045-notification-system.md
│       └── index.md                    # Seznam všech specs
```

### Template specifikace

```yaml
# Konfigurace template
paths:
  specs: "docs/specs"

templates:
  spec:
    path: ".ado/templates/spec.md"
    variables:
      - id
      - title
      - author
      - date
```

## Úpravy specifikace

### Před implementací

```bash
# Interaktivní úprava
ado run "..." --edit-spec

# Nebo při review
Choice [A]: M

# Otevře editor pro úpravu specifikace
```

### Během implementace

Pokud je potřeba změnit scope během implementace:

```
⚠️ SCOPE CHANGE DETECTED

Během implementace byl identifikován dodatečný požadavek:
- Přidání rate limiting pro notifikace

Options:
  [A] Add to current spec - přidat do SPEC-045
  [N] New spec - vytvořit novou specifikaci
  [S] Skip - ignorovat (není nutné)
  [P] Pause - pozastavit pro manuální rozhodnutí

Choice [A]:
```

## Trasovatelnost

### Propojení kódu a specifikace

```typescript
/**
 * Notification Service
 *
 * @spec SPEC-045
 * @see docs/specs/SPEC-045-notification-system.md
 */
export class NotificationService {
  // ...
}
```

### Git commit reference

```
feat(notifications): implement notification system

Implements SPEC-045: Notification System
- Email notifications via nodemailer
- Push notifications via FCM
- Retry logic with exponential backoff

Spec: docs/specs/SPEC-045-notification-system.md
```

### Changelog entry

```markdown
## [1.5.0] - 2025-01-15

### Added
- Notification system with email and push support (SPEC-045)
```

## Konfigurace Doc-First

```yaml
# ado.config.yaml
documentation:
  # Vyžadovat specifikaci
  requireSpec: true

  # Automaticky generovat spec pro všechny úkoly
  autoGenerateSpec: true

  # Minimální obsah specifikace
  requiredSections:
    - goal
    - scope
    - acceptance_criteria

  # Template
  template: ".ado/templates/spec.md"

  # Cesta pro ukládání
  specsPath: "docs/specs"

  # Pojmenování
  naming:
    pattern: "SPEC-{number}-{slug}.md"
    numberPadding: 3

  # Propojení s kódem
  codeReferences:
    enabled: true
    annotation: "@spec"
```

## Best Practices

### 1. Definujte jasná acceptance criteria

```markdown
## Acceptance Criteria
- [ ] User can send email notification (measurable)
- [ ] Response time < 100ms (specific)
- [ ] Error rate < 0.1% (quantified)
```

### 2. Dokumentujte scope boundaries

```markdown
### In Scope
- Feature A
- Feature B

### Out of Scope
- Feature C (will be in SPEC-046)
- Feature D (not required)
```

### 3. Odhadujte effort

```markdown
## Estimated Effort
- Implementation: ~2 hours
- Testing: ~1 hour
- Documentation: ~30 min
```

### 4. Identifikujte rizika

```markdown
## Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API rate limit | Medium | High | Implement caching |
```

---

## Souvislosti

- [Autonomous Mode](./autonomous-mode.md)
- [Checkpoints & HITL](./checkpoints-hitl.md)
- [FR-003: Documentation Workflow](../../02-requirements/01-functional/FR-003-documentation-workflow.md)
