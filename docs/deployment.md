# Deployment Guide

Deploy ADO locally with Docker or on Kubernetes for production.

## Deployment Options

1. **Local** - Single machine with Docker
2. **Kubernetes** - Scalable production deployment
3. **Hybrid** - Local CLI with K8s orchestrator backend

## Local Deployment (Docker)

### Prerequisites

- Docker 24.0+
- Docker Compose 2.20+

### Quick Start

```bash
# Clone repository
git clone https://github.com/dxheroes/ado
cd ado

# Build Docker image
docker build -t ado:latest .

# Run with Docker Compose
docker compose up -d
```

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  ado-orchestrator:
    image: ado:latest
    container_name: ado-orchestrator
    ports:
      - "8080:8080"      # API server
      - "3000:3000"      # Dashboard
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/ado
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
    volumes:
      - ./ado.config.yaml:/app/ado.config.yaml
      - ado-data:/app/.ado
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=ado
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  dashboard:
    image: ado-dashboard:latest
    ports:
      - "3001:3000"
    environment:
      - VITE_API_URL=http://ado-orchestrator:8080

volumes:
  ado-data:
  postgres-data:
  redis-data:
```

### Environment Variables

Create `.env` file:

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENAI_API_KEY=sk-...

# Database
DATABASE_URL=postgresql://postgres:password@db:5432/ado

# Redis
REDIS_URL=redis://redis:6379

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# Telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes 1.28+
- kubectl configured
- Helm 3.12+

### Install with Helm

```bash
# Add ADO Helm repository
helm repo add ado https://charts.ado.dev
helm repo update

# Install ADO
helm install ado ado/ado \
  --namespace ado-system \
  --create-namespace \
  --values values.yaml
```

### Helm Values (`values.yaml`)

```yaml
# ADO Helm Chart Values

replicaCount: 3

image:
  repository: dxheroes/ado
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: ado.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ado-tls
      hosts:
        - ado.example.com

config:
  # ADO configuration
  version: "1.1"
  project:
    id: "production"

  providers:
    claude-code:
      enabled: true
      accessModes:
        - mode: subscription
          priority: 1
          enabled: true

  storage:
    driver: postgresql
    connectionString: postgresql://ado:password@postgres:5432/ado

  rateLimitTracking:
    driver: redis
    redisUrl: redis://redis:6379

  observability:
    telemetry:
      enabled: true
      serviceName: ado-orchestrator
      environment: production
      tracing:
        enabled: true
        endpoint: http://jaeger-collector:4318/v1/traces
      metrics:
        enabled: true
        endpoint: http://prometheus:9090/api/v1/write

secrets:
  anthropicApiKey: ""     # Set via --set or sealed secrets
  googleApiKey: ""
  slackWebhookUrl: ""

postgresql:
  enabled: true
  auth:
    username: ado
    password: password
    database: ado
  primary:
    persistence:
      enabled: true
      size: 10Gi

redis:
  enabled: true
  auth:
    enabled: false
  master:
    persistence:
      enabled: true
      size: 2Gi

resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

nodeSelector: {}
tolerations: []
affinity: {}
```

### Install Dependencies

```bash
# PostgreSQL
helm install postgres bitnami/postgresql \
  --namespace ado-system \
  --set auth.username=ado \
  --set auth.password=password \
  --set auth.database=ado

# Redis
helm install redis bitnami/redis \
  --namespace ado-system \
  --set auth.enabled=false

# Jaeger (optional - for tracing)
helm install jaeger jaegertracing/jaeger \
  --namespace observability \
  --create-namespace
```

### Deploy ADO

```bash
# Create namespace
kubectl create namespace ado-system

# Create secrets
kubectl create secret generic ado-secrets \
  --namespace ado-system \
  --from-literal=anthropic-api-key=$ANTHROPIC_API_KEY \
  --from-literal=google-api-key=$GOOGLE_API_KEY \
  --from-literal=slack-webhook-url=$SLACK_WEBHOOK_URL

# Install ADO
helm install ado ./deploy/helm/ado \
  --namespace ado-system \
  --values values.yaml
```

### Verify Deployment

```bash
# Check pods
kubectl get pods -n ado-system

# Check services
kubectl get svc -n ado-system

# Check logs
kubectl logs -n ado-system -l app=ado -f

# Port forward for testing
kubectl port-forward -n ado-system svc/ado 8080:8080
```

## Scaling

### Horizontal Pod Autoscaling

```yaml
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

```bash
# View HPA status
kubectl get hpa -n ado-system

# Manual scaling
kubectl scale deployment ado --replicas=5 -n ado-system
```

### Vertical Scaling

```yaml
resources:
  limits:
    cpu: 4000m
    memory: 8Gi
  requests:
    cpu: 1000m
    memory: 2Gi
```

## Monitoring

### Prometheus Metrics

ADO exposes metrics at `/metrics`:

```yaml
# ServiceMonitor for Prometheus Operator
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ado
  namespace: ado-system
spec:
  selector:
    matchLabels:
      app: ado
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### Grafana Dashboards

Import ADO dashboards:

```bash
kubectl apply -f deploy/grafana/dashboards.yaml
```

Dashboards include:
- Task execution metrics
- Provider usage
- Cost tracking
- Rate limit status

### Distributed Tracing

ADO integrates with Jaeger:

```bash
# Access Jaeger UI
kubectl port-forward -n observability svc/jaeger-query 16686:16686

# Open http://localhost:16686
```

## High Availability

### Database Replication

```yaml
postgresql:
  enabled: true
  replication:
    enabled: true
    readReplicas: 2
```

### Redis Sentinel

```yaml
redis:
  enabled: true
  sentinel:
    enabled: true
    quorum: 2
  master:
    count: 3
```

### Pod Disruption Budget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ado-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: ado
```

## Backup and Recovery

### Database Backups

```bash
# Backup PostgreSQL
kubectl exec -n ado-system postgres-0 -- \
  pg_dump -U ado ado > backup-$(date +%Y%m%d).sql

# Restore
kubectl exec -i -n ado-system postgres-0 -- \
  psql -U ado ado < backup-20251126.sql
```

### State Backups

```bash
# Backup persistent volumes
kubectl get pvc -n ado-system
velero backup create ado-backup --include-namespaces ado-system
```

## Security

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ado-network-policy
spec:
  podSelector:
    matchLabels:
      app: ado
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: nginx-ingress
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
```

### RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ado
  namespace: ado-system
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ado-role
  namespace: ado-system
rules:
  - apiGroups: [""]
    resources: ["pods", "configmaps", "secrets"]
    verbs: ["get", "list", "watch"]
```

## Troubleshooting

### Check Pod Status

```bash
kubectl describe pod -n ado-system ado-xxx
kubectl logs -n ado-system ado-xxx --previous
```

### Database Connection Issues

```bash
# Test database connection
kubectl run -it --rm debug --image=postgres:16 --restart=Never -- \
  psql -h postgres -U ado -d ado
```

### Resource Limits

```bash
# Check resource usage
kubectl top pods -n ado-system

# Increase limits
kubectl set resources deployment ado \
  --limits=cpu=4,memory=8Gi \
  --requests=cpu=1,memory=2Gi
```

## Upgrading

### Rolling Update

```bash
# Update image
helm upgrade ado ./deploy/helm/ado \
  --namespace ado-system \
  --set image.tag=1.1.0 \
  --reuse-values

# Monitor rollout
kubectl rollout status deployment/ado -n ado-system

# Rollback if needed
kubectl rollout undo deployment/ado -n ado-system
```

## Next Steps

- [Configuration Reference](./configuration.md)
- [Monitoring Guide](./monitoring.md)
- [API Reference](./api-reference.md)
