# ADR 0001 — One abuse-budget chokepoint

Status: implemented · 2026-08-31 · supersedes McpRateLimitService
Context doc: docs/security-review-2026-08-31.md (findings R1, R2, X2, X3, E1, X4)

## Problem

Cost control today lives in four independent mechanisms: the global
`@nestjs/throttler`, per-route `@Throttle` decorators, a separate
`McpRateLimitService`, and ad-hoc per-object counters (`MAX_EMAIL_UPDATES_PER_DAY`,
`MAX_INVITATIONS_PER_REQUEST`). Consequences, all confirmed in the security review:

- It counts the wrong unit. The limiter charges once per HTTP request, but cost is
  incurred per operation, so one JSON-RPC batch multiplies into ~890 tool calls past
  a single charge (X2).
- It keys on the wrong identity. Behind double-Cloudflare the tracked IP is a shared,
  per-request-varying edge address (R2), and the per-route bucket makes the "100/min"
  really ~85×/min (R1).
- It has holes where there is no limit at all: no per-user creation cap (X3), no
  per-day email cap on the status-change mail path (E1).

A rule spread across four mechanisms and forgotten at every new endpoint is a
convention, not a chokepoint. Adding a fifth decorator is call site 301.

## Decision

One module, `src/abuse-budget/`, with one public entry:

    consume(principal: Principal, action: BudgetAction, cost: number): Promise<void>

that throws `BudgetExceeded` (→ 429) when over budget and `BudgetUnavailable` when the
store is unreachable. Every costly operation routes through it.

### 1. One store: Redis sliding window
A single Redis-backed sliding-window counter backs every action, creation caps included
(Victor's call, over a two-backend proposal). Atomic INCR+PEXPIRE via a Lua script so the
window cannot be raced. `McpRateLimitService` and `@nestjs/throttler` are removed; their
role folds into this module. Requires a provisioned Redis (DigitalOcean Managed Valkey);
this is a prerequisite, not code.

### 2. Principal: expensive work requires auth
`Principal` resolves to `user:<id>` when authenticated, `mcpKey:<id>` for MCP, else
`ip:<resolved-client-ip>`. The expensive unauthenticated endpoints (free-text search) move
behind auth so their principal is always reliable; anonymous traffic gets only a coarse,
best-effort IP bucket. This removes the dependency on resolving the true client IP perfectly
for correctness — but the IP fallback still needs `src/util/trusted-proxies.ts` wired in
(tracked separately) to be worth anything.

### 3. Fail-closed on mutation, fail-open on read
`BudgetUnavailable` is handled per action, not globally:
- `failMode: 'closed'` — creation, email/Discord sends, MCP writes → 503, operation refused.
- `failMode: 'open'` — anonymous reads and search → allowed, logged, uncounted.
A Redis outage becomes a read-only-ish degradation, not a full outage, and the abuse window
during an outage is reads only.

### 4. Bypass made unrepresentable: charge inside the client, not at the call site

Wrapping the sinks in a `BudgetedRepository` was rejected during implementation: it is
still an optional function call, so any of the seven creation sites can reach
`prisma.event.create` directly and pay nothing, and a CI grep is a lint rather than a
mechanism. Type-narrowing the injected client fails for the same reason in a subtler way —
all seven costed creates run inside `this.prisma.$transaction(async (trx) => ...)`, and the
`trx` handed to that callback is a full client.

The charge therefore lives in the Prisma client itself, as a `$extends` query extension
(`src/prisma/budgeted-prisma.client.ts`) applied through a single `$allModels.$allOperations`
funnel. `PrismaModule` provides the extended client under the existing `PrismaService`
token, so the raw client is never injected anywhere and all 30 injection sites are
unchanged. Verified empirically against Prisma 7.9.1: query extensions **do** fire for
`create` issued inside an interactive transaction, which is what makes this reach the seven
call sites that a wrapper or a narrowed type could not.

Cost is charged per row, so `createMany` of 501 invitations pays 501. MCP tool calls are
charged one-by-one in the `registerTool` funnel, so a JSON-RPC batch of N pays N — this is
what closes X2. The principal is resolved from request-scoped `AsyncLocalStorage`, read at
the moment of charging rather than when the request arrived, because authentication runs in
a guard after the middleware that opens the scope.

## Action catalogue (enforced today)

| action | limit | window | failMode | charged at |
|---|---|---|---|---|
| event.create | 20 | 24h | closed | prisma extension |
| organization.create | 3 | 24h | closed | prisma extension |
| invitation.recipient | 500 | 24h | closed | prisma extension (per row) |
| registration.create | 200 | 24h | open | prisma extension |
| follow.create | 500 | 24h | open | prisma extension |
| mcp.tool | 120 | 1min | closed | registerTool, per tool call |

Attending an event is the core function of the product, so `registration.create` and
`follow.create` fail open: a Valkey outage must not stop people signing up, and their abuse
ceiling is low. The spam vectors fail closed.

The catalogue deliberately lists only what is enforced. `search.text`, `anon.read`,
`registration.statusEmail` and `organization.report` were dropped from the initial design
rather than shipped unwired, because a catalogue entry with no call site implies coverage
that does not exist.

## What was deliberately not folded in

- **The event-update email cap** (`MAX_EMAIL_UPDATES_PER_DAY`) stays where it is. It counts
  and inserts inside one transaction behind `SELECT ... FOR UPDATE` on the event, so the
  slot is reserved atomically with the write. The Redis counter cannot make that guarantee,
  so folding it in would trade a correct reservation for a racy one.
- **`MAX_INVITATIONS_PER_REQUEST`** is an input bound on a single request, not a budget. It
  stays as validation; `invitation.recipient` adds the cross-request cap it never had.
- **`@nestjs/throttler` and `CfThrottlerGuard`** stay. They limit HTTP requests per IP, which
  is a different unit from cost per operation, and they already run as a global `APP_GUARD`
  rather than as an optional per-call-site check. Removing them would delete defence, not
  duplication.

`McpRateLimitService` is deleted: it was per-instance, in-memory, charged once per HTTP
request, and therefore could not see batch amplification at all.

## Consequences

- New hard dependency on Redis on the critical path for every mutation. Mitigated by the
  per-action fail mode, but a Redis outage does refuse writes. Accepted.
- No call site moves: the charge is inside the client, so the seven creation sites and all
  30 `PrismaService` injections are untouched.
- Every query now passes through one extension callback. It is a function call on the way to
  a database round trip, so the cost is not measurable.
- A create issued outside a request scope (seeds, cron) resolves no principal and is not
  charged. That is server-initiated code, not attacker-reachable input.

## Prerequisites
- DO Managed Valkey provisioned in ams3, firewalled to the backend app alone, with
  `REDIS_URL` set as a SECRET app-level env var. Done.
- Wire `src/util/trusted-proxies.ts` for the IP fallback (separate change, review R2).
- AUTHZ2 (organization `approved` default) is a product decision, out of scope.
