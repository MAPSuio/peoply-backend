const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const START_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 2000;
const PORT = process.env.SMOKE_TEST_PORT || "3100";
const TARGET_URL = `http://127.0.0.1:${PORT}/api/`;

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

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const status = await request(TARGET_URL);
      if (status >= 200 && status < 400) {
        return status;
      }
    } catch {
      // Server is still starting.
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error(`Backend did not become reachable at ${TARGET_URL}`);
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
    const status = await Promise.race([waitForServer(), childExit]);
    console.log(`Smoke test passed with HTTP ${status}`);
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
