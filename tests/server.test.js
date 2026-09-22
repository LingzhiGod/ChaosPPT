import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startServer } from "../src/server.js";
test("server serves ordered slides and rejects root escape, hidden files and foreign hosts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-server-"));
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "Test",
      slides: [{ id: "first", file: "a.html" }],
    }),
  );
  await writeFile(
    path.join(root, "a.html"),
    '<section class="slide">你好</section>',
  );
  await writeFile(path.join(root, ".secret"), "secret");
  await symlink("/etc/hosts", path.join(root, "outside"));
  const s = await startServer(root);
  try {
    assert.equal((await fetch(s.url + "/")).status, 200);
    assert.match(
      await (await fetch(s.url + "/slide/first")).text(),
      /Chaos|__CHAOSPPT_CONFIG__/,
    );
    assert.equal((await fetch(s.url + "/files/outside")).status, 400);
    assert.equal((await fetch(s.url + "/files/.secret")).status, 400);
    assert.equal((await fetch(s.url + "/files/%2e%2e%2fsecret")).status, 400);
    assert.equal(
      await new Promise((resolve) => {
        http.get(
          s.url + "/api/deck",
          { headers: { Host: "evil.example:80" } },
          (r) => {
            r.resume();
            resolve(r.statusCode);
          },
        );
      }),
      403,
    );
  } finally {
    await s.close();
  }
});
