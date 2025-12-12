# Changelog

Všechny významné změny v této specifikaci jsou dokumentovány v tomto souboru.

Formát je založen na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
a tento projekt dodržuje [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Plánované
- OpenAPI/Swagger export pro API dokumentaci
- Interaktivní diagramy (Mermaid live)
- PDF export specifikace

---

## [2.1.0] - 2025-12-12

### Přidáno

#### Design dokumenty (podle DEF.md research)
- `04-design/04-security/sandboxing-strategy.md` - Firecracker MicroVMs a bezpečnostní izolace
- `04-design/01-distributed-system/litellm-routing.md` - LiteLLM unified API pro 100+ LLM providers
- `04-design/02-autonomous-workflow/temporal-workflows.md` - Temporal.io durable workflows
- `04-design/02-autonomous-workflow/git-worktree-manager.md` - Git worktrees pro paralelní izolaci agentů
- `04-design/02-autonomous-workflow/spec-kit-integration.md` - GitHub Spec-Kit 4-phase workflow
- `04-design/02-autonomous-workflow/merge-conflict-resolution.md` - AI-powered conflict resolution
- `04-design/03-cloud-infrastructure/pr-agent-integration.md` - Qodo Merge PR-Agent integrace

### Změněno
- `04-design/02-autonomous-workflow/test-build-validation.md` - Doplněny language-specific quality gates (TypeScript, Python, Go, Rust, Java) s parallel execution strategy
- `06-user-guide/02-core-concepts/checkpoints-hitl.md` - Doplněny escalation thresholds (stuck detection, iteration limits, time-based escalation)
- `07-operations/02-monitoring/metrics.md` - Rozšířena OpenTelemetry integrace (distributed tracing, LLM call spans, cost tracking)

---

## [2.0.1] - 2025-01-15

### Přidáno

#### Design dokumenty
- `04-design/02-autonomous-workflow/test-build-validation.md` - Quality gates design
- `04-design/03-cloud-infrastructure/docker-compose.md` - Docker Compose architektura
- `04-design/03-cloud-infrastructure/coolify-integration.md` - Coolify integrace

#### Architektura
- `03-architecture/03-component-diagrams/distributed-controller.md` - Distributed controller komponenty
- `03-architecture/06-decisions/ADR-003-websocket-subscriptions.md` - ADR pro WebSocket

#### API
- `05-api/01-trpc-procedures/agents.md` - Agent CRUD procedures

#### Design
- `04-design/01-distributed-system/remote-execution.md` - Remote execution design

### Opraveno
- Doplněny chybějící cross-reference odkazy

---

## [2.0.0] - 2025-01-15

### Přidáno

#### Vize a principy
- `01-vision/01-product-vision.md` - Produktová vize ADO v2
- `01-vision/02-principles.md` - Principy návrhu
- `01-vision/03-success-metrics.md` - KPIs a metriky úspěchu

#### Požadavky
- `02-requirements/01-functional/FR-001-autonomous-execution.md` - Autonomní provádění
- `02-requirements/01-functional/FR-002-distributed-orchestration.md` - Distribuovaná orchestrace
- `02-requirements/01-functional/FR-003-documentation-workflow.md` - Doc-first workflow
- `02-requirements/01-functional/FR-004-cloud-parallelization.md` - Cloud paralelizace
- `02-requirements/01-functional/FR-005-quality-assurance.md` - Quality gates
- `02-requirements/01-functional/FR-006-hitl-checkpoints.md` - HITL checkpointy
- `02-requirements/02-non-functional/NFR-001-performance.md` - Výkonnostní požadavky
- `02-requirements/02-non-functional/NFR-002-scalability.md` - Škálovatelnost
- `02-requirements/02-non-functional/NFR-003-reliability.md` - Spolehlivost
- `02-requirements/02-non-functional/NFR-004-security.md` - Bezpečnost

#### Architektura
- `03-architecture/01-system-context.md` - C4 Level 1 diagram
- `03-architecture/02-container-diagram.md` - C4 Level 2 diagram
- `03-architecture/03-component-diagrams/orchestrator-core.md` - Orchestrator komponenty
- `03-architecture/03-component-diagrams/agent-adapters.md` - Agent adaptéry
- `03-architecture/03-component-diagrams/distributed-controller.md` - Distributed controller
- `03-architecture/04-data-models/entities.md` - Datové entity
- `03-architecture/04-data-models/events.md` - Event typy
- `03-architecture/04-data-models/schemas.md` - Validační schémata
- `03-architecture/05-communication/trpc-api.md` - tRPC specifikace
- `03-architecture/05-communication/websocket-streaming.md` - WebSocket streaming
- `03-architecture/06-decisions/ADR-001-trpc-over-rest.md` - ADR: tRPC vs REST
- `03-architecture/06-decisions/ADR-002-documentation-first.md` - ADR: Doc-first
- `03-architecture/06-decisions/ADR-003-websocket-subscriptions.md` - ADR: WebSocket

#### Design
- `04-design/01-distributed-system/cloud-agent-controller.md` - Cloud controller design
- `04-design/01-distributed-system/remote-execution.md` - Remote execution design
- `04-design/01-distributed-system/state-synchronization.md` - State sync design
- `04-design/02-autonomous-workflow/doc-first-pipeline.md` - Doc-first pipeline
- `04-design/02-autonomous-workflow/task-decomposition.md` - Task decomposition
- `04-design/03-cloud-infrastructure/kubernetes-deployment.md` - K8s deployment
- `04-design/04-security/threat-model.md` - STRIDE threat model
- `04-design/04-security/secrets-management.md` - Secrets management

#### API
- `05-api/01-trpc-procedures/tasks.md` - Task CRUD procedures
- `05-api/01-trpc-procedures/agents.md` - Agent CRUD procedures
- `05-api/01-trpc-procedures/checkpoints.md` - Checkpoint procedures
- `05-api/01-trpc-procedures/providers.md` - Provider procedures
- `05-api/02-websocket-events/task-events.md` - Task events
- `05-api/02-websocket-events/agent-events.md` - Agent events
- `05-api/03-agent-adapter-interface/base-adapter.md` - Base adapter interface

#### Uživatelská dokumentace
- `06-user-guide/01-getting-started/installation.md` - Instalace
- `06-user-guide/01-getting-started/quick-start.md` - Quick start
- `06-user-guide/01-getting-started/configuration.md` - Konfigurace
- `06-user-guide/02-core-concepts/autonomous-mode.md` - Autonomní režim
- `06-user-guide/02-core-concepts/checkpoints-hitl.md` - Checkpointy a HITL
- `06-user-guide/02-core-concepts/doc-first-workflow.md` - Doc-first workflow
- `06-user-guide/03-use-cases/greenfield-app.md` - Greenfield aplikace
- `06-user-guide/03-use-cases/feature-development.md` - Vývoj features
- `06-user-guide/03-use-cases/bug-fixing.md` - Oprava bugů
- `06-user-guide/04-troubleshooting/common-issues.md` - Běžné problémy
- `06-user-guide/04-troubleshooting/error-codes.md` - Error kódy

#### Provozní dokumentace
- `07-operations/01-deployment/kubernetes.md` - K8s deployment
- `07-operations/01-deployment/docker-compose.md` - Docker Compose
- `07-operations/01-deployment/coolify.md` - Coolify deployment
- `07-operations/02-monitoring/metrics.md` - Prometheus metriky
- `07-operations/02-monitoring/alerting.md` - Alertmanager konfigurace
- `07-operations/03-scaling/capacity-planning.md` - Kapacitní plánování

#### Implementace
- `08-implementation/milestones/M7-distributed-control.md` - Milestone 7
- `08-implementation/milestones/M8-autonomous-workflow.md` - Milestone 8
- `08-implementation/milestones/M9-cloud-parallelization.md` - Milestone 9

#### Meta dokumenty
- `README.md` - Navigační hub
- `GLOSSARY.md` - Slovník pojmů
- `CHANGELOG.md` - Historie změn (tento soubor)

### Změněno
- Kompletní redesign architektury pro distribuovaný provoz
- Přechod z REST na tRPC + WebSocket
- Nový documentation-first workflow

### Odstraněno
- Původní single-node architektura (nahrazena distribuovanou)
- REST API specifikace (nahrazena tRPC)

---

## [1.1.0] - 2024-11-XX

Viz `ado-specification.md` v kořenovém adresáři projektu.

### Hlavní funkce v1.1
- Základní orchestrace AI agentů
- CLI rozhraní
- Lokální provádění
- Provider management
- Rate limit handling

---

## Konvence verzování

### Specifikace
- **MAJOR** (X.0.0): Zásadní změny architektury, breaking changes
- **MINOR** (0.X.0): Nové funkce, rozšíření
- **PATCH** (0.0.X): Opravy, upřesnění, typo fixes

### Stavy dokumentů
- **Draft**: Rozpracovaný dokument
- **Review**: Připraven k review
- **Approved**: Schválený dokument
- **Deprecated**: Zastaralý, bude odstraněn

---

## Autoři

- DX Heroes Team

## License

MIT License - viz [LICENSE](../LICENSE) v kořenu projektu.
