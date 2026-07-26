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

  const ca = process.env.DATABASE_CA_CERT;

  if (!ca) {
    return new PrismaPg({ connectionString });
  }

  return new PrismaPg({
    connectionString: withoutSslMode(connectionString),
    ssl: { ca: normalisePem(ca), rejectUnauthorized: true },
  });
}

/**
 * Accepts a PEM certificate whether its line breaks are real newlines or the
 * two-character sequence `\n`.
 *
 * Which one you get depends on how the value was entered rather than on
 * anything in the code: a real newline survives a multi-line env var, but any
 * tooling that flattens the value to a single line turns it into `\n`. Node's
 * TLS stack accepts only the former and rejects the latter as an unparseable
 * certificate, so normalising here removes a failure mode that is invisible in
 * the value you would read back out of the environment.
 */
function normalisePem(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

/**
 * Removes the `sslmode` parameter from a connection string, leaving the rest
 * of it untouched.
 *
 * This exists because of an ordering rule inside `pg` that is easy to miss.
 * `ConnectionParameters` merges the parsed connection string *over* the
 * explicit config object:
 *
 *     config = Object.assign({}, config, parse(config.connectionString))
 *
 * Any `sslmode` at all — including `require` — makes `parse()` return an `ssl`
 * key, and that key overwrites the `ssl` we pass in. So the obvious spelling,
 * `new PrismaPg({ connectionString, ssl: { ca } })`, silently drops the CA and
 * fails exactly as if it had never been configured. Only a connection string
 * with no `sslmode` leaves `ssl` absent from the parsed object, which is what
 * lets ours survive.
 *
 * Dropping `sslmode` loses nothing: the `ssl` object we supply instead is
 * strictly stronger than the mode it replaces. `rejectUnauthorized` is on and
 * Node checks the hostname against the certificate's SANs, which is `verify-
 * full` in libpq's terms.
 */
function withoutSslMode(connectionString: string): string {
  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      "DATABASE_CA_CERT is set, but DATABASE_URL is not a URL " +
        "(`postgresql://…`). The key=value connection format cannot be used " +
        "together with a CA certificate — see CONTRIBUTING.md.",
    );
  }

  url.searchParams.delete("sslmode");
  return url.toString();
}
