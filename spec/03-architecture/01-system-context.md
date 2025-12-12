# System Context (C4 Level 1)

## Přehled

Tento dokument popisuje ADO v kontextu okolních systémů a uživatelů.

## Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                          │
│                                    EXTERNAL SYSTEMS                                      │
│                                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │   Claude     │  │   Gemini     │  │   GitHub     │  │   Cursor     │                │
│  │   (Claude    │  │   (Gemini    │  │   (Copilot   │  │   (Cursor    │                │
│  │    Code)     │  │    CLI)      │  │    CLI)      │  │    CLI)      │                │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                │
│         │                │                 │                 │                          │
│         └────────────────┴─────────────────┴─────────────────┘                          │
│                                    │                                                    │
│                                    ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                   │  │
│  │                           ADO (Agentic Development                               │  │
│  │                               Orchestrator)                                       │  │
│  │                                                                                   │  │
│  │   Orchestruje AI coding agenty, poskytuje subscription-first routing,           │  │
│  │   documentation-first workflow, quality assurance a distribuovanou orchestraci  │  │
│  │                                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│         │                    │                    │                    │               │
│         │                    │                    │                    │               │
│         ▼                    ▼                    ▼                    ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │     Git      │  │  CI/CD       │  │   Slack      │  │   Email      │              │
│  │  Repositories│  │  Pipelines   │  │  (notif.)    │  │  (notif.)    │              │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘

                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
       ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
       │  Developer   │          │   DevOps     │          │   CI/CD      │
       │    (CLI)     │          │  (Dashboard) │          │   System     │
       └──────────────┘          └──────────────┘          └──────────────┘
```

## Uživatelé (Actors)

### Developer
- **Role:** Primární uživatel
- **Interakce:** CLI, Dashboard
- **Use cases:**
  - Zadávání úkolů
  - Monitoring průběhu
  - HITL checkpoints
  - Review výstupů

### DevOps/Platform Engineer
- **Role:** Správce infrastruktury
- **Interakce:** Dashboard, CLI, Kubernetes
- **Use cases:**
  - Konfigurace deploymentu
  - Monitoring zdrojů
  - Škálování
  - Troubleshooting

### CI/CD System
- **Role:** Automatizovaný uživatel
- **Interakce:** API
- **Use cases:**
  - Spouštění úkolů v pipeline
  - Čekání na dokončení
  - Integrace s PR workflow

## Externí systémy

### AI Coding Agents

| Systém | Účel | Komunikace |
|--------|------|------------|
| Claude Code | AI coding agent | CLI subprocess |
| Gemini CLI | AI coding agent | CLI subprocess |
| Cursor CLI | AI coding agent | CLI subprocess |
| GitHub Copilot | AI coding agent | CLI subprocess |
| Codex CLI | AI coding agent | CLI subprocess |

### Infrastruktura

| Systém | Účel | Komunikace |
|--------|------|------------|
| Kubernetes | Container orchestration | K8s API |
| Docker | Container runtime | Docker API |
| Coolify | PaaS deployment | API |
| AWS/GCP | Cloud provider | API |

### Persistence

| Systém | Účel | Komunikace |
|--------|------|------------|
| PostgreSQL | State storage | SQL |
| Redis | Rate limiting, cache | Redis protocol |
| S3/GCS | Checkpoint storage | API |

### Integrace

| Systém | Účel | Komunikace |
|--------|------|------------|
| Git (GitHub/GitLab) | Source control | Git protocol, API |
| Slack | Notifications | Webhook |
| Email (SMTP) | Notifications | SMTP |
| OpenTelemetry | Observability | OTLP |

## Hranice systému

### V scope ADO:
- Task orchestrace a routing
- Provider management
- State persistence
- Quality assurance
- HITL workflow
- Distributed execution
- Notifications

### Mimo scope ADO:
- AI model execution (delegováno na agenty)
- Git hosting
- CI/CD orchestrace (pouze integrace)
- Identity management (externí IdP)

## Data Flows

### Task Execution Flow
```
Developer → CLI → Controller → Task Queue → Worker → Agent → Repository
    ↑                                         │
    └───────── Status Updates ────────────────┘
```

### Notification Flow
```
Controller → Event → Notification Service → Slack/Email → User
```

### Observability Flow
```
All Components → OpenTelemetry Collector → Jaeger/Prometheus/Grafana
```

---

## Souvislosti

- [Container Diagram](./02-container-diagram.md) - Detailní pohled na komponenty
- [FR-002: Distributed Orchestration](../02-requirements/01-functional/FR-002-distributed-orchestration.md)
