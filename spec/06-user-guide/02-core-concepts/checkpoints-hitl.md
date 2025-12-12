# Checkpoints & HITL (Human-in-the-Loop)

## Přehled

Checkpoints jsou body v průběhu úkolu, kde ADO uloží stav a může požádat o lidskou kontrolu. HITL (Human-in-the-Loop) je mechanismus pro zapojení člověka do rozhodovacího procesu.

## Jak fungují checkpointy

```
Task Start
    │
    ▼
┌─────────────┐
│  Checkpoint │ ← Auto checkpoint (každých 5 min)
│    #1       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  HITL       │ ← Specifikace - vyžaduje schválení
│  Checkpoint │
│    #2       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Checkpoint │ ← Phase change checkpoint
│    #3       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  HITL       │ ← Validace selhala - vyžaduje rozhodnutí
│  Checkpoint │
│    #4       │
└──────┬──────┘
       │
       ▼
Task Complete
```

## Typy checkpointů

### 1. Automatické checkpointy (Auto)

Vytvářejí se automaticky v pravidelných intervalech.

```yaml
# Konfigurace
checkpoints:
  auto:
    interval: 300         # Každých 5 minut
    onSubtaskComplete: true
```

**Účel:** Recovery při selhání, možnost návratu k předchozímu stavu.

### 2. Phase checkpointy

Vytvářejí se při přechodu mezi fázemi úkolu.

```
Specification → Implementation → Validation → Finalization
      │               │              │              │
   Checkpoint     Checkpoint    Checkpoint    Checkpoint
```

### 3. HITL checkpointy

Vyžadují lidské rozhodnutí.

```typescript
// Příklady HITL situací
type HITLTrigger =
  | 'specification_review'     // Review specifikace
  | 'architecture_decision'    // Architektonické rozhodnutí
  | 'validation_failure'       // Selhání validace
  | 'cost_threshold'           // Překročení nákladů
  | 'high_risk_change'         // Riziková změna
  | 'external_dependency'      // Závislost na externím systému
```

### 4. Error checkpointy

Vytvářejí se před pokusem o recovery z chyby.

```
Error detected
     │
     ▼
Create checkpoint ← Uloží stav před pokusem o opravu
     │
     ▼
Attempt recovery
     │
     ├── Success → Continue
     │
     └── Failure → Restore from checkpoint
```

## HITL rozhodnutí

### Specifikace Review

```
═══════════════════════════════════════════════════════════════
📋 SPECIFICATION REVIEW

Task: Implementovat platební gateway

SPEC-042: Payment Gateway Integration

Scope:
- Integrace se Stripe API
- Vytvoření payment service
- Webhook handling pro události
- Uložení transakčních dat

Estimated:
- Duration: ~45 min
- Cost: ~$0.50 (if using API)
- Files: 8 new, 3 modified

═══════════════════════════════════════════════════════════════

What would you like to do?

  [1] ✓ Approve and continue
  [2] ✎ Request modifications
  [3] ✗ Reject and cancel
  [4] ⏸ Pause for later

Choice [1]:
```

### Architektonické rozhodnutí

```
═══════════════════════════════════════════════════════════════
🏗️ ARCHITECTURE DECISION REQUIRED

I need to make an architectural decision:

How should we handle payment state management?

Options:

[1] Local state with database sync (Recommended)
    + Simpler implementation
    + Works offline
    - Potential sync issues

[2] Real-time state via WebSocket
    + Always in sync
    + Better UX
    - More complex

[3] Polling approach
    + Simplest
    - Higher latency
    - More API calls

═══════════════════════════════════════════════════════════════

Select option [1]:
```

### Validation Failure

```
═══════════════════════════════════════════════════════════════
⚠️ VALIDATION FAILED

Test failures detected:

  FAIL src/services/payment.test.ts
    ✗ should process payment successfully
      Expected: { status: 'completed' }
      Received: { status: 'pending' }

    ✗ should handle webhook events
      Error: Missing signature verification

Coverage: 72% (required: 80%)

═══════════════════════════════════════════════════════════════

What would you like to do?

  [1] 🔄 Retry - let AI fix the issues
  [2] ✎ Modify - provide guidance
  [3] ⏭ Skip - accept current state
  [4] ↩ Rollback - restore last checkpoint
  [5] ✗ Cancel - abort task

Choice [1]:
```

### Cost Threshold

```
═══════════════════════════════════════════════════════════════
💰 COST THRESHOLD WARNING

The task is approaching the cost limit:

Current cost: $8.50
Limit: $10.00
Estimated remaining: $3.00

Progress: 75% complete

═══════════════════════════════════════════════════════════════

Options:

  [1] 📈 Increase limit to $15.00
  [2] ⏸ Pause and save progress
  [3] ✓ Continue (may exceed limit)
  [4] ✗ Stop and finalize current state

Choice [2]:
```

## Konfigurace HITL

### Základní konfigurace

```yaml
hitl:
  defaultPolicy: "spec-review"

  checkpoints:
    specification: true      # Review specifikace
    architecture: true       # Review architektury
    implementation: false    # Bez review implementace
    validation: false        # Bez review validace
```

### Pokročilá konfigurace

```yaml
hitl:
  defaultPolicy: "checkpoint"

  checkpoints:
    specification: true
    architecture: true
    implementation: false
    validation: true

  # Automatické akce při timeout
  timeout:
    duration: 3600           # 1 hodina
    action: "pause"          # approve | reject | pause

  # Notifikace
  notifications:
    email: true
    slack: true
    webhook: "https://hooks.example.com/ado"

  # Eskalace
  escalation:
    afterMinutes: 30
    to: "team-lead@example.com"

  # Auto-approve podmínky
  autoApprove:
    lowRiskChanges: true     # Automaticky schválit nízké riziko
    minorFixes: true         # Automaticky schválit drobné opravy
    maxCost: 1.00            # Auto-approve pod $1
```

## CLI příkazy pro checkpointy

### Zobrazení checkpointů

```bash
# Seznam checkpointů pro úkol
ado checkpoints list --task task-123

# ID          TYPE   HITL    STATUS    CREATED
# cp-001      auto   no      -         10:30:15
# cp-002      hitl   yes     decided   10:35:22
# cp-003      phase  no      -         10:42:18
```

### Čekající HITL rozhodnutí

```bash
# Zobrazit čekající rozhodnutí
ado hitl pending

# TASK       CHECKPOINT  TYPE          TIMEOUT
# task-123   cp-005      spec_review   55m remaining
# task-124   cp-002      validation    2h remaining
```

### Rozhodnutí z CLI

```bash
# Schválit
ado hitl approve cp-005

# Zamítnout
ado hitl reject cp-005 --reason "Needs more detail"

# Modifikovat
ado hitl modify cp-005 --feedback "Add error handling"
```

### Obnovení z checkpointu

```bash
# Obnovit stav z checkpointu
ado checkpoint restore cp-003

# S důvodem
ado checkpoint restore cp-003 --reason "Implementation went wrong"
```

## Dashboard HITL

Pro týmy s více úkoly je k dispozici webový dashboard:

```
┌─────────────────────────────────────────────────────────────────┐
│  ADO Dashboard - Pending Decisions                    [Refresh] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ⚠ 3 decisions pending                                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Task: Implement payment gateway                         │   │
│  │ Type: Specification Review                              │   │
│  │ Time remaining: 55 minutes                              │   │
│  │                                                         │   │
│  │ [Approve] [Modify] [Reject]                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Task: Fix authentication bug                            │   │
│  │ Type: Validation Failure                                │   │
│  │ Time remaining: 2 hours                                 │   │
│  │                                                         │   │
│  │ [Retry] [Skip] [Rollback] [Cancel]                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Best Practices

### 1. Nastavte rozumné timeouty

```yaml
hitl:
  timeout:
    duration: 3600    # 1 hodina pro většinu úkolů
    action: "pause"   # Bezpečná výchozí akce
```

### 2. Používejte notifikace

```yaml
hitl:
  notifications:
    email: true
    slack: true
```

### 3. Definujte auto-approve pravidla

```yaml
hitl:
  autoApprove:
    lowRiskChanges: true
    maxCost: 1.00
```

### 4. Pravidelně kontrolujte čekající rozhodnutí

```bash
# Přidejte do denní rutiny
ado hitl pending
```

---

## Souvislosti

- [Autonomous Mode](./autonomous-mode.md)
- [Doc-First Workflow](./doc-first-workflow.md)
- [FR-006: HITL Checkpoints](../../02-requirements/01-functional/FR-006-hitl-checkpoints.md)
- [tRPC: Checkpoints](../../05-api/01-trpc-procedures/checkpoints.md)
