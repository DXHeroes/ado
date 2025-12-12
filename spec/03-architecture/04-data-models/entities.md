# Data Models: Entities

## Přehled

Definice hlavních entit systému ADO a jejich vztahů.

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │──────<│    Task     │>──────│   Worker    │
└─────────────┘   1:N └──────┬──────┘ N:1   └─────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
       │ Checkpoint  │ │  Subtask    │ │  Artifact   │
       └─────────────┘ └─────────────┘ └─────────────┘
              │
              ▼
       ┌─────────────┐
       │HITLDecision │
       └─────────────┘

┌─────────────┐       ┌─────────────┐
│  Provider   │──────<│AccessMode   │
└─────────────┘   1:N └─────────────┘
```

## Core Entities

### Task

Základní jednotka práce v systému.

```typescript
interface Task {
  // Identifikace
  id: string;                    // UUID v7 (time-ordered)
  externalId?: string;           // Externí reference (Jira, GitHub)

  // Hierarchie
  parentTaskId?: string;         // Rodičovský úkol
  rootTaskId?: string;           // Kořenový úkol

  // Obsah
  prompt: string;                // Původní prompt od uživatele
  normalizedPrompt?: string;     // Normalizovaný prompt pro agenta
  taskType: TaskType;            // Typ úkolu

  // Stav
  status: TaskStatus;
  phase: TaskPhase;
  progress: number;              // 0-100

  // Přiřazení
  userId: string;
  workerId?: string;
  providerId?: string;
  accessMode?: AccessModeType;

  // Konfigurace
  config: TaskConfig;

  // Výsledky
  result?: TaskResult;
  error?: TaskError;

  // Časování
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Metriky
  metrics: TaskMetrics;

  // Metadata
  tags: string[];
  metadata: Record<string, unknown>;
}

type TaskType =
  | 'greenfield'      // Nový projekt od nuly
  | 'feature'         // Nová funkce
  | 'bugfix'          // Oprava chyby
  | 'refactor'        // Refaktoring
  | 'test'            // Přidání testů
  | 'documentation'   // Dokumentace
  | 'review'          // Code review
  | 'custom';         // Vlastní typ

type TaskStatus =
  | 'pending'         // Čeká na zpracování
  | 'queued'          // Ve frontě
  | 'running'         // Probíhá
  | 'paused'          // Pozastaveno (HITL)
  | 'validating'      // Validace výstupu
  | 'completed'       // Dokončeno
  | 'failed'          // Selhalo
  | 'cancelled'       // Zrušeno
  | 'timeout';        // Timeout

type TaskPhase =
  | 'specification'   // Tvorba specifikace
  | 'planning'        // Plánování implementace
  | 'implementation'  // Implementace
  | 'validation'      // Build, test, lint
  | 'review'          // Code review
  | 'finalization';   // Závěrečné úpravy

interface TaskConfig {
  maxDuration: number;           // Max doba v sekundách
  maxCost: number;               // Max náklady v USD
  maxRetries: number;            // Max počet pokusů
  qualityThresholds: {
    minCoverage: number;         // Min test coverage (0-100)
    maxLintErrors: number;       // Max počet lint errorů
    requireBuild: boolean;       // Vyžadovat úspěšný build
  };
  hitlPolicy: HITLPolicy;        // HITL politika
  providers?: string[];          // Preferovaní provideři
  allowApiFallback: boolean;     // Povolit API fallback
}

interface TaskMetrics {
  tokensUsed: number;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  duration: number;              // v sekundách
  retryCount: number;
  checkpointCount: number;
  subtaskCount: number;
}
```

### Subtask

Podúkol v rámci hlavního úkolu.

```typescript
interface Subtask {
  id: string;
  taskId: string;

  // Obsah
  name: string;
  description: string;
  prompt?: string;

  // Stav
  status: SubtaskStatus;
  progress: number;

  // Pořadí
  order: number;
  dependencies: string[];        // ID závislých subtasků

  // Přiřazení
  agentId?: string;

  // Výsledek
  result?: SubtaskResult;
  error?: TaskError;

  // Časování
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Artefakty
  artifacts: string[];           // ID vytvořených artefaktů
}

type SubtaskStatus =
  | 'pending'
  | 'blocked'         // Čeká na závislosti
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

interface SubtaskResult {
  success: boolean;
  output?: string;
  filesChanged: string[];
  duration: number;
}
```

### Checkpoint

Uložený stav pro recovery a HITL.

```typescript
interface Checkpoint {
  id: string;
  taskId: string;

  // Typ
  type: CheckpointType;
  trigger: CheckpointTrigger;

  // Stav
  taskState: Partial<Task>;
  workspaceRef: string;          // Git commit nebo snapshot ID
  agentState?: unknown;          // Interní stav agenta

  // HITL
  hitlRequired: boolean;
  hitlDecision?: HITLDecision;

  // Časování
  createdAt: Date;
  expiresAt?: Date;

  // Metadata
  description: string;
  metadata: Record<string, unknown>;
}

type CheckpointType =
  | 'auto'            // Automatický (periodický)
  | 'phase'           // Při změně fáze
  | 'hitl'            // HITL checkpoint
  | 'error'           // Před error recovery
  | 'manual';         // Manuální

type CheckpointTrigger =
  | 'periodic'        // Časový interval
  | 'phase_change'    // Změna fáze
  | 'subtask_complete'// Dokončení subtasku
  | 'validation_fail' // Selhání validace
  | 'cost_threshold'  // Překročení nákladů
  | 'user_request';   // Uživatelský požadavek
```

### HITLDecision

Rozhodnutí uživatele v HITL checkpointu.

```typescript
interface HITLDecision {
  id: string;
  checkpointId: string;
  taskId: string;
  userId: string;

  // Rozhodnutí
  action: HITLAction;
  feedback?: string;
  modifications?: Record<string, unknown>;

  // Kontext
  presentedOptions: HITLOption[];
  selectedOption: string;

  // Časování
  requestedAt: Date;
  decidedAt: Date;
  responseTime: number;          // v sekundách

  // Auto-action
  autoActionTriggered: boolean;
  autoActionReason?: string;
}

type HITLAction =
  | 'approve'         // Schválit a pokračovat
  | 'reject'          // Zamítnout a zastavit
  | 'modify'          // Upravit a pokračovat
  | 'retry'           // Zkusit znovu
  | 'skip'            // Přeskočit
  | 'escalate';       // Eskalovat (notifikace)

interface HITLOption {
  id: string;
  label: string;
  description: string;
  action: HITLAction;
  isDefault: boolean;
}
```

### Worker

Instance provádějící úkoly.

```typescript
interface Worker {
  id: string;

  // Identifikace
  hostname: string;
  instanceId?: string;           // K8s pod ID, EC2 instance ID

  // Typ
  type: WorkerType;
  location: WorkerLocation;

  // Stav
  status: WorkerStatus;
  currentTaskId?: string;

  // Schopnosti
  capabilities: string[];        // ID podporovaných providerů
  resources: WorkerResources;

  // Metriky
  metrics: WorkerMetrics;

  // Časování
  registeredAt: Date;
  lastHeartbeat: Date;

  // Metadata
  version: string;
  metadata: Record<string, unknown>;
}

type WorkerType =
  | 'local'           // Lokální worker
  | 'remote'          // Vzdálený worker
  | 'cloud';          // Cloud worker (K8s, EC2)

type WorkerLocation =
  | { type: 'local' }
  | { type: 'kubernetes'; namespace: string; pod: string }
  | { type: 'docker'; container: string }
  | { type: 'ec2'; instanceId: string; region: string };

type WorkerStatus =
  | 'starting'        // Startuje
  | 'idle'            // Připraven
  | 'busy'            // Zpracovává úkol
  | 'draining'        // Dokončuje a končí
  | 'offline';        // Nedostupný

interface WorkerResources {
  cpuCores: number;
  memoryMB: number;
  diskGB: number;
  gpuCount?: number;
}

interface WorkerMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  totalDuration: number;
  uptime: number;
  lastTaskDuration?: number;
}
```

### Provider

Konfigurace AI providera.

```typescript
interface Provider {
  id: string;

  // Identifikace
  name: string;
  type: ProviderType;

  // Stav
  enabled: boolean;
  status: ProviderStatus;

  // Schopnosti
  capabilities: AgentCapabilities;

  // Přístupové módy
  accessModes: AccessMode[];

  // Konfigurace
  config: ProviderConfig;

  // Rate limiting
  rateLimits: RateLimitStatus;

  // Metriky
  metrics: ProviderMetrics;

  // Časování
  createdAt: Date;
  updatedAt: Date;
}

type ProviderType =
  | 'claude-code'
  | 'gemini-cli'
  | 'cursor-cli'
  | 'copilot-cli'
  | 'codex-cli'
  | 'custom';

type ProviderStatus =
  | 'available'       // Dostupný
  | 'rate_limited'    // Rate limited
  | 'unavailable'     // Nedostupný
  | 'disabled';       // Vypnutý

interface AccessMode {
  id: string;
  type: AccessModeType;
  priority: number;
  enabled: boolean;

  // Subscription specifické
  subscription?: {
    plan: string;
    rateLimits: RateLimits;
  };

  // API specifické
  api?: {
    model: string;
    pricing: Pricing;
    maxTokens: number;
  };
}

type AccessModeType = 'subscription' | 'api' | 'local';

interface RateLimits {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerDay?: number;
}

interface Pricing {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  currency: string;
}
```

### Artifact

Výstupní artefakt (soubor, dokument).

```typescript
interface Artifact {
  id: string;
  taskId: string;
  subtaskId?: string;

  // Identifikace
  type: ArtifactType;
  name: string;
  path: string;

  // Obsah
  content?: string;              // Pro malé soubory
  storageRef?: string;           // Pro velké soubory
  checksum: string;              // SHA-256
  size: number;                  // v bytes

  // Git
  gitCommit?: string;
  gitBranch?: string;

  // Metadata
  mimeType: string;
  encoding: string;

  // Časování
  createdAt: Date;
  updatedAt: Date;
}

type ArtifactType =
  | 'source_code'     // Zdrojový kód
  | 'test'            // Test
  | 'config'          // Konfigurace
  | 'documentation'   // Dokumentace
  | 'spec'            // Specifikace
  | 'build'           // Build artefakt
  | 'other';
```

### User

Uživatel systému.

```typescript
interface User {
  id: string;

  // Identifikace
  email: string;
  name: string;

  // Autentizace
  authProvider: AuthProvider;
  authProviderId: string;

  // Role
  role: UserRole;
  permissions: Permission[];

  // Nastavení
  preferences: UserPreferences;

  // Limity
  quotas: UserQuotas;
  usage: UserUsage;

  // Časování
  createdAt: Date;
  lastLoginAt?: Date;
}

type AuthProvider = 'github' | 'google' | 'email';
type UserRole = 'admin' | 'user' | 'viewer';

interface UserPreferences {
  defaultHitlPolicy: HITLPolicy;
  defaultProviders: string[];
  notifications: NotificationPreferences;
  theme: 'light' | 'dark' | 'system';
}

interface UserQuotas {
  maxConcurrentTasks: number;
  maxDailyTasks: number;
  maxMonthlyCost: number;
}

interface UserUsage {
  currentMonthCost: number;
  currentMonthTasks: number;
  totalTasks: number;
  totalCost: number;
}
```

## Database Schema (PostgreSQL)

```sql
-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(255),
  parent_task_id UUID REFERENCES tasks(id),
  root_task_id UUID REFERENCES tasks(id),

  prompt TEXT NOT NULL,
  normalized_prompt TEXT,
  task_type VARCHAR(50) NOT NULL,

  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  phase VARCHAR(50) NOT NULL DEFAULT 'specification',
  progress INTEGER NOT NULL DEFAULT 0,

  user_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID REFERENCES workers(id),
  provider_id VARCHAR(100),
  access_mode VARCHAR(50),

  config JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error JSONB,
  metrics JSONB NOT NULL DEFAULT '{}',

  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_progress CHECK (progress >= 0 AND progress <= 100)
);

-- Indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_parent_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);

-- Checkpoints
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL,
  trigger VARCHAR(50) NOT NULL,

  task_state JSONB NOT NULL,
  workspace_ref VARCHAR(255) NOT NULL,
  agent_state JSONB,

  hitl_required BOOLEAN NOT NULL DEFAULT FALSE,

  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_checkpoints_task_id ON checkpoints(task_id);
CREATE INDEX idx_checkpoints_created_at ON checkpoints(created_at DESC);

-- Workers
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  hostname VARCHAR(255) NOT NULL,
  instance_id VARCHAR(255),

  type VARCHAR(50) NOT NULL,
  location JSONB NOT NULL,

  status VARCHAR(50) NOT NULL DEFAULT 'starting',
  current_task_id UUID REFERENCES tasks(id),

  capabilities TEXT[] DEFAULT '{}',
  resources JSONB NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',

  version VARCHAR(50),
  metadata JSONB DEFAULT '{}',

  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workers_status ON workers(status);
CREATE INDEX idx_workers_last_heartbeat ON workers(last_heartbeat);
```

---

## Souvislosti

- [Data Models: Events](./events.md)
- [Data Models: Schemas](./schemas.md)
- [tRPC Procedures: Tasks](../../05-api/01-trpc-procedures/tasks.md)
