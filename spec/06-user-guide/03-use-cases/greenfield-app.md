# Use Case: Greenfield Application

## Přehled

Vytvoření kompletní aplikace od nuly pomocí ADO. Tento use case demonstruje plnou sílu ADO - od specifikace po funkční, otestovanou aplikaci.

## Scénář

Chcete vytvořit **REST API pro správu TODO položek** s:
- CRUD operace
- Uživatelská autentizace (JWT)
- PostgreSQL databáze
- Testy
- Docker deployment

## Krok 1: Příprava

```bash
# Vytvoření prázdného projektu
mkdir todo-api && cd todo-api
git init

# Inicializace ADO
ado init --project todo-api
```

## Krok 2: Spuštění úkolu

```bash
ado run --type greenfield "
Vytvoř REST API pro správu TODO položek.

Požadavky:
- TypeScript + Express
- PostgreSQL databáze s Prisma ORM
- JWT autentizace (register, login, logout)
- CRUD pro TODO položky (user-scoped)
- Validace pomocí Zod
- Testy pomocí Vitest
- Docker a docker-compose pro development
- Dokumentace API (OpenAPI/Swagger)

Struktura TODO:
- id, title, description, completed, createdAt, updatedAt
- Patří jednomu uživateli
"
```

## Krok 3: ADO Workflow

### 3.1 Specifikace

ADO vytvoří detailní specifikaci:

```markdown
# SPEC-001: TODO API Application

## Cíl
Kompletní REST API pro správu TODO položek s autentizací.

## Architektura

```
┌─────────────────┐     ┌─────────────────┐
│   Express API   │────▶│   PostgreSQL    │
│   (Port 3000)   │     │   (Prisma ORM)  │
└────────┬────────┘     └─────────────────┘
         │
    JWT Auth
```

## API Endpoints

### Auth
- POST /auth/register
- POST /auth/login
- POST /auth/logout

### Todos
- GET /todos
- GET /todos/:id
- POST /todos
- PUT /todos/:id
- DELETE /todos/:id

## Data Models

### User
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  todos     Todo[]
  createdAt DateTime @default(now())
}
```

### Todo
```prisma
model Todo {
  id          String   @id @default(uuid())
  title       String
  description String?
  completed   Boolean  @default(false)
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## Acceptance Criteria
- [ ] User can register with email/password
- [ ] User can login and receive JWT
- [ ] User can CRUD their todos
- [ ] User cannot access other users' todos
- [ ] All endpoints are documented in OpenAPI
- [ ] Test coverage > 80%
- [ ] Docker compose starts the app
```

### 3.2 Implementace

ADO automaticky implementuje podle specifikace:

```
⏳ Implementing...

Progress:
├── [✓] Project setup (package.json, tsconfig)     100%
├── [✓] Prisma schema and migrations               100%
├── [▶] Auth module (register, login)               65%
├── [⏸] Todo CRUD                                    0%
├── [⏸] API documentation                           0%
└── [⏸] Tests                                        0%

Current: Creating src/modules/auth/auth.service.ts
Provider: claude-code (subscription)
```

### 3.3 Validace

```
🧪 Validating...

Build:
✓ TypeScript compilation successful
✓ Prisma client generated

Tests:
✓ 24 tests passed
✓ Coverage: 87%

Lint:
✓ No errors
⚠ 2 warnings (unused imports)

Docker:
✓ docker-compose up successful
✓ API responding on port 3000
```

### 3.4 Výsledek

```
═══════════════════════════════════════════════════════════════
✅ Greenfield application created!

Project Structure:
todo-api/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.routes.ts
│   │   │   └── auth.test.ts
│   │   └── todos/
│   │       ├── todos.controller.ts
│   │       ├── todos.service.ts
│   │       ├── todos.routes.ts
│   │       └── todos.test.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   └── jwt.ts
│   └── index.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   └── setup.ts
├── docs/
│   ├── specs/SPEC-001-todo-api.md
│   └── openapi.yaml
├── docker-compose.yaml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md

Files created: 24
Tests: 24 passed
Coverage: 87%
Time: 12m 34s
Cost: $0.00 (subscription)
═══════════════════════════════════════════════════════════════
```

## Krok 4: Ověření

```bash
# Spuštění
docker-compose up -d

# Test registrace
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}'

# Test loginu
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}' \
  | jq -r '.token')

# Vytvoření TODO
curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Moje první TODO","description":"Testovací položka"}'

# Výpis TODO
curl http://localhost:3000/todos \
  -H "Authorization: Bearer $TOKEN"
```

## Pokročilé možnosti

### Více workerů (paralelizace)

```bash
ado run --type greenfield "..." --workers 5 --remote
```

### Custom template

```bash
ado run --type greenfield "..." --template ./templates/express-api
```

### Specifická konfigurace

```bash
ado run --type greenfield "..." \
  --quality-coverage 90 \
  --provider claude-code \
  --max-cost 10.00
```

## Typické greenfield úkoly

```bash
# CLI nástroj
ado run --type greenfield "Vytvoř CLI pro konverzi obrázků (resize, format)"

# React aplikace
ado run --type greenfield "Vytvoř React dashboard pro monitoring IoT zařízení"

# Microservice
ado run --type greenfield "Vytvoř notification microservice (email, SMS, push)"

# Lambda funkce
ado run --type greenfield "Vytvoř AWS Lambda pro zpracování S3 eventů"
```

---

## Souvislosti

- [Quick Start](../01-getting-started/quick-start.md)
- [Feature Development](./feature-development.md)
- [FR-001: Autonomous Execution](../../02-requirements/01-functional/FR-001-autonomous-execution.md)
