# FR-006: HITL Checkpoints

## Přehled

ADO musí poskytovat mechanismus Human-in-the-Loop (HITL) checkpoints, které umožňují lidskou kontrolu a schvalování na strategických bodech autonomního provádění úkolů.

## Požadavky

### FR-006.1: Checkpoint definice

**Popis:** Systém definuje standardní checkpointy v task lifecycle.

**Akceptační kritéria:**
- [ ] Pre-defined checkpoint types
- [ ] Custom checkpoint support
- [ ] Conditional checkpoints
- [ ] Checkpoint metadata
- [ ] Checkpoint history

**Standardní checkpointy:**
```typescript
type CheckpointType =
  | 'spec_review'        // Po vytvoření specifikace
  | 'architecture'       // Před architektonickými změnami
  | 'implementation'     // Po implementaci, před testy
  | 'quality_gate'       // Při selhání quality gate
  | 'cost_threshold'     // Při překročení cost limitu
  | 'security_alert'     // Při bezpečnostním nálezu
  | 'conflict'           // Při merge konfliktu
  | 'custom';            // User-defined

interface Checkpoint {
  id: string;
  type: CheckpointType;
  taskId: string;
  createdAt: Date;

  // Context for decision
  title: string;
  description: string;
  context: Record<string, unknown>;

  // Options
  options: CheckpointOption[];
  defaultOption?: string;
  timeout?: number;  // Auto-approve after timeout

  // Resolution
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  resolvedAt?: Date;
  resolvedBy?: string;
  decision?: string;
  feedback?: string;
}
```

### FR-006.2: HITL policies

**Popis:** Konfigurovatelné politiky určující kdy vyžadovat lidský input.

**Akceptační kritéria:**
- [ ] Policy levels (autonomous → manual)
- [ ] Per-task override
- [ ] Per-checkpoint type configuration
- [ ] Time-based auto-approval
- [ ] Cost-based escalation

**Policy konfigurace:**
```yaml
hitl:
  defaultPolicy: "review-major"

  policies:
    autonomous:
      checkpoints: []  # No checkpoints

    review-spec:
      checkpoints:
        - spec_review

    review-major:
      checkpoints:
        - spec_review
        - architecture
        - security_alert

    review-all:
      checkpoints:
        - spec_review
        - architecture
        - implementation
        - quality_gate
        - security_alert
        - conflict

    manual:
      checkpoints: ["*"]  # All checkpoints

  # Override pro specifické situace
  overrides:
    - condition: "cost > 10"
      addCheckpoint: "cost_threshold"
    - condition: "securitySeverity == 'high'"
      addCheckpoint: "security_alert"
```

### FR-006.3: Checkpoint UI (CLI)

**Popis:** CLI poskytuje interaktivní rozhraní pro checkpoint rozhodování.

**Akceptační kritéria:**
- [ ] Clear presentation of context
- [ ] Multiple choice options
- [ ] Free-text feedback
- [ ] View more details option
- [ ] Skip/defer option

**CLI interakce:**
```
┌─────────────────────────────────────────────────────────────┐
│  CHECKPOINT: Specification Review                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Task: Create User Authentication API                       │
│  Type: spec_review                                          │
│                                                             │
│  A specification has been generated for your review.        │
│                                                             │
│  Summary:                                                   │
│  - 3 API endpoints (register, login, refresh)              │
│  - JWT-based authentication                                 │
│  - bcrypt password hashing                                  │
│  - Estimated: 15-20 minutes                                │
│                                                             │
│  Options:                                                   │
│  [A] Approve - Continue with implementation                 │
│  [M] Modify - Edit specification                            │
│  [V] View - See full specification                          │
│  [R] Reject - Cancel task                                   │
│  [D] Defer - Decide later (task paused)                    │
│                                                             │
│  Auto-approve in: 23:45:12 (if configured)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
>
```

### FR-006.4: Checkpoint UI (Dashboard)

**Popis:** Web dashboard zobrazuje pending checkpoints.

**Akceptační kritéria:**
- [ ] List pending checkpoints
- [ ] Filtering a sorting
- [ ] Detailed view
- [ ] Inline decision making
- [ ] Batch operations

### FR-006.5: Notifications

**Popis:** Systém notifikuje uživatele o pending checkpoints.

**Akceptační kritéria:**
- [ ] Multi-channel notifications (Slack, email, webhook)
- [ ] Notification obsahuje kontext pro rychlé rozhodnutí
- [ ] Deep link do CLI nebo dashboard
- [ ] Reminder pro long-pending checkpoints
- [ ] Escalation při timeout

**Slack notification příklad:**
```
🔔 ADO Checkpoint Required

Task: Create User Authentication API
Type: Specification Review

A specification has been generated and requires your approval.

Quick actions:
• ✅ Approve: /ado approve task-123
• 👁️ View: https://ado.example.com/tasks/123
• ❌ Reject: /ado reject task-123

⏰ Auto-approve in 24 hours
```

### FR-006.6: Checkpoint resolution

**Popis:** Zpracování rozhodnutí a pokračování v provádění.

**Akceptační kritéria:**
- [ ] Approve → pokračuj v provádění
- [ ] Reject → ukonči task s důvodem
- [ ] Modify → aplikuj změny, pokračuj
- [ ] Defer → pausni task
- [ ] Audit log všech rozhodnutí

**Resolution flow:**
```
Checkpoint triggered
        │
        ▼
Notify user(s)
        │
        ▼
Wait for decision
        │
        ├── Approve
        │      │
        │      └── Continue execution
        │
        ├── Reject
        │      │
        │      └── Cancel task
        │           │
        │           └── Log reason
        │
        ├── Modify
        │      │
        │      └── Apply modifications
        │           │
        │           └── Continue execution
        │
        └── Defer
               │
               └── Pause task
                    │
                    └── Resume later
```

### FR-006.7: Timeout handling

**Popis:** Automatické zpracování checkpointů při timeout.

**Akceptační kritéria:**
- [ ] Konfigurabilní timeout per checkpoint type
- [ ] Default action při timeout (approve/reject/escalate)
- [ ] Reminder notifications před timeout
- [ ] Escalation chain
- [ ] Override pro kritické checkpoints (no auto-action)

**Timeout konfigurace:**
```yaml
hitl:
  timeouts:
    spec_review:
      duration: 24h
      reminders: [1h, 6h, 12h]
      defaultAction: "approve"

    security_alert:
      duration: 48h
      reminders: [4h, 12h, 24h]
      defaultAction: "escalate"
      escalateTo: "security-team"

    cost_threshold:
      duration: 1h
      reminders: [15m, 30m]
      defaultAction: "reject"
```

### FR-006.8: Checkpoint analytics

**Popis:** Analytika checkpoint patterns pro optimalizaci workflow.

**Akceptační kritéria:**
- [ ] Average resolution time
- [ ] Approval/rejection rate
- [ ] Common modification patterns
- [ ] Bottleneck identification
- [ ] Recommendations

**Analytics report:**
```
Checkpoint Analytics (Last 30 days)
───────────────────────────────────

Total checkpoints: 156
Average resolution time: 2.3 hours

By Type:
├── spec_review: 45 (95% approved, avg 1.2h)
├── architecture: 12 (83% approved, avg 4.5h)
├── quality_gate: 67 (100% approved, avg 0.5h)
└── security_alert: 32 (78% approved, avg 6.2h)

Recommendations:
• Consider auto-approving quality_gate (100% approval rate)
• Security alerts taking long - consider dedicated reviewer
```

---

## Konfigurace

```yaml
hitl:
  enabled: true
  defaultPolicy: "review-major"

  checkpoints:
    spec_review:
      enabled: true
      timeout: 24h
      defaultAction: "approve"
      notify: ["slack", "email"]

    architecture:
      enabled: true
      timeout: 48h
      defaultAction: "defer"
      notify: ["slack"]

    security_alert:
      enabled: true
      timeout: 48h
      defaultAction: "escalate"
      escalateTo: "security@company.com"
      notify: ["slack", "email", "pagerduty"]

    cost_threshold:
      enabled: true
      threshold: 10.00
      timeout: 1h
      defaultAction: "reject"

  notifications:
    slack:
      enabled: true
      webhook: ${SLACK_WEBHOOK}
      channel: "#ado-checkpoints"

    email:
      enabled: true
      recipients: ["dev-team@company.com"]

  analytics:
    enabled: true
    retentionDays: 90
```

---

## Souvislosti

- [FR-001: Autonomous Execution](./FR-001-autonomous-execution.md)
- [Principles: Autonomy with Control](../../01-vision/02-principles.md)
- [Design: Checkpoint Strategy](../../04-design/02-autonomous-workflow/checkpoint-strategy.md)
