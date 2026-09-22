import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildProject, inspectProject } from "../src/renderer.js";
import { verifyProject } from "../src/verify.js";
import { unzipSync } from "fflate";
async function fixture(body) {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-media-"));
  await cp(
    new URL("./fixtures/media/", import.meta.url),
    path.join(root, "assets"),
    { recursive: true },
  );
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "Media",
      size: { width: 800, height: 450 },
      render: { timeoutMs: 15000, scale: 1 },
      slides: [{ id: "media", file: "page.html" }],
    }),
  );
  await writeFile(
    path.join(root, "page.html"),
    `<section class="slide" style="padding:30px"><h1 style="font-size:30px">Native media</h1>${body}</section>`,
  );
  return root;
}
const video =
  '<video data-pptx-media src="assets/clip.mp4" poster="assets/poster.png" style="position:absolute;left:30px;top:110px;width:320px;height:180px" controls></video>';
const gif =
  '<img data-pptx-media src="assets/animation.gif" style="position:absolute;left:420px;top:110px;width:320px;height:180px">';
test("MP4/GIF are embedded with original bytes; PDF remains static; verify checks geometry", async () => {
  const root = await fixture(video + gif);
  try {
    await buildProject(root, { formats: ["pdf", "pptx"] });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    assert.equal(b.slides[0].media.length, 2);
    assert.notEqual(b.slides[0].background.sha256, b.slides[0].sha256);
    const zip = unzipSync(await readFile(path.join(root, "dist/deck.pptx")));
    for (const file of ["clip.mp4", "animation.gif"]) {
      const bytes = await readFile(path.join(root, "assets", file));
      assert.ok(
        Object.values(zip).some((x) => Buffer.from(x).equals(bytes)),
        file,
      );
    }
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("missing poster fails instead of silently flattening video", async () => {
  const root = await fixture(video.replace(' poster="assets/poster.png"', ""));
  try {
    const r = await inspectProject(root);
    assert.ok(
      r.slides[0].issues.some((i) => i.code === "MEDIA_POSTER_REQUIRED"),
    );
    await assert.rejects(buildProject(root, { formats: ["pptx"] }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("GIF static frame is deterministic across builds", async () => {
  const root = await fixture(gif);
  try {
    await buildProject(root);
    const first = JSON.parse(
      await readFile(path.join(root, "dist/build.json")),
    );
    await buildProject(root);
    const second = JSON.parse(
      await readFile(path.join(root, "dist/build.json")),
    );
    assert.equal(first.slides[0].sha256, second.slides[0].sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("transformed, cropped, or foreground-covered media is rejected", async () => {
  for (const html of [
    gif.replace("width:320px", "transform:rotate(5deg);width:320px"),
    gif.replace("width:320px", "object-fit:cover;width:320px"),
    gif +
      '<div style="position:absolute;left:420px;top:110px;width:320px;height:180px;background:red">overlay</div>',
  ]) {
    const root = await fixture(html);
    try {
      const r = await inspectProject(root);
      assert.ok(
        r.slides[0].issues.some((i) =>
          ["MEDIA_STYLE", "MEDIA_OCCLUDED"].includes(i.code),
        ),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test("transparent GIF native background keeps CSS color but excludes first frame", async () => {
  const root = await fixture(
    gif
      .replace("animation.gif", "transparent.gif")
      .replace("width:320px", "background:rgb(10,20,30);width:320px"),
  );
  try {
    await buildProject(root, { formats: ["pptx"] });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    assert.equal(b.slides[0].media[0].kind, "gif");
    assert.notEqual(b.slides[0].background.sha256, b.slides[0].sha256);
    // Decode background pixels with the same browser PNG decoder; center of first-frame red box must be CSS background.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const bytes = await readFile(
        path.join(root, "dist", b.slides[0].background.file),
      );
      const pixel = await page.evaluate(
        async (src) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = 800;
          c.height = 450;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0);
          return [...ctx.getImageData(470, 190, 1, 1).data];
        },
        "data:image/png;base64," + bytes.toString("base64"),
      );
      assert.deepEqual(pixel, [10, 20, 30, 255]);
    } finally {
      await browser.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("media file tampering is caught by verify", async () => {
  const root = await fixture(gif);
  try {
    await buildProject(root, { formats: ["pptx"] });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    await writeFile(
      path.join(root, "dist", b.slides[0].media[0].file),
      "corrupt",
    );
    await assert.rejects(verifyProject(root), /Media hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pointer-events:none foreground overlays are diagnosed", async () => {
  const root = await fixture(
    gif +
      '<div style="pointer-events:none;position:absolute;left:480px;top:125px;width:120px;height:15px;background:blue">caption</div>',
  );
  try {
    const r = await inspectProject(root);
    assert.ok(r.slides[0].issues.some((i) => i.code === "MEDIA_OCCLUDED"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rounded clipping ancestor is rejected", async () => {
  const root = await fixture(
    '<div style="position:absolute;left:420px;top:110px;width:320px;height:180px;overflow:hidden;border-radius:8px"><img data-pptx-media src="assets/animation.gif" style="display:block;width:320px;height:180px"></div>',
  );
  try {
    const r = await inspectProject(root);
    assert.ok(r.slides[0].issues.some((i) => i.code === "MEDIA_STYLE"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("animated GIF video poster requires a static PNG/JPEG asset", async () => {
  const root = await fixture(video.replace("poster.png", "animation.gif"));
  try {
    const r = await inspectProject(root);
    assert.ok(
      r.slides[0].issues.some(
        (i) => i.code === "MEDIA_INVALID" && i.message.includes("PNG or JPEG"),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
