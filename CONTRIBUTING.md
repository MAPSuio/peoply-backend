# Contributing

This is the backend for [peoply.app](https://peoply.app) — a NestJS API served
at `api.peoply.app`, backed by Postgres through Prisma.

## Getting set up

The project requires **Node >= 24 < 25** and **npm >= 11 < 12**
(`engines` in `package.json`). CI runs Node 24.18.0. Check `node -v` before
opening an issue about a broken install.

```bash
npm ci        # install exactly what the lockfile says
```

Use `npm ci` rather than `npm install`. `npm install` silently repairs a
lockfile that has drifted from `package.json`; CI uses `npm ci`, which fails
instead. A tree that only works under `npm install` is a tree that fails in CI.

### Database

The API does not boot without Postgres — Prisma and the session store both
connect during startup. Bring up the local database before anything else:

```bash
cp .env.example .env                       # set DATABASE_URL as described in README.md
npm run start:dev-db                       # docker-compose in dev-db/
npx prisma migrate dev                     # apply migrations
npm run seed:dev-db                        # local users, organizations, events
npm run dev                                # http://localhost:3000
```

`npm run init:dev-db` chains the middle three for you.

A Prisma `P1001` error means the database is not up, not that your code is
wrong.

### Where Prisma keeps its configuration

Three things about Prisma 7 are worth knowing before the first `Cannot find
module` sends you looking in the wrong place.

**The generated client is build output.** It is emitted as TypeScript into
`src/generated/prisma`, which is git-ignored. Prisma 7 does not generate on
install by itself, so `postinstall` runs `prisma generate` — that is what puts
it there. If your editor reports that `../generated/prisma/client` does not
exist, you have not installed yet; run `npm ci`. Never edit anything under
that directory, and never import from `@prisma/client` — it no longer holds
the generated types.

**The connection string lives in `prisma.config.ts`, not `schema.prisma`.**
Prisma 7 removed `url` from the `datasource` block. The config file also
imports `dotenv/config`, because the CLI no longer reads `.env` on its own.

Be aware that the CLI needs `typescript` installed to read a `.ts` config, and
says nothing when it cannot. Without it the "Loaded Prisma config from
prisma.config.ts" line simply does not appear and the command proceeds with the
config ignored. `migrate deploy` still finds the database, because
`schema.prisma` declares no `url` and Prisma falls back to `DATABASE_URL` — the
same value the config would have supplied. That fallback is why the mistake is
survivable and also why it is invisible. If you add anything to
`prisma.config.ts` that the fallback does not cover, check that line is present
in the output.

**Every `PrismaClient` needs a driver adapter.** The Rust query engine is
gone, so `new PrismaClient()` with no arguments throws at runtime rather than
failing to compile. Construct it through `createPrismaAdapter()` in
`src/prisma/prisma.adapter.ts` so the connection settings stay in one place.

### TLS against a managed database

Losing the Rust engine also changed how TLS is negotiated, and production is
the only environment where that shows. Queries now go through
`@prisma/adapter-pg`, which hands `sslmode` to `pg-connection-string` — and
there `require` means **verify the certificate chain**, not merely "encrypt"
as it does in libpq and as the Rust engine treated it. DigitalOcean signs its
managed databases with a per-project CA that is in no system trust store, so
`?sslmode=require` alone now fails with `P1011 TlsConnectionError: self-signed
certificate in certificate chain`.

The fix is to supply that CA rather than to stop verifying. Set
`DATABASE_CA_CERT` to the certificate itself — `doctl databases get-ca <id>`
returns it base64-encoded — and `createPrismaAdapter()` uses it to do a real
`verify-full`, hostname included. Leave the variable unset locally and in CI,
where Postgres runs without TLS at all.

One trap is worth knowing before you touch that function. `pg` merges the
parsed connection string *over* the config object you pass it, so **any**
`sslmode` in the URL replaces your `ssl` settings with its own and the CA is
silently discarded. That is why the adapter strips `sslmode` before handing
the URL over. Removing that step reintroduces a bug whose symptom is
indistinguishable from not having configured a CA at all.

Neither `npm test` nor the CI job exercises any of this — they talk to a
plaintext Postgres. To test a change here, run a local Postgres with `ssl=on`
and a self-signed CA, and check `pg_stat_ssl` to confirm the connection is
genuinely encrypted rather than quietly falling back.

The local database runs Postgres 16, matching production. If you set the
project up when it was still on Postgres 13, `npm run start:dev-db` alone will
fail with `FATAL: database files are incompatible with server` — Compose
carries the old data directory over when it recreates the container. Run
`npm run init:dev-db` once instead; it tears the container down first, so the
new one initialises a fresh Postgres 16 directory and re-seeds it. Local data
is lost, which is why this is safe to do here and nowhere else.

### Logging in locally

Vipps and Google login are awkward to use against localhost. Set
`LOCAL_AUTH_ENABLED=true` and the backend exposes dev-only auth endpoints with
localhost-safe cookies (`SameSite=Lax`, `Secure=false`). See the *Local mock
auth* section of `README.md` for the endpoints. This flag changes nothing about
the production auth flow.

## Making a change

Work on a branch and open a pull request. Nothing is pushed straight to
`master` — it deploys to production.

```bash
git checkout -b fix/thing-that-is-broken
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/),
checked by a `commit-msg` hook. The allowed types are `build`, `chore`, `ci`,
`docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` and `test`,
optionally scoped (`fix(auth):`). Write the subject so it says what changed for
a caller, not which file you touched.

Merge, revert and `fixup!`/`squash!` messages are exempt, so `git merge` and
`git commit --fixup` are unaffected. `git commit --no-verify` skips the check.

## Checks

Run these before pushing. A red check blocks both merge and deploy.

```bash
npx prisma migrate deploy   # schema must be current
npm test                    # Jest
npm run lint                # Biome
npm run build               # tsc -p tsconfig.build.json
npm run test:smoke          # boots the built app and checks it responds
npm run test:database-tls   # connects over TLS; needs Docker
```

`npm run lint:fix` applies Biome's fixes. `npm run build` compiles and nothing
else — it used to migrate and seed whatever `DATABASE_URL` pointed at, which is
why an older `build:dev` script existed to avoid it. Both are gone; see *How
deploys work* for where migrations moved.

### What CI runs

`.github/workflows/ci.yml` is the entry point. It calls one workflow per
concern so a red check names what broke, instead of reporting the same
"Backend Verification" for a formatting slip and a failed deploy alike:

| Workflow | Checks | Needs a database |
| --- | --- | --- |
| `lint.yml` | Biome | no |
| `unit-tests.yml` | Jest, against a migrated Postgres | plaintext |
| `build.yml` | compiles, then boots the compiled app | plaintext, and *not* during the build |
| `database-tls.yml` | connects through a privately signed certificate | starts its own |
| `deploy-production.yml` | ships `master` to App Platform | — |

Two pieces are shared rather than repeated: `.github/actions/setup` installs
the Node version from `.nvmrc` and runs `npm ci`, and `.github/ci.env` holds
the placeholder configuration the application's Joi schema demands at startup.
**Adding a required environment variable means adding it to `.github/ci.env`**
— otherwise the app fails to boot in CI with a validation error.

The TLS workflow is the one worth understanding. Every other Postgres in this
project — CI's service container, the local dev database — speaks plaintext, so
before it existed the TLS path was first executed in production. That is how
`P1011 TlsConnectionError: self-signed certificate in certificate chain` broke
every deploy after the Prisma 7 upgrade while CI stayed green. The harness in
`test/database-tls/` generates a throwaway CA, starts a Postgres that presents
a certificate signed by it, and connects through the real adapter. Nothing is
committed, so there is no key material in the repository.

### The pre-commit hook

`npm ci` installs a Husky `pre-commit` hook that runs Biome over your staged
files, so a lint or formatting error is caught before the commit exists rather
than by CI ten minutes later. It only looks at what you staged, so it stays
fast, and it does not rewrite your files — run `npm run lint:fix` yourself.

Warnings do not block, matching `npm run lint` in CI. Use
`git commit --no-verify` to skip the hook when you need to.

The hook needs `node` on `PATH`. Git runs hooks with a minimal environment, so
under nvm a GUI git client may not find it — commit from a shell where
`node -v` works.

New behaviour should come with a test. `npm run test:db` and `npm run test:e2e`
need a running database; `npm test` does not.

## Database migrations

Migrations are applied automatically on deploy — see below. That makes every
merge to `master` a schema change against production, so treat migrations with
more care than ordinary code:

- Generate them with `npx prisma migrate dev`, and commit the generated SQL.
  Never hand-edit a migration that has already been merged.
- Prefer additive changes. A migration that drops or renames a column breaks
  the running instance for as long as the old code is still serving traffic,
  because App Platform keeps it up until the new build is healthy.
- Rolling back a deploy does not roll back a migration. If a change is not
  safely reversible, say so in the pull request.

## How deploys work

Merging to `master` runs `.github/workflows/deploy-production.yml`, which calls
`digitalocean/app_action/deploy@v2` and deploys the `prod-peoply-backend` app on
DigitalOcean App Platform. `ci.yml` only reaches it once lint, the unit tests,
the build and the TLS check are all green, so a failing check cannot reach
production.

Migrations run in the app's `PRE_DEPLOY` job, which executes
`npm run predeploy:prod` — `prisma migrate deploy` followed by the seed — after
the image is built and before any new instance takes traffic. Two consequences
worth internalising:

1. **Every production deploy migrates the production database.** There is no
   separate migration step to forget or to gate.
2. **Every production deploy re-runs the seed.** `prisma/seed.ts` only inserts
   reference data (categories, allergens) with `skipDuplicates: true`, so it is
   idempotent. Keep it that way — anything non-idempotent added there runs on
   every single deploy.

This used to be a `postbuild` hook, so it ran during the build instead. That
stopped working the moment the database got a trusted-sources rule: build
containers have no stable address and are not part of the app's network, so
they cannot be allowed through the firewall. A `PRE_DEPLOY` job runs in the
app's own network and is covered by the rule. If you ever move this back into
the build, deploys will fail with `P1001: Can't reach database server` while
production keeps serving the previous release.

The job runs from the compiled output — `node dist/prisma/seed.js`, not
`prisma db seed` — because `ts-node` is a devDependency and need not exist in
the runtime image. For the same reason `prisma` is a regular dependency rather
than a devDependency: `postinstall` runs `prisma generate`, so it has to
survive a production install anyway.

The App Platform spec lives in DigitalOcean, not in this repository, and it
holds production environment variables including the database URL. Do not
commit a `.do/app.yaml` — it would put those values in git history.

Deploys are gated on CI rather than on App Platform's own push hook
(`deploy_on_push` is off), so the workflow is the only path to production.

### Health checks

Two endpoints, answering two different questions:

| Endpoint | Answers | Touches the database |
| --- | --- | --- |
| `GET /_health` | the process is up and routing works | no |
| `GET /readiness` | the app can actually serve traffic | yes — `SELECT 1` |

The split exists because the database driver connects lazily. An instance
whose database configuration is broken still boots, still listens, and still
passes a TCP check — it just answers 500 to every request that touches data.
That is not hypothetical: it is how a `P1011` TLS failure reached production
and stayed there until somebody opened the site.

So `/readiness` is what everything checks:

- **App Platform** uses it as the component's health check. A release that
  cannot reach the database never passes, so it is never promoted and the
  previous release keeps serving.
- **`npm run test:smoke`** asserts it after booting the compiled output, so a
  change that breaks the database path fails on the pull request.
- **The deploy workflow** polls it against the live URL afterwards, so a
  release that got through anyway turns the run red instead of going unnoticed.

Two properties are load-bearing, and both are covered by tests in
`src/health/`:

- The probe result is cached for two seconds and concurrent probes share a
  single query. `/readiness` is unauthenticated, so without that it would be a
  free database query per request.
- The driver's error is logged and never returned. It names the database host
  and user.

Both endpoints skip the rate limiter. A throttled probe returns 429, the
platform reads that as unhealthy, and it restarts an instance that was fine —
turning a traffic spike into an outage. The cache bounds database load
instead, which holds regardless of source IP.

## Environment variables

`.env.example` documents what the app needs. Real values belong in your local
`.env` (git-ignored), in the App Platform app for production, or in repository
secrets for CI. Nothing secret belongs in this repository.

CI supplies its own throwaway values for every required variable from
`.github/ci.env`, so adding a new mandatory env var means adding it there as
well — otherwise the app fails to boot in CI even though the code is fine.

## Prior art

`HALL_OF_FAME.md` credits everyone who built this before the move to the
`MAPSuio` organization.
