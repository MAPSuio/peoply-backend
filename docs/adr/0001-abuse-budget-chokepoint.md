# ADR 0001 — One abuse-budget chokepoint

Status: implemented · 2026-08-31 · supersedes McpRateLimitService
Context: the 2026-08-31 security review (kept out of this public repository)

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

    consume(identities: RequestIdentities, action: BudgetAction, cost: number): Promise<void>

that throws `BudgetExceeded` (→ 429) when over budget and `BudgetUnavailable` when the
store is unreachable. Every costly operation routes through it.

### 1. One store: Redis sliding window
A single Redis-backed sliding-window counter backs every action, creation caps included
(Victor's call, over a two-backend proposal). Atomic INCR+PEXPIRE via a Lua script so the
window cannot be raced. `McpRateLimitService` and `@nestjs/throttler` are removed; their
role folds into this module. Requires a provisioned Redis (DigitalOcean Managed Valkey);
this is a prerequisite, not code.

### 2. Principal: expensive work requires auth
A `Principal` is `user:<id>`, `mcpKey:<id>` or `ip:<resolved-client-ip>`. A request can carry
several at once; which one an action is billed to is decided per action (see 5). The expensive unauthenticated endpoints (free-text search) move
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

### 4. Charge inside the client, not at the call site

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

#### Nested writes are counted too

A query extension only sees the *top-level* operation, so `event.update({ data: { registrations:
{ create: [...] } } })` reaches the database as an update and would pay nothing. The funnel
therefore also walks `args.data`, `args.create` and `args.update` before running the query,
counting `create`, `createMany` and `connectOrCreate` at every depth and charging each affected
action by the rows it would insert. One `event.create` carrying three nested registrations pays
one `event.create` and three `registration.create`.

Walking needs to know which relation field leads to which model, which Prisma does not tell the
extension. `src/abuse-budget/relation-target-models.ts` holds that as data: `Model.field` → target
model, for the twenty fields that can reach a costed model. A hand-written table rots silently, so
`relation-target-models.spec.ts` parses `prisma/schema.prisma` at test time, recomputes the set,
and fails when a new relation field to a costed model is added or an old one disappears.

#### `upsert` is refused rather than charged

`upsert` used to count as a create. An upsert whose update branch runs would still spend creation
budget and could 429 a plain edit, and the branch cannot be known before execution. So `upsert` is
no longer a charged create; instead, an upsert of a costed model **throws** when it happens inside
a request scope, because the call site knows which of create or update it means and should say so.
Outside a request scope it passes through untouched, which is what keeps the ICS `@Cron` import
(`ics-feeds.service.ts` upserts `event`) working.

#### What this still does not cover

- Raw SQL (`$queryRaw`, `$executeRaw`) bypasses the extension entirely. No costed create runs
  through raw SQL today; nothing prevents one from being written.
- A *nested* upsert of a costed model is not charged. The walk follows its update branch for
  deeper creates but does not count the create branch, for the same reason the top-level rule
  refuses rather than counts.

### 5. One request carries several identities; the action picks the bucket

`currentIdentities()` exposes every identity the request has — `user`, `mcpKey` and always an `ip` —
and `consume` selects one by the action's `keyBy`, falling back to the most specific identity present
(user, then key, then address). Before this, the principal was resolved once per request and an MCP
key outranked the user, so every key a user minted got its own `event.create` bucket and the per-user
cap could be multiplied by minting keys. Now `event.create` charges the user whichever transport it
arrives on, while `mcp.tool` still charges the key, which is the unit it is meant to meter. `keyBy`
was previously declared and never read; it is now the thing that decides.

## Action catalogue (enforced today)

| action | limit | window | failMode | charged at |
|---|---|---|---|---|
| event.create | 20 | 24h | closed | prisma extension (per row, nested included) |
| organization.create | 3 | 24h | closed | prisma extension |
| invitation.recipient | 500 | 24h | closed | prisma extension (per row, nested included) |
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

## Full-text search (X4)

`GET /events?description=` and `GET /organizations?description=` reach Prisma's `search:`
filter, which emits `to_tsvector(concat_ws(' ', "description")) @@ to_tsquery($1)`: a per-row
tsvector build on a 1-vCPU database, previously reachable with no account.

The review recommended a GIN index. That is not implementable here: the one-argument
`to_tsvector` and `concat_ws` are both STABLE rather than IMMUTABLE, so PostgreSQL refuses
to build an index on the expression Prisma actually emits (verified against 16). Adding an
index on an `'english'::regconfig` variant would build, but Prisma would never use it,
because the emitted predicate would not match.

So the cost is bounded by identity instead. The same funnel detects any `search:` filter
anywhere in a query's `where`, refuses it when the caller is neither an authenticated user
nor an MCP key, and charges `search.text` (30/min, fail-open) otherwise. No frontend caller
sends `description`; it only ever sends `title` and `name`, which stay public.

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
- A create issued outside a request scope (seeds, cron) resolves no identities and is not
  charged. That is server-initiated code, not attacker-reachable input.
- Request-scoped code may no longer upsert an event, organization, registration, invitation or
  follow. There is no such call site today; a future one gets a loud error rather than a wrong bill.

## Prerequisites
- DO Managed Valkey provisioned in ams3, firewalled to the backend app alone, with
  `REDIS_URL` set as a SECRET app-level env var. Done.
- Wire `src/util/trusted-proxies.ts` for the IP fallback (separate change, review R2).
- AUTHZ2 (organization `approved` default) is a product decision, out of scope.
