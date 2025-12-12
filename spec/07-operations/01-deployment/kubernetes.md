# Kubernetes Deployment Guide

## Přehled

Průvodce nasazením ADO na Kubernetes cluster.

## Předpoklady

- Kubernetes 1.28+
- Helm 3.12+
- kubectl nakonfigurovaný
- Přístup k container registry
- PostgreSQL (managed nebo in-cluster)
- Redis (managed nebo in-cluster)

## Quick Start

```bash
# 1. Přidání Helm repo
helm repo add ado https://charts.ado.dev
helm repo update

# 2. Vytvoření namespace
kubectl create namespace ado-system

# 3. Vytvoření secrets
kubectl create secret generic ado-secrets \
  --namespace ado-system \
  --from-literal=database-url="postgresql://user:pass@host:5432/ado" \
  --from-literal=redis-url="redis://redis:6379" \
  --from-literal=anthropic-api-key="$ANTHROPIC_API_KEY"

# 4. Instalace
helm install ado ado/ado \
  --namespace ado-system \
  --values values.yaml
```

## Values.yaml

```yaml
# values.yaml

global:
  imageRegistry: ghcr.io/dxheroes

# API Gateway
apiGateway:
  replicas: 2
  image:
    repository: ado/api-gateway
    tag: "2.0.0"
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 2000m
      memory: 2Gi
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70

# Orchestrator
orchestrator:
  replicas: 2
  image:
    repository: ado/orchestrator
    tag: "2.0.0"
  resources:
    requests:
      cpu: 1000m
      memory: 1Gi
    limits:
      cpu: 4000m
      memory: 4Gi

# Workers
workers:
  replicas: 3
  image:
    repository: ado/worker
    tag: "2.0.0"
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 4000m
      memory: 8Gi
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 50
    metrics:
      - type: External
        external:
          metric:
            name: ado_task_queue_length
          target:
            type: AverageValue
            averageValue: "10"
  # Volume pro workspace
  persistence:
    enabled: true
    size: 10Gi
    storageClass: "standard"

# Dashboard
dashboard:
  enabled: true
  replicas: 2
  image:
    repository: ado/dashboard
    tag: "2.0.0"

# Ingress
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
  hosts:
    - host: ado.example.com
      paths:
        - path: /api
          service: api-gateway
        - path: /ws
          service: api-gateway
          port: 3001
        - path: /
          service: dashboard
  tls:
    - secretName: ado-tls
      hosts:
        - ado.example.com

# Database (použijte managed service v produkci)
postgresql:
  enabled: false  # Použít external
  # enabled: true
  # auth:
  #   postgresPassword: "changeme"
  #   database: "ado"

# Redis
redis:
  enabled: true
  architecture: standalone
  auth:
    enabled: false

# Monitoring
monitoring:
  serviceMonitor:
    enabled: true
    interval: 30s
  prometheusRule:
    enabled: true

# Config
config:
  logLevel: info
  logFormat: json
  tracing:
    enabled: true
    endpoint: "http://jaeger-collector:14268/api/traces"
```

## Komponenty

### 1. API Gateway

Vstupní bod pro všechny požadavky.

```bash
# Ověření
kubectl get pods -n ado-system -l app=ado-api-gateway

# Logs
kubectl logs -n ado-system -l app=ado-api-gateway -f
```

### 2. Orchestrator

Jádro orchestrace.

```bash
# Status
kubectl get pods -n ado-system -l app=ado-orchestrator

# Scale (manuální)
kubectl scale deployment ado-orchestrator -n ado-system --replicas=3
```

### 3. Workers

Provádí úkoly.

```bash
# Status
kubectl get pods -n ado-system -l app=ado-worker

# HPA status
kubectl get hpa ado-worker-hpa -n ado-system

# Manuální scale
kubectl scale deployment ado-worker -n ado-system --replicas=10
```

## Upgrade

```bash
# Update repo
helm repo update

# Upgrade s novými values
helm upgrade ado ado/ado \
  --namespace ado-system \
  --values values.yaml \
  --set workers.image.tag="2.1.0"
```

## Rollback

```bash
# Seznam revizí
helm history ado -n ado-system

# Rollback na předchozí
helm rollback ado 1 -n ado-system
```

## Monitoring

### Prometheus Metrics

```yaml
# ServiceMonitor je vytvořen automaticky
# Metriky dostupné na :9090/metrics

# Key metrics:
# - ado_tasks_total
# - ado_tasks_duration_seconds
# - ado_workers_active
# - ado_queue_length
# - ado_cost_usd_total
```

### Grafana Dashboard

```bash
# Import dashboard
kubectl apply -f https://charts.ado.dev/dashboards/ado-overview.yaml
```

### Alerting

```yaml
# PrometheusRule je vytvořen automaticky
# Klíčové alerty:

# HighTaskFailureRate
# - Spouští se když failure rate > 10% za 5 minut

# WorkerPoolExhausted
# - Spouští se když všichni workers jsou busy + queue > 50

# HighAPICost
# - Spouští se když daily cost > threshold
```

## Troubleshooting

### Workers nescalují

```bash
# Ověření metrics
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1" | jq

# Ověření HPA
kubectl describe hpa ado-worker-hpa -n ado-system
```

### Vysoká latence

```bash
# Ověření resource limits
kubectl top pods -n ado-system

# Zvýšení resources
helm upgrade ado ado/ado \
  --set workers.resources.limits.cpu=8000m \
  --set workers.resources.limits.memory=16Gi
```

### Database connection issues

```bash
# Test connectivity
kubectl run psql-test --rm -it --image=postgres:15 \
  --restart=Never -- psql $DATABASE_URL -c "SELECT 1"
```

## Security Best Practices

1. **Secrets management**
   ```bash
   # Použijte external-secrets nebo sealed-secrets
   kubectl apply -f external-secret.yaml
   ```

2. **Network policies**
   ```yaml
   # Omezení traffic mezi komponenty
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: ado-network-policy
   spec:
     podSelector:
       matchLabels:
         app.kubernetes.io/name: ado
     ingress:
       - from:
         - namespaceSelector:
             matchLabels:
               name: ado-system
   ```

3. **Pod Security Standards**
   ```yaml
   # Enforce restricted PSS
   apiVersion: v1
   kind: Namespace
   metadata:
     name: ado-system
     labels:
       pod-security.kubernetes.io/enforce: restricted
   ```

---

## Souvislosti

- [Design: Kubernetes Deployment](../../04-design/03-cloud-infrastructure/kubernetes-deployment.md)
- [NFR-002: Scalability](../../02-requirements/02-non-functional/NFR-002-scalability.md)
- [Monitoring Guide](../02-monitoring/metrics.md)
