import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { inspectProject, buildProject } from "../src/renderer.js";
import { verifyProject } from "../src/verify.js";
async function fixture(body, extra = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-render-"));
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "测试",
      size: { width: 800, height: 450 },
      render: { timeoutMs: 3000, scale: 1 },
      slides: [{ id: "test", file: "page.html" }],
      ...extra,
    }),
  );
  await writeFile(path.join(root, "page.html"), body);
  return root;
}
test("waits for explicit asynchronous rendering, captures local-font sample and exports verified PDF/PPTX", async () => {
  const root = await fixture(
    `<section class="slide"><h1 id="result" style="font-size:40px">加载中</h1></section><script>ChaosPPT.waitUntil(new Promise(resolve=>setTimeout(()=>{document.getElementById('result').textContent='就绪';resolve();},200)));</script>`,
  );
  try {
    const report = await buildProject(root, { formats: ["pdf", "pptx"] });
    assert.equal(report.ok, true);
    const verified = await verifyProject(root);
    assert.equal(verified.pages, 1);
    assert.deepEqual(verified.formats, ["pdf", "pptx"]);
    await writeFile(
      path.join(root, "page.html"),
      '<section class="slide">修改</section>',
    );
    await assert.rejects(verifyProject(root), /source changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("reports long-title overflow, missing images, font failures, script errors and blocked remote assets", async () => {
  const root = await fixture(
    `<section class="slide"><h1 data-element-id="long" style="width:100px;height:40px;overflow:hidden">长标题必须报告裁切</h1><img src="missing.png"><script>throw new Error('fixture-script-error')</script><img src="https://example.com/image.png"></section>`,
    { fonts: [{ family: "MissingFont", file: "missing.woff2" }] },
  );
  try {
    const report = await inspectProject(root);
    assert.equal(report.ok, false);
    const codes = new Set(report.slides[0].issues.map((i) => i.code));
    for (const code of [
      "CONTENT_OVERFLOW",
      "RESOURCE_FAILED",
      "FONT_LOAD_FAILED",
      "SCRIPT_ERROR",
      "REMOTE_RESOURCE_BLOCKED",
    ])
      assert.ok(codes.has(code), `missing ${code}: ${JSON.stringify(report)}`);
    await assert.rejects(
      buildProject(root, { formats: ["pptx"] }),
      /diagnostic errors/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("unresolved readiness task fails within bounded deadline", async () => {
  const root = await fixture(
    '<section class="slide">Wait</section><script>ChaosPPT.waitUntil(new Promise(()=>{}))</script>',
    { render: { timeoutMs: 1000, scale: 1 } },
  );
  try {
    const r = await inspectProject(root);
    assert.ok(r.slides[0].issues.some((i) => i.code === "RENDER_TIMEOUT"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("raster PDF and selected-slide ordering; corrupt artifact is detected", async () => {
  const root = await fixture(
    '<section class="slide"><h1 style="font-size:36px">Raster</h1></section>',
    {
      slides: [
        { id: "z", file: "page.html" },
        { id: "a", file: "page.html" },
      ],
    },
  );
  try {
    const r = await buildProject(root, {
      formats: ["pdf"],
      pdfMode: "raster",
      ids: ["a", "z"],
    });
    assert.deepEqual(
      r.slides.map((s) => s.slideId),
      ["z", "a"],
    );
    assert.equal((await verifyProject(root)).pages, 2);
    await writeFile(path.join(root, "dist/deck.pdf"), "bad");
    await assert.rejects(verifyProject(root), /hash/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("failed export preserves previous successful output", async () => {
  const root = await fixture('<section class="slide">Good</section>');
  try {
    await buildProject(root, { formats: ["pdf"] });
    const before = await readFile(path.join(root, "dist/deck.pdf"));
    await writeFile(
      path.join(root, "page.html"),
      '<section class="slide"><img src="bad.png"></section>',
    );
    await assert.rejects(buildProject(root, { formats: ["pdf"] }));
    assert.deepEqual(await readFile(path.join(root, "dist/deck.pdf")), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("late background resource failures are not hidden behind readiness success", async () => {
  const { default: http } = await import("node:http");
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(404);
      res.end("missing");
    }, 700);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const root = await fixture(
    `<section class="slide" id="target"></section><script>ChaosPPT.waitUntil(new Promise(resolve=>setTimeout(()=>{document.getElementById('target').style.backgroundImage='url(http://127.0.0.1:${server.address().port}/late.png)';resolve();},50)));</script>`,
    { render: { timeoutMs: 4000, scale: 1, allowRemote: true } },
  );
  try {
    const r = await inspectProject(root);
    assert.equal(r.ok, false);
    assert.ok(r.slides[0].issues.some((i) => i.code === "RESOURCE_FAILED"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});

test("full HTML body attributes survive and screenshots do not advance paused WAAPI", async () => {
  const { visitSlides } = await import("../src/renderer.js");
  const root = await fixture(
    `<html lang="zh-CN"><head><style>body.dark{background:rgb(10,20,30)}</style></head><body class="dark" onload="document.body.dataset.loaded='yes'"><section class="slide"><div id="box" style="width:100px;height:100px;background:red"></div></section><script>const animation=document.getElementById('box').animate([{transform:'translateX(0px)'},{transform:'translateX(1000px)'}],{duration:5000,fill:'forwards'});animation.pause();animation.currentTime=0;</script></body></html>`,
  );
  try {
    const r = await visitSlides(root, {
      onPage: async ({ page }) => {
        assert.equal(
          await page.evaluate(() => document.body.className),
          "dark",
        );
        assert.equal(
          await page.evaluate(() => document.body.dataset.loaded),
          "yes",
        );
        const before = await page.locator("#box").boundingBox();
        await page.screenshot();
        assert.deepEqual(await page.locator("#box").boundingBox(), before);
      },
    });
    assert.equal(r.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("visible CJK ink exceeding tight line-height is not treated as container clipping", async () => {
  const root = await fixture(
    '<section class="slide"><h1 style="line-height:.9;font-size:44px">字体排版</h1></section>',
  );
  try {
    const r = await inspectProject(root);
    assert.equal(r.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
