# Secrets Management

## Přehled

Design pro bezpečnou správu secrets (API klíče, credentials, tokens) v systému ADO.

## Architektura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SECRETS MANAGEMENT                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                    Secret Providers                             │     │
│  │                                                                 │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │     │
│  │  │   HashiCorp  │  │     AWS      │  │   Google     │         │     │
│  │  │    Vault     │  │   Secrets    │  │   Secret     │         │     │
│  │  │              │  │   Manager    │  │   Manager    │         │     │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │     │
│  │         │                 │                 │                  │     │
│  │         └─────────────────┼─────────────────┘                  │     │
│  │                           │                                    │     │
│  │                           ▼                                    │     │
│  │              ┌────────────────────────┐                        │     │
│  │              │    Secret Manager      │                        │     │
│  │              │                        │                        │     │
│  │              │  - fetch()             │                        │     │
│  │              │  - rotate()            │                        │     │
│  │              │  - cache()             │                        │     │
│  │              └────────────┬───────────┘                        │     │
│  │                           │                                    │     │
│  └───────────────────────────┼────────────────────────────────────┘     │
│                              │                                           │
│         ┌────────────────────┼────────────────────┐                     │
│         │                    │                    │                     │
│         ▼                    ▼                    ▼                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │ API Gateway │     │ Orchestrator│     │   Workers   │               │
│  │             │     │             │     │             │               │
│  │ - JWT keys  │     │ - DB creds  │     │ - AI keys   │               │
│  │ - API keys  │     │ - Redis     │     │ - Git tokens│               │
│  └─────────────┘     └─────────────┘     └─────────────┘               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Secret Types

### 1. Infrastructure Secrets

```typescript
interface InfrastructureSecrets {
  // Databáze
  database: {
    host: string;
    port: number;
    username: string;
    password: string;     // SECRET
    database: string;
    sslCert?: string;     // SECRET
  };

  // Redis
  redis: {
    url: string;
    password?: string;    // SECRET
  };

  // Message Queue
  messageQueue?: {
    url: string;
    username: string;
    password: string;     // SECRET
  };
}
```

### 2. AI Provider Secrets

```typescript
interface AIProviderSecrets {
  anthropic?: {
    apiKey: string;       // SECRET
    organizationId?: string;
  };

  openai?: {
    apiKey: string;       // SECRET
    organizationId?: string;
  };

  google?: {
    apiKey: string;       // SECRET
    projectId: string;
  };

  // Pro subscription-based přístup
  subscriptionCredentials?: {
    provider: string;
    refreshToken: string; // SECRET
    accessToken: string;  // SECRET (short-lived)
  };
}
```

### 3. Integration Secrets

```typescript
interface IntegrationSecrets {
  github?: {
    appId: string;
    privateKey: string;   // SECRET
    webhookSecret: string; // SECRET
  };

  slack?: {
    botToken: string;     // SECRET
    signingSecret: string; // SECRET
  };

  oauth?: {
    clientId: string;
    clientSecret: string; // SECRET
  };
}
```

### 4. Signing & Encryption Secrets

```typescript
interface CryptoSecrets {
  // JWT signing
  jwt: {
    accessTokenSecret: string;  // SECRET
    refreshTokenSecret: string; // SECRET
    algorithm: 'RS256' | 'HS256';
    publicKey?: string;
    privateKey?: string;        // SECRET
  };

  // Data encryption
  encryption: {
    masterKey: string;          // SECRET
    algorithm: 'aes-256-gcm';
  };

  // Checkpoint signing
  signing: {
    privateKey: string;         // SECRET
    publicKey: string;
  };
}
```

## Secret Manager Interface

```typescript
interface SecretManager {
  // Načtení secret
  get<T>(path: string): Promise<T>;

  // Načtení s fallback na env var
  getOrEnv<T>(path: string, envVar: string): Promise<T>;

  // Batch načtení
  getMany<T extends Record<string, string>>(
    paths: T
  ): Promise<Record<keyof T, unknown>>;

  // Rotace secret
  rotate(path: string): Promise<void>;

  // Health check
  healthCheck(): Promise<boolean>;
}

// Implementace pro HashiCorp Vault
class VaultSecretManager implements SecretManager {
  private client: VaultClient;
  private cache = new Map<string, CachedSecret>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: VaultConfig) {
    this.client = new VaultClient({
      endpoint: config.endpoint,
      token: config.token,
      namespace: config.namespace,
    });
  }

  async get<T>(path: string): Promise<T> {
    // Check cache
    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value as T;
    }

    // Fetch from Vault
    const result = await this.client.read(`secret/data/${path}`);
    const value = result.data.data as T;

    // Cache
    this.cache.set(path, {
      value,
      timestamp: Date.now(),
    });

    return value;
  }

  async getOrEnv<T>(path: string, envVar: string): Promise<T> {
    // Prefer Vault
    try {
      return await this.get<T>(path);
    } catch (error) {
      // Fallback to environment variable
      const envValue = process.env[envVar];
      if (!envValue) {
        throw new SecretNotFoundError(path);
      }
      return envValue as T;
    }
  }

  async rotate(path: string): Promise<void> {
    // Generate new secret
    const newSecret = await this.generateSecret();

    // Update in Vault
    await this.client.write(`secret/data/${path}`, {
      data: { value: newSecret },
    });

    // Invalidate cache
    this.cache.delete(path);

    // Emit rotation event
    this.emit('secret.rotated', { path });
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('base64');
  }
}

// Implementace pro AWS Secrets Manager
class AWSSecretManager implements SecretManager {
  private client: SecretsManagerClient;
  private cache = new Map<string, CachedSecret>();

  constructor(config: AWSConfig) {
    this.client = new SecretsManagerClient({
      region: config.region,
      credentials: config.credentials,
    });
  }

  async get<T>(path: string): Promise<T> {
    const command = new GetSecretValueCommand({
      SecretId: path,
    });

    const result = await this.client.send(command);

    if (result.SecretString) {
      return JSON.parse(result.SecretString) as T;
    }

    throw new SecretNotFoundError(path);
  }
}
```

## Kubernetes Integration

### External Secrets Operator

```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ado-secrets
  namespace: ado-system
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: vault-backend
  target:
    name: ado-secrets
    creationPolicy: Owner
  data:
    # Database
    - secretKey: DATABASE_URL
      remoteRef:
        key: ado/database
        property: url

    # AI Providers
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: ado/ai-providers
        property: anthropic_api_key

    - secretKey: OPENAI_API_KEY
      remoteRef:
        key: ado/ai-providers
        property: openai_api_key

    # JWT
    - secretKey: JWT_SECRET
      remoteRef:
        key: ado/auth
        property: jwt_secret
```

### Secret Store

```yaml
# cluster-secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "ado-external-secrets"
          serviceAccountRef:
            name: external-secrets
            namespace: external-secrets
```

## Secret Rotation

### Automatic Rotation

```typescript
interface RotationConfig {
  // Interval rotace
  interval: {
    aiApiKeys: '30d';      // 30 dnů
    databasePassword: '90d'; // 90 dnů
    jwtSecret: '7d';       // 7 dnů
    encryptionKey: '365d'; // 1 rok
  };

  // Notification před rotací
  notifyBefore: '24h';

  // Grace period pro staré secrets
  gracePeriod: '1h';
}

class SecretRotationService {
  private scheduler: Scheduler;
  private secretManager: SecretManager;

  async scheduleRotation(path: string, interval: string): Promise<void> {
    this.scheduler.schedule(
      `rotate-${path}`,
      interval,
      async () => {
        await this.rotateSecret(path);
      }
    );
  }

  async rotateSecret(path: string): Promise<void> {
    // 1. Notify about upcoming rotation
    await this.notifyRotation(path, 'starting');

    // 2. Generate new secret
    const newSecret = await this.generateNewSecret(path);

    // 3. Update in secret store
    await this.secretManager.update(path, {
      current: newSecret,
      previous: await this.secretManager.get(path), // Grace period
    });

    // 4. Invalidate caches
    await this.invalidateCaches(path);

    // 5. Notify completion
    await this.notifyRotation(path, 'completed');

    // 6. Schedule cleanup of old secret
    setTimeout(
      () => this.cleanupOldSecret(path),
      this.config.gracePeriod
    );
  }
}
```

### Zero-Downtime Rotation

```typescript
// Support pro dual secrets během rotace
interface DualSecret {
  current: string;
  previous?: string;
  rotatedAt: Date;
}

class DualSecretValidator {
  async validate(
    providedSecret: string,
    storedSecret: DualSecret
  ): Promise<boolean> {
    // Try current first
    if (await this.compare(providedSecret, storedSecret.current)) {
      return true;
    }

    // Try previous during grace period
    if (storedSecret.previous) {
      const gracePeriodActive =
        Date.now() - storedSecret.rotatedAt.getTime() < GRACE_PERIOD_MS;

      if (gracePeriodActive) {
        return this.compare(providedSecret, storedSecret.previous);
      }
    }

    return false;
  }
}
```

## Environment-Specific Configuration

```typescript
interface SecretManagerConfig {
  development: {
    provider: 'dotenv';
    path: '.env.local';
    // Nikdy necommitovat!
  };

  staging: {
    provider: 'vault';
    endpoint: 'https://vault.staging.example.com';
    namespace: 'ado-staging';
  };

  production: {
    provider: 'vault';
    endpoint: 'https://vault.prod.example.com';
    namespace: 'ado-production';
    // Přísnější audit logging
    auditLog: true;
    // Kratší cache TTL
    cacheTTL: 60000; // 1 minuta
  };
}
```

## Secret Access Control

```typescript
// Role-based secret access
interface SecretAccessPolicy {
  // Kdo může přistupovat k jakým secrets
  policies: {
    'ado/ai-providers/*': {
      read: ['worker', 'orchestrator'];
      write: ['admin'];
      rotate: ['admin', 'security-automation'];
    };
    'ado/database/*': {
      read: ['orchestrator', 'api-gateway'];
      write: ['admin'];
      rotate: ['admin', 'dba-automation'];
    };
    'ado/auth/*': {
      read: ['api-gateway'];
      write: ['admin'];
      rotate: ['admin'];
    };
  };
}

// Vault policy
const VAULT_POLICY = `
# Workers - read AI provider keys only
path "secret/data/ado/ai-providers/*" {
  capabilities = ["read"]
}

# Orchestrator - read database and AI keys
path "secret/data/ado/database/*" {
  capabilities = ["read"]
}
path "secret/data/ado/ai-providers/*" {
  capabilities = ["read"]
}

# API Gateway - read auth secrets
path "secret/data/ado/auth/*" {
  capabilities = ["read"]
}
`;
```

## Audit Logging

```typescript
interface SecretAccessLog {
  timestamp: Date;
  action: 'read' | 'write' | 'rotate' | 'delete';
  path: string;
  actor: {
    type: 'user' | 'service' | 'automation';
    id: string;
    ip?: string;
  };
  result: 'success' | 'denied' | 'error';
  metadata?: Record<string, unknown>;
}

class SecretAuditLogger {
  async log(entry: SecretAccessLog): Promise<void> {
    // Log to secure audit store
    await this.auditStore.append(entry);

    // Alert on suspicious activity
    if (this.isSuspicious(entry)) {
      await this.alertSecurityTeam(entry);
    }
  }

  private isSuspicious(entry: SecretAccessLog): boolean {
    // Multiple failed attempts
    // Access from unusual IP
    // Access outside business hours
    // Access to high-sensitivity secrets
    return (
      entry.result === 'denied' ||
      this.isUnusualIP(entry.actor.ip) ||
      this.isOutsideBusinessHours() ||
      this.isHighSensitivity(entry.path)
    );
  }
}
```

## CLI Secret Management

```bash
# Lokální development - .env file
ado secrets init
# Vytvoří .env.local z template

# Nastavení secret provideru
ado secrets configure --provider vault --endpoint https://vault.example.com

# Zobrazení secrets (maskované)
ado secrets list
# ANTHROPIC_API_KEY=sk-ant-***
# DATABASE_URL=postgres://***

# Přidání secret
ado secrets set CUSTOM_SECRET --value "secret-value"

# Rotace secret
ado secrets rotate ANTHROPIC_API_KEY

# Export pro debugging (pouze development)
ado secrets export --env development
```

## Security Best Practices

### Never Do

```typescript
// ❌ NIKDY: Hardcoded secrets
const apiKey = 'sk-ant-api03-xxx';

// ❌ NIKDY: Secrets v logu
console.log(`Using API key: ${apiKey}`);

// ❌ NIKDY: Secrets v error messages
throw new Error(`Auth failed for key: ${apiKey}`);

// ❌ NIKDY: Secrets v URL
fetch(`https://api.example.com?key=${apiKey}`);

// ❌ NIKDY: Secrets v git
// .env files with real secrets
```

### Always Do

```typescript
// ✅ VŽDY: Načítat z secret manageru
const apiKey = await secretManager.get('ai-providers/anthropic/api-key');

// ✅ VŽDY: Redakce v logu
logger.info(`Using API key: ${redact(apiKey)}`);

// ✅ VŽDY: Generické error messages
throw new Error('Authentication failed');

// ✅ VŽDY: Secrets v headers
fetch('https://api.example.com', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

// ✅ VŽDY: .env.example bez skutečných hodnot
// ANTHROPIC_API_KEY=your-api-key-here
```

---

## Souvislosti

- [Threat Model](./threat-model.md)
- [NFR-004: Security](../../02-requirements/02-non-functional/NFR-004-security.md)
- [Kubernetes Deployment](../../07-operations/01-deployment/kubernetes.md)
