import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { engineRoot } from "../src/project.js";
for (const args of [
  ["inspect", "missing", "--unknown", "--json"],
  ["export", "missing", "--slides", "one", "--json"],
  ["render", "missing", "--scale", "0", "--json"],
  ["unknown", "missing", "--json"],
]) {
  test(`CLI structured usage failure: ${args.join(" ")}`, () => {
    const p = spawnSync(
      process.execPath,
      [path.join(engineRoot, "src/cli.js"), ...args],
      { encoding: "utf8" },
    );
    assert.equal(p.status, 2);
    assert.equal(JSON.parse(p.stdout).ok, false);
  });
}
test("CLI prints supported commands in help", () => {
  const p = spawnSync(
    process.execPath,
    [path.join(engineRoot, "src/cli.js"), "--help"],
    { encoding: "utf8" },
  );
  assert.equal(p.status, 0);
  for (const command of [
    "init",
    "dev",
    "inspect",
    "render",
    "export",
    "verify",
  ])
    assert.ok(p.stdout.includes(command));
});
