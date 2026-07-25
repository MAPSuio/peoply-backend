# Peoply backend

The API behind [peoply.app](https://peoply.app), a site for finding and
arranging student events. NestJS and Prisma on top of Postgres, served in
production at `api.peoply.app`.

The frontend is a separate Next.js app in
[MAPSuio/peoply-frontend](https://github.com/MAPSuio/peoply-frontend). Running
the site locally means running both: this API on port 3000 and the frontend on
port 3001.

Interactive API docs are at `/api` — `http://localhost:3000/api` locally.

New here? `CONTRIBUTING.md` covers branching, checks and how deploys work.

## Prerequisites

- **Node 20.19.5** — the version in `.nvmrc`. `package.json` sets
  `engineStrict`, so npm refuses to install on anything outside
  `>=20.11.0 <21`.
- **npm 10** (`>=10 <11`), which ships with Node 20.
- **Docker**, for the local Postgres.

```bash
nvm use          # picks up .nvmrc
npm ci
```

Use `npm ci`, not `npm install` — `ci` installs exactly what the lockfile says
and fails if the lockfile has drifted, which is what CI does too.

## Running it

The API does not start without a database: Prisma and the session layer both
connect during startup.

```bash
cp .env.example .env    # then set DATABASE_URL, see below
npm run init:dev-db     # starts Postgres in Docker, migrates, seeds
npm run dev             # http://localhost:3000
```

For a local database, `DATABASE_URL` should be:

```
DATABASE_URL="postgresql://pg:pg@localhost:5432/pg?schema=public"
```

`npm run init:dev-db` is a shortcut for these three, which you can also run
separately:

```bash
npm run start:dev-db    # docker compose up in dev-db/
npx prisma migrate dev  # apply migrations
npm run seed:dev-db     # local users, organizations and events
```

Other commands:

```bash
npm run dev             # watch mode
npm run build:dev       # compile without the production postbuild hooks
npm start               # run the compiled app from dist/
```

Use `build:dev` locally. Plain `npm run build` triggers `postbuild`, which runs
`prisma migrate deploy && prisma db seed` against whatever `DATABASE_URL` points
at.

## Logging in locally

Vipps and Google login are awkward against localhost, so the backend has a mock
auth mode. Set `LOCAL_AUTH_ENABLED=true` in `.env` (or export it in the shell
you run `npm run dev` from) and it exposes dev-only endpoints with
localhost-safe cookies. Nothing about production auth changes — these endpoints
return 404 unless the flag is on, `NODE_ENV` is not `production`, and the
request comes from localhost.

```bash
# list the seeded users
curl http://localhost:3000/auth/dev-users

# log in from the browser, so the frontend on :3001 sees you as logged in
open "http://localhost:3000/auth/dev-login?email=Kristian@gmail.com"

# or from the shell, saving cookies for curl
curl -X POST http://localhost:3000/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"Kristian@gmail.com"}' -c cookies.txt

curl http://localhost:3000/auth/user -b cookies.txt      # authenticated call
curl -X POST http://localhost:3000/auth/dev-logout -b cookies.txt
```

`curl -c cookies.txt` saves cookies for curl only. To appear logged in on the
frontend, open the `dev-login` URL in the browser.

## Changing the database schema

```bash
# 1. edit prisma/schema.prisma, then
npx prisma format
# 2. generate and apply the migration
npx prisma migrate dev --name what_you_changed
# 3. regenerate the client used by the app
npx prisma generate
```

Run `npx prisma generate` after pulling someone else's schema change too — a
stale client is the usual reason `npm run dev` fails right after a `git pull`.

Migrations are applied to production automatically on deploy, so prefer
additive changes. `CONTRIBUTING.md` has the details.

## Tests

```bash
npm test            # unit tests — Prisma is mocked, no database needed
npm run test:cov    # with coverage
npm run lint        # Biome
npm run test:smoke  # boots the built app and checks it responds (after a build)
```

## Environment variables

`.env.example` lists what you need. The app validates its config on startup and
refuses to boot if a required variable is missing, so a misconfigured `.env`
fails loudly rather than at the first request.

A few are read by the code but missing from `.env.example`:

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on. Defaults to 3000 |
| `MODERATOR_EMAILS` | Comma-separated emails allowed to reach `/moderation` |
| `DISCORD_ALERT_WEBHOOK_URL` | Where threat-detection alerts go. Unset means local logging only |
| `THREAT_DETECTION_ENABLED` | Defaults to `true` |
| `AZURE_STORAGE_SKIP_INIT` | Skips blob-container setup, used by CI |

Email sending needs a full `AZURE_COMMUNICATION_CONNECTION_STRING`. Without one
the app still starts, with email delivery disabled.

## When it will not start

| Symptom | Cause |
|---|---|
| Prisma `P1001` | The database is not running. `npm run start:dev-db` |
| Config validation error on boot | A required variable is missing from `.env` |
| Type errors about Prisma models after a pull | Stale client. `npx prisma generate` |
| `npm ci` fails on engines | Wrong Node version. `nvm use` |
