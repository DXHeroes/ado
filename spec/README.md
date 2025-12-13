# ADO v2.1.0 Specification

**Agentic Development Orchestrator** - Fully autonomous, distributed AI coding agent orchestrator.

## Navigation

### Vision and Principles
- [Product Vision](./01-vision/01-product-vision.md) - Where we're heading
- [Design Principles](./01-vision/02-principles.md) - How we think
- [Success Metrics](./01-vision/03-success-metrics.md) - How we measure success

### Requirements
- [Functional Requirements](./02-requirements/01-functional/) - What the system must do
- [Non-Functional Requirements](./02-requirements/02-non-functional/) - How well it must do it

### Architecture
- [System Context (C4 L1)](./03-architecture/01-system-context.md) - High-level view
- [Container Diagram (C4 L2)](./03-architecture/02-container-diagram.md) - Main components
- [Components](./03-architecture/03-component-diagrams/) - Detailed components
- [Data Models](./03-architecture/04-data-models/) - Entities and schemas
- [Communication](./03-architecture/05-communication/) - tRPC, WebSocket
- [Architectural Decisions](./03-architecture/06-decisions/) - ADRs

### Design
- [Distributed System](./04-design/01-distributed-system/) - Cloud orchestration
- [Autonomous Workflow](./04-design/02-autonomous-workflow/) - Doc-first pipeline
- [Cloud Infrastructure](./04-design/03-cloud-infrastructure/) - K8s, Docker, Coolify
- [Security](./04-design/04-security/) - Threat model, secrets

### API
- [tRPC Procedures](./05-api/01-trpc-procedures/) - API interface
- [WebSocket Events](./05-api/02-websocket-events/) - Real-time streaming
- [Agent Adapters](./05-api/03-agent-adapter-interface/) - Adapter interface

### User Documentation
- [Getting Started](./06-user-guide/01-getting-started/) - Installation, quick start
- [Core Concepts](./06-user-guide/02-core-concepts/) - Key concepts
- [Use Cases](./06-user-guide/03-use-cases/) - Practical examples
- [Troubleshooting](./06-user-guide/04-troubleshooting/) - Problem resolution

### Operations
- [Deployment](./07-operations/01-deployment/) - Deployment guides
- [Monitoring](./07-operations/02-monitoring/) - Observability
- [Scaling](./07-operations/03-scaling/) - Capacity planning

### Implementation
- [Milestones](./08-implementation/milestones/) - M7-M9 plans

### Advanced Features
- [DEF.md](./DEF.md) - LiteLLM, Temporal.io, Firecracker, PR-Agent integration
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [GLOSSARY.md](./GLOSSARY.md) - Terminology reference

---

## ADO v2 Quick Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LOCAL PC                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ADO CLI                                                                 ││
│  │  $ ado run "Create REST API for todo app" --workers 5                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
│                              tRPC + WS                                       │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLOUD INFRASTRUCTURE                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ADO Controller (Kubernetes/Docker/Coolify)                              ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     ││
│  │  │ Doc Gen     │  │ Planner     │  │ Implementer │  │ Validator   │     ││
│  │  │ (Claude)    │  │ (Gemini)    │  │ (Claude)    │  │ (Cursor)    │     ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
│                              Git Push                                        │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  OUTPUT: Tested, buildable application with documentation                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Innovations in v2

| Area | v1 | v2 |
|------|----|----|
| **Operation** | Local CLI | Distributed orchestration |
| **Communication** | REST API | tRPC + WebSocket subscriptions |
| **Workflow** | Ad-hoc tasks | Documentation-first pipeline |
| **Output** | Code | Tested, buildable application |
| **Scaling** | Single node | Multi-node parallelization |
| **Infrastructure** | Local/K8s | + Coolify, EC2, VPC |

## Documentation Versions

| Version | Date | Changes |
|---------|------|---------|
| 2.1.0 | 2025-01 | Advanced features (DEF.1-4), autonomous workflow refinements |
| 2.0.0 | 2024-12 | Initial v2 specification |
| 1.1.0 | 2024-11 | See `../ado-specification.md` (archived) |

---

*This specification serves as context for AI agents implementing ADO v2.*
