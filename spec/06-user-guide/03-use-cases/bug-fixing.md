# Use Case: Bug Fixing

## Přehled

Průvodce použitím ADO pro opravu bugů v existujícím kódu.

## Typy bugů a přístupy

| Typ bugu | Přístup | HITL Policy |
|----------|---------|-------------|
| Jednoduchý (typo, off-by-one) | Autonomous | autonomous |
| Střední (logická chyba) | Spec review | spec-review |
| Komplexní (race condition) | Checkpoint | checkpoint |
| Kritický (security) | Always | always |

## Scénář 1: Jednoduchý bug

### Problém

```
Bug: API vrací 500 při prázdném query parametru

Reprodukce:
GET /api/users?search=
Response: 500 Internal Server Error

Očekávané chování:
Response: 200 OK s prázdným polem
```

### Řešení

```bash
ado run --type bugfix --autonomous "
Oprav bug: GET /api/users?search= vrací 500 místo prázdného pole.

Soubor: src/routes/users.ts
Endpoint: GET /users
"
```

### Průběh

```
⏳ Analyzuji bug...

📋 Analýza:
├── Typ: bugfix (simple)
├── Příčina: Chybí validace prázdného stringu
├── Soubor: src/routes/users.ts:45
└── Řešení: Přidat null/empty check

🔨 Opravuji...

Změna v src/routes/users.ts:
  - const users = await userService.search(search);
  + const users = search ? await userService.search(search) : [];

🧪 Validuji...
✓ Build passed
✓ Existing tests pass
✓ New regression test added
✓ Bug reproduced and fixed

═══════════════════════════════════════════════════════════════
✅ Bug fixed!

Changes:
M src/routes/users.ts (+3, -1)
+ tests/users.regression.test.ts (+15)

Duration: 2m 18s
═══════════════════════════════════════════════════════════════
```

## Scénář 2: Logická chyba

### Problém

```
Bug: Výpočet slevy nefunguje správně pro objednávky nad 1000 Kč

Reprodukce:
1. Vytvoř objednávku za 1500 Kč
2. Aplikuj slevový kód "SLEVA10" (10% sleva)
3. Očekávaná cena: 1350 Kč
4. Skutečná cena: 1500 Kč (sleva se neaplikuje)
```

### Řešení

```bash
ado run --type bugfix "
Bug: Sleva se neaplikuje na objednávky nad 1000 Kč

Reprodukce:
- Objednávka 1500 Kč
- Slevový kód SLEVA10 (10%)
- Očekávaná cena: 1350 Kč
- Skutečná: 1500 Kč

Pravděpodobně problém v src/services/discount.service.ts
"
```

### Průběh

```
⏳ Analyzuji bug...

📋 Analýza:
├── Typ: bugfix (moderate)
├── Soubory k prozkoumání:
│   ├── src/services/discount.service.ts
│   ├── src/services/order.service.ts
│   └── src/utils/price.ts
└── Vytvářím specifikaci...

═══════════════════════════════════════════════════════════════
SPEC-BUG-008: Discount Calculation Fix

Root Cause Analysis:
Discount service obsahuje podmínku `if (total < 1000)` která
zabraňuje aplikaci slevy na objednávky nad 1000 Kč.

```typescript
// src/services/discount.service.ts:34
if (total < 1000) {  // BUG: Mělo by být bez této podmínky
  return this.applyDiscount(total, discount);
}
return total;  // Sleva se neaplikuje
```

Fix:
Odstranit chybnou podmínku, sleva by se měla aplikovat vždy
když je validní kód.

Test Cases:
- [ ] Objednávka < 1000 Kč se slevou
- [ ] Objednávka = 1000 Kč se slevou
- [ ] Objednávka > 1000 Kč se slevou
- [ ] Objednávka bez slevy
- [ ] Neplatný slevový kód
═══════════════════════════════════════════════════════════════

Approve fix? [Y/n/v]: Y
```

```
🔨 Opravuji podle SPEC-BUG-008...

├── [✓] Identifikace problému
├── [✓] Oprava discount.service.ts
├── [✓] Regression testy
└── [✓] Validace

🧪 Validuji...

Test Results:
✓ Objednávka 500 Kč + SLEVA10 = 450 Kč
✓ Objednávka 1000 Kč + SLEVA10 = 900 Kč
✓ Objednávka 1500 Kč + SLEVA10 = 1350 Kč  ← FIX VERIFIED
✓ Objednávka 1500 Kč bez slevy = 1500 Kč
✓ Neplatný kód = error

═══════════════════════════════════════════════════════════════
✅ Bug fixed!

Root cause: Chybná podmínka omezující slevy na < 1000 Kč
Fix: Odstranění podmínky v discount.service.ts:34

Changes:
M src/services/discount.service.ts (+2, -5)
+ tests/discount.regression.test.ts (+45)

Duration: 5m 42s
═══════════════════════════════════════════════════════════════
```

## Scénář 3: Komplexní bug (Race Condition)

### Problém

```
Bug: Občas se vytvoří duplicitní platby

Reprodukce:
- Stisknutí tlačítka "Zaplatit" rychle 2x
- Občas se vytvoří 2 platby místo 1
- Nelze konzistentně reprodukovat

Logy:
[12:00:00.100] POST /payments - user 123 - started
[12:00:00.150] POST /payments - user 123 - started  ← Druhý request
[12:00:00.300] Payment created: pay_001
[12:00:00.350] Payment created: pay_002  ← Duplicita!
```

### Řešení

```bash
ado run --type bugfix --hitl checkpoint "
Race condition: Duplicitní platby při rychlém dvojkliku

Logy:
[12:00:00.100] POST /payments - user 123 - started
[12:00:00.150] POST /payments - user 123 - started
[12:00:00.300] Payment created: pay_001
[12:00:00.350] Payment created: pay_002

Pravděpodobně chybí idempotency nebo locking.
"
```

### Průběh

```
⏳ Analyzuji bug...

📋 Analýza:
├── Typ: bugfix (complex - race condition)
├── Pravděpodobné příčiny:
│   ├── Chybí idempotency key
│   ├── Chybí optimistic locking
│   └── Chybí request deduplication
└── Vyžaduje důkladnou analýzu

═══════════════════════════════════════════════════════════════
SPEC-BUG-012: Payment Race Condition Fix

Problem Analysis:
Race condition v payment flow - dva konkurentní requesty
mohou vytvořit duplicitní platby.

Current Flow:
```
Request 1: Check existing → None → Create payment
Request 2: Check existing → None → Create payment  ← RACE!
```

Proposed Solutions:

Option A: Idempotency Key (Recommended)
- Klient posílá unique key s každým requestem
- Server deduplikuje podle klíče
- Standardní řešení pro payment APIs

Option B: Database Lock
- Optimistic locking na user + order
- Druhý request selže s conflict

Option C: Redis Lock
- Distributed lock na payment operation
- Komplexnější implementace

Recommendation: Option A - Idempotency Key
- Nejčistší řešení
- Stripe/PayPal standard
- Klient má kontrolu
═══════════════════════════════════════════════════════════════

Select approach:
[A] Idempotency Key (Recommended)
[B] Database Lock
[C] Redis Lock

Choice [A]: A
```

```
🔨 Implementuji idempotency...

├── [✓] Idempotency middleware          100%
├── [✓] Database schema update          100%
├── [▶] Payment service update           75%
├── [⏸] API documentation                 0%
└── [⏸] Tests                             0%

═══════════════════════════════════════════════════════════════
🏗️ ARCHITECTURE CHECKPOINT

Navrhované změny:

1. Nová tabulka `idempotency_keys`:
   - key: string (unique)
   - response: jsonb
   - created_at: timestamp
   - expires_at: timestamp

2. Middleware `idempotencyMiddleware`:
   - Vyžaduje header `Idempotency-Key`
   - Vrací cached response pro existující klíč

3. Aktualizace API dokumentace

Approve architecture? [Y/n/m]: Y
═══════════════════════════════════════════════════════════════

🧪 Validuji...

Concurrency Test:
✓ 10 parallel requests, same key → 1 payment created
✓ 10 parallel requests, diff keys → 10 payments created
✓ Retry with same key → cached response
✓ Expired key → new payment allowed

═══════════════════════════════════════════════════════════════
✅ Race condition fixed!

Solution: Idempotency key middleware

Changes:
+ src/middleware/idempotency.ts
M src/routes/payments.ts
M prisma/schema.prisma
+ tests/idempotency.test.ts
M docs/api.md (Idempotency-Key header documented)

Duration: 24m 18s
═══════════════════════════════════════════════════════════════
```

## Scénář 4: Security bug

### Problém

```
SECURITY: SQL Injection vulnerability

Endpoint: GET /api/products?category=electronics
Vulnerable: category parameter is not sanitized

Proof of concept:
GET /api/products?category='; DROP TABLE products; --
```

### Řešení

```bash
ado run --type bugfix --hitl always "
SECURITY BUG: SQL Injection v /api/products

PoC: ?category='; DROP TABLE products; --

KRITICKÉ - vyžaduje okamžitou opravu a audit
"
```

```
🚨 SECURITY ISSUE DETECTED

Typ: SQL Injection (CWE-89)
Severity: CRITICAL
CVSS: 9.8

Immediate actions:
1. Oprava vulnerable kódu
2. Audit všech SQL queries
3. Přidání input sanitization
4. Security testy

Pokračovat s opravou? [Y/n]: Y

═══════════════════════════════════════════════════════════════
SECURITY-001: SQL Injection Fix

Vulnerable Code:
```typescript
// src/repositories/product.repository.ts:23
const query = `SELECT * FROM products WHERE category = '${category}'`;
```

Fix:
```typescript
const query = `SELECT * FROM products WHERE category = $1`;
const result = await db.query(query, [category]);
```

Additional Fixes:
- Audit all raw SQL queries (found 3 more issues)
- Add input validation middleware
- Add SQL injection tests
═══════════════════════════════════════════════════════════════

[HITL] Review security fix before applying? [Y/n]: Y

[HITL] Showing diff...
[HITL] Apply fix? [Y/n]: Y

[HITL] Audit found 3 more vulnerable queries. Fix all? [Y/n]: Y

✅ Security fix applied

Recommendation:
- Deploy immediately
- Review access logs for exploitation attempts
- Consider security audit
```

## CLI příkazy pro bugfix

```bash
# Základní bugfix
ado run --type bugfix "popis bugu"

# S odkazem na issue
ado run --type bugfix --issue GH-123 "popis"

# S reprodukčními kroky
ado run --type bugfix "
Bug: [popis]
Repro:
1. step 1
2. step 2
Expected: X
Actual: Y
"

# Prioritní oprava
ado run --type bugfix --priority critical "security issue"
```

---

## Souvislosti

- [Feature Development](./feature-development.md)
- [Greenfield App](./greenfield-app.md)
- [Autonomous Mode](../02-core-concepts/autonomous-mode.md)
- [Troubleshooting](../04-troubleshooting/common-issues.md)
