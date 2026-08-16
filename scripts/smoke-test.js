const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const START_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 2000;
const PORT = process.env.SMOKE_TEST_PORT || "3100";
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** The endpoint we poll to decide the process has finished starting. */
const LIVENESS_URL = `${BASE_URL}/_health`;

/**
 * Asserted once the process is up. `/readiness` is the one that earns its
 * keep: the database driver connects lazily, so a build whose database
 * configuration is broken still boots and still serves the docs page. Before
 * this ran here, CI called that a pass.
 */
const REQUIRED_URLS = [`${BASE_URL}/readiness`, `${BASE_URL}/api/`];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });

    req.on("error", reject);
  });
}

function redirectFor(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ status: res.statusCode || 0, location: res.headers.location });
    });

    req.on("error", reject);
  });
}

/**
 * Checks the shape of the authorization request the app would send a user to.
 *
 * `GET /auth/login` answering 302 proves only that we replied. It does not say
 * whether the provider will accept what we built, and reading it as "login
 * works" is exactly how three defects reached production in one day.
 *
 * Two of the three are visible right here, in our own redirect, without
 * calling the provider at all. openid-client v6 omits `state` for a provider
 * that advertises PKCE; Vipps requires it and answers a request without one by
 * sending the user to an error page. A missing `code_challenge` would mean
 * PKCE had silently stopped being applied.
 */
async function assertAuthorizationRequest() {
  for (const path of ["/auth/login", "/auth/login/google"]) {
    const { status, location } = await redirectFor(`${BASE_URL}${path}`);

    if (status !== 302 || !location) {
      throw new Error(`${path} answered HTTP ${status} without a redirect`);
    }

    const params = new URL(location).searchParams;

    for (const required of ["state", "code_challenge", "redirect_uri"]) {
      if (!params.get(required)) {
        throw new Error(
          `${path} built an authorization request with no ${required}: ${location}`,
        );
      }
    }

    console.log(`${path} -> 302 with state, PKCE and redirect_uri`);
  }
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const status = await request(LIVENESS_URL);
      if (status >= 200 && status < 400) {
        return status;
      }
    } catch {
      // Server is still starting.
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error(`Backend did not become reachable at ${LIVENESS_URL}`);
}

async function assertServing() {
  for (const url of REQUIRED_URLS) {
    const status = await request(url);

    if (status < 200 || status >= 400) {
      throw new Error(`${url} answered HTTP ${status}`);
    }

    console.log(`${url} -> HTTP ${status}`);
  }

  await assertAuthorizationRequest();
}

async function main() {
  let childExited = false;
  const entryFile = path.resolve(__dirname, "..", "dist", "src", "main.js");
  const child = spawn(process.execPath, [entryFile], {
    env: {
      ...process.env,
      PORT,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    logs += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    logs += text;
    process.stderr.write(text);
  });

  const childExit = new Promise((_, reject) => {
    child.on("exit", (code, signal) => {
      childExited = true;
      reject(
        new Error(
          `Backend process exited before becoming ready (code: ${code}, signal: ${signal})`,
        ),
      );
    });
    child.on("error", (error) => {
      childExited = true;
      reject(error);
    });
  });

  const stopChild = () => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  };

  const childClosed = new Promise((resolve) => {
    child.on("close", resolve);
  });

  process.on("exit", stopChild);
  process.on("SIGINT", () => {
    stopChild();
    process.exit(1);
  });
  process.on("SIGTERM", () => {
    stopChild();
    process.exit(1);
  });

  try {
    await Promise.race([waitForServer(), childExit]);
    await Promise.race([assertServing(), childExit]);
    console.log("Smoke test passed.");
  } catch (error) {
    stopChild();
    await wait(1000);
    console.error("Smoke test failed.");
    if (logs.trim()) {
      console.error(logs);
    }
    throw error;
  }

  if (!childExited) {
    stopChild();
  }
  await Promise.race([childClosed, wait(5000)]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
