# Threat Model

## Přehled

Analýza bezpečnostních hrozeb pro systém ADO a opatření k jejich mitigaci.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TRUST BOUNDARIES                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ UNTRUSTED: External                                              │    │
│  │                                                                  │    │
│  │   Users  ──▶  Internet  ──▶  CDN/WAF                            │    │
│  │                                                                  │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │ SEMI-TRUSTED: DMZ                                                │    │
│  │                                                                  │    │
│  │   API Gateway  ──▶  Auth Service                                │    │
│  │                                                                  │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │ TRUSTED: Internal                                                │    │
│  │                                                                  │    │
│  │   Orchestrator  ──▶  Workers  ──▶  AI Agents                    │    │
│  │        │                │                                        │    │
│  │        ▼                ▼                                        │    │
│  │   PostgreSQL        Redis                                        │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ EXTERNAL SERVICES (3rd party)                                    │    │
│  │                                                                  │    │
│  │   Anthropic API  │  Google AI  │  OpenAI  │  GitHub             │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## STRIDE Analysis

### 1. Spoofing (Podvržení identity)

| Hrozba | Popis | Pravděpodobnost | Dopad | Mitigace |
|--------|-------|-----------------|-------|----------|
| S1 | Útočník se vydává za legitimního uživatele | Střední | Vysoký | OAuth 2.0 + MFA |
| S2 | Podvržený worker se připojí ke clusteru | Nízká | Kritický | mTLS + node identity |
| S3 | Man-in-the-middle na API calls | Nízká | Vysoký | TLS 1.3 everywhere |
| S4 | Podvržené AI API responses | Velmi nízká | Střední | Response validation |

**Mitigační opatření:**

```typescript
// S1: OAuth 2.0 autentizace
interface AuthConfig {
  providers: ['github', 'google'];
  mfa: {
    required: true;
    methods: ['totp', 'webauthn'];
  };
  session: {
    maxAge: 24 * 60 * 60; // 24 hodin
    sliding: true;
  };
}

// S2: Worker identity verification
interface WorkerRegistration {
  // Kubernetes service account token
  serviceAccountToken: string;

  // Node attestation
  nodeAttestation: {
    platform: 'kubernetes' | 'ec2' | 'local';
    identity: string;
    signature: string;
  };
}

// Ověření identity workeru
async function verifyWorkerIdentity(
  registration: WorkerRegistration
): Promise<boolean> {
  // Verify Kubernetes service account
  if (registration.nodeAttestation.platform === 'kubernetes') {
    return await verifyK8sServiceAccount(
      registration.serviceAccountToken,
      registration.nodeAttestation
    );
  }

  // Verify EC2 instance identity document
  if (registration.nodeAttestation.platform === 'ec2') {
    return await verifyEC2InstanceIdentity(
      registration.nodeAttestation.identity,
      registration.nodeAttestation.signature
    );
  }

  return false;
}
```

### 2. Tampering (Manipulace)

| Hrozba | Popis | Pravděpodobnost | Dopad | Mitigace |
|--------|-------|-----------------|-------|----------|
| T1 | Modifikace task promptu během přenosu | Nízká | Vysoký | Message signing |
| T2 | Manipulace s checkpoint daty | Nízká | Kritický | Integrity hashing |
| T3 | Modifikace generovaného kódu | Střední | Kritický | Git signing + review |
| T4 | SQL injection do task parametrů | Střední | Kritický | Parametrizované queries |

**Mitigační opatření:**

```typescript
// T2: Checkpoint integrity
interface CheckpointIntegrity {
  // SHA-256 hash obsahu
  contentHash: string;

  // Podpis pro ověření integrity
  signature: string;

  // Timestamp pro detekci replay attacks
  timestamp: number;
  nonce: string;
}

class SecureCheckpointManager {
  private signingKey: CryptoKey;

  async create(taskId: string, data: CheckpointData): Promise<Checkpoint> {
    const contentHash = await this.hashContent(data);
    const nonce = crypto.randomUUID();
    const timestamp = Date.now();

    const signature = await this.sign({
      taskId,
      contentHash,
      timestamp,
      nonce,
    });

    return {
      ...data,
      integrity: {
        contentHash,
        signature,
        timestamp,
        nonce,
      },
    };
  }

  async verify(checkpoint: Checkpoint): Promise<boolean> {
    const { integrity } = checkpoint;

    // Verify timestamp (max 1 hour old)
    if (Date.now() - integrity.timestamp > 3600000) {
      throw new CheckpointExpiredError();
    }

    // Verify content hash
    const computedHash = await this.hashContent(checkpoint);
    if (computedHash !== integrity.contentHash) {
      throw new CheckpointTamperedError('Content hash mismatch');
    }

    // Verify signature
    const isValid = await this.verifySignature(
      {
        taskId: checkpoint.taskId,
        contentHash: integrity.contentHash,
        timestamp: integrity.timestamp,
        nonce: integrity.nonce,
      },
      integrity.signature
    );

    return isValid;
  }
}

// T3: Git commit signing
interface GitSecurityConfig {
  signCommits: true;
  gpgKeyId: string;
  requireSignedCommits: true;
  protectedBranches: ['main', 'production'];
}

// T4: SQL injection prevention
class SecureTaskRepository {
  async findByPrompt(searchTerm: string): Promise<Task[]> {
    // NIKDY: `SELECT * FROM tasks WHERE prompt LIKE '%${searchTerm}%'`

    // SPRÁVNĚ: Parametrizovaný query
    return this.db.query(
      `SELECT * FROM tasks WHERE prompt ILIKE $1`,
      [`%${searchTerm}%`]
    );
  }
}
```

### 3. Repudiation (Popírání)

| Hrozba | Popis | Pravděpodobnost | Dopad | Mitigace |
|--------|-------|-----------------|-------|----------|
| R1 | Uživatel popírá spuštění úkolu | Střední | Střední | Audit logging |
| R2 | Popření HITL rozhodnutí | Střední | Vysoký | Signed decisions |
| R3 | Popření změn v kódu | Nízká | Střední | Git history + signing |

**Mitigační opatření:**

```typescript
// Comprehensive audit logging
interface AuditLog {
  id: string;
  timestamp: Date;

  // Actor
  actor: {
    type: 'user' | 'system' | 'worker' | 'agent';
    id: string;
    ip?: string;
    userAgent?: string;
  };

  // Action
  action: string;
  resource: {
    type: string;
    id: string;
  };

  // Context
  request?: {
    method: string;
    path: string;
    body?: unknown;
  };

  // Result
  result: 'success' | 'failure';
  error?: string;

  // Integrity
  previousLogHash: string;
  hash: string;
}

class AuditLogger {
  private lastHash: string = '';

  async log(entry: Omit<AuditLog, 'id' | 'hash' | 'previousLogHash'>): Promise<void> {
    const id = crypto.randomUUID();
    const previousLogHash = this.lastHash;

    const fullEntry: AuditLog = {
      ...entry,
      id,
      previousLogHash,
      hash: '', // Will be computed
    };

    // Compute hash for chain integrity
    fullEntry.hash = await this.computeHash(fullEntry);
    this.lastHash = fullEntry.hash;

    // Persist to immutable storage
    await this.storage.append(fullEntry);

    // Also send to SIEM if configured
    if (this.siemEndpoint) {
      await this.sendToSIEM(fullEntry);
    }
  }

  private async computeHash(entry: AuditLog): Promise<string> {
    const data = JSON.stringify({
      ...entry,
      hash: undefined, // Exclude hash itself
    });
    const buffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(data)
    );
    return Buffer.from(buffer).toString('hex');
  }
}
```

### 4. Information Disclosure (Únik informací)

| Hrozba | Popis | Pravděpodobnost | Dopad | Mitigace |
|--------|-------|-----------------|-------|----------|
| I1 | Únik API klíčů v logu | Střední | Kritický | Secret redaction |
| I2 | Únik zdrojového kódu přes AI | Střední | Vysoký | Context filtering |
| I3 | Únik credentials v error messages | Střední | Vysoký | Sanitized errors |
| I4 | Unauthorized access to other users' tasks | Střední | Vysoký | Row-level security |

**Mitigační opatření:**

```typescript
// I1: Secret redaction in logs
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,           // OpenAI/Anthropic keys
  /ghp_[a-zA-Z0-9]{36}/g,           // GitHub tokens
  /AIza[a-zA-Z0-9-_]{35}/g,         // Google API keys
  /password['":\s]*['"]?[^'"\s]+/gi, // Passwords
  /bearer\s+[a-zA-Z0-9-_.]+/gi,     // Bearer tokens
];

function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

// I2: Context filtering for AI
interface ContextFilter {
  // Soubory, které se NIKDY neodesílají AI
  excludePatterns: [
    '.env*',
    '*.pem',
    '*.key',
    '*credentials*',
    '*secrets*',
    '.git/config',
  ];

  // Sanitizace před odesláním
  sanitize(content: string): string;
}

// I4: Row-level security
const RLS_POLICY = `
  -- Enable RLS
  ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

  -- Policy: Users can only see their own tasks
  CREATE POLICY tasks_user_isolation ON tasks
    FOR ALL
    USING (user_id = current_user_id());

  -- Admin bypass
  CREATE POLICY tasks_admin_access ON tasks
    FOR ALL
    TO admin_role
    USING (true);
`;
```

### 5. Denial of Service (Odepření služby)

| Hrozba | Popis | Pravděpodobnost | Dopad | Mitigace |
|--------|-------|-----------------|-------|----------|
| D1 | API rate limiting bypass | Střední | Vysoký | Multi-layer rate limiting |
| D2 | Resource exhaustion (memory/CPU) | Střední | Vysoký | Resource quotas |
| D3 | Queue flooding | Střední | Vysoký | Queue limits + priority |
| D4 | WebSocket connection exhaustion | Střední | Střední | Connection limits |

**Mitigační opatření:**

```typescript
// D1: Multi-layer rate limiting
interface RateLimitConfig {
  // Per-IP limits (unauthenticated)
  ip: {
    windowMs: 60000;      // 1 minute
    max: 100;             // requests
  };

  // Per-user limits (authenticated)
  user: {
    windowMs: 60000;
    max: 500;
  };

  // Per-endpoint limits
  endpoints: {
    'POST /tasks': { windowMs: 60000, max: 10 };
    'GET /tasks': { windowMs: 60000, max: 100 };
  };

  // Global limits
  global: {
    windowMs: 1000;       // 1 second
    max: 10000;           // Total requests
  };
}

// D2: Resource quotas per user
interface ResourceQuotas {
  user: {
    maxConcurrentTasks: 5;
    maxDailyTasks: 100;
    maxTaskDuration: 3600;        // 1 hour
    maxMonthlyTokens: 10_000_000;
    maxMonthlyCost: 100;          // USD
  };

  task: {
    maxPromptLength: 50000;
    maxOutputSize: 10_000_000;    // 10MB
    maxSubtasks: 50;
    maxRetries: 5;
  };
}

// D3: Queue management
class SecureTaskQueue {
  private readonly MAX_QUEUE_SIZE = 10000;
  private readonly MAX_USER_PENDING = 50;

  async enqueue(task: Task): Promise<void> {
    // Check global queue size
    const queueSize = await this.getQueueSize();
    if (queueSize >= this.MAX_QUEUE_SIZE) {
      throw new QueueFullError();
    }

    // Check user's pending tasks
    const userPending = await this.getUserPendingCount(task.userId);
    if (userPending >= this.MAX_USER_PENDING) {
      throw new UserQueueLimitError();
    }

    // Priority queue - paid users get priority
    const priority = await this.calculatePriority(task);
    await this.queue.add(task, { priority });
  }
}

// D4: WebSocket connection management
class WebSocketManager {
  private readonly MAX_CONNECTIONS_PER_IP = 10;
  private readonly MAX_CONNECTIONS_PER_USER = 5;
  private readonly MAX_TOTAL_CONNECTIONS = 50000;

  private connections = new Map<string, Set<WebSocket>>();

  async handleConnection(ws: WebSocket, req: Request): Promise<void> {
    const ip = req.ip;
    const userId = req.user?.id;

    // Check limits
    if (this.getTotalConnections() >= this.MAX_TOTAL_CONNECTIONS) {
      ws.close(1013, 'Server overloaded');
      return;
    }

    const ipConnections = this.getConnectionsByIP(ip);
    if (ipConnections >= this.MAX_CONNECTIONS_PER_IP) {
      ws.close(1008, 'Too many connections from this IP');
      return;
    }

    if (userId) {
      const userConnections = this.getConnectionsByUser(userId);
      if (userConnections >= this.MAX_CONNECTIONS_PER_USER) {
        ws.close(1008, 'Too many connections for this user');
        return;
      }
    }

    this.registerConnection(ws, ip, userId);
  }
}
```

### 6. Elevation of Privilege (Eskalace oprávnění)

| Hrozba | Popis | Pravděpodobnost | Dopad | Mitigace |
|--------|-------|-----------------|-------|----------|
| E1 | Worker escalation to admin | Nízká | Kritický | Least privilege + RBAC |
| E2 | AI agent filesystem escape | Střední | Kritický | Sandboxing |
| E3 | Container escape | Velmi nízká | Kritický | Security contexts |
| E4 | HITL bypass | Nízká | Vysoký | Mandatory checkpoints |

**Mitigační opatření:**

```typescript
// E1: RBAC
type Role = 'admin' | 'operator' | 'user' | 'viewer' | 'worker' | 'agent';

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['*'],
  operator: [
    'tasks.read', 'tasks.cancel',
    'workers.read', 'workers.manage',
    'providers.read', 'providers.configure',
  ],
  user: [
    'tasks.own.read', 'tasks.own.create', 'tasks.own.cancel',
    'checkpoints.own.read', 'checkpoints.own.decide',
  ],
  viewer: ['tasks.own.read', 'checkpoints.own.read'],
  worker: [
    'tasks.assigned.read', 'tasks.assigned.update',
    'checkpoints.create',
  ],
  agent: ['files.workspace.read', 'files.workspace.write'],
};

// E2: Agent sandboxing
interface AgentSandbox {
  // Filesystem restrictions
  filesystem: {
    allowedPaths: ['./workspace', '/tmp/ado'];
    blockedPaths: ['/', '/etc', '/root', '~/.ssh'];
    maxFileSize: 10_000_000;  // 10MB
    maxTotalSize: 100_000_000; // 100MB
  };

  // Network restrictions
  network: {
    allowedHosts: ['api.anthropic.com', 'api.openai.com'];
    blockedPorts: [22, 23, 25, 3389];
  };

  // Process restrictions
  process: {
    maxMemory: 4_000_000_000;  // 4GB
    maxCPU: 2;                  // cores
    timeout: 3600000;           // 1 hour
    noNewPrivileges: true;
  };
}

// E3: Kubernetes security context
const WORKER_SECURITY_CONTEXT = {
  runAsNonRoot: true,
  runAsUser: 1000,
  runAsGroup: 1000,
  readOnlyRootFilesystem: true,
  allowPrivilegeEscalation: false,
  capabilities: {
    drop: ['ALL'],
  },
  seccompProfile: {
    type: 'RuntimeDefault',
  },
};
```

## Security Controls Summary

| Control | Implementation | Status |
|---------|---------------|--------|
| Authentication | OAuth 2.0 + MFA | Required |
| Authorization | RBAC + Row-level security | Required |
| Encryption in transit | TLS 1.3 | Required |
| Encryption at rest | AES-256 | Required |
| Secret management | External secrets + rotation | Required |
| Audit logging | Immutable chain + SIEM | Required |
| Rate limiting | Multi-layer | Required |
| Input validation | Zod schemas | Required |
| Sandboxing | Container + filesystem | Required |
| Network segmentation | K8s network policies | Required |

---

## Souvislosti

- [NFR-004: Security](../../02-requirements/02-non-functional/NFR-004-security.md)
- [Secrets Management](./secrets-management.md)
- [Kubernetes Deployment](../03-cloud-infrastructure/kubernetes-deployment.md)
