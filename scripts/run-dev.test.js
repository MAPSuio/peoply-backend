const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { getNodeProcessEnvironment, resolveNodeCommand } = require("./run-dev");
const { getStartNodeCommand } = require("./run-start");

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

runTest("uses current node when major version matches", () => {
  const nodePath = resolveNodeCommand({
    currentVersion: "v16.20.2",
    currentExecPath: "/tmp/current-node",
    requiredVersion: "16.20.2",
    homeDir: "/tmp/home",
  });

  assert.strictEqual(nodePath, "/tmp/current-node");
});

runTest("falls back to nvm node binary when current version mismatches", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "peoply-node-"));
  const nodePath = path.join(
    homeDir,
    ".nvm",
    "versions",
    "node",
    "v16.20.2",
    "bin",
    "node",
  );

  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(nodePath, "#!/usr/bin/env node\n");

  const resolvedPath = resolveNodeCommand({
    currentVersion: "v25.8.1",
    currentExecPath: "/tmp/current-node",
    requiredVersion: "16.20.2",
    homeDir,
  });

  assert.strictEqual(resolvedPath, nodePath);
});

runTest("throws a helpful error when no compatible node is available", () => {
  assert.throws(
    () =>
      resolveNodeCommand({
        currentVersion: "v25.8.1",
        currentExecPath: "/tmp/current-node",
        requiredVersion: "16.20.2",
        homeDir: "/tmp/missing-home",
      }),
    /Backend dev requires Node 16.20.2/,
  );
});

runTest("prepends the selected node directory to PATH", () => {
  const env = getNodeProcessEnvironment("/tmp/node16/bin/node", {
    PATH: "/usr/bin:/bin",
  });

  assert.strictEqual(env.PATH, "/tmp/node16/bin:/usr/bin:/bin");
});

runTest("uses the current runtime node for production start", () => {
  const nodePath = getStartNodeCommand({
    currentExecPath: "/tmp/current-node",
  });

  assert.strictEqual(nodePath, "/tmp/current-node");
});
