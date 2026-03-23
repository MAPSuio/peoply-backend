const path = require("path");
const { spawn } = require("child_process");

const { getNodeProcessEnvironment, resolveNodeCommand } = require("./run-dev");

function runStart() {
  const nodeCommand = resolveNodeCommand();
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
