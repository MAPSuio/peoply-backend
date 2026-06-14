const path = require("path");
const { spawn } = require("child_process");

const { getNodeProcessEnvironment } = require("./run-dev");

function getStartNodeCommand({ currentExecPath = process.execPath } = {}) {
  return currentExecPath;
}

function runStart() {
  const nodeCommand = getStartNodeCommand();
  const entryFile = path.resolve(__dirname, "..", "dist", "src", "main.js");

  const child = spawn(nodeCommand, [entryFile], {
    stdio: "inherit",
    env: getNodeProcessEnvironment(nodeCommand),
  });

  child.on("error", (error) => {
    console.error("Failed to start backend server.", error);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

if (require.main === module) {
  runStart();
}

module.exports = {
  getStartNodeCommand,
};
