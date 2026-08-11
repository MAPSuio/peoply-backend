/**
 * Starts a throwaway Postgres that speaks TLS with a certificate signed by a
 * private CA, which is the one property of production our other test databases
 * do not have.
 *
 * CI and the local dev database both run Postgres over plaintext, so the whole
 * TLS path — the CA handling in `createPrismaAdapter`, the `sslmode` strip, the
 * PEM normalisation — was never executed anywhere before a deploy. That is how
 * `P1011 TlsConnectionError: self-signed certificate in certificate chain`
 * reached production with CI fully green.
 *
 * The certificates are generated on every run and thrown away with the
 * container. Nothing here is committed, so there is no key material in the
 * repository and nothing to rotate.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("pg");

const IMAGE = "postgres:16";
const USER = "tlstest";
const PASSWORD = "tlstest";
const DATABASE = "tlstest";

// Use the same IPv4 address Docker publishes below. It is present in the
// certificate SAN, so hostname verification remains active without relying on
// each runner's localhost IPv4/IPv6 resolution order.
const HOSTNAME = "127.0.0.1";

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options });
}

function requireDocker() {
  try {
    run("docker", ["info"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "Docker is not available. The database TLS tests need it to start a " +
        "Postgres with a private CA; run them with Docker Desktop started, " +
        "or let CI run them.",
    );
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Issues a self-signed CA plus a server certificate signed by it. The second,
 * unrelated CA exists so a test can prove the client actually verifies the
 * chain rather than accepting whatever it is handed.
 */
function generateCertificates(dir) {
  const at = (name) => path.join(dir, name);
  const subject = (cn) => ["-subj", `/CN=${cn}`];

  const newCa = (prefix, cn) =>
    run("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
      "-days", "1",
      "-keyout", at(`${prefix}.key`),
      "-out", at(`${prefix}.crt`),
      ...subject(cn),
    ], { stdio: ["ignore", "ignore", "pipe"] });

  newCa("ca", "peoply-test-ca");
  newCa("other-ca", "peoply-unrelated-ca");

  run("openssl", [
    "req", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-keyout", at("server.key"),
    "-out", at("server.csr"),
    ...subject(HOSTNAME),
  ], { stdio: ["ignore", "ignore", "pipe"] });

  fs.writeFileSync(
    at("server.ext"),
    "subjectAltName=DNS:localhost,IP:127.0.0.1\n",
  );

  run("openssl", [
    "x509", "-req", "-sha256", "-days", "1",
    "-in", at("server.csr"),
    "-CA", at("ca.crt"),
    "-CAkey", at("ca.key"),
    "-CAcreateserial",
    "-extfile", at("server.ext"),
    "-out", at("server.crt"),
  ], { stdio: ["ignore", "ignore", "pipe"] });

  return {
    caCert: fs.readFileSync(at("ca.crt"), "utf8"),
    unrelatedCaCert: fs.readFileSync(at("other-ca.crt"), "utf8"),
  };
}

/**
 * The postgres image refuses to start if the private key is group- or
 * world-readable, and a bind mount keeps the host's ownership. Copying the
 * material to container-owned paths before handing control back to the normal
 * entrypoint is cheaper than building an image for it.
 */
const BOOT = [
  "install -o postgres -g postgres -m 600 /certs/server.key /var/lib/postgresql/server.key",
  "install -o postgres -g postgres -m 644 /certs/server.crt /var/lib/postgresql/server.crt",
  "exec docker-entrypoint.sh postgres" +
    " -c ssl=on" +
    " -c ssl_cert_file=/var/lib/postgresql/server.crt" +
    " -c ssl_key_file=/var/lib/postgresql/server.key",
].join(" && ");

async function waitUntilAccepting(container, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      run("docker", ["exec", container, "pg_isready", "-U", USER, "-d", DATABASE], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  let logs = "";
  try {
    logs = run("docker", ["logs", "--tail", "40", container], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    /* the container may already be gone; the timeout is the real message */
  }

  throw new Error(`Postgres did not accept connections in time.\n${logs}`);
}

async function waitUntilTlsReady(container, port, caCert, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  const connectionString = `postgresql://${USER}:${PASSWORD}@${HOSTNAME}:${port}/${DATABASE}`;
  let lastError;

  while (Date.now() < deadline) {
    const client = new Client({
      connectionString,
      ssl: { ca: caCert, rejectUnauthorized: true },
    });

    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  let logs = "";
  try {
    logs = run("docker", ["logs", "--tail", "40", container], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    /* preserve the TLS readiness failure when the container is unavailable */
  }
  throw new Error(
    `Postgres TLS endpoint did not become ready: ${lastError}\n${logs}`,
  );
}

async function start() {
  requireDocker();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peoply-tls-"));
  const { caCert, unrelatedCaCert } = generateCertificates(dir);
  const port = await freePort();
  const container = `peoply-tls-test-${port}`;

  run("docker", [
    "run", "--detach", "--rm",
    "--name", container,
    "--publish", `127.0.0.1:${port}:5432`,
    "--env", `POSTGRES_USER=${USER}`,
    "--env", `POSTGRES_PASSWORD=${PASSWORD}`,
    "--env", `POSTGRES_DB=${DATABASE}`,
    "--volume", `${dir}:/certs:ro`,
    IMAGE,
    "bash", "-c", BOOT,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  try {
    await waitUntilAccepting(container);
    // Docker can report the database ready before its published TLS endpoint
    // accepts complete PostgreSQL sessions. Exercise that exact path before
    // Jest starts, rather than racing it with the first assertion.
    await waitUntilTlsReady(container, port, caCert);
  } catch (error) {
    stop({ container, dir });
    throw error;
  }

  return {
    container,
    dir,
    caCert,
    unrelatedCaCert,
    url: `postgresql://${USER}:${PASSWORD}@${HOSTNAME}:${port}/${DATABASE}`,
  };
}

function stop(server) {
  if (!server) return;

  try {
    run("docker", ["rm", "--force", server.container], {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch {
    /* already gone */
  }

  fs.rmSync(server.dir, { recursive: true, force: true });
}

module.exports = { start, stop };
