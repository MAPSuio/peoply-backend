import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 removed the Rust query engine, so a driver adapter is no longer
 * optional — `new PrismaClient()` with no arguments throws. Every client in
 * this repository (the Nest service, both seed scripts and the integration
 * test client) goes through this factory so the connection settings are
 * described once rather than four times.
 *
 * `DATABASE_URL` is validated by the Joi schema in `app.module.ts` when the
 * application boots, but the seed scripts run outside Nest and would
 * otherwise fail deep inside the driver with a less obvious message.
 */
export function createPrismaAdapter(): PrismaPg {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Prisma cannot connect without it — see .env.example.",
    );
  }

  return new PrismaPg({ connectionString });
}
