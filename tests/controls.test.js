import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, cp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import { buildProject, inspectProject } from "../src/renderer.js";
import { verifyProject } from "../src/verify.js";
async function fixture(body) {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-controls-"));
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "Controls",
      size: { width: 800, height: 450 },
      render: { scale: 1 },
      slides: [{ id: "one", file: "one.html" }],
    }),
  );
  await writeFile(
    path.join(root, "one.html"),
    `<section class="slide" data-pptx-layout="controls" style="padding:30px;font-size:24px;line-height:1.5">${body}</section>`,
  );
  return root;
}
async function scene(root) {
  const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
  return JSON.parse(
    await readFile(path.join(root, "dist", b.slides[0].editable.file)),
  );
}
const markup =
  '<div data-pptx-group="card" style="width:600px;height:300px;position:relative"><div data-pptx="shape" data-pptx-id="bg" style="position:absolute;inset:0;background:#ddeedd;border-radius:10px"></div><div data-pptx="group" data-pptx-id="content" style="position:relative;padding:20px;width:560px;height:240px"><div data-pptx="text" data-pptx-id="body" style="width:500px;height:160px">One <b>bold</b> paragraph<br>Second line 中文</div></div></div>';
test("one text control becomes one native rich-text frame inside real nested groups", async () => {
  const root = await fixture(markup);
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const s = await scene(root);
    assert.equal(s.authoringMode, "controls");
    assert.equal(s.nodes.filter((n) => n.type === "richtext").length, 1);
    assert.equal(s.groups.length, 2);
    const z = unzipSync(await readFile(path.join(root, "dist/deck.pptx")));
    const doc = new DOMParser().parseFromString(
      strFromU8(z["ppt/slides/slide1.xml"]),
      "application/xml",
    );
    assert.equal(doc.getElementsByTagName("p:grpSp").length, 2);
    assert.equal(doc.getElementsByTagName("p:txBody").length, 1);
    assert.equal(doc.getElementsByTagName("a:p").length, 2);
    assert.ok(
      [...doc.getElementsByTagName("a:rPr")].some(
        (e) => e.getAttribute("b") === "1",
      ),
    );
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("strict authoring rejects duplicate IDs and unmarked visible content", async () => {
  for (const body of [
    '<div data-pptx="text" data-pptx-id="same">A</div><div data-pptx="text" data-pptx-id="same">B</div>',
    "<h1>Unmarked</h1>",
  ]) {
    const root = await fixture(body);
    try {
      const r = await inspectProject(root);
      assert.ok(r.slides[0].issues.some((i) => i.code === "CONTROL_INVALID"));
      await assert.rejects(
        buildProject(root, { formats: ["pptx"], pptxMode: "editable" }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test("explicit raster Canvas is cropped instead of spanning the whole slide", async () => {
  const root = await fixture(
    '<canvas data-pptx="raster" data-pptx-id="plot" width="160" height="80" style="width:160px;height:80px;background:#18352c"></canvas>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const s = await scene(root),
      n = s.nodes[0];
    assert.equal(n.type, "fallback");
    assert.ok(n.bounds.width <= 161 && n.bounds.height <= 81);
    assert.ok(n.bounds.x >= 29);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unmarked Canvas and unsupported nested block text cannot silently disappear", async () => {
  for (const body of [
    '<canvas width="60" height="40" style="background:red"></canvas>',
    '<div data-pptx="text" data-pptx-id="body"><p>paragraph</p></div>',
    '<div data-pptx-group="card" style="width:100px;height:100px;background:red"><div data-pptx="text" data-pptx-id="label">A</div></div>',
  ]) {
    const root = await fixture(body);
    try {
      assert.equal((await inspectProject(root)).ok, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
test("rich runs preserve spaces, XML-sensitive characters and multiple explicit lines", async () => {
  const root = await fixture(
    '<div data-pptx="text" data-pptx-id="body">A <b>&amp; B</b> C<br><span style="color:#ff0000">red</span><br><i>last</i></div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const s = await scene(root);
    assert.equal(s.nodes[0].text, "A & B C\nred\nlast");
    assert.equal(s.nodes[0].paragraphs.length, 3);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("compatible mode still exports the appearance of an invalid controls document", async () => {
  const root = await fixture(
    '<div data-pptx="text" data-pptx-id="body"><p>Visible</p></div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "compatible" });
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("invalid controls export preserves previous successful output", async () => {
  const root = await fixture(
    '<div data-pptx="text" data-pptx-id="body">Good</div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const bytes = await readFile(path.join(root, "dist/deck.pptx"));
    await writeFile(
      path.join(root, "one.html"),
      '<section class="slide" data-pptx-layout="controls"><h1>Unmarked</h1></section>',
    );
    await assert.rejects(
      buildProject(root, { formats: ["pptx"], pptxMode: "editable" }),
    );
    assert.deepEqual(await readFile(path.join(root, "dist/deck.pptx")), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("visible descendants of hidden text spans fail instead of being dropped", async () => {
  const root = await fixture(
    '<div data-pptx="text" data-pptx-id="body">Visible <span style="visibility:hidden">hidden<span style="visibility:visible">IMPORTANT</span></span></div>',
  );
  try {
    assert.equal((await inspectProject(root)).ok, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("NBSP, ideographic spaces and nowrap survive rich text export", async () => {
  const root = await fixture(
    '<div data-pptx="text" data-pptx-id="body" style="white-space:nowrap">A&nbsp;&nbsp;B　C</div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const s = await scene(root);
    assert.equal(s.nodes[0].text, "A\u00a0\u00a0B\u3000C");
    const z = unzipSync(await readFile(path.join(root, "dist/deck.pptx")));
    assert.match(strFromU8(z["ppt/slides/slide1.xml"]), /wrap="none"/);
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("unsupported indentation and unmarked outlines are reported", async () => {
  for (const body of [
    '<div data-pptx="text" data-pptx-id="t" style="text-indent:40px">Text</div>',
    '<div style="outline:8px solid red"><div data-pptx="text" data-pptx-id="t">Text</div></div>',
  ]) {
    const root = await fixture(body);
    try {
      assert.equal((await inspectProject(root)).ok, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("native GIF/MP4 can be children of actual groups", async () => {
  const root = await fixture(
    '<div data-pptx-group="media-card" style="width:700px;height:200px;position:relative"><video data-pptx="media" data-pptx-id="movie" data-pptx-media src="assets/clip.mp4" poster="assets/poster.png" style="position:absolute;left:0;top:0;width:320px;height:180px"></video><img data-pptx="media" data-pptx-id="gif" data-pptx-media src="assets/animation.gif" style="position:absolute;left:360px;top:0;width:320px;height:180px"></div>',
  );
  try {
    await cp(
      new URL("./fixtures/media/", import.meta.url),
      path.join(root, "assets"),
      { recursive: true },
    );
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    assert.equal((await verifyProject(root)).ok, true);
    const z = unzipSync(await readFile(path.join(root, "dist/deck.pptx")));
    const doc = new DOMParser().parseFromString(
      strFromU8(z["ppt/slides/slide1.xml"]),
      "application/xml",
    );
    assert.equal(
      doc.getElementsByTagName("p:grpSp")[0].getElementsByTagName("p:pic")
        .length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changing group child-coordinate transform is rejected after refreshing file hash", async () => {
  const root = await fixture(markup);
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    const { zipSync, strToU8 } = await import("fflate"),
      { createHash } = await import("node:crypto");
    const file = path.join(root, "dist/deck.pptx"),
      z = unzipSync(await readFile(file));
    const doc = new DOMParser().parseFromString(
      strFromU8(z["ppt/slides/slide1.xml"]),
      "application/xml",
    );
    doc
      .getElementsByTagName("p:grpSp")[0]
      .getElementsByTagName("a:chOff")[0]
      .setAttribute("x", "1");
    const { XMLSerializer } = await import("@xmldom/xmldom");
    z["ppt/slides/slide1.xml"] = strToU8(
      new XMLSerializer().serializeToString(doc),
    );
    const data = zipSync(z);
    await writeFile(file, data);
    const b = JSON.parse(await readFile(path.join(root, "dist/build.json")));
    b.artifacts[0].sha256 = createHash("sha256").update(data).digest("hex");
    await writeFile(path.join(root, "dist/build.json"), JSON.stringify(b));
    await assert.rejects(verifyProject(root), /group child coordinate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ellipse preview and native geometry agree", async () => {
  const root = await fixture(
    '<div data-pptx="shape" data-pptx-id="dot" data-pptx-shape="ellipse" style="width:100px;height:60px;background:red"></div>',
  );
  try {
    await buildProject(root, { formats: ["pptx"], pptxMode: "editable" });
    assert.equal((await scene(root)).nodes[0].geometry, "ellipse");
    assert.equal((await verifyProject(root)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('asymmetric CSS text padding maps to correct OOXML edges',async()=>{const root=await fixture('<div data-pptx="text" data-pptx-id="badge" style="width:240px;padding:8px 16px 12px 20px;background:#18352c;color:white">Padded text</div>');try{await buildProject(root,{formats:['pptx'],pptxMode:'editable'});const z=unzipSync(await readFile(path.join(root,'dist/deck.pptx')));const d=new DOMParser().parseFromString(strFromU8(z['ppt/slides/slide1.xml']),'application/xml');const p=d.getElementsByTagName('a:bodyPr')[0];for(const [key,value] of [['tIns',8],['rIns',16],['bIns',12],['lIns',20]])assert.equal(Number(p.getAttribute(key)),value*9525);assert.equal((await verifyProject(root)).ok,true);}finally{await rm(root,{recursive:true,force:true});}});

test('nested inline emphasis retains ancestor underline',async()=>{const root=await fixture('<div data-pptx="text" data-pptx-id="body"><u>plain <b>bold</b></u></div>');try{await buildProject(root,{formats:['pptx'],pptxMode:'editable'});const s=await scene(root),runs=s.nodes[0].paragraphs[0].runs;assert.ok(runs.every(r=>r.style.underline));assert.ok(runs.find(r=>r.text==='bold').style.bold);}finally{await rm(root,{recursive:true,force:true});}});
test('init creates a fully declared two-page starter',async()=>{const {initProject}=await import('../src/project.js');const root=await mkdtemp(path.join(tmpdir(),'chaosppt-new-controls-'));try{await initProject(root);const r=await inspectProject(root);assert.equal(r.ok,true);assert.equal(r.slides.length,2);await buildProject(root,{formats:['pptx'],pptxMode:'editable'});assert.equal((await verifyProject(root)).pages,2);}finally{await rm(root,{recursive:true,force:true});}});
