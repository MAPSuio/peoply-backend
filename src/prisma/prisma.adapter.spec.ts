/**
 * These tests exist because of a production incident that CI could not have
 * caught: after the Prisma 7 upgrade every deploy failed with
 * `P1011 TlsConnectionError: self-signed certificate in certificate chain`,
 * while CI stayed green throughout. CI talks to a plaintext Postgres, so the
 * TLS path is never executed there.
 *
 * They cannot prove the app reaches a managed database — only an integration
 * test against a TLS-enabled server can do that. What they do is pin the two
 * behaviours whose absence caused, and then nearly re-caused, the outage:
 * `sslmode` must be stripped from the URL, and an escaped PEM must be
 * un-escaped. Both are silent when wrong.
 */

const constructed: unknown[] = [];

jest.mock("@prisma/adapter-pg", () => ({
  PrismaPg: jest.fn().mockImplementation((config: unknown) => {
    constructed.push(config);
    return { config };
  }),
}));

import { createPrismaAdapter } from "./prisma.adapter";

type AdapterConfig = {
  connectionString: string;
  ssl?: { ca: string; rejectUnauthorized: boolean };
};

const lastConfig = () => constructed[constructed.length - 1] as AdapterConfig;

const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";

describe("createPrismaAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    constructed.length = 0;
    process.env = { ...originalEnv };
    delete process.env.DATABASE_CA_CERT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("throws a pointed error when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    expect(() => createPrismaAdapter()).toThrow(/DATABASE_URL is not set/);
  });

  describe("without a CA certificate", () => {
    it("passes the connection string through untouched", () => {
      process.env.DATABASE_URL = "postgresql://u:p@host:5432/db?schema=public";
      createPrismaAdapter();

      expect(lastConfig().connectionString).toBe(
        "postgresql://u:p@host:5432/db?schema=public",
      );
      expect(lastConfig().ssl).toBeUndefined();
    });

    it("leaves sslmode alone — without a CA there is nothing to protect", () => {
      process.env.DATABASE_URL =
        "postgresql://u:p@host:5432/db?sslmode=require";
      createPrismaAdapter();

      expect(lastConfig().connectionString).toContain("sslmode=require");
    });
  });

  describe("with a CA certificate", () => {
    beforeEach(() => {
      process.env.DATABASE_CA_CERT = PEM;
    });

    /**
     * The regression guard. `pg` merges the parsed connection string over the
     * config object:
     *
     *     config = Object.assign({}, config, parse(config.connectionString))
     *
     * so any `sslmode` at all makes `parse()` emit an `ssl` key that replaces
     * ours, discarding the CA. The failure is indistinguishable from having
     * configured no CA — which is exactly how the incident presented.
     */
    it("strips sslmode so the CA is not clobbered by pg's config merge", () => {
      process.env.DATABASE_URL =
        "postgresql://u:p@host:25060/defaultdb?sslmode=require";
      createPrismaAdapter();

      expect(lastConfig().connectionString).not.toContain("sslmode");
    });

    it.each([
      "postgresql://u:p@host:25060/db?sslmode=require",
      "postgresql://u:p@host:25060/db?sslmode=verify-full",
      "postgresql://u:p@host:25060/db?sslmode=disable",
      "postgresql://u:p@host:25060/db?schema=public&sslmode=require",
    ])("strips sslmode from %s", (url) => {
      process.env.DATABASE_URL = url;
      createPrismaAdapter();

      expect(lastConfig().connectionString).not.toContain("sslmode");
    });

    it("keeps every other query parameter", () => {
      process.env.DATABASE_URL =
        "postgresql://u:p@host:25060/db?schema=public&sslmode=require&connection_limit=5";
      createPrismaAdapter();

      const url = new URL(lastConfig().connectionString);
      expect(url.searchParams.get("schema")).toBe("public");
      expect(url.searchParams.get("connection_limit")).toBe("5");
      expect(url.searchParams.get("sslmode")).toBeNull();
    });

    it("keeps host, port, database and credentials intact", () => {
      process.env.DATABASE_URL =
        "postgresql://user:pa%24%24@db.example.com:25060/defaultdb?sslmode=require";
      createPrismaAdapter();

      const url = new URL(lastConfig().connectionString);
      expect(url.hostname).toBe("db.example.com");
      expect(url.port).toBe("25060");
      expect(url.pathname).toBe("/defaultdb");
      expect(url.username).toBe("user");
      expect(url.password).toBe("pa%24%24");
    });

    it("verifies the chain rather than merely encrypting", () => {
      process.env.DATABASE_URL =
        "postgresql://u:p@host:25060/db?sslmode=require";
      createPrismaAdapter();

      expect(lastConfig().ssl?.rejectUnauthorized).toBe(true);
    });

    it("passes a real-newline PEM through unchanged", () => {
      process.env.DATABASE_URL = "postgresql://u:p@host:25060/db";
      createPrismaAdapter();

      expect(lastConfig().ssl?.ca).toBe(PEM);
    });

    /**
     * Anything that flattens the variable to a single line turns the newlines
     * into a literal backslash-n. Node's TLS stack rejects that as an
     * unparseable certificate, and the value looks correct when read back out
     * of the environment.
     */
    it("un-escapes a PEM whose newlines arrived as the characters \\n", () => {
      process.env.DATABASE_URL = "postgresql://u:p@host:25060/db";
      process.env.DATABASE_CA_CERT = PEM.replace(/\n/g, "\\n");
      createPrismaAdapter();

      expect(lastConfig().ssl?.ca).toBe(PEM);
      expect(lastConfig().ssl?.ca).not.toContain("\\n");
    });

    it("rejects the key=value connection format, which cannot carry a CA", () => {
      process.env.DATABASE_URL = "host=localhost port=5432 dbname=db";
      expect(() => createPrismaAdapter()).toThrow(/not a URL/);
    });
  });
});
