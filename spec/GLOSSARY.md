# Slovník pojmů (Glossary)

## A

### Access Mode
Způsob přístupu k AI agentovi. Typy: `subscription` (měsíční předplatné), `api` (platba za token), `free` (zdarma s limity).

### ADO
**Agentic Development Orchestrator** - hlavní produkt, orchestrátor AI coding agentů.

### Agent
AI coding agent jako Claude Code, Gemini CLI, Cursor CLI, GitHub Copilot, Codex.

### Agent Adapter
Softwarová vrstva, která abstrahuje specifické API/CLI konkrétního agenta do jednotného rozhraní.

### Autonomous Mode
Režim provozu, kdy ADO pracuje bez lidské intervence až do dokončení úkolu.

## C

### Checkpoint
Bod v provádění úkolu, kde je uložen stav pro možné obnovení nebo lidskou kontrolu.

### Controller
Centrální komponenta ADO, která řídí distribuované workery a koordinuje úkoly.

### Coolify
Open-source PaaS platforma pro self-hosted deployment aplikací.

## D

### Documentation-First
Přístup, kdy před implementací je vždy vytvořena specifikace a dokumentace.

### Distributed Orchestration
Orchestrace agentů běžících na vzdálené infrastruktuře z lokálního PC.

## F

### Failover
Automatické přepnutí na alternativního providera při výpadku nebo rate limitu.

## G

### Greenfield
Nový projekt bez existujícího kódu.

## H

### HITL (Human-in-the-Loop)
Mechanismus pro lidskou kontrolu a schvalování v autonomních procesech.

### Helm Chart
Balíčkovací formát pro Kubernetes aplikace.

## K

### Kubernetes (K8s)
Platforma pro orchestraci kontejnerů, primární deployment target pro ADO v2.

## M

### Milestone
Významný bod v roadmapě s měřitelnými deliverables.

## P

### Provider
Poskytovatel AI agenta (Anthropic, Google, GitHub, OpenAI).

### Priority
Číslo určující pořadí při výběru access mode. Nižší = vyšší priorita.

## Q

### Quality Gate
Automatická kontrola kvality (testy, build, lint) před dokončením úkolu.

## R

### Rate Limit
Omezení počtu požadavků nebo tokenů v časovém období.

### Remote Execution
Provádění úkolů na vzdálené infrastruktuře místo lokálního PC.

## S

### Subscription-First Routing
Strategie routování, která preferuje předplatné před API platbami.

### State Synchronization
Synchronizace stavu mezi kontrolérem a workery v distribuovaném prostředí.

## T

### Task
Jednotka práce zadaná ADO orchestrátoru.

### Task Decomposition
Rozložení velkého úkolu na menší, paralelizovatelné podúkoly.

### tRPC
Type-safe RPC framework pro TypeScript, primární komunikační protokol ADO v2.

## V

### Validation Pipeline
Sada kontrol zajišťujících kvalitu výstupu (testy, build, lint).

## W

### WebSocket
Protokol pro real-time bidirectional komunikaci, používán pro streaming.

### Worker
Instance provádějící úkoly v distribuovaném prostředí (K8s pod, Docker kontejner).

### Worktree
Git worktree - izolovaný pracovní adresář pro paralelní práci na jednom repozitáři.

---

## Zkratky

| Zkratka | Význam |
|---------|--------|
| ADO | Agentic Development Orchestrator |
| ADR | Architecture Decision Record |
| API | Application Programming Interface |
| C4 | Context, Container, Component, Code (architektonický model) |
| CLI | Command Line Interface |
| FR | Functional Requirement |
| HITL | Human-in-the-Loop |
| K8s | Kubernetes |
| MCP | Model Context Protocol |
| NFR | Non-Functional Requirement |
| PaaS | Platform as a Service |
| PR | Pull Request |
| RPC | Remote Procedure Call |
| TPM | Tokens Per Minute |
| RPM | Requests Per Minute |
| VPC | Virtual Private Cloud |
| WS | WebSocket |
