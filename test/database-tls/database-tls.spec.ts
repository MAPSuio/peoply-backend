/**
 * The test that would have caught the outage.
 *
 * After the Prisma 7 upgrade every production deploy failed with
 * `P1011 TlsConnectionError: self-signed certificate in certificate chain`,
 * and CI was green throughout — because CI's Postgres speaks plaintext, so
 * nothing in CI ever performed a TLS handshake. The unit tests in
 * `src/prisma/prisma.adapter.spec.ts` pin the shape of the config object; these
 * connect to a Postgres that actually presents a certificate signed by a
 * private CA, which is what the managed database in production does.
 *
 * The adapter is exercised directly rather than through `PrismaClient`. The
 * handshake happens in the adapter, and Prisma 7's client engine loads a WASM
 * module that Jest's VM refuses — going through the client would test Jest's
 * WebAssembly support, not our TLS configuration.
 *
 * The server is started by `test/database-tls/global-setup.js`.
 */

import { createPrismaAdapter } from "../../src/prisma/prisma.adapter";

const url = () => process.env.TLS_TEST_DATABASE_URL as string;

type Connection = Awaited<
  ReturnType<ReturnType<typeof createPrismaAdapter>["connect"]>
>;

/**
 * Opens the adapter. Note that this does not itself perform a handshake — the
 * adapter wraps a lazy `pg` pool, so the TLS negotiation happens on the first
 * query. Every assertion about the connection therefore has to run one.
 */
async function connect(databaseUrl: string, caCert?: string) {
  process.env.DATABASE_URL = databaseUrl;

  if (caCert) {
    process.env.DATABASE_CA_CERT = caCert;
  } else {
    delete process.env.DATABASE_CA_CERT;
  }

  return createPrismaAdapter().connect();
}

/** Reads the server's own view of the connection it is answering on. */
async function sslStatus(connection: Connection) {
  const result = await connection.queryRaw({
    sql: "SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()",
    args: [],
    argTypes: [],
  });

  const [row] = result.rows;
  return {
    ssl: row[result.columnNames.indexOf("ssl")] as boolean,
    version: row[result.columnNames.indexOf("version")] as string | null,
  };
}

describe("connecting to a Postgres behind a private CA", () => {
  const originalEnv = { ...process.env };
  let connection: Connection | undefined;

  afterEach(async () => {
    await connection?.dispose();
    connection = undefined;
    process.env = { ...originalEnv };
  });

  /**
   * Production's URL carries `sslmode=require`, and that parameter is what
   * broke the deploy: `pg` merges the parsed connection string over the config
   * object, so the `ssl` it derived from `sslmode` replaced the one carrying
   * our CA. This is the exact combination that failed.
   */
  it("encrypts the connection when the URL carries sslmode=require", async () => {
    connection = await connect(
      `${url()}?sslmode=require`,
      process.env.TLS_TEST_CA_CERT,
    );

    const status = await sslStatus(connection);

    expect(status.ssl).toBe(true);
    expect(status.version).toMatch(/^TLSv1\.[23]$/);
  });

  it("encrypts the connection when the URL carries no sslmode at all", async () => {
    connection = await connect(url(), process.env.TLS_TEST_CA_CERT);

    expect((await sslStatus(connection)).ssl).toBe(true);
  });

  /**
   * `normalisePem` looks like a cosmetic convenience until the PEM arrives
   * flattened, which is what any tool that stores the value on a single line
   * produces. Node rejects the escaped form as an unparseable certificate.
   */
  it("accepts a CA whose newlines arrived as the characters \\n", async () => {
    const escaped = (process.env.TLS_TEST_CA_CERT as string).replace(
      /\n/g,
      "\\n",
    );

    connection = await connect(`${url()}?sslmode=require`, escaped);

    expect((await sslStatus(connection)).ssl).toBe(true);
  });

  /**
   * Encryption without verification is the failure mode nobody notices: the
   * connection succeeds, `pg_stat_ssl` says `true`, and any server that can
   * intercept the route is trusted. Handing the client the wrong CA must be
   * a refusal.
   */
  it("refuses a server whose certificate was signed by a different CA", async () => {
    connection = await connect(
      `${url()}?sslmode=require`,
      process.env.TLS_TEST_UNRELATED_CA_CERT,
    );

    await expect(sslStatus(connection)).rejects.toThrow(/TlsConnectionError/);
  });

  /**
   * Documents why `DATABASE_CA_CERT` is required in production rather than
   * being optional hardening: without it the driver falls back to the system
   * trust store, which does not contain the managed database's private CA.
   * This reproduces the deploy failure.
   */
  it("fails without a CA, the way production failed", async () => {
    connection = await connect(`${url()}?sslmode=require`);

    await expect(sslStatus(connection)).rejects.toThrow(/TlsConnectionError/);
  });
});
