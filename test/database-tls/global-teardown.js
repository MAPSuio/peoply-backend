const { stop } = require("./tls-postgres");

module.exports = async function globalTeardown() {
  stop(globalThis.__TLS_POSTGRES__);
};
