# Produktová vize ADO v2

## Executive Summary

**ADO v2** transformuje způsob, jakým vývojářské týmy pracují s AI coding agenty. Místo manuálního zadávání úkolů jednotlivým nástrojům poskytuje ADO **plně autonomní, distribuovanou platformu**, která:

1. **Přijme úkol** - od jednoduchého bugfixu po celou aplikaci
2. **Vytvoří dokumentaci** - technickou specifikaci před implementací
3. **Naplánuje implementaci** - rozloží na paralelizovatelné podúkoly
4. **Orchestruje agenty** - v cloudu nebo lokálně, s optimálním využitím předplatných
5. **Validuje výstup** - testy, build, lint - vše musí projít
6. **Doručí výsledek** - otestovaná, funkční aplikace/feature/fix

## Proč ADO v2?

### Současný stav (problém)

```
Developer
    │
    ├──► Claude Code ──► Manuální review ──► Manuální testy
    │
    ├──► Cursor ──► Manuální review ──► Manuální testy
    │
    └──► Copilot ──► Manuální review ──► Manuální testy

Výsledek: Fragmentovaný workflow, duplicitní práce, nekonzistentní kvalita
```

### Cílový stav (ADO v2)

```
Developer
    │
    └──► ADO ──► [Dokumentace] ──► [Implementace] ──► [Validace] ──► Hotovo
              │                   │                   │
              │                   │                   └── Testy, Build, Lint
              │                   └── Claude + Gemini + Cursor (paralelně)
              └── Automatická technická specifikace

Výsledek: Jeden vstup, kvalitní výstup, plná automatizace
```

## Klíčové hodnoty

### 1. Autonomie s kontrolou

ADO pracuje **samostatně**, ale s **HITL checkpointy** na klíčových bodech:
- Po vytvoření dokumentace (schválení specifikace)
- Před velkými změnami v architektuře
- Při překročení cost limitu
- Na vyžádání uživatele

### 2. Documentation-First

**Každý úkol začíná dokumentací:**
- Technická specifikace
- Acceptance criteria
- Test plán
- Architektonické rozhodnutí (pokud relevantní)

Dokumentace slouží jako:
- Kontext pro AI agenty
- Záznam pro budoucí údržbu
- Báze pro validaci výstupu

### 3. Kvalitní výstup garantovaný

ADO **neoznačí úkol jako hotový**, dokud:
- [ ] Všechny testy projdou
- [ ] Build je úspěšný
- [ ] Lint nemá errory
- [ ] Dokumentace je aktuální
- [ ] PR/commit má smysluplný popis

### 4. Distribuovaná síla

Z lokálního PC ovládáte armádu agentů v cloudu:
- **Paralelizace** - 10+ agentů současně
- **Škálování** - od 1 workeru po 100
- **Flexibilita** - K8s, Docker, Coolify, EC2

### 5. Subscription-First (z v1)

Maximalizace hodnoty předplatných:
- Claude MAX, Cursor Pro, Copilot Pro → použít první
- API fallback pouze když nutné
- Transparentní cost tracking

## Cílové skupiny

### Primární: Vývojářské týmy (3-20 lidí)

**Potřeby:**
- Zrychlení vývoje bez ztráty kvality
- Konzistentní kódová báze
- Využití investice do AI předplatných
- Dokumentovaný development proces

**Jak ADO pomáhá:**
- Autonomní implementace features/bugfixů
- Vynucená dokumentace
- Automatická validace
- Cost optimization

### Sekundární: Enterprise týmy (20+ lidí)

**Potřeby:**
- Škálovatelná infrastruktura
- Compliance a audit trail
- Multi-tenant provoz
- Integrace s CI/CD

**Jak ADO pomáhá:**
- Kubernetes deployment
- Kompletní audit log
- RBAC (budoucí verze)
- GitHub Actions / GitLab CI integrace

### Terciární: Solo vývojáři

**Potřeby:**
- Multiplikace produktivity
- Nízké náklady
- Jednoduchý setup

**Jak ADO pomáhá:**
- Docker Compose deployment
- Lokální provoz
- Subscription-first = nízké náklady

## Konkurenční diferenciace

| Aspekt | Ostatní nástroje | ADO v2 |
|--------|------------------|--------|
| **Scope** | Jeden agent | 5+ agentů orchestrovaně |
| **Výstup** | Kód | Otestovaná aplikace |
| **Dokumentace** | Volitelná | Povinná (doc-first) |
| **Deployment** | Lokální | Lokální + Cloud |
| **Komunikace** | REST/CLI | tRPC + real-time streaming |
| **Routing** | Manuální | Automatický, subscription-first |

## Časový horizont

### Q1 2025: Foundation
- Distribuovaná orchestrace (tRPC)
- Documentation-first workflow
- Základní quality gates

### Q2 2025: Cloud Native
- Kubernetes operátor
- Coolify integrace
- Multi-region support

### Q3 2025: Enterprise
- RBAC a multi-tenancy
- SSO integrace
- Advanced audit

### Q4 2025: Ecosystem
- Plugin systém
- Marketplace adaptérů
- Community contributions

## Metriky úspěchu

Viz [Success Metrics](./03-success-metrics.md) pro detailní KPIs.

**Hlavní cíl:** 10x produktivita vývojářského týmu při zachování/zvýšení kvality kódu.

---

*"ADO v2: Zadej úkol, dostaneš aplikaci."*
