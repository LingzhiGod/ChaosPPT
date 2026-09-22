#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.CHAOSPPT_ENGINE,
  path.resolve(here, "../assets/engine"),
  path.resolve(here, "../../.."),
].filter(Boolean);
const root = candidates.find((p) => existsSync(path.join(p, "src/cli.js")));
if (!root) {
  console.error(
    "ChaosPPT engine not found. Install the bundled skill or set CHAOSPPT_ENGINE to its repository.",
  );
  process.exit(2);
}
const child = spawn(
  process.execPath,
  [path.join(root, "src/cli.js"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 2;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
