# NFR-004: Security

## Přehled

ADO musí zajistit bezpečnost dat, komunikace a přístupu na všech úrovních systému.

## Požadavky

### NFR-004.1: Authentication

| Metoda | Use case | Požadavek |
|--------|----------|-----------|
| API Key | CLI, CI/CD | Required |
| JWT | Dashboard, API | Required |
| mTLS | Worker-Controller | Optional |

**Acceptance criteria:**
- [ ] API keys rotatable
- [ ] JWT expiry configurable (default 1h)
- [ ] Refresh token support
- [ ] Session management

### NFR-004.2: Authorization

| Role | Permissions |
|------|-------------|
| Admin | Full access |
| Developer | Create/view own tasks |
| Viewer | View only |
| CI/CD | Create tasks, limited config |

**RBAC model:**
```yaml
roles:
  admin:
    permissions: ["*"]

  developer:
    permissions:
      - "task:create"
      - "task:view:own"
      - "task:cancel:own"
      - "checkpoint:resolve:own"
      - "config:view"

  viewer:
    permissions:
      - "task:view"
      - "dashboard:view"

  cicd:
    permissions:
      - "task:create"
      - "task:view"
      - "task:wait"
```

### NFR-004.3: Data Protection

| Data | At rest | In transit |
|------|---------|------------|
| Credentials | AES-256 | TLS 1.3 |
| Task data | AES-256 | TLS 1.3 |
| Logs | Optional | TLS 1.3 |

**Encryption configuration:**
```yaml
encryption:
  atRest:
    enabled: true
    algorithm: "AES-256-GCM"
    keyRotation: 90d

  inTransit:
    tls:
      minVersion: "1.3"
      cipherSuites:
        - "TLS_AES_256_GCM_SHA384"
        - "TLS_CHACHA20_POLY1305_SHA256"
```

### NFR-004.4: Secrets Management

**Requirements:**
- [ ] No secrets in logs
- [ ] No secrets in error messages
- [ ] Environment variable injection
- [ ] External secret store support (Vault, AWS Secrets Manager)

**Secret sources:**
```yaml
secrets:
  providers:
    - type: "env"
      prefix: "ADO_"

    - type: "vault"
      address: "https://vault.example.com"
      path: "secret/ado"

    - type: "aws-secrets-manager"
      region: "us-east-1"
      secretId: "ado/production"
```

### NFR-004.5: Network Security

| Zone | Ingress | Egress |
|------|---------|--------|
| Controller | HTTPS (443) | Workers, DB, AI APIs |
| Workers | None (internal) | AI APIs, Git |
| Database | Internal only | None |

**Network policies:**
```yaml
networkPolicies:
  controller:
    ingress:
      - from: ["internet"]
        ports: [443]
      - from: ["workers"]
        ports: [3000]
    egress:
      - to: ["workers"]
        ports: [3001]
      - to: ["database"]
        ports: [5432]
      - to: ["redis"]
        ports: [6379]

  workers:
    ingress:
      - from: ["controller"]
        ports: [3001]
    egress:
      - to: ["ai-apis"]
        ports: [443]
      - to: ["git"]
        ports: [443, 22]
```

### NFR-004.6: Audit Logging

**Required events:**
- Authentication attempts
- Authorization decisions
- Task creation/modification
- Checkpoint resolutions
- Configuration changes
- Data access

**Audit log format:**
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "eventType": "task.create",
  "actor": {
    "type": "user",
    "id": "user-123",
    "ip": "192.168.1.100"
  },
  "resource": {
    "type": "task",
    "id": "task-456"
  },
  "action": "create",
  "result": "success",
  "metadata": {
    "provider": "claude-code",
    "prompt_hash": "sha256:abc..."
  }
}
```

### NFR-004.7: Vulnerability Management

| Scan type | Frequency | Blocking |
|-----------|-----------|----------|
| Dependency scan | Daily | High/Critical |
| Container scan | On build | High/Critical |
| SAST | On commit | High |
| DAST | Weekly | Critical |

---

## Security Checklist

### Deployment
- [ ] TLS certificates configured
- [ ] Network policies applied
- [ ] Secrets in external store
- [ ] Audit logging enabled
- [ ] RBAC configured

### Operations
- [ ] Regular secret rotation
- [ ] Vulnerability scanning
- [ ] Access review quarterly
- [ ] Incident response plan

### Development
- [ ] Security code review
- [ ] Dependency updates
- [ ] Security testing in CI
- [ ] No hardcoded secrets

---

## Incident Response

```yaml
incidentResponse:
  severity:
    critical:
      examples: ["Data breach", "Auth bypass"]
      response: "Immediate"
      notification: ["security-team", "management"]

    high:
      examples: ["Privilege escalation", "Injection"]
      response: "< 4 hours"
      notification: ["security-team"]

    medium:
      examples: ["Info disclosure", "XSS"]
      response: "< 24 hours"
      notification: ["dev-team"]
```
