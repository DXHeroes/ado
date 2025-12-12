# Use Case: Feature Development

## Přehled

Průvodce použitím ADO pro vývoj nových funkcí v existujícím projektu.

## Scénář

Máte existující Express.js API a chcete přidat **systém uživatelských rolí a oprávnění** s:
- Role (admin, user, viewer)
- Permission-based access control
- Middleware pro kontrolu oprávnění
- Admin API pro správu rolí

## Krok 1: Příprava

```bash
# Ujistěte se, že jste v projektovém adresáři
cd /path/to/your/project

# Ověřte, že je ADO inicializován
ado status
# Project: my-api
# Providers: claude-code (available)
```

## Krok 2: Spuštění úkolu

```bash
ado run --type feature "
Implementuj systém rolí a oprávnění.

Požadavky:
- 3 role: admin, user, viewer
- Každá role má definovaná oprávnění (permissions)
- Middleware pro kontrolu oprávnění na endpointech
- Admin může přiřazovat role uživatelům
- API pro správu rolí (CRUD)

Technické detaily:
- Rozšíř existující User model o role
- Použij stávající auth middleware jako základ
- Přidej testy pro všechny permission kombinace
"
```

## Krok 3: ADO Workflow

### 3.1 Analýza existujícího kódu

```
⏳ Analyzuji projekt...

📂 Struktura projektu:
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   └── index.ts
│   ├── middleware/
│   │   └── auth.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── user.service.ts
│   └── models/
│       └── user.ts
├── prisma/
│   └── schema.prisma
└── tests/

📊 Analýza:
├── Framework: Express.js + TypeScript
├── ORM: Prisma
├── Auth: JWT (existující)
├── Tests: Vitest
└── Affected files: ~12
```

### 3.2 Specifikace

```
📝 Generuji specifikaci...

═══════════════════════════════════════════════════════════════
SPEC-012: Role-Based Access Control

Cíl:
Implementovat RBAC systém pro kontrolu přístupu k API endpointům.

Architektura:
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Request   │────▶│ Auth Middleware│───▶│ Permission  │
│             │     │   (JWT)     │     │ Middleware  │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │    User     │     │    Role     │
                    │   Service   │     │   Service   │
                    └─────────────┘     └─────────────┘

Data Model:
```prisma
model Role {
  id          String       @id @default(uuid())
  name        String       @unique
  permissions Permission[]
  users       User[]
  createdAt   DateTime     @default(now())
}

model Permission {
  id        String   @id @default(uuid())
  name      String   @unique
  roles     Role[]
}
```

API Endpoints:
- GET /roles - Seznam rolí
- POST /roles - Vytvoření role (admin only)
- PUT /roles/:id - Aktualizace role (admin only)
- DELETE /roles/:id - Smazání role (admin only)
- POST /users/:id/role - Přiřazení role (admin only)

Middleware:
```typescript
// Použití
router.get('/admin/users', requirePermission('users:read'), handler);
router.delete('/users/:id', requirePermission('users:delete'), handler);
```

Acceptance Criteria:
- [ ] Admin může vytvořit/upravit/smazat role
- [ ] Admin může přiřadit role uživatelům
- [ ] Middleware blokuje neautorizované requesty
- [ ] Existující endpointy fungují bez změny
- [ ] 90%+ test coverage pro permission logiku

Files:
- prisma/schema.prisma (modify)
- src/models/role.ts (new)
- src/services/role.service.ts (new)
- src/middleware/permission.ts (new)
- src/routes/roles.ts (new)
- src/routes/users.ts (modify)
- tests/permission.test.ts (new)
- tests/roles.test.ts (new)
═══════════════════════════════════════════════════════════════

Approve specification? [Y/n/e/v]: Y
```

### 3.3 Implementace

```
✓ Specifikace schválena
🔨 Implementuji SPEC-012...

Progress:
├── [✓] Database schema (Prisma)         100%
│   └── Added Role, Permission models
├── [✓] Role service                      100%
│   └── Created src/services/role.service.ts
├── [▶] Permission middleware              65%
│   └── Working on src/middleware/permission.ts
├── [⏸] Routes                              0%
├── [⏸] User service updates                0%
└── [⏸] Tests                               0%

Current file: src/middleware/permission.ts
Provider: claude-code (subscription)
Elapsed: 8m 24s
```

### 3.4 Validace

```
🧪 Validuji...

Database:
✓ Migrations generated
✓ Prisma client updated

Build:
✓ TypeScript compilation successful
✓ No type errors

Tests:
✓ 24 tests passed
✓ Permission middleware: 8/8
✓ Role service: 10/10
✓ Integration: 6/6
✓ Coverage: 94%

Lint:
✓ No errors
✓ No warnings

Integration:
✓ Existing endpoints working
✓ New role endpoints responding
✓ Permission checks enforced
```

### 3.5 Výsledek

```
═══════════════════════════════════════════════════════════════
✅ Feature implemented!

Changes:
M prisma/schema.prisma
+ src/models/role.ts
+ src/services/role.service.ts
+ src/middleware/permission.ts
+ src/routes/roles.ts
M src/routes/users.ts
M src/routes/index.ts
+ tests/permission.test.ts
+ tests/roles.test.ts
+ src/seeds/roles.seed.ts

Spec: docs/specs/SPEC-012-rbac.md

Stats:
├── Files: 6 new, 4 modified
├── Lines: +842, -12
├── Tests: 24 new
├── Coverage: 94%
├── Duration: 18m 42s
└── Cost: $0.00 (subscription)
═══════════════════════════════════════════════════════════════
```

## Krok 4: Ověření

```bash
# Spuštění migrace
pnpm prisma migrate dev

# Seed základních rolí
pnpm prisma db seed

# Spuštění testů
pnpm test

# Spuštění aplikace
pnpm dev

# Test nových endpointů
curl -X GET http://localhost:3000/roles \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Test permission middleware
curl -X DELETE http://localhost:3000/users/123 \
  -H "Authorization: Bearer $USER_TOKEN"
# 403 Forbidden - nemá oprávnění
```

## Pokročilé možnosti

### Paralelní implementace

Pro rychlejší vývoj můžete použít více workerů:

```bash
ado run --type feature "..." --workers 3 --remote
```

### Iterativní vývoj

Pokud chcete přidávat funkce postupně:

```bash
# Fáze 1: Základní role
ado run --type feature "Přidej základní Role model a service"

# Fáze 2: Permission middleware
ado run --type feature "Přidej permission middleware (navazuje na SPEC-012)"

# Fáze 3: Admin API
ado run --type feature "Přidej admin API pro správu rolí"
```

### Specifikace předem

Můžete specifikaci vytvořit ručně a pak ji implementovat:

```bash
# Vytvoření specifikace bez implementace
ado spec create "Role-based access control"

# Úprava specifikace
vim docs/specs/SPEC-012-rbac.md

# Implementace podle specifikace
ado run --spec docs/specs/SPEC-012-rbac.md
```

## Tips pro feature development

### 1. Jasně definujte scope

```bash
# ❌ Příliš vágní
ado run "Vylepši uživatelský systém"

# ✓ Konkrétní
ado run "Přidej RBAC s rolemi admin, user, viewer"
```

### 2. Odkazujte na existující kód

```bash
ado run "
Přidej soft delete pro User model.
Inspiruj se existujícím soft delete v src/models/post.ts
"
```

### 3. Specifikujte technické preference

```bash
ado run "
Implementuj caching pro API responses.
Použij Redis (již je v projektu).
Použij dekorátor pattern jako v src/decorators/cache.ts
"
```

### 4. Nastavte kvalitativní požadavky

```bash
ado run "..." \
  --quality-coverage 90 \
  --quality-lint-errors 0
```

---

## Souvislosti

- [Quick Start](../01-getting-started/quick-start.md)
- [Greenfield App](./greenfield-app.md)
- [Bug Fixing](./bug-fixing.md)
- [Autonomous Mode](../02-core-concepts/autonomous-mode.md)
