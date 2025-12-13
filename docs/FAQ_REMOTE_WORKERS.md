# FAQ: Remote Workers & Deployment

Odpovědi na časté otázky ohledně lokálního vývoje s remote workery.

## Základní otázky

### Můžu mít kód lokálně a spouštět to na remote workerech?

**ANO! To je přesně účel Hybrid módu.** ✅

```
Ty lokálně:                Remote workery (Coolify/K8s):
┌─────────────┐            ┌─────────────────────────────┐
│ Tvůj kód    │            │ Výkonné servery             │
│ (local git) │ ─sync────► │ - 4-8GB RAM                 │
│             │            │ - Multi-core CPU            │
│ Tvůj editor │            │ - SSD storage               │
│ (VS Code)   │            │                             │
│             │            │ Claude MAX subscription     │
│ ado CLI     │ ◄─stream── │ sdílená napříč týmem        │
└─────────────┘            └─────────────────────────────┘
```

**Jak to funguje:**
1. Máš kód u sebe (`git clone`, VS Code, atd.)
2. Spustíš: `ado run "úkol" --hybrid`
3. CLI nahraje tvůj kód na remote worker
4. Worker provede úkol (s AI agentem)
5. Výsledky se streamují zpět k tobě
6. Worker pushne změny do gitu
7. Ty si stáhneš branch: `git checkout ado/task-123`

### K čemu je tedy Coolify/Kubernetes?

Remote infrastruktura ti dává:

#### 1. **Sdílený Worker Pool**
Celý tým používá stejné workery místo každý svého laptopu.

```
Bez remote (každý sám):        S remote (sdílený pool):
┌──────────┐                   ┌──────────┐
│ Alice    │ ─► Claude MAX     │ Alice    │ ─┐
│ (laptop) │    $20/měsíc      │ (laptop) │  │
└──────────┘                   └──────────┘  │
                                              ├─► Worker Pool
┌──────────┐                   ┌──────────┐  │   - 1x Claude MAX ($20)
│ Bob      │ ─► Claude MAX     │ Bob      │  │   - Sdílené 5 workerů
│ (laptop) │    $20/měsíc      │ (laptop) │ ─┘   - Cost tracking
└──────────┘                   └──────────┘

Celkem: $40/měsíc             Celkem: $20/měsíc
2 workery (jejich laptopy)    5 workerů (cloud)
```

#### 2. **Větší Výkon**
Remote workers mají víc zdrojů než laptop.

```
Tvůj laptop:              Remote worker:
- 16GB RAM                - 32-64GB RAM
- 4-8 CPU cores           - 8-16 CPU cores
- Omezený čas             - 24/7 dostupnost
- 1 úkol najednou         - 3-5 úkolů paralelně
```

#### 3. **Paralelizace**
Můžeš spustit 10+ úkolů najednou.

```bash
# Lokálně (postupně):
ado run "Add auth" &        # Blokuje
ado run "Add tests" &       # Čeká
ado run "Fix bug" &         # Čeká
# Trvá: 30 minut

# Remote (paralelně):
ado run "Add auth" --hybrid &     # Worker 1
ado run "Add tests" --hybrid &    # Worker 2
ado run "Fix bug" --hybrid &      # Worker 3
# Trvá: 10 minut (3x rychleji!)
```

#### 4. **Persistence**
Úkoly běží i když vypneš laptop.

```bash
# Spustíš dlouhý úkol
ado run "Velký refactoring" --hybrid

# Zavřeš laptop, jdeš domů
# Worker stále běží na cloudu!

# Druhý den:
ado attach task-123
# Vidíš průběh
```

#### 5. **Subscription Pooling**
Sdílení předplatných (Claude MAX, Cursor Pro) napříč týmem.

```yaml
# Sdílený Claude MAX account
providers:
  claude-code:
    accessModes:
      - mode: subscription
        priority: 1
        sessionToken: ${SHARED_ANTHROPIC_SESSION}  # Jeden pro všechny
```

**Úspora:**
- Bez remote: 5 lidí × $20 = $100/měsíc
- S remote: 1 subscription = $20/měsíc
- **Ušetříš: $80/měsíc** 💰

#### 6. **Cost Tracking**
Centrální sledování nákladů.

```bash
# Kolik stála každá úloha?
ado cost history

# Kdo nejvíc utrácí?
ado cost by-user

# Týdenní report
ado cost report --period week
```

### Jak to nasadit?

#### Rychlý start (Coolify - doporučeno pro malé týmy)

```bash
# 1. Nasaď na Coolify (15 minut)
# Viz: docs/COOLIFY_DEPLOYMENT.md

# 2. Každý developer nastaví CLI
cat > ~/.ado/config.yaml <<EOF
remote:
  enabled: true
  apiUrl: https://ado.vasefirma.cz
  defaultMode: hybrid
  auth:
    type: api_key
    keyEnvVar: ADO_API_KEY
EOF

# 3. Použití
ado run "úkol" --hybrid
```

#### Enterprise (Kubernetes - pro velké týmy)

```bash
# Viz: deploy/KUBERNETES.md
helm install ado ./deploy/helm/ado
```

## Praktické příklady

### Scénář 1: Individuální vývojář

**Začátek (Local mode):**
```bash
# Všechno lokálně
ado run "Add feature"
```

**Po měsíci (pořád solo, ale větší úkoly):**
```bash
# Nasadíš si vlastní Coolify worker
# Teď můžeš dělat větší věci

ado run "Refactor celého backendu" --hybrid
# Trvá 2 hodiny, ale neblokuje tvůj laptop!
```

### Scénář 2: Malý tým (2-5 lidí)

**Setup (DevOps):**
```bash
# Deploy na Coolify
docker compose -f deploy/coolify/docker-compose.yml up -d

# Vytvoř API keys
ado keys create --user alice
ado keys create --user bob
```

**Použití (Developers):**
```bash
# Alice:
export ADO_API_KEY=ado_alice_key
ado run "Implement auth" --hybrid

# Bob (současně):
export ADO_API_KEY=ado_bob_key
ado run "Add tests" --hybrid

# Oba běží paralelně na sdílených workerech!
```

### Scénář 3: Větší tým (10+ lidí)

**Setup (Platform team):**
```bash
# Kubernetes deployment
helm install ado ./deploy/helm/ado \
  --set workerPool.minReplicas=5 \
  --set workerPool.maxReplicas=20 \
  --set autoscaling.enabled=true
```

**Použití:**
```bash
# 10 developerů běží úkoly současně
# Auto-scaling přidá workery při zátěži
# Cost tracking per team/user
```

## Srovnání Coolify vs Kubernetes

| Vlastnost | Coolify | Kubernetes |
|-----------|---------|------------|
| **Čas na setup** | 15 minut | 2-4 hodiny |
| **Složitost** | Nízká | Vysoká |
| **Auto-scaling** | Manuální/Scripty | Native HPA |
| **HA** | Omezená | Plná |
| **Cena** | Nižší | Vyšší |
| **Velikost týmu** | 2-20 | 20+ |
| **Kdy použít** | Start, malý tým | Enterprise |

**Doporučení:**
- **1-10 lidí**: Začni s Coolify
- **10-50 lidí**: Coolify nebo K8s
- **50+ lidí**: Kubernetes

## Běžné use-casy

### Use-case 1: "Chci to vyzkoušet sám"

```bash
# Lokální mode, žádný remote
ado run "Add feature"

# Když se ti to líbí:
# → Nasaď Coolify (15 min)
# → Přepni na hybrid
```

**Čas do prvního použití: 5 minut**

### Use-case 2: "Jsme tým 5 lidí, chceme sdílet workery"

```bash
# DevOps:
# 1. Deploy Coolify (viz docs/COOLIFY_DEPLOYMENT.md)
# 2. Vygeneruj API keys
# 3. Pošli team members

# Developers:
# 1. Nastaví config (2 min)
# 2. Používají --hybrid
```

**Čas do produkčního použití: 1-2 hodiny**

### Use-case 3: "Potřebuji spustit 20 úkolů paralelně"

```bash
# S remote workers:
for i in {1..20}; do
  ado run "Task $i" --hybrid &
done

# Workery se auto-scalují
# Všechny úkoly běží paralelně
```

**Výhoda: 20x rychlejší než postupně**

### Use-case 4: "CI/CD pipeline"

```yaml
# .github/workflows/ado.yml
jobs:
  ado-task:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          ado run "Generate changelog" --remote \
            --git-ref ${{ github.sha }}
```

**Remote mode: kód z gitu, execution na cloudu**

## Troubleshooting

### "Workers se neregistrují"

```bash
# Check logs
docker logs ado-worker-claude

# Časté problémy:
# - Špatný API key
# - Firewall blokuje WSS
# - Špatná API URL
```

**Fix:**
```bash
# Verify API key
curl -H "Authorization: Bearer $ADO_API_KEY" \
  https://ado.vasefirma.cz/api/workers

# Check firewall (needs ports 80, 443, WSS)
```

### "Úkoly jsou ve frontě, ale neexekuují se"

```bash
# Check worker count
ado workers list

# Pokud 0 workers:
# → Scale up v Coolify UI
# → Nebo docker compose scale worker=5
```

### "Vysoké náklady"

```bash
# 1. Review cost history
ado cost history --limit 20

# 2. Set limits
ado config set cost.maxCostPerTask 5.00

# 3. Use subscription mode (not API)
# Edit config: mode: subscription
```

## Migrace

### Z Local → Hybrid (doporučená cesta)

```bash
# Fáze 1: Local (týden 1)
ado run "task"

# Fáze 2: Nasaď Coolify (týden 2)
# Deploy workers

# Fáze 3: Vyzkoušej hybrid (týden 3)
ado run "task" --hybrid

# Fáze 4: Nastav jako default (týden 4)
# config.yaml: defaultMode: hybrid
ado run "task"  # Automaticky hybrid
```

### Z Coolify → Kubernetes (při růstu)

```bash
# Když Coolify nestačí (20+ lidí):

# 1. Export konfigurace
coolify export > k8s.yaml

# 2. Deploy na K8s
helm install ado ./deploy/helm/ado

# 3. Update team config
# Jen změna URL:
# apiUrl: https://ado-k8s.vasefirma.cz
```

## Další zdroje

- [Coolify Deployment Guide](./COOLIFY_DEPLOYMENT.md) - Krok za krokem
- [Remote Execution Deep Dive](./REMOTE_EXECUTION.md) - Všechny módy
- [Execution Modes Diagram](./diagrams/execution-modes.md) - Vizuální srovnání
- [Kubernetes Guide](../deploy/KUBERNETES.md) - Pro enterprise

## Shrnutí

**Odpovědi na tvoje otázky:**

1. **Jde to lokálně s remote workery?** → Ano! Hybrid mode ✅
2. **K čemu je Coolify/K8s?** → Sdílený worker pool, větší výkon, paralelizace, cost tracking
3. **Jak začít?** → Deploy Coolify (15 min), nastav config (2 min), použij `--hybrid`

**Golden path pro týmy:**
```
Solo dev → Local mode
Malý tým (2-10) → Coolify + Hybrid mode ⭐
Velký tým (20+) → Kubernetes + Hybrid mode
```

Máš další otázky? Otevři issue nebo se koukni do [dokumentace](./README.md).
