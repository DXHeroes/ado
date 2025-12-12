# ADO v2 Specifikace

**Agentic Development Orchestrator** - Plně autonomní, distribuovaný orchestrátor AI coding agentů.

## Navigace

### Vize a principy
- [Produktová vize](./01-vision/01-product-vision.md) - Kam směřujeme
- [Principy návrhu](./01-vision/02-principles.md) - Jak přemýšlíme
- [Metriky úspěchu](./01-vision/03-success-metrics.md) - Jak měříme úspěch

### Požadavky
- [Funkční požadavky](./02-requirements/01-functional/) - Co systém musí dělat
- [Nefunkční požadavky](./02-requirements/02-non-functional/) - Jak dobře to musí dělat

### Architektura
- [System Context (C4 L1)](./03-architecture/01-system-context.md) - Vysokoúrovňový pohled
- [Container Diagram (C4 L2)](./03-architecture/02-container-diagram.md) - Hlavní komponenty
- [Komponenty](./03-architecture/03-component-diagrams/) - Detailní komponenty
- [Datové modely](./03-architecture/04-data-models/) - Entity a schémata
- [Komunikace](./03-architecture/05-communication/) - tRPC, WebSocket
- [Architektonická rozhodnutí](./03-architecture/06-decisions/) - ADRs

### Design
- [Distribuovaný systém](./04-design/01-distributed-system/) - Cloud orchestrace
- [Autonomní workflow](./04-design/02-autonomous-workflow/) - Doc-first pipeline
- [Cloud infrastruktura](./04-design/03-cloud-infrastructure/) - K8s, Docker, Coolify
- [Bezpečnost](./04-design/04-security/) - Threat model, secrets

### API
- [tRPC procedury](./05-api/01-trpc-procedures/) - API rozhraní
- [WebSocket eventy](./05-api/02-websocket-events/) - Real-time streaming
- [Agent adaptéry](./05-api/03-agent-adapter-interface/) - Rozhraní adaptérů

### Uživatelská dokumentace
- [Začínáme](./06-user-guide/01-getting-started/) - Instalace, quick start
- [Koncepty](./06-user-guide/02-core-concepts/) - Klíčové koncepty
- [Use cases](./06-user-guide/03-use-cases/) - Praktické příklady
- [Troubleshooting](./06-user-guide/04-troubleshooting/) - Řešení problémů

### Provoz
- [Deployment](./07-operations/01-deployment/) - Nasazení
- [Monitoring](./07-operations/02-monitoring/) - Sledování
- [Škálování](./07-operations/03-scaling/) - Kapacitní plánování

### Implementace
- [Milníky](./08-implementation/milestones/) - M7-M9 plány

---

## Rychlý přehled ADO v2

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LOKÁLNÍ PC                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ADO CLI                                                                 ││
│  │  $ ado run "Vytvoř REST API pro todo aplikaci" --workers 5              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                         │
│                              tRPC + WS                                       │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLOUD INFRASTRUKTURA                               │
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
│  │  VÝSTUP: Otestovaná, zbuilditelná aplikace s dokumentací                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Klíčové inovace v2

| Oblast | v1 | v2 |
|--------|----|----|
| **Provoz** | Lokální CLI | Distribuovaná orchestrace |
| **Komunikace** | REST API | tRPC + WebSocket subscriptions |
| **Workflow** | Ad-hoc úkoly | Documentation-first pipeline |
| **Výstup** | Kód | Otestovaná, zbuilditelná aplikace |
| **Škálování** | Single node | Multi-node paralelizace |
| **Infrastruktura** | Lokální/K8s | + Coolify, EC2, VPC |

## Verze dokumentace

| Verze | Datum | Změny |
|-------|-------|-------|
| 2.0.0 | 2025-01 | Iniciální v2 specifikace |
| 1.1.0 | 2024-11 | Viz `ado-specification.md` |

---

*Tato specifikace slouží jako kontext pro AI agenty při implementaci ADO v2.*
