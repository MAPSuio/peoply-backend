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

Run these before pushing. They mirror the `verify` job in
`.github/workflows/backend_verification.yml`, and a red job blocks both merge
and deploy.

```bash
npx prisma migrate deploy   # schema must be current
npm test                    # Jest
npm run lint                # Biome
npm run build:dev           # nest build, without the production postbuild hooks
npm run test:smoke          # boots the built app and checks it responds
```

`npm run lint:fix` applies Biome's fixes. Note that `npm run build:dev` is the
right local build: plain `npm run build` triggers `postbuild`, which talks to
whatever database `DATABASE_URL` points at.

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

Merging to `master` runs the `deploy` job in
`.github/workflows/backend_verification.yml`, which calls
`digitalocean/app_action/deploy@v2` and deploys the `prod-peoply-backend` app on
DigitalOcean App Platform. The job needs `verify` green first, so a failing
build cannot reach production.

The production build runs `postbuild`, which is
`prisma migrate deploy && prisma db seed`. Two consequences worth internalising:

1. **Every production deploy migrates the production database.** There is no
   separate migration step to forget or to gate.
2. **Every production deploy re-runs the seed.** `prisma/seed.ts` only inserts
   reference data (categories, allergens) with `skipDuplicates: true`, so it is
   idempotent. Keep it that way — anything non-idempotent added there runs on
   every single deploy.

The App Platform spec lives in DigitalOcean, not in this repository, and it
holds production environment variables including the database URL. Do not
commit a `.do/app.yaml` — it would put those values in git history.

Deploys are gated on CI rather than on App Platform's own push hook
(`deploy_on_push` is off), so the workflow is the only path to production.

## Environment variables

`.env.example` documents what the app needs. Real values belong in your local
`.env` (git-ignored), in the App Platform app for production, or in repository
secrets for CI. Nothing secret belongs in this repository.

The CI job supplies its own throwaway values for every required variable, so
adding a new mandatory env var means adding it to
`.github/workflows/backend_verification.yml` as well — otherwise the app fails
to boot in CI even though the code is fine.

## Prior art

`HALL_OF_FAME.md` credits everyone who built this before the move to the
`MAPSuio` organization.
