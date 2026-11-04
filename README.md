# Peoply backend

NestJS API for [peoply.app](https://peoply.app), on Postgres via Prisma.

| | Repo | Local | Prod |
| --- | --- | --- | --- |
| Backend | you are here | `http://localhost:3000` | `https://api.peoply.app` |
| Frontend | [`MAPSuio/peoply-frontend`](https://github.com/MAPSuio/peoply-frontend) | `http://localhost:3001` | `https://peoply.app` |

Node >= 24 < 27, npm >= 11 < 13. Docker needed for the local database.

## Run the backend

```bash
npm ci
cp .env.example .env
docker compose -f dev-db/docker-compose.yml up -d
npx prisma migrate deploy
npm run seed:dev-db     # local users, organizations, events
npm run dev             # http://localhost:3000

npm ci && cp .env.example .env && docker compose -f dev-db/docker-compose.yml up -d && npx prisma migrate deploy && npm run seed:dev-db && npm run dev
```

`npm run init:dev-db` replaces the docker/migrate/seed steps, but it recreates the database and shells out to `sudo`.

API reference: <http://localhost:3000/api>, rendered by [Scalar](https://scalar.com/). The raw OpenAPI document is at `/api/openapi.json`. A Prisma `P1001` means the database isn't up.

| Script | |
| --- | --- |
| `npm run dev` | watch mode |
| `npm run build` | compile only — touches no database |
| `npm run lint` / `lint:fix` | Biome |

## Run the frontend against it

```bash
git clone https://github.com/MAPSuio/peoply-frontend.git
cd peoply-frontend
npm ci
cp .env.example .env.development
npm run dev   # http://localhost:3001

git clone https://github.com/MAPSuio/peoply-frontend.git && cd peoply-frontend && npm ci && cp .env.example .env.development && npm run dev
```

`.env.example` already points at `http://localhost:3000`.

The ports aren't interchangeable. Auth cookies are cross-origin, so the backend must trust the frontend's origin (both already in `.env.example`):

```bash
CORS_ORIGIN="http://localhost:3001"    # allowlist; wrong value = browser drops the auth cookie
FRONTEND_URL="http://localhost:3001"   # redirect target after login
```

Change both and restart the backend if you move the frontend off 3001.

## Log in locally (dummy user)

1. Make sure `LOCAL_AUTH_ENABLED=true` is set in `.env` (already enabled in `.env.example`; restart `npm run dev` if you edited `.env`) and that the database is seeded (`npm run seed:dev-db`).
2. Open this URL in your **browser** to log in as a dummy user (sets the session cookies and redirects to the frontend at `http://localhost:3001`):

```text
http://localhost:3000/auth/dev-login?email=Kristian@gmail.com
```

To see all available seeded dummy users, open <http://localhost:3000/auth/dev-users> in your browser or run from the terminal:

```bash
curl http://localhost:3000/auth/dev-users                    # seeded users
curl -X POST http://localhost:3000/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"Kristian@gmail.com"}' -c cookies.txt
curl http://localhost:3000/auth/user -b cookies.txt
```

`curl -c cookies.txt` logs in `curl`, not your browser — use the browser URL above for the frontend.

## Change the schema

```bash
npx prisma format
npx prisma migrate dev --name what_you_changed
npx prisma generate    # skipping this is why dev fails after a schema change

npx prisma format && npx prisma migrate dev --name what_you_changed && npx prisma generate
```

`generate` writes TypeScript to `src/generated/prisma`, which is git-ignored
and recreated by `postinstall`. Import from `../generated/prisma/client`, not
from `@prisma/client`. The connection string lives in `prisma.config.ts` —
see [`CONTRIBUTING.md`](CONTRIBUTING.md#where-prisma-keeps-its-configuration).

Migrations hit production automatically on deploy — see [`CONTRIBUTING.md`](CONTRIBUTING.md#database-migrations).

## Test

```bash
npm test                   # unit, no database
npm run test:smoke         # boots the built app
npm run test:database-tls  # connects over TLS; starts its own Postgres, needs Docker
```

## Health checks

```bash
curl localhost:3000/_health     # {"status":"ok"} — the process is up
curl localhost:3000/readiness   # also checks the database; 503 if it is down
```

## More

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branching, CI checks, deploys, env vars
- [`docs/location-search.md`](docs/location-search.md) — provider evaluation, architecture, config
- [`docs/rate-limiting.md`](docs/rate-limiting.md) — rate limiting, klient-IP bak Cloudflare
