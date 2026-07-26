const { start } = require("./tls-postgres");

module.exports = async function globalSetup() {
  const server = await start();

  // Jest workers inherit this process's environment, so the tests read the
  // connection details from here rather than from a file on disk.
  process.env.TLS_TEST_DATABASE_URL = server.url;
  process.env.TLS_TEST_CA_CERT = server.caCert;
  process.env.TLS_TEST_UNRELATED_CA_CERT = server.unrelatedCaCert;

  globalThis.__TLS_POSTGRES__ = server;
};
