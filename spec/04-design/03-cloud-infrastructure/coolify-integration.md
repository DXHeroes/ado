# Coolify Integration Design

## Přehled

Architektonický design pro integraci ADO s Coolify - open-source self-hosted PaaS platformou.

## Proč Coolify?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Deployment Platform Comparison                            │
└─────────────────────────────────────────────────────────────────────────────┘

                    Kubernetes         Docker Compose       Coolify
                    ──────────         ──────────────       ───────
Complexity          High               Low                  Medium
Self-hosted         Yes                Yes                  Yes
Auto SSL            Manual/Cert-mgr    Manual/Traefik       Automatic
UI Dashboard        External           None                 Built-in
Git Integration     Manual             Manual               Built-in
Scaling             Excellent          Limited              Good
Cost                Infrastructure     Infrastructure       Infrastructure
Learning Curve      Steep              Gentle               Moderate

Best for:
- Kubernetes: Enterprise, multi-region, large scale
- Docker Compose: Development, single server, simple deployments
- Coolify: Small-medium teams, self-hosted, want UI without K8s complexity
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Coolify Deployment Architecture                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Coolify Server                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Coolify Dashboard                                ││
│  │                                                                          ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  ││
│  │  │   Projects   │  │  Resources   │  │   Settings   │                  ││
│  │  │              │  │              │  │              │                  ││
│  │  │ ado-prod     │  │ Services     │  │ SSL/DNS      │                  ││
│  │  │ ado-staging  │  │ Databases    │  │ Backups      │                  ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          Docker Engine                                   ││
│  │                                                                          ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       ││
│  │  │   Traefik   │ │ PostgreSQL  │ │   Redis     │ │   ADO       │       ││
│  │  │   (proxy)   │ │             │ │             │ │  Services   │       ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Coolify Resource Types

### 1. Database Resources

```yaml
# PostgreSQL jako Coolify Database resource
resource: database
type: postgresql
version: "16"
configuration:
  database: ado
  username: ado
  password: ${GENERATED}  # Coolify generates
  publicPort: false       # Internal only

settings:
  persistence:
    enabled: true
    size: 20Gi
  backup:
    enabled: true
    schedule: "0 2 * * *"  # Daily at 2 AM
    retention: 7
```

```yaml
# Redis jako Coolify Database resource
resource: database
type: redis
version: "7"
configuration:
  password: ${GENERATED}
  publicPort: false

settings:
  persistence:
    enabled: true
    size: 5Gi
```

### 2. Application Resources

```yaml
# API Gateway jako Coolify Application
resource: application
type: docker-image
image: ghcr.io/dxheroes/ado/api-gateway:${VERSION}

configuration:
  ports:
    - containerPort: 3000
      publicPort: 443
      protocol: https
    - containerPort: 3001
      publicPort: 443
      path: /ws
      protocol: wss

  environment:
    NODE_ENV: production
    DATABASE_URL: ${postgresql.connectionString}
    REDIS_URL: ${redis.connectionString}
    JWT_SECRET: ${secrets.JWT_SECRET}

  healthCheck:
    path: /health
    port: 3000
    interval: 30
    timeout: 10

  resources:
    cpu: 2
    memory: 2048

  replicas: 2
```

```yaml
# Worker jako Coolify Application
resource: application
type: docker-image
image: ghcr.io/dxheroes/ado/worker:${VERSION}

configuration:
  ports: []  # No public ports

  environment:
    NODE_ENV: production
    DATABASE_URL: ${postgresql.connectionString}
    REDIS_URL: ${redis.connectionString}
    ANTHROPIC_API_KEY: ${secrets.ANTHROPIC_API_KEY}

  volumes:
    - /data/workspaces:/app/workspaces

  healthCheck:
    path: /health
    port: 9091
    interval: 30

  resources:
    cpu: 4
    memory: 8192

  replicas: 3
```

## Integration Components

### Coolify API Client

```typescript
// packages/core/src/deploy/coolify/client.ts
export class CoolifyClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;

  constructor(config: CoolifyConfig) {
    this.apiUrl = config.apiUrl;
    this.apiToken = config.apiToken;
  }

  async createProject(name: string): Promise<Project> {
    return this.request('POST', '/projects', { name });
  }

  async createDatabase(
    projectId: string,
    config: DatabaseConfig
  ): Promise<Database> {
    return this.request('POST', `/projects/${projectId}/databases`, config);
  }

  async createApplication(
    projectId: string,
    config: ApplicationConfig
  ): Promise<Application> {
    return this.request('POST', `/projects/${projectId}/applications`, config);
  }

  async deploy(applicationId: string): Promise<Deployment> {
    return this.request('POST', `/applications/${applicationId}/deploy`);
  }

  async scale(applicationId: string, replicas: number): Promise<void> {
    return this.request('PATCH', `/applications/${applicationId}`, {
      replicas,
    });
  }

  async getLogs(
    resourceId: string,
    options?: LogOptions
  ): AsyncIterable<LogEntry> {
    // Stream logs via WebSocket
  }
}
```

### Deployment Orchestrator

```typescript
// packages/core/src/deploy/coolify/orchestrator.ts
export class CoolifyDeploymentOrchestrator {
  constructor(private client: CoolifyClient) {}

  async deployADO(config: ADODeploymentConfig): Promise<DeploymentResult> {
    const { projectName, environment, scaling } = config;

    // 1. Create or get project
    const project = await this.ensureProject(projectName);

    // 2. Deploy databases
    const postgres = await this.deployPostgres(project.id, environment);
    const redis = await this.deployRedis(project.id, environment);

    // Wait for databases to be ready
    await this.waitForHealthy([postgres.id, redis.id]);

    // 3. Run migrations
    await this.runMigrations(postgres.connectionString);

    // 4. Deploy applications
    const apiGateway = await this.deployApiGateway(project.id, {
      postgres,
      redis,
      environment,
    });

    const orchestrator = await this.deployOrchestrator(project.id, {
      postgres,
      redis,
      environment,
    });

    const workers = await this.deployWorkers(project.id, {
      postgres,
      redis,
      environment,
      replicas: scaling.workers,
    });

    const dashboard = await this.deployDashboard(project.id, {
      apiGateway,
      environment,
    });

    // 5. Configure domains and SSL
    await this.configureDomains(config.domains, {
      api: apiGateway.id,
      dashboard: dashboard.id,
    });

    return {
      projectId: project.id,
      resources: {
        postgres,
        redis,
        apiGateway,
        orchestrator,
        workers,
        dashboard,
      },
      urls: {
        api: `https://${config.domains.api}`,
        dashboard: `https://${config.domains.dashboard}`,
      },
    };
  }

  private async waitForHealthy(resourceIds: string[]): Promise<void> {
    const maxWait = 300000; // 5 minutes
    const checkInterval = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const statuses = await Promise.all(
        resourceIds.map(id => this.client.getResourceStatus(id))
      );

      if (statuses.every(s => s === 'healthy')) {
        return;
      }

      await sleep(checkInterval);
    }

    throw new Error('Resources did not become healthy in time');
  }
}
```

## Coolify-specific Features

### 1. Auto SSL with Let's Encrypt

```typescript
// Coolify handles SSL automatically
interface DomainConfig {
  domain: string;
  ssl: {
    enabled: true;
    provider: 'letsencrypt';
    email: string;
  };
}

// No additional configuration needed - Coolify + Traefik handle it
```

### 2. Environment Secrets

```typescript
// Coolify secrets management
interface SecretsConfig {
  // Shared across project
  projectSecrets: {
    JWT_SECRET: string;
    ANTHROPIC_API_KEY: string;
  };

  // Per-environment
  environmentSecrets: {
    production: {
      DATABASE_URL: string;
    };
    staging: {
      DATABASE_URL: string;
    };
  };
}
```

### 3. Git-based Deployments

```typescript
// Coolify can build from Git
interface GitDeploymentConfig {
  repository: 'https://github.com/dxheroes/ado';
  branch: 'main';
  buildPack: 'dockerfile';
  dockerfile: 'packages/api/Dockerfile';

  // Auto-deploy on push
  webhook: {
    enabled: true;
    branches: ['main', 'staging'];
  };
}
```

### 4. Preview Environments

```typescript
// Coolify preview environments for PRs
interface PreviewConfig {
  enabled: true;
  baseDomain: 'preview.ado.example.com';
  // PR #123 -> pr-123.preview.ado.example.com
  pattern: 'pr-{number}';

  // Auto-cleanup
  ttl: '7d';

  // Resource limits for previews
  resources: {
    workers: 1;
    memory: '2Gi';
  };
}
```

## Monitoring Integration

### Coolify Built-in Metrics

```typescript
// Coolify provides basic metrics
interface CoolifyMetrics {
  cpu: number;
  memory: number;
  network: {
    rx: number;
    tx: number;
  };
  storage: number;
}

// Access via Coolify API
const metrics = await client.getMetrics(resourceId);
```

### External Monitoring

```yaml
# Add Prometheus to Coolify project
resource: application
type: docker-image
image: prom/prometheus:latest

configuration:
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml

  # Scrape ADO services
  # prometheus.yml configured to scrape:
  # - api-gateway:9090/metrics
  # - orchestrator:9090/metrics
  # - worker:9091/metrics
```

## Backup Strategy

```typescript
// Coolify backup configuration
interface BackupConfig {
  databases: {
    postgres: {
      enabled: true;
      schedule: '0 2 * * *'; // Daily at 2 AM
      retention: 7; // Keep 7 days
      storage: 's3'; // Or 'local'
      s3Config?: {
        bucket: 'ado-backups';
        region: 'eu-central-1';
        accessKey: '${secrets.AWS_ACCESS_KEY}';
        secretKey: '${secrets.AWS_SECRET_KEY}';
      };
    };
    redis: {
      enabled: true;
      schedule: '0 */6 * * *'; // Every 6 hours
      retention: 3;
    };
  };

  volumes: {
    workspaces: {
      enabled: true;
      schedule: '0 3 * * *';
      retention: 7;
    };
  };
}
```

## Scaling Strategy

### Manual Scaling

```typescript
// Scale via Coolify API
await client.scale(workerId, 10);

// Or via Coolify UI
// Resources -> Application -> Settings -> Replicas
```

### Scheduled Scaling

```typescript
// Coolify doesn't have native auto-scaling
// Implement via external cron job

// scale-workers.ts (run via cron)
async function autoScale() {
  const metrics = await getQueueMetrics();

  if (metrics.queueLength > 50) {
    await coolify.scale(workerId, Math.min(currentReplicas + 2, 20));
  } else if (metrics.queueLength < 5 && metrics.utilization < 30) {
    await coolify.scale(workerId, Math.max(currentReplicas - 1, 2));
  }
}

// Cron: */5 * * * * node scale-workers.js
```

## CLI Integration

```typescript
// packages/cli/src/commands/deploy.ts
export const deployCommand = new Command('deploy')
  .description('Deploy ADO to Coolify')
  .option('--coolify-url <url>', 'Coolify API URL')
  .option('--coolify-token <token>', 'Coolify API token')
  .option('--environment <env>', 'Environment', 'production')
  .option('--workers <n>', 'Number of workers', '3')
  .action(async (options) => {
    const client = new CoolifyClient({
      apiUrl: options.coolifyUrl,
      apiToken: options.coolifyToken,
    });

    const orchestrator = new CoolifyDeploymentOrchestrator(client);

    const result = await orchestrator.deployADO({
      projectName: 'ado',
      environment: options.environment,
      scaling: {
        workers: parseInt(options.workers),
      },
      domains: {
        api: `api.${options.domain}`,
        dashboard: `ado.${options.domain}`,
      },
    });

    console.log('Deployment complete!');
    console.log(`API: ${result.urls.api}`);
    console.log(`Dashboard: ${result.urls.dashboard}`);
  });
```

## Migration Path

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Migration Paths                                           │
└─────────────────────────────────────────────────────────────────────────────┘

Docker Compose ──────────────────────────────────► Coolify
                 Simple migration
                 - Import docker-compose.yaml
                 - Configure domains
                 - Enable SSL

Coolify ─────────────────────────────────────────► Kubernetes
                 When you need:
                 - Auto-scaling
                 - Multi-node
                 - Service mesh
                 - Advanced networking

Steps:
1. Export configuration from Coolify
2. Generate Kubernetes manifests
3. Migrate databases (pg_dump/restore)
4. Update DNS
5. Verify and cutover
```

## Limitations

| Feature | Coolify Support | Workaround |
|---------|-----------------|------------|
| Auto-scaling | No | External cron job |
| Multi-node | Limited | Use Coolify clusters |
| Service mesh | No | Not needed for ADO scale |
| Custom networking | Limited | Docker networks |
| Blue-green deploy | Partial | Manual via replicas |

---

## Souvislosti

- [Operations: Coolify Deployment](../../07-operations/01-deployment/coolify.md)
- [Docker Compose Design](./docker-compose.md)
- [Kubernetes Deployment](./kubernetes-deployment.md)
- [NFR-002: Scalability](../../02-requirements/02-non-functional/NFR-002-scalability.md)
