// Explicit HTTPS mode; keep the normal HTTP dev command for localhost/tests.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { httpsDevConfig } from "./https-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
try {
  const config = httpsDevConfig(root, process.env, process.argv.slice(2));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), ...config.args], {
    cwd: root, env: config.env, stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.once("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.once("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1); });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
