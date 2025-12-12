# Kubernetes Deployment Design

## Přehled

Tento dokument popisuje architekturu nasazení ADO na Kubernetes, včetně všech potřebných komponent, konfigurací a best practices.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            KUBERNETES CLUSTER                                │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          INGRESS                                       │  │
│  │  nginx-ingress / traefik / cloud LB                                   │  │
│  │  - TLS termination                                                    │  │
│  │  - Path routing                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│              ┌─────────────────────┴─────────────────────┐                  │
│              │                                           │                  │
│              ▼                                           ▼                  │
│  ┌─────────────────────────┐               ┌─────────────────────────┐     │
│  │   API Gateway           │               │   Dashboard             │     │
│  │   (Deployment)          │               │   (Deployment)          │     │
│  │                         │               │                         │     │
│  │   Replicas: 2-5         │               │   Replicas: 2           │     │
│  │   HPA: CPU 70%          │               │                         │     │
│  └───────────┬─────────────┘               └─────────────────────────┘     │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────┐                                               │
│  │   Orchestrator Core     │                                               │
│  │   (Deployment)          │                                               │
│  │                         │                                               │
│  │   Replicas: 2-3         │                                               │
│  │   Anti-affinity: true   │                                               │
│  └───────────┬─────────────┘                                               │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         WORKER POOL                                  │  │
│  │                                                                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker N │            │  │
│  │  │ (Pod)    │  │ (Pod)    │  │ (Pod)    │  │ (Pod)    │            │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │  │
│  │                                                                      │  │
│  │  HPA: 3-50 replicas                                                 │  │
│  │  Scale on: Queue length, CPU                                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         DATA LAYER                                   │  │
│  │                                                                      │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │  │
│  │  │   PostgreSQL     │  │     Redis        │  │   S3 (MinIO)     │  │  │
│  │  │   (StatefulSet)  │  │   (StatefulSet)  │  │   (External)     │  │  │
│  │  │                  │  │                  │  │                  │  │  │
│  │  │   Primary +      │  │   Cluster mode   │  │   Checkpoints    │  │  │
│  │  │   Replica        │  │   3 nodes        │  │   Artifacts      │  │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │  │
│  │                                                                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Kubernetes Resources

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ado-system
  labels:
    app.kubernetes.io/name: ado
    app.kubernetes.io/managed-by: helm
```

### API Gateway Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ado-api-gateway
  namespace: ado-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ado-api-gateway
  template:
    metadata:
      labels:
        app: ado-api-gateway
    spec:
      containers:
        - name: api-gateway
          image: ado/api-gateway:latest
          ports:
            - containerPort: 3000
              name: http
            - containerPort: 3001
              name: ws
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ado-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: ado-secrets
                  key: redis-url
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 2000m
              memory: 2Gi
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
```

### Worker Deployment with HPA

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ado-worker
  namespace: ado-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ado-worker
  template:
    metadata:
      labels:
        app: ado-worker
    spec:
      containers:
        - name: worker
          image: ado/worker:latest
          env:
            - name: CONTROLLER_URL
              value: "http://ado-orchestrator:3000"
            - name: WORKER_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
          resources:
            requests:
              cpu: 1000m
              memory: 2Gi
            limits:
              cpu: 4000m
              memory: 8Gi
          volumeMounts:
            - name: workspace
              mountPath: /workspace
            - name: agent-credentials
              mountPath: /etc/ado/credentials
              readOnly: true
      volumes:
        - name: workspace
          emptyDir:
            sizeLimit: 10Gi
        - name: agent-credentials
          secret:
            secretName: ado-agent-credentials

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ado-worker-hpa
  namespace: ado-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ado-worker
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
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 5
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
```

### Services

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ado-api-gateway
  namespace: ado-system
spec:
  selector:
    app: ado-api-gateway
  ports:
    - name: http
      port: 80
      targetPort: 3000
    - name: ws
      port: 81
      targetPort: 3001

---
apiVersion: v1
kind: Service
metadata:
  name: ado-orchestrator
  namespace: ado-system
spec:
  selector:
    app: ado-orchestrator
  ports:
    - name: grpc
      port: 3000
      targetPort: 3000
  clusterIP: None  # Headless for direct pod access
```

### Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ado-ingress
  namespace: ado-system
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - ado.example.com
      secretName: ado-tls
  rules:
    - host: ado.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: ado-api-gateway
                port:
                  number: 80
          - path: /ws
            pathType: Prefix
            backend:
              service:
                name: ado-api-gateway
                port:
                  number: 81
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ado-dashboard
                port:
                  number: 80
```

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ado-config
  namespace: ado-system
data:
  config.yaml: |
    server:
      port: 3000
      wsPort: 3001

    orchestration:
      maxParallelAgents: 50
      checkpointInterval: 30
      worktreeIsolation: true

    routing:
      strategy: subscription-first
      apiFallback:
        enabled: true
        confirmAboveCost: 1.00

    quality:
      build: { required: true }
      tests: { required: true, minCoverage: 80 }
      lint: { required: true }

    observability:
      logging:
        level: info
        format: json
      tracing:
        enabled: true
        endpoint: http://jaeger-collector:14268/api/traces
```

### Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ado-secrets
  namespace: ado-system
type: Opaque
stringData:
  database-url: "postgresql://ado:password@postgresql:5432/ado"
  redis-url: "redis://redis:6379"

---
apiVersion: v1
kind: Secret
metadata:
  name: ado-agent-credentials
  namespace: ado-system
type: Opaque
stringData:
  anthropic-api-key: "sk-ant-..."
  google-api-key: "AIza..."
```

### Pod Disruption Budget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ado-api-gateway-pdb
  namespace: ado-system
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: ado-api-gateway

---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ado-worker-pdb
  namespace: ado-system
spec:
  maxUnavailable: 30%
  selector:
    matchLabels:
      app: ado-worker
```

## Helm Chart Structure

```
deploy/helm/ado/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-prod.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── api-gateway/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── hpa.yaml
│   ├── orchestrator/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── worker/
│   │   ├── deployment.yaml
│   │   └── hpa.yaml
│   ├── dashboard/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── ingress.yaml
│   ├── pdb.yaml
│   └── servicemonitor.yaml
└── charts/
    ├── postgresql/
    └── redis/
```

## Installation

```bash
# Add Helm repo
helm repo add ado https://charts.ado.dev

# Install with default values
helm install ado ado/ado \
  --namespace ado-system \
  --create-namespace

# Install with custom values
helm install ado ado/ado \
  --namespace ado-system \
  --create-namespace \
  -f values-prod.yaml \
  --set secrets.anthropicApiKey=$ANTHROPIC_API_KEY \
  --set secrets.googleApiKey=$GOOGLE_API_KEY
```

## Monitoring

### ServiceMonitor for Prometheus

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ado-metrics
  namespace: ado-system
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: ado
  endpoints:
    - port: metrics
      interval: 30s
      path: /metrics
```

### Grafana Dashboard

Key panels:
- Task throughput
- Success rate
- Queue length
- Worker utilization
- Cost per hour
- Provider availability

---

## Souvislosti

- [FR-002: Distributed Orchestration](../../02-requirements/01-functional/FR-002-distributed-orchestration.md)
- [NFR-002: Scalability](../../02-requirements/02-non-functional/NFR-002-scalability.md)
- [Operations: Deployment](../../07-operations/01-deployment/kubernetes.md)
