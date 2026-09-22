import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateManifest, safeFile } from "../src/project.js";
const valid = () => ({
  version: 1,
  title: "中文",
  slides: [{ id: "intro", file: "slides/intro.html" }],
});
test("manifest defaults and slide order", () => {
  const d = validateManifest(valid());
  assert.equal(d.size.width, 1600);
  assert.equal(d.slides[0].id, "intro");
});
test("rejects duplicate ids, invalid sizes, unsafe references and unknown fields", () => {
  for (const v of [
    {
      ...valid(),
      slides: [
        { id: "x", file: "a.html" },
        { id: "x", file: "b.html" },
      ],
    },
    { ...valid(), size: { width: 0, height: 900 } },
    { ...valid(), slides: [{ id: "x", file: "../secret" }] },
    { ...valid(), typo: true },
  ])
    assert.throws(() => validateManifest(v));
});
test("safeFile rejects traversal and escaping symlinks", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "chaosppt-path-"));
  await writeFile(path.join(dir, "ok"), "ok");
  await symlink(tmpdir(), path.join(dir, "outside"));
  assert.equal(await safeFile(dir, "ok"), await realpath(path.join(dir, "ok")));
  await assert.rejects(safeFile(dir, "../bad"));
  await assert.rejects(safeFile(dir, "outside/test"));
});
