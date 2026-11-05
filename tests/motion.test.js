import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { buildProject, inspectProject } from "../src/renderer.js";
import { verifyProject } from "../src/verify.js";
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-motion-"));
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "Motion",
      size: { width: 800, height: 450 },
      render: { scale: 1 },
      slides: [{ id: "one", file: "one.html" }],
    }),
  );
  return root;
}
const html =
  '<section class="slide" data-pptx-layout="controls"><div data-pptx="group" data-pptx-id="card" data-pptx-motion=\'{"effect":"fly-in","direction":"left","durationMs":500}\' style="width:400px;height:160px"><div data-pptx="text" data-pptx-id="body">Animated group</div></div><div data-pptx="shape" data-pptx-id="bar" data-pptx-motion=\'{"effect":"reveal-in","direction":"left","trigger":"after-previous","durationMs":700}\' style="width:300px;height:25px;background:red"></div></section>';
test("group entrance and bar reveal are native timing, with hashed motion receipts", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "one.html"), html);
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const zip = unzipSync(await readFile(path.join(root, "dist/deck.pptx"))),
      xml = strFromU8(zip["ppt/slides/slide1.xml"]);
    assert.match(xml, /presetID="2"/);
    assert.match(xml, /wipe\(left\)/);
    assert.match(xml, /p:timing/);
    const receipt = JSON.parse(
      await readFile(path.join(root, "dist/motion.json")),
    );
    assert.equal(receipt.applied[0].events.length, 2);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("compatibility export requires explicit static mode when controls have animation", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "one.html"), html);
    await assert.rejects(buildProject(root, { formats: ["pptx"] }));
    await buildProject(root, { formats: ["pptx"], motionMode: "static" });
    const zip = unzipSync(await readFile(path.join(root, "dist/deck.pptx")));
    assert.doesNotMatch(strFromU8(zip["ppt/slides/slide1.xml"]), /p:timing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Morph matches explicit shared keys across native groups", async () => {
  const root = await fixture();
  try {
    const d = JSON.parse(await readFile(path.join(root, "deck.json")));
    d.slides.push({
      id: "two",
      file: "two.html",
      transition: { effect: "morph", durationMs: 800 },
    });
    await writeFile(path.join(root, "deck.json"), JSON.stringify(d));
    for (const [file, x] of [
      ["one.html", 60],
      ["two.html", 300],
    ])
      await writeFile(
        path.join(root, file),
        `<section class="slide" data-pptx-layout="controls"><div data-pptx-group="card" data-pptx-shared="main-card" style="position:absolute;left:${x}px;top:100px;width:250px;height:160px"><div data-pptx="text" data-pptx-id="title">Shared card</div></div></section>`,
      );
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const zip = unzipSync(await readFile(path.join(root, "dist/deck.pptx")));
    for (const n of [1, 2])
      assert.match(
        strFromU8(zip[`ppt/slides/slide${n}.xml`]),
        /!!chaosppt-shared-main-card/,
      );
    assert.match(strFromU8(zip["ppt/slides/slide2.xml"]), /p159:morph/);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("unknown effects and overlapping group/child animations fail inspection", async () => {
  const root = await fixture();
  try {
    await writeFile(
      path.join(root, "one.html"),
      html.replace('"fly-in"', '"bounce"'),
    );
    const r = await inspectProject(root);
    assert.ok(r.slides[0].issues.some((i) => i.code === "MOTION_INVALID"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native duration tampering is caught even after refreshing the outer PPTX hash", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "one.html"), html);
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const { zipSync, strToU8 } = await import("fflate"),
      { createHash } = await import("node:crypto");
    const file = path.join(root, "dist/deck.pptx"),
      zip = unzipSync(await readFile(file));
    zip["ppt/slides/slide1.xml"] = strToU8(
      strFromU8(zip["ppt/slides/slide1.xml"]).replace('dur="700"', 'dur="701"'),
    );
    const bytes = zipSync(zip);
    await writeFile(file, bytes);
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    b.artifacts[0].sha256 = createHash("sha256").update(bytes).digest("hex");
    await writeFile(path.join(root, "dist/build.json"), JSON.stringify(b));
    await assert.rejects(verifyProject(root), /motion duration/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("every supported effect family and direction produces checked native behaviors", async () => {
  const root = await fixture();
  try {
    const effects = [
      "fade-in",
      "fade-out",
      "fly-in",
      "fly-out",
      "reveal-in",
      "reveal-out",
    ];
    let body = "";
    let i = 0;
    for (const effect of effects)
      for (const direction of effect.startsWith("fade")
        ? [undefined]
        : ["left", "right", "up", "down"]) {
        const motion = {
          effect,
          direction,
          trigger: "on-click",
          durationMs: 250,
        };
        body += `<div data-pptx="shape" data-pptx-id="s${i}" data-pptx-motion='${JSON.stringify(motion)}' style="position:absolute;left:${20 + (i % 5) * 140}px;top:${20 + Math.floor(i / 5) * 70}px;width:100px;height:35px;background:#334455"></div>`;
        i++;
      }
    await writeFile(
      path.join(root, "one.html"),
      `<section class="slide" data-pptx-layout="controls">${body}</section>`,
    );
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ancestor/descendant effects and duplicate shared keys are rejected", async () => {
  const root = await fixture();
  try {
    for (const body of [
      html.replace(
        'data-pptx-id="body"',
        `data-pptx-id="body" data-pptx-motion='{"effect":"fade-in"}'`,
      ),
      '<section class="slide" data-pptx-layout="controls"><div data-pptx="text" data-pptx-id="a" data-pptx-shared="duplicate">A</div><div data-pptx="text" data-pptx-id="b" data-pptx-shared="duplicate">B</div></section>',
    ]) {
      await writeFile(path.join(root, "one.html"), body);
      const r = await inspectProject(root);
      assert.ok(r.slides[0].issues.some((i) => i.code === "MOTION_INVALID"));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("static references are identical with native effects preserved or explicitly flattened", async () => {
  const root = await fixture();
  try {
    await writeFile(path.join(root, "one.html"), html);
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const a = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    await buildProject(root, {
      formats: ["pptx"],
      pptxMode: "compatible",
      motionMode: "static",
    });
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    assert.equal(a.slides[0].sha256, b.slides[0].sha256);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("page Fade is supported in compatible output without per-control effects", async () => {
  const root = await fixture();
  try {
    const d = JSON.parse(await readFile(path.join(root, "deck.json")));
    d.slides[0].transition = { effect: "fade", durationMs: 350 };
    await writeFile(path.join(root, "deck.json"), JSON.stringify(d));
    await writeFile(
      path.join(root, "one.html"),
      '<section class="slide">Static page with Fade transition</section>',
    );
    await buildProject(root, { formats: ["pptx"] });
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
