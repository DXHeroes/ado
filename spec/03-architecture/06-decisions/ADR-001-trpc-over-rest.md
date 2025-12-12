# ADR-001: tRPC over REST API

## Status
**Accepted**

## Context

ADO potřebuje komunikační protokol mezi:
- CLI (lokální) ↔ API Gateway (remote)
- Dashboard (browser) ↔ API Gateway (remote)
- Kontrolér ↔ Workers (internal)

Možnosti:
1. **REST API** - tradiční HTTP endpoints
2. **GraphQL** - query language s schématem
3. **gRPC** - binary protocol s Protocol Buffers
4. **tRPC** - TypeScript-native RPC

## Decision

**Použijeme tRPC jako primární komunikační protokol.**

## Rationale

### Type Safety

| Aspekt | REST | GraphQL | gRPC | tRPC |
|--------|------|---------|------|------|
| Compile-time safety | ❌ | ⚠️ (codegen) | ⚠️ (codegen) | ✅ Native |
| IDE autocomplete | ❌ | ⚠️ | ⚠️ | ✅ Full |
| Runtime validation | Manual | Built-in | Built-in | Zod |
| Schema sync | Manual | Manual | Manual | Automatic |

tRPC poskytuje **end-to-end type safety** bez nutnosti generování kódu. Změna v serveru se okamžitě projeví jako TypeScript error v clientu.

### Subscriptions (Real-time)

| Aspekt | REST | GraphQL | gRPC | tRPC |
|--------|------|---------|------|------|
| Native subscriptions | ❌ | ✅ | ✅ | ✅ |
| WebSocket support | Manual | Apollo | Complex | Native |
| Browser support | ✅ | ✅ | ⚠️ | ✅ |

tRPC subscriptions jsou nativně podporované a jednoduše se integrují s WebSocket.

### Developer Experience

```typescript
// REST - nutná manuální typová synchronizace
const response = await fetch('/api/tasks', {
  method: 'POST',
  body: JSON.stringify(data),
});
const task = await response.json() as Task; // Hope this is right...

// tRPC - automatická typová inference
const task = await trpc.tasks.create.mutate(data);
// ^-- TypeScript ví přesně co 'task' obsahuje
```

### Complexity

| Aspekt | REST | GraphQL | gRPC | tRPC |
|--------|------|---------|------|------|
| Setup complexity | Low | Medium | High | Low |
| Learning curve | Low | Medium | High | Low |
| Tooling required | Minimal | Apollo/etc | Protobuf compiler | None |
| Bundle size | Small | Large | Medium | Small |

### Proč ne ostatní?

**REST:**
- Žádná automatická type safety
- Manuální OpenAPI/Swagger maintenance
- Subscriptions vyžadují separátní řešení

**GraphQL:**
- Overkill pro API s jedním klientem
- Vyžaduje codegen
- Větší komplexita

**gRPC:**
- Omezená browser podpora (gRPC-web)
- Vyžaduje Protocol Buffers
- Komplexnější setup

## Consequences

### Positive
- ✅ Full type safety bez codegen
- ✅ Jednoduché subscriptions
- ✅ Menší bundle size než GraphQL
- ✅ Snadná integrace s React Query
- ✅ Nativní Zod validace

### Negative
- ⚠️ Pouze TypeScript ekosystém
- ⚠️ Menší community než REST/GraphQL
- ⚠️ Non-TypeScript klienti musí používat raw HTTP

### Mitigation
- Pro non-TS klienty vystavíme REST wrapper (automaticky generovaný)
- Dokumentace bude obsahovat HTTP equivalenty

## Implementation

### Server Setup
```typescript
// packages/api/src/trpc.ts
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(authMiddleware);
```

### Client Setup
```typescript
// packages/cli/src/client.ts
import { createTRPCProxyClient } from '@trpc/client';
import type { AppRouter } from '@ado/api';

export const client = createTRPCProxyClient<AppRouter>({
  links: [/* ... */],
});
```

## References

- [tRPC Documentation](https://trpc.io)
- [tRPC vs REST vs GraphQL](https://trpc.io/docs/concepts)
- [Type-Safe APIs](https://www.typescriptlang.org/docs/)

---

**Date:** 2025-01
**Authors:** ADO Team
