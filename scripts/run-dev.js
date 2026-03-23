const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function normalizeVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^v/, "");
}

function getMajorVersion(version) {
  return normalizeVersion(version).split(".")[0];
}

function getRequiredNodeVersion() {
  const nvmrcPath = path.resolve(__dirname, "..", ".nvmrc");
  return normalizeVersion(fs.readFileSync(nvmrcPath, "utf8"));
}

function resolveNodeCommand({
  currentVersion = process.version,
  currentExecPath = process.execPath,
  homeDir = process.env.HOME,
  requiredVersion = getRequiredNodeVersion(),
} = {}) {
  if (getMajorVersion(currentVersion) === getMajorVersion(requiredVersion)) {
    return currentExecPath;
  }

  const nvmNodePath = path.join(
    homeDir || "",
    ".nvm",
    "versions",
    "node",
    `v${requiredVersion}`,
    "bin",
    "node",
  );

  if (homeDir && fs.existsSync(nvmNodePath)) {
    return nvmNodePath;
  }

  throw new Error(
    [
      `Backend dev requires Node ${requiredVersion}.`,
      `Current runtime is ${normalizeVersion(currentVersion)}.`,
      `Install it with \`nvm install ${requiredVersion}\` and switch using \`nvm use ${requiredVersion}\`.`,
    ].join(" "),
  );
}

function getNodeProcessEnvironment(nodeCommand, env = process.env) {
  return {
    ...env,
    PATH: `${path.dirname(nodeCommand)}${path.delimiter}${env.PATH || ""}`,
  };
}

function runDev() {
  const nodeCommand = resolveNodeCommand();
  const nestCliPath = path.resolve(
    __dirname,
    "..",
    "node_modules",
    "@nestjs",
    "cli",
    "bin",
    "nest.js",
  );

  const child = spawn(nodeCommand, [nestCliPath, "start", "--watch"], {
    stdio: "inherit",
    env: getNodeProcessEnvironment(nodeCommand),
  });

  child.on("error", (error) => {
    console.error("Failed to start backend dev server.", error);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  runDev();
}

module.exports = {
  getNodeProcessEnvironment,
  getMajorVersion,
  normalizeVersion,
  resolveNodeCommand,
};
