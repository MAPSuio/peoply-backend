import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved the datasource URL out of `schema.prisma` and stopped
 * loading `.env` on its own, so both jobs land here. The `dotenv/config`
 * import is what makes `npx prisma migrate dev` work from a checkout with a
 * local `.env`; in CI and on App Platform the variables are already in the
 * environment and it does nothing.
 *
 * The URL is read with `process.env` rather than Prisma's `env()` helper on
 * purpose. `env()` resolves eagerly while this file is being loaded and
 * throws `PrismaConfigEnvError` when the variable is missing, which breaks
 * `prisma generate` — a command that never touches the database — on any
 * machine without a `.env`. Since `generate` runs from `postinstall`, that
 * would make `npm ci` fail on a fresh clone. Passing `undefined` instead
 * leaves `generate` working and still fails the commands that genuinely need
 * a connection, with Prisma's own message.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "ts-node prisma/seed.ts",
  },
});
