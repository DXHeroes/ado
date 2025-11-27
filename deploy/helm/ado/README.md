# ADO Helm Chart

This Helm chart deploys the Agentic Development Orchestrator (ADO) on Kubernetes.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.8+
- PV provisioner support in the underlying infrastructure (for persistence)

## Installing the Chart

```bash
# Add the repository (when published)
helm repo add dxheroes https://charts.dxheroes.io
helm repo update

# Install the chart
helm install ado dxheroes/ado \
  --namespace ado-system \
  --create-namespace \
  --set secrets.create=true \
  --set postgresql.auth.password=your-postgres-password \
  --set redis.auth.password=your-redis-password
```

### Installing from source

```bash
# From the repository root
helm install ado ./deploy/helm/ado \
  --namespace ado-system \
  --create-namespace \
  -f ./deploy/helm/ado/values.yaml
```

## Configuration

The following table lists the configurable parameters of the ADO chart and their default values.

### Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.imageRegistry` | Global Docker image registry | `""` |
| `global.imagePullSecrets` | Global Docker registry secret names | `[]` |

### Image Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `image.registry` | Image registry | `docker.io` |
| `image.repository` | Image repository | `dxheroes/ado` |
| `image.tag` | Image tag | Chart appVersion |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Deployment Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `2` |
| `strategy.type` | Deployment strategy | `RollingUpdate` |

### Resource Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.limits.cpu` | CPU limit | `2000m` |
| `resources.limits.memory` | Memory limit | `4Gi` |
| `resources.requests.cpu` | CPU request | `500m` |
| `resources.requests.memory` | Memory request | `1Gi` |

### Autoscaling Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `2` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU % | `70` |
| `autoscaling.targetMemoryUtilizationPercentage` | Target Memory % | `80` |

### PostgreSQL Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Deploy PostgreSQL | `true` |
| `postgresql.auth.username` | PostgreSQL username | `ado` |
| `postgresql.auth.password` | PostgreSQL password | `""` (must set) |
| `postgresql.auth.database` | PostgreSQL database | `ado` |
| `postgresql.external.host` | External PostgreSQL host | `""` |

### Redis Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `redis.enabled` | Deploy Redis | `true` |
| `redis.auth.enabled` | Enable Redis auth | `true` |
| `redis.auth.password` | Redis password | `""` (must set) |
| `redis.external.host` | External Redis host | `""` |

## Examples

### Using External PostgreSQL and Redis

```yaml
# values-external-db.yaml
postgresql:
  enabled: false
  external:
    host: postgres.example.com
    port: 5432
    database: ado
    username: ado
    existingSecret: ado-postgres-secret
    existingSecretPasswordKey: password

redis:
  enabled: false
  external:
    host: redis.example.com
    port: 6379
    existingSecret: ado-redis-secret
    existingSecretPasswordKey: password
```

```bash
helm install ado ./deploy/helm/ado -f values-external-db.yaml
```

### Production Configuration

```yaml
# values-production.yaml
replicaCount: 3

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 60
  targetMemoryUtilizationPercentage: 70

resources:
  limits:
    cpu: 4000m
    memory: 8Gi
  requests:
    cpu: 1000m
    memory: 2Gi

postgresql:
  primary:
    persistence:
      size: 50Gi
    resources:
      limits:
        cpu: 2000m
        memory: 4Gi

redis:
  master:
    persistence:
      size: 20Gi
    resources:
      limits:
        cpu: 1000m
        memory: 2Gi

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: ado.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ado-tls
      hosts:
        - ado.example.com
```

### Minimal Development Setup

```yaml
# values-dev.yaml
replicaCount: 1

autoscaling:
  enabled: false

resources:
  limits:
    cpu: 1000m
    memory: 2Gi
  requests:
    cpu: 250m
    memory: 512Mi

postgresql:
  primary:
    persistence:
      size: 5Gi

redis:
  master:
    persistence:
      size: 2Gi

persistence:
  enabled: false
```

## Upgrading

```bash
# Upgrade to a new version
helm upgrade ado dxheroes/ado \
  --namespace ado-system \
  --reuse-values

# Upgrade with new values
helm upgrade ado dxheroes/ado \
  --namespace ado-system \
  -f values-production.yaml
```

## Uninstalling

```bash
helm uninstall ado --namespace ado-system
```

**Note:** This will not delete PVCs. To delete them manually:

```bash
kubectl delete pvc -n ado-system -l app.kubernetes.io/instance=ado
```

## Monitoring

### Prometheus Integration

Enable ServiceMonitor for Prometheus Operator:

```yaml
serviceMonitor:
  enabled: true
  interval: 30s
  labels:
    prometheus: kube-prometheus
```

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n ado-system -l app.kubernetes.io/name=ado
```

### View logs

```bash
kubectl logs -n ado-system -l app.kubernetes.io/name=ado -f
```

### Check configuration

```bash
kubectl get configmap -n ado-system -o yaml
```

### Verify database connection

```bash
kubectl exec -n ado-system deploy/ado -- node -e "
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.connect().then(() => console.log('Connected')).catch(console.error);
"
```

## Support

For issues and questions, visit: https://github.com/dxheroes/ado/issues
