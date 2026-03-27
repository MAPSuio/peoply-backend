<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ nvm use 16.20.2
$ npm install
```

The project is pinned to Node 16 and npm 8 in `package.json`.

## Running the app

```bash
# watch mode
$ npm run dev

# build without running Prisma deploy/seed hooks
$ npm run build:dev

# run compiled app
$ npm run start

# production build pipeline
$ npm run build
```

## Running the database in development

Do the following steps to start the db in your local environment:

- Start Docker Desktop or another Docker daemon first.
- Create a `.env` file from `.env.example` and set `DATABASE_URL="postgresql://pg:pg@localhost:5432/pg?schema=public"`.
- Start the db with `docker-compose up -d` from `dev-db/`, or run `npm run start:dev-db`.
- Run `npx prisma migrate dev` to apply migrations.
- Run `npm run seed:dev-db` to load local test users, organizations, and events.

Quick start:

```bash
$ nvm use 16.20.2
$ cp .env.example .env
$ docker-compose -f dev-db/docker-compose.yml up -d
$ npx prisma migrate dev
$ npm run seed:dev-db
$ npm run dev
```

### Local mock auth

If Vipps or Google login is inconvenient locally, you can enable backend-driven mock auth without changing the production auth flow:

This only replaces the external login providers. The backend still needs a running local Postgres instance because Prisma and the session/auth data layer are initialized on startup.

```bash
# either add this to .env
LOCAL_AUTH_ENABLED=true

# or export it before starting the backend
export LOCAL_AUTH_ENABLED=true
npm run dev
```

When `LOCAL_AUTH_ENABLED=true`, the backend exposes dev-only endpoints and uses localhost-safe cookie settings (`SameSite=Lax`, `Secure=false`) so browser auth works over plain `http://localhost`.

If you see a Prisma `P1001` error like `Please make sure your database server is running at localhost:5432`, start the dev database first:

```bash
$ docker compose -f dev-db/docker-compose.yml up -d
# or
$ npm run start:dev-db
```

If `npm run dev` still fails locally because `AZURE_COMMUNICATION_CONNECTION_STRING` is missing or only contains the Azure endpoint, the backend now starts anyway and disables email sending until the env var contains a full connection string.

Useful endpoints:

```bash
# list local users from the seeded dev database
$ curl http://localhost:3000/auth/dev-users

# browser login for local frontend testing
# open this URL directly in the browser
$ open "http://localhost:3000/auth/dev-login?email=Kristian@gmail.com"

# log in as a seeded user by email
$ curl -X POST http://localhost:3000/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"Kristian@gmail.com"}' \
  -c cookies.txt

# call an authenticated endpoint with the saved cookies
$ curl http://localhost:3000/auth/user -b cookies.txt

# clear local auth cookies
$ curl -X POST http://localhost:3000/auth/dev-logout -b cookies.txt
```

These endpoints return `404` unless `LOCAL_AUTH_ENABLED=true`, and they are also disabled automatically when `NODE_ENV=production`.

Important:

- `curl -c cookies.txt` saves cookies for `curl`, not for your browser.
- If the frontend at `http://localhost:3001` should show you as logged in, use the browser URL `http://localhost:3000/auth/dev-login?email=Kristian@gmail.com`.
- `LOCAL_AUTH_ENABLED=true` must be present in `.env` or exported in the same shell before you run `npm run dev`.

If `npm run dev` fails after a schema change even though the database migration is already applied, regenerate the Prisma client locally:

```bash
$ npx prisma generate
```

Local startup also requires a valid `AZURE_COMMUNICATION_CONNECTION_STRING` if you want email sending enabled. The backend now starts without it, but email delivery is disabled until the env var contains a full Azure Communication Services connection string like:

```bash
AZURE_COMMUNICATION_CONNECTION_STRING="endpoint=https://example.communication.azure.com/;accesskey=your-key"
```

When you modify the schema, you must create a new migration:

- Modify `schema.prisma` with desired changes, then run `npx prisma format`.
- Run `npx prisma migrate dev --name what_you_have_changed` to generate SQL and apply it to the DB.
- Run `npx prisma generate` to update the Prisma client code that we use in the app.

If you make changes to the production seed script, run it manually with `npx prisma db seed`.

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
