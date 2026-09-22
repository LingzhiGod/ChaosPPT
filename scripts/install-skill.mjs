#!/usr/bin/env node
import { cp, mkdir, mkdtemp, rename, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.resolve(
  process.argv[2] ||
    path.join(
      process.env.CODEX_HOME || path.join(homedir(), ".codex"),
      "skills/chaosppt",
    ),
);
let temp;
try {
  if (
    await lstat(destination).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    })
  )
    throw new Error(
      "Destination already exists; choose an empty destination to preserve existing skills",
    );
  await mkdir(path.dirname(destination), { recursive: true });
  temp = await mkdtemp(
    path.join(path.dirname(destination), ".chaosppt-install-"),
  );
  await cp(path.join(root, "skills/chaosppt"), temp, { recursive: true });
  const engine = path.join(temp, "assets/engine");
  await mkdir(engine, { recursive: true });
  for (const name of [
    "src",
    "assets",
    "templates",
    "package.json",
    "package-lock.json",
  ])
    await cp(path.join(root, name), path.join(engine, name), {
      recursive: true,
    });
  const run = (program, args) => {
    const p = spawnSync(program, args, { cwd: engine, stdio: "inherit" });
    if (p.error) throw p.error;
    if (p.status !== 0)
      throw new Error(`${program} failed with status ${p.status}`);
  };
  run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "ci",
    "--omit=dev",
    "--ignore-scripts",
    "--cache",
    path.join(tmpdir(), "chaosppt-npm-cache"),
  ]);
  run(process.execPath, [
    path.join(engine, "node_modules/playwright/cli.js"),
    "install",
    "chromium",
  ]);
  await rename(temp, destination);
  temp = null;
  console.log(JSON.stringify({ ok: true, skill: destination }));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (temp) await rm(temp, { recursive: true, force: true });
}
