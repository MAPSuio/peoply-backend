const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { getNodeProcessEnvironment, resolveNodeCommand } = require("./run-dev");

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

runTest("starts production without a wrapper process", () => {
  const packageJsonPath = path.resolve(__dirname, "..", "package.json");
  const { scripts } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  assert.strictEqual(scripts.start, "node dist/src/main.js");
});

function packageNameOf(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
}

function runtimeSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(entryPath);
    const isTest = entry.name.endsWith(".spec.ts");
    return entry.name.endsWith(".ts") && !isTest ? [entryPath] : [];
  });
}

function devDependenciesImportedByRuntimeCode(projectRoot) {
  const { devDependencies } = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const importPattern = /(?:from|require\()\s*["']([^"']+)["']/g;

  return runtimeSourceFiles(path.join(projectRoot, "src")).flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    return [...source.matchAll(importPattern)]
      .map((match) => match[1])
      .filter(
        (specifier) =>
          !specifier.startsWith(".") && !specifier.startsWith("node:"),
      )
      .map(packageNameOf)
      .filter((name) => name in devDependencies)
      .map((name) => `${name} imported by ${path.relative(projectRoot, file)}`);
  });
}

runTest("no runtime source imports a dev dependency", () => {
  const projectRoot = path.resolve(__dirname, "..");

  assert.deepStrictEqual(devDependenciesImportedByRuntimeCode(projectRoot), []);
});

runTest("the production build drops dev dependencies from the image", () => {
  const packageJsonPath = path.resolve(__dirname, "..", "package.json");
  const { scripts } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  assert.strictEqual(
    scripts["build:prod"],
    "npm run build && npm prune --omit=dev",
  );
});
