# Container Diagram (C4 Level 2)

## Přehled

Tento dokument popisuje hlavní kontejnery (deployable units) ADO systému.

## Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                      ADO SYSTEM                                          │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐│
│  │                              INTERFACE LAYER                                         ││
│  │                                                                                      ││
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                  ││
│  │  │     CLI          │  │    Dashboard     │  │    MCP Server    │                  ││
│  │  │   (Node.js)      │  │    (React)       │  │    (Node.js)     │                  ││
│  │  │                  │  │                  │  │                  │                  ││
│  │  │ - Commands       │  │ - Task view      │  │ - Agent tools    │                  ││
│  │  │ - tRPC client    │  │ - Dashboard      │  │ - MCP protocol   │                  ││
│  │  │ - Local exec     │  │ - Config UI      │  │                  │                  ││
│  │  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘                  ││
│  │           │                     │                     │                             ││
│  └───────────┼─────────────────────┼─────────────────────┼─────────────────────────────┘│
│              │                     │                     │                              │
│              └─────────────────────┼─────────────────────┘                              │
│                                    │                                                    │
│                              tRPC + WebSocket                                           │
│                                    │                                                    │
│  ┌─────────────────────────────────┼────────────────────────────────────────────────┐  │
│  │                          CONTROLLER LAYER                                         │  │
│  │                                 │                                                 │  │
│  │  ┌──────────────────────────────▼──────────────────────────────────────────────┐ │  │
│  │  │                         API Gateway                                          │ │  │
│  │  │                         (Node.js)                                            │ │  │
│  │  │                                                                              │ │  │
│  │  │  - tRPC router          - WebSocket server       - Authentication           │ │  │
│  │  │  - Rate limiting        - Load balancing         - Request routing          │ │  │
│  │  └────────────────────────────────┬─────────────────────────────────────────────┘ │  │
│  │                                   │                                               │  │
│  │  ┌────────────────────────────────▼─────────────────────────────────────────────┐ │  │
│  │  │                      Orchestrator Core                                        │ │  │
│  │  │                        (Node.js)                                              │ │  │
│  │  │                                                                               │ │  │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │ │  │
│  │  │  │Task Router  │  │Provider Mgr │  │Workflow Eng │  │HITL Control │         │ │  │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │ │  │
│  │  │                                                                               │ │  │
│  │  └────────────────────────────────┬─────────────────────────────────────────────┘ │  │
│  │                                   │                                               │  │
│  └───────────────────────────────────┼───────────────────────────────────────────────┘  │
│                                      │                                                  │
│                              Task Assignment                                            │
│                                      │                                                  │
│  ┌───────────────────────────────────▼───────────────────────────────────────────────┐  │
│  │                            WORKER LAYER                                            │  │
│  │                                                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │  │
│  │  │   Worker 1   │  │   Worker 2   │  │   Worker 3   │  │   Worker N   │          │  │
│  │  │  (Node.js)   │  │  (Node.js)   │  │  (Node.js)   │  │  (Node.js)   │          │  │
│  │  │              │  │              │  │              │  │              │          │  │
│  │  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │          │  │
│  │  │ │ Adapter  │ │  │ │ Adapter  │ │  │ │ Adapter  │ │  │ │ Adapter  │ │          │  │
│  │  │ │ Layer    │ │  │ │ Layer    │ │  │ │ Layer    │ │  │ │ Layer    │ │          │  │
│  │  │ └────┬─────┘ │  │ └────┬─────┘ │  │ └────┬─────┘ │  │ └────┬─────┘ │          │  │
│  │  └──────┼───────┘  └──────┼───────┘  └──────┼───────┘  └──────┼───────┘          │  │
│  │         │                 │                 │                 │                   │  │
│  └─────────┼─────────────────┼─────────────────┼─────────────────┼───────────────────┘  │
│            │                 │                 │                 │                      │
│            ▼                 ▼                 ▼                 ▼                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │ Claude Code  │  │ Gemini CLI   │  │ Cursor CLI   │  │ Copilot CLI  │                │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                │
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐│
│  │                            PERSISTENCE LAYER                                         ││
│  │                                                                                      ││
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐                  ││
│  │  │   PostgreSQL     │  │     Redis        │  │    S3/GCS        │                  ││
│  │  │                  │  │                  │  │                  │                  ││
│  │  │ - Task state     │  │ - Rate limits    │  │ - Checkpoints    │                  ││
│  │  │ - Sessions       │  │ - Pub/Sub        │  │ - Artifacts      │                  ││
│  │  │ - Audit logs     │  │ - Cache          │  │ - Logs           │                  ││
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘                  ││
│  │                                                                                      ││
│  └─────────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Container Descriptions

### Interface Layer

#### CLI
- **Technologie:** Node.js, TypeScript, Commander.js
- **Účel:** Primární uživatelské rozhraní
- **Responsibilities:**
  - Parsování příkazů
  - tRPC client pro remote operations
  - Lokální execution mode
  - Interactive prompts (HITL)

#### Dashboard
- **Technologie:** React, TypeScript, TanStack Query
- **Účel:** Web UI pro monitoring a správu
- **Responsibilities:**
  - Real-time task monitoring
  - Provider configuration
  - Checkpoint management
  - Analytics a reports

#### MCP Server
- **Technologie:** Node.js, TypeScript
- **Účel:** Integration s Claude Code přes MCP
- **Responsibilities:**
  - MCP protocol implementation
  - Tool exposure pro agenty
  - Context sharing

### Controller Layer

#### API Gateway
- **Technologie:** Node.js, tRPC, fastify
- **Účel:** Vstupní bod pro všechny API calls
- **Responsibilities:**
  - Request routing
  - Authentication/Authorization
  - Rate limiting
  - WebSocket management
  - Load balancing

#### Orchestrator Core
- **Technologie:** Node.js, TypeScript
- **Účel:** Jádro orchestrace
- **Components:**
  - **Task Router:** Routing úkolů k správným agentům
  - **Provider Manager:** Správa providerů a access modes
  - **Workflow Engine:** Sekvenční/paralelní workflow
  - **HITL Controller:** Human-in-the-loop management

### Worker Layer

#### Worker
- **Technologie:** Node.js, TypeScript
- **Účel:** Provádění úkolů pomocí AI agentů
- **Responsibilities:**
  - Task execution
  - Agent lifecycle management
  - Output streaming
  - Checkpoint creation
  - Health reporting

#### Adapter Layer
- **Účel:** Abstrakce jednotlivých AI agentů
- **Adapters:**
  - Claude Code Adapter
  - Gemini CLI Adapter
  - Cursor CLI Adapter
  - Copilot CLI Adapter
  - Codex CLI Adapter

### Persistence Layer

#### PostgreSQL
- **Účel:** Primární state storage
- **Data:**
  - Task definitions a state
  - Session management
  - User/org data
  - Audit logs
  - Configuration

#### Redis
- **Účel:** Cache a real-time features
- **Data:**
  - Rate limit counters
  - Pub/Sub for events
  - Session cache
  - Task queue

#### S3/GCS
- **Účel:** Object storage
- **Data:**
  - Checkpoints
  - Build artifacts
  - Large outputs
  - Log archives

---

## Communication Patterns

### Synchronous (tRPC)
- CLI → API Gateway: Task submission, queries
- Dashboard → API Gateway: All operations

### Asynchronous (WebSocket)
- API Gateway → CLI/Dashboard: Real-time updates
- Worker → Controller: Progress streaming

### Message Queue (Redis)
- Controller → Workers: Task assignment
- Workers → Controller: Status updates

---

## Deployment Options

### Local Mode
```
CLI ─── embedded ─── Orchestrator ─── Worker ─── Agents
                          │
                        SQLite
```

### Docker Compose
```
CLI ─── HTTP ─── API Gateway ─── Orchestrator ─── Worker(s) ─── Agents
                      │               │               │
                   PostgreSQL      Redis           Git
```

### Kubernetes
```
Ingress ─── API Gateway (ReplicaSet) ─── Orchestrator (ReplicaSet)
                    │                           │
               PostgreSQL                   Worker (HPA)
                    │                           │
                  Redis                      Agents
```

---

## Souvislosti

- [Component Diagrams](./03-component-diagrams/) - Detailní pohled na komponenty
- [Communication: tRPC API](./05-communication/trpc-api.md)
- [Communication: WebSocket](./05-communication/websocket-streaming.md)
