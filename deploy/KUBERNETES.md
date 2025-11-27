# Kubernetes Deployment Guide

This guide covers deploying ADO on Kubernetes for production use with horizontal scaling, distributed state, and high availability.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Ingress (HTTPS)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Service (ClusterIP)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
    ┌───▼───┐           ┌───▼───┐           ┌───▼───┐
    │ Pod 1 │           │ Pod 2 │           │ Pod N │
    │ ADO   │           │ ADO   │           │ ADO   │
    └───┬───┘           └───┬───┘           └───┬───┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼──────────┐   ┌───▼────┐      ┌──────▼──────┐
    │ PostgreSQL   │   │ Redis  │      │ Persistent  │
    │ (State)      │   │ (Queue)│      │ Volume      │
    └──────────────┘   └────────┘      └─────────────┘
```

## Prerequisites

- Kubernetes 1.24+ cluster
- `kubectl` configured to access your cluster
- Helm 3.8+
- PostgreSQL 14+ (managed or in-cluster)
- Redis 6+ (managed or in-cluster)
- Storage class for persistent volumes

## Quick Start

### 1. Create Namespace

```bash
kubectl create namespace ado-system
```

### 2. Create Secrets

```bash
# Create secrets for API keys
kubectl create secret generic ado-secrets \
  --namespace ado-system \
  --from-literal=ANTHROPIC_API_KEY='your-key-here' \
  --from-literal=GOOGLE_API_KEY='your-key-here' \
  --from-literal=POSTGRESQL_PASSWORD='your-postgres-password' \
  --from-literal=REDIS_PASSWORD='your-redis-password'
```

### 3. Install with Helm

```bash
# Install with default values (includes PostgreSQL and Redis)
helm install ado ./deploy/helm/ado \
  --namespace ado-system \
  --set secrets.existingSecret=ado-secrets

# Or use external databases
helm install ado ./deploy/helm/ado \
  --namespace ado-system \
  --set secrets.existingSecret=ado-secrets \
  --set postgresql.enabled=false \
  --set postgresql.external.host=postgres.example.com \
  --set redis.enabled=false \
  --set redis.external.host=redis.example.com
```

## Configuration

### Horizontal Pod Autoscaling (HPA)

ADO automatically scales based on CPU and memory usage:

```yaml
# values.yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

Monitor autoscaling:

```bash
kubectl get hpa -n ado-system
kubectl describe hpa ado -n ado-system
```

### Resource Limits

Configure resource requests and limits based on your workload:

```yaml
# values.yaml
resources:
  limits:
    cpu: 2000m
    memory: 4Gi
  requests:
    cpu: 500m
    memory: 1Gi
```

### Pod Disruption Budget

Ensure availability during maintenance:

```yaml
# values.yaml
podDisruptionBudget:
  enabled: true
  minAvailable: 1  # At least 1 pod must be available
```

## Distributed State Management

### PostgreSQL

ADO uses PostgreSQL for shared state across pods:

- **Sessions**: Track agent sessions across the cluster
- **Tasks**: Store task definitions and results
- **Checkpoints**: Enable resume across pod restarts
- **Usage**: Track provider usage for rate limiting

Connection configuration:

```yaml
# values.yaml
postgresql:
  enabled: true  # Deploy PostgreSQL in cluster
  auth:
    database: ado
    username: ado
    password: set-via-secret

# Or use external PostgreSQL
postgresql:
  enabled: false
  external:
    host: postgres.example.com
    port: 5432
    database: ado
    username: ado
    existingSecret: ado-secrets
    existingSecretPasswordKey: POSTGRESQL_PASSWORD
```

### Redis

Redis provides distributed rate limiting and task queue:

- **Rate Limiting**: Track usage across all pods
- **Task Queue**: Distribute tasks to available pods
- **Caching**: Cache provider configurations

Connection configuration:

```yaml
# values.yaml
redis:
  enabled: true  # Deploy Redis in cluster
  auth:
    enabled: true
    password: set-via-secret

# Or use external Redis
redis:
  enabled: false
  external:
    host: redis.example.com
    port: 6379
    existingSecret: ado-secrets
    existingSecretPasswordKey: REDIS_PASSWORD
```

## High Availability

### Multi-Zone Deployment

Deploy across availability zones for resilience:

```yaml
# values.yaml
affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
            - key: app.kubernetes.io/name
              operator: In
              values:
                - ado
        topologyKey: topology.kubernetes.io/zone
```

### Database HA

For production, use managed PostgreSQL with:
- Multi-AZ deployment
- Automated backups
- Point-in-time recovery

Example with AWS RDS:

```yaml
postgresql:
  enabled: false
  external:
    host: ado.cluster-xxx.us-east-1.rds.amazonaws.com
    port: 5432
```

### Redis HA

Use Redis Sentinel or Cluster mode:

```yaml
redis:
  enabled: true
  architecture: replication
  sentinel:
    enabled: true
    masterSet: ado-redis
```

## Monitoring and Observability

### Health Checks

ADO provides health endpoints:

- **Liveness**: `/health` - Pod is alive and running
- **Readiness**: `/ready` - Pod is ready to serve requests

```yaml
# values.yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Prometheus Metrics

Enable ServiceMonitor for Prometheus Operator:

```yaml
# values.yaml
serviceMonitor:
  enabled: true
  interval: 30s
  labels:
    prometheus: kube-prometheus
```

Metrics include:
- Task execution duration
- Provider usage
- Queue depth
- Rate limit status
- Cost tracking

### Logs

ADO outputs structured JSON logs in Kubernetes:

```bash
# View logs from all pods
kubectl logs -n ado-system -l app.kubernetes.io/name=ado -f

# View logs from specific pod
kubectl logs -n ado-system ado-7d8f9c8b6d-abcde -f
```

Configure log level:

```yaml
# values.yaml
ado:
  observability:
    logging:
      level: info  # debug, info, warn, error
      format: json
```

## Scaling Strategies

### Task-Based Scaling

Scale based on task queue depth using custom metrics:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ado-tasks
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ado
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: External
    external:
      metric:
        name: ado_pending_tasks
      target:
        type: AverageValue
        averageValue: "10"
```

### Manual Scaling

```bash
# Scale to specific replica count
kubectl scale deployment ado -n ado-system --replicas=5

# Check current replicas
kubectl get deployment ado -n ado-system
```

## Deployment Strategies

### Rolling Update (Default)

Zero-downtime deployments:

```yaml
# values.yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

### Blue-Green Deployment

```bash
# Deploy new version as separate release
helm install ado-green ./deploy/helm/ado \
  --namespace ado-system \
  -f values-production.yaml

# Test the new version
# Switch traffic via ingress
# Uninstall old version
helm uninstall ado -n ado-system
```

## Security

### Pod Security

```yaml
# values.yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1001
  fsGroup: 1001

securityContext:
  capabilities:
    drop:
    - ALL
  readOnlyRootFilesystem: false
  allowPrivilegeEscalation: false
```

### Network Policies

Restrict network access:

```yaml
# values.yaml
networkPolicy:
  enabled: true
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: ingress-nginx
  egress:
    - to:
      - podSelector:
          matchLabels:
            app: postgresql
    - to:
      - podSelector:
          matchLabels:
            app: redis
```

### Secrets Management

Use external secret management:

```yaml
# Example with External Secrets Operator
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ado-secrets
spec:
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: ado-secrets
  data:
    - secretKey: ANTHROPIC_API_KEY
      remoteRef:
        key: ado/anthropic-api-key
```

## Backup and Recovery

### Database Backups

```bash
# Backup PostgreSQL
kubectl exec -n ado-system ado-postgresql-0 -- \
  pg_dump -U ado ado > ado-backup-$(date +%Y%m%d).sql

# Restore
kubectl exec -i -n ado-system ado-postgresql-0 -- \
  psql -U ado ado < ado-backup-20240115.sql
```

### Redis Persistence

Enable AOF or RDB persistence:

```yaml
redis:
  master:
    persistence:
      enabled: true
      size: 5Gi
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n ado-system
kubectl describe pod ado-xxx -n ado-system
```

### View Events

```bash
kubectl get events -n ado-system --sort-by='.lastTimestamp'
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
kubectl run -n ado-system psql-test --rm -it --image=postgres:14 -- \
  psql -h ado-postgresql -U ado -d ado

# Test Redis connection
kubectl run -n ado-system redis-test --rm -it --image=redis:6 -- \
  redis-cli -h ado-redis-master -a <password>
```

### Resource Constraints

```bash
# Check resource usage
kubectl top pods -n ado-system
kubectl describe node <node-name>
```

## Production Checklist

- [ ] Secrets stored in external secret manager
- [ ] PostgreSQL with automated backups
- [ ] Redis with persistence enabled
- [ ] HPA configured with appropriate limits
- [ ] Pod disruption budget enabled
- [ ] Resource requests/limits set
- [ ] Monitoring and alerting configured
- [ ] Ingress with TLS enabled
- [ ] Network policies configured
- [ ] Multi-zone deployment
- [ ] Backup strategy tested
- [ ] Disaster recovery plan documented

## Cost Optimization

### Right-Size Resources

Monitor actual usage and adjust:

```bash
# Check current usage
kubectl top pods -n ado-system

# Adjust based on metrics
helm upgrade ado ./deploy/helm/ado \
  --set resources.requests.cpu=250m \
  --set resources.requests.memory=512Mi
```

### Use Spot Instances

```yaml
nodeSelector:
  node.kubernetes.io/instance-type: spot

tolerations:
  - key: spot
    operator: Equal
    value: "true"
    effect: NoSchedule
```

### Scale to Zero

For development environments:

```bash
# Scale down when not in use
kubectl scale deployment ado -n ado-system --replicas=0

# Scale up when needed
kubectl scale deployment ado -n ado-system --replicas=2
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/dxheroes/ado/issues
- Documentation: https://github.com/dxheroes/ado
