import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildProject } from "../src/renderer.js";
import { verifyProject } from "../src/verify.js";
import { unzipSync, strFromU8 } from "fflate";
async function fixture(content) {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-editable-"));
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "Editable test",
      size: { width: 800, height: 450 },
      render: { scale: 1, timeoutMs: 15000 },
      slides: [{ id: "test", file: "page.html" }],
    }),
  );
  await writeFile(
    path.join(root, "page.html"),
    `<section class="slide" style="padding:32px;font-family:Arial"><h1 style="font-size:32px;letter-spacing:0">Editable title 中文</h1>${content}</section>`,
  );
  return root;
}
const boxes =
  '<div style="display:flex;gap:20px;margin-top:30px"><div style="background:#ffeecc;border:2px solid #663300;border-radius:12px;padding:20px"><p style="font-size:22px">Hello <b>world</b></p></div><canvas width="100" height="80" style="background:#aabbcc"></canvas></div>';
test("editable exports real text/shapes with local Canvas fallback and verifies", async () => {
  const root = await fixture(boxes);
  try {
    await buildProject(root, {
      formats: ["pptx", "pdf"],
      pptxMode: "editable",
    });
    const build = JSON.parse(
      await readFile(path.join(root, "dist/build.json")),
    );
    assert.equal(build.pptxMode, "editable");
    const report = JSON.parse(
      await readFile(path.join(root, "dist/conversion.json")),
    );
    assert.ok(report.slides[0].counts.text > 0);
    assert.ok(report.slides[0].counts.shape > 0);
    assert.equal(report.slides[0].counts.fallback, 1);
    const zip = unzipSync(await readFile(path.join(root, "dist/deck.pptx")));
    const xml = strFromU8(zip["ppt/slides/slide1.xml"]);
    assert.match(xml, /<a:t>Editable title 中文<\/a:t>/);
    assert.match(xml, /<a:t>world<\/a:t>/);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("default and explicit compatible export retain reference slide pixels", async () => {
  const root = await fixture(boxes);
  try {
    await buildProject(root, { formats: ["pptx"] });
    const a = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    await buildProject(root, { formats: ["pptx"], pptxMode: "compatible" });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    assert.equal(b.pptxMode, "compatible");
    assert.equal(a.slides[0].sha256, b.slides[0].sha256);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("invalid mode fails before replacing outputs", async () => {
  const root = await fixture("");
  try {
    await assert.rejects(
      buildProject(root, { formats: ["pptx"], pptxMode: "invalid" }),
      /PPTX mode/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editable mode retains native media after many shapes without duplicate object ids", async () => {
  const root = await fixture(
    '<p>Media remains native</p><video data-pptx-media src="assets/clip.mp4" poster="assets/poster.png" style="position:absolute;top:140px;left:40px;width:320px;height:180px"></video><img data-pptx-media src="assets/animation.gif" style="position:absolute;top:140px;left:420px;width:320px;height:180px">',
  );
  try {
    await cp(
      new URL("./fixtures/media/", import.meta.url),
      path.join(root, "assets"),
      { recursive: true },
    );
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("rich text wraps into visual lines; hidden and display:contents ancestors retain visible children", async () => {
  const root = await fixture(
    '<p style="width:180px;font-size:22px">First line and second <b>bold</b> end.</p><div style="visibility:hidden"><span style="visibility:visible">Visible descendant</span></div><div style="display:contents"><p>Boxless child</p></div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const c = JSON.parse(
      await readFile(path.join(root, "dist/conversion.json")),
    );
    assert.ok(c.slides[0].counts.text >= 4);
    assert.ok(
      c.slides[0].fallbacks.some(
        (f) => f.reason === "hidden-container-with-visible-descendant",
      ),
    );
    assert.ok(
      c.slides[0].fallbacks.some((f) => f.reason === "boxless-container"),
    );
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("scene asset corruption is detected", async () => {
  const root = await fixture(boxes);
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    await writeFile(path.join(root, "dist", b.slides[0].editable.file), "{}");
    await assert.rejects(verifyProject(root), /scene hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("changing native XML text is detected even if artifact hash is refreshed", async () => {
  const root = await fixture("<p>Distinct source text</p>");
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const { zipSync, strToU8 } = await import("fflate");
    const { createHash } = await import("node:crypto");
    const file = path.join(root, "dist/deck.pptx"),
      zip = unzipSync(await readFile(file));
    zip["ppt/slides/slide1.xml"] = strToU8(
      strFromU8(zip["ppt/slides/slide1.xml"]).replace(
        "Distinct source text",
        "Replaced source text",
      ),
    );
    const changed = zipSync(zip);
    await writeFile(file, changed);
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    b.artifacts[0].sha256 = createHash("sha256").update(changed).digest("hex");
    await writeFile(path.join(root, "dist/build.json"), JSON.stringify(b));
    await assert.rejects(verifyProject(root), /native text content/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("backdrop-dependent blending uses complete-scene fallback instead of isolated wrong colors", async () => {
  const root = await fixture(
    '<div style="width:200px;height:100px;background:blue;mix-blend-mode:multiply"></div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    const scene = JSON.parse(
      await readFile(path.join(root, "dist", b.slides[0].editable.file)),
    );
    assert.equal(scene.nodes.length, 1);
    assert.equal(scene.nodes[0].reason, "backdrop-dependent-compositing");
    assert.equal(scene.nodes[0].captureDocument, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("positioned overlay mixed with direct text is flattened in correct browser paint order", async () => {
  const root = await fixture(
    '<div style="position:relative;color:white"><span style="position:absolute;inset:0;background:red"></span>COVERED TEXT</div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    const scene = JSON.parse(
      await readFile(path.join(root, "dist", b.slides[0].editable.file)),
    );
    assert.ok(scene.nodes.some((n) => n.reason === "mixed-text-paint-order"));
    assert.ok(
      !scene.nodes.some((n) => n.type === "text" && n.text.includes("COVERED")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preformatted tab spacing is retained as a raster fallback", async () => {
  const root = await fixture('<pre style="font:24px monospace">A\tB</pre>');
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const c = JSON.parse(
      await readFile(path.join(root, "dist/conversion.json")),
    );
    assert.ok(
      c.slides[0].fallbacks.some((f) => f.reason === "preserved-tab-spacing"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
