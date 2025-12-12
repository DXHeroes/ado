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

## Escalation Thresholds

ADO automatically escalates to human review when certain thresholds are reached. This prevents wasted compute and cost on tasks that AI cannot complete autonomously.

### Automatic Escalation Triggers

```typescript
// Escalation thresholds based on OpenHands research
interface EscalationThresholds {
  // Iteration-based escalation
  maxIterations: 10;              // Max attempts before escalation
  stuckDetection: {
    sameErrorCount: 3;             // Same error 3 times → stuck
    similarityThreshold: 0.9;      // 90% similar errors → stuck
  };

  // Time-based escalation
  maxTaskDuration: {
    simple: 15 * 60 * 1000;        // 15 minutes
    medium: 30 * 60 * 1000;        // 30 minutes
    complex: 60 * 60 * 1000;       // 60 minutes
  };

  // Progress-based escalation
  noProgressIterations: 5;         // 5 iterations without progress

  // Cost-based escalation
  costThreshold: {
    warningAt: 0.8;                // Warn at 80% of budget
    escalateAt: 1.0;               // Escalate at 100%
  };
}
```

### Iteration Escalation Hierarchy

ADO follows a graduated escalation strategy based on iteration count:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Escalation Hierarchy                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Iterations 1-3:  RETRY
                 ├─ Same approach, prompt variation
                 ├─ Add more context to AI
                 └─ Structured error feedback

Iterations 4-5:  STUCK DETECTION
                 ├─ Check for repeating errors
                 ├─ Semantic similarity analysis
                 └─ Trigger if same error 3+ times

Iterations 6-7:  DIFFERENT APPROACH
                 ├─ Try alternative implementation
                 ├─ Use different AI model
                 └─ Break task into smaller subtasks

Iterations 8-9:  PARTIAL COMPLETION
                 ├─ Accept current progress
                 ├─ Add TODO comments for remaining work
                 └─ Document what's incomplete

Iteration 10:    HUMAN ESCALATION
                 ├─ Pause task execution
                 ├─ Notify team
                 └─ Provide detailed context for human intervention
```

### Example: Stuck Detection

```
═══════════════════════════════════════════════════════════════
⚠️ STUCK STATE DETECTED

ADO has been stuck on the same error for 3 iterations:

Iteration 7:
  ✗ src/payment.ts:42: Type 'string | undefined' is not assignable to type 'string'

Iteration 8:
  ✗ src/payment.ts:42: Type 'string | undefined' is not assignable to type 'string'

Iteration 9:
  ✗ src/payment.ts:42: Type 'string | undefined' is not assignable to type 'string'

Similarity: 100% (same error repeated)

═══════════════════════════════════════════════════════════════

What would you like to do?

  [1] 🔄 Try different approach
  [2] ✎ Provide guidance
  [3] ⏭ Accept partial completion
  [4] ✗ Cancel task

Choice [1]:
```

### Time-Based Escalation

Complex tasks that exceed expected duration automatically trigger HITL:

```
═══════════════════════════════════════════════════════════════
⏱️ TASK DURATION WARNING

Task: Implement OAuth2 integration
Complexity: High
Duration: 32 minutes
Expected: 30 minutes

The task is taking longer than expected.

Progress:
  ✓ Specification complete
  ✓ Implementation in progress (75%)
  ⏳ Validation pending
  ⏸ Finalization pending

═══════════════════════════════════════════════════════════════

Options:

  [1] ⏭ Continue - extend timeout to 60 minutes
  [2] 👁 Review progress - see what's been done
  [3] ⏸ Pause - save state for later
  [4] ✗ Cancel - stop execution

Choice [1]:
```

### No Progress Detection

If 5 consecutive iterations show no progress (no new files, no tests passing, same errors):

```typescript
// Progress tracking
interface ProgressMetrics {
  iteration: number;
  timestamp: Date;

  // File changes
  filesModified: number;
  linesAdded: number;
  linesRemoved: number;

  // Quality improvements
  testsAdded: number;
  testsPassing: number;
  coverageChange: number;

  // Error reduction
  errorCount: number;
  errorsFixed: number;
  newErrors: number;
}

// No progress if:
// - 0 files modified in last 3 iterations
// - 0 tests added or fixed
// - Same or more errors
// - No coverage improvement
function detectNoProgress(metrics: ProgressMetrics[]): boolean {
  const lastFive = metrics.slice(-5);

  return lastFive.every(m =>
    m.filesModified === 0 &&
    m.testsAdded === 0 &&
    m.testsPassing === metrics[0].testsPassing &&
    m.errorCount >= metrics[0].errorCount
  );
}
```

### Escalation Example

```
═══════════════════════════════════════════════════════════════
🚨 ESCALATION TO HUMAN

Task: Implement payment webhook handler
Reason: No progress for 5 iterations

Timeline:
  Iteration 1-3: Setup webhook endpoint (✓)
  Iteration 4-8: Stuck on signature verification (✗)

Error history:
  Iteration 4: InvalidSignatureError: Verification failed
  Iteration 5: InvalidSignatureError: Verification failed
  Iteration 6: InvalidSignatureError: Verification failed
  Iteration 7: InvalidSignatureError: Verification failed
  Iteration 8: InvalidSignatureError: Verification failed

AI attempts:
  ✗ Tried different signature algorithm
  ✗ Tried raw payload verification
  ✗ Tried timestamp validation
  ✗ Tried header parsing variation
  ✗ Tried webhook library

What's been completed:
  ✓ Webhook endpoint created (/api/webhooks/stripe)
  ✓ Request parsing logic
  ✓ Event type routing
  ✓ Tests for happy path (85% coverage)

What's incomplete:
  ✗ Signature verification
  ✗ Replay attack prevention
  ✗ Error handling for invalid signatures

Cost so far: $3.50
Estimated to complete: Unknown

═══════════════════════════════════════════════════════════════

Recommended actions:

  [1] 🔍 Review Stripe documentation
  [2] 👤 Assign to developer with Stripe experience
  [3] ⏭ Skip signature verification (add TODO)
  [4] ✗ Cancel and replan

Choice [1]:
```

## Configuration

### Escalation Threshold Configuration

```yaml
# ado.config.yaml
hitl:
  escalation:
    # Iteration-based thresholds
    maxIterations: 10
    stuckDetection:
      enabled: true
      sameErrorCount: 3
      similarityThreshold: 0.9

    # Time-based thresholds
    maxDuration:
      simple: 15   # minutes
      medium: 30
      complex: 60

    # Progress-based thresholds
    noProgressIterations: 5
    progressMetrics:
      requireFileChanges: true
      requireTestProgress: true
      requireErrorReduction: true

    # Cost-based thresholds
    cost:
      warningAt: 0.8      # 80% of budget
      pauseAt: 0.95       # 95% of budget
      escalateAt: 1.0     # 100% of budget

    # Notification settings
    notifications:
      onStuck: true
      onTimeout: true
      onNoProgress: true
      channels:
        - slack
        - email

    # Auto-escalation actions
    autoActions:
      onStuck: "pause_and_notify"        # or "continue", "cancel"
      onTimeout: "pause_and_notify"
      onNoProgress: "retry_different_approach"
```

### Per-Task Escalation Override

```bash
# Run task with custom escalation thresholds
ado run "Implement feature" \
  --max-iterations 15 \
  --max-duration 45 \
  --stuck-threshold 4

# Run task with escalation disabled (use cautiously!)
ado run "Simple fix" \
  --no-escalation \
  --max-iterations 3
```

### Escalation Metrics

Track escalation patterns over time:

```prometheus
# Escalation metrics
ado_escalation_total{reason,task_type} counter
ado_escalation_duration_seconds{reason} histogram
ado_escalation_iteration_when_triggered{reason} histogram

# Resolution metrics
ado_escalation_resolution{action} counter
ado_escalation_resolution_duration_seconds histogram

# Example queries:
# - Escalation rate by reason
# - Average iterations before escalation
# - Most common stuck points
# - Human intervention effectiveness
```

### Slack Integration for Escalation

```typescript
// Automatic Slack notification on escalation
async function notifyEscalation(
  task: Task,
  reason: EscalationReason,
  context: EscalationContext
): Promise<void> {
  await slackClient.chat.postMessage({
    channel: '#ado-escalations',
    text: `🚨 Task escalated: ${task.title}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚨 Task Escalation: ${task.id}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Task:* ${task.title}\n*Reason:* ${reason}\n*Iteration:* ${context.iteration}/${context.maxIterations}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Duration:*\n${formatDuration(context.duration)}`,
          },
          {
            type: 'mrkdwn',
            text: `*Cost:*\n$${context.cost.toFixed(2)}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error:*\n\`\`\`\n${context.lastError}\n\`\`\``,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review Task' },
            url: `https://ado.example.com/tasks/${task.id}`,
            style: 'primary',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Logs' },
            url: `https://ado.example.com/tasks/${task.id}/logs`,
          },
        ],
      },
    ],
  });
}
```

---

## Souvislosti

- [Autonomous Mode](./autonomous-mode.md)
- [Doc-First Workflow](./doc-first-workflow.md)
- [Test & Build Validation](../../04-design/02-autonomous-workflow/test-build-validation.md)
- [Temporal Workflows](../../04-design/02-autonomous-workflow/temporal-workflows.md)
- [FR-006: HITL Checkpoints](../../02-requirements/01-functional/FR-006-hitl-checkpoints.md)
- [tRPC: Checkpoints](../../05-api/01-trpc-procedures/checkpoints.md)
