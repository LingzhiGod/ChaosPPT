import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "../src/server.js";
async function setup(slides) {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-motion-browser-"));
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "Motion preview",
      size: { width: 800, height: 450 },
      render: { timeoutMs: 5000, scale: 1 },
      slides: slides.map((s, i) => ({
        id: "s" + i,
        file: i + ".html",
        ...(s.transition ? { transition: s.transition } : {}),
      })),
    }),
  );
  for (let i = 0; i < slides.length; i++)
    await writeFile(
      path.join(root, i + ".html"),
      '<section class="slide" data-pptx-layout="controls">' +
        slides[i].body +
        "</section>",
    );
  const server = await startServer(root),
    browser = await chromium.launch();
  return {
    root,
    server,
    browser,
    close: async () => {
      await browser.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test("browser group fly, exit and capture reset follow the same declared steps", async () => {
  const x = await setup([
    {
      body: `<div id="card" data-pptx-group="card" data-pptx-motion='[{"effect":"fly-in","direction":"left","durationMs":500,"order":1},{"effect":"fade-out","durationMs":100,"order":2}]' style="position:absolute;left:200px;top:100px;width:300px;height:160px"><div data-pptx="text" data-pptx-id="label">Group</div></div>`,
    },
  ]);
  try {
    const p = await x.browser.newPage({ reducedMotion: "no-preference" });
    await p.goto(x.server.url + "/slide/s0");
    await p.evaluate(() => ChaosPPT.motion.initialize());
    assert.equal(
      await p.locator("#card").evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    await p.evaluate(() => ChaosPPT.motion.next());
    await p.waitForTimeout(180);
    const box = await p.locator("#card").boundingBox();
    assert.ok(box.x < 190 && box.x > -300);
    await p.evaluate(() => ChaosPPT.motion.next());
    assert.equal(Math.round((await p.locator("#card").boundingBox()).x), 200);
    await p.evaluate(() => ChaosPPT.motion.next());
    await p.waitForTimeout(160);
    assert.equal(
      await p.locator("#card").evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    await p.evaluate(() => ChaosPPT.prepare());
    assert.equal(
      await p.locator("#card").evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
    assert.equal(Math.round((await p.locator("#card").boundingBox()).x), 200);
  } finally {
    await x.close();
  }
});
test("player uses steps before page navigation and animates shared-element overlays", async () => {
  const card = (x) =>
    `<div data-pptx-group="card" data-pptx-shared="card" style="position:absolute;left:${x}px;top:80px;width:240px;height:180px"><div data-pptx="text" data-pptx-id="text">Shared</div></div>`;
  const x = await setup([
    {
      body:
        card(80) +
        `<div data-pptx="shape" data-pptx-id="bar" data-pptx-motion='{"effect":"reveal-in","durationMs":100}' style="position:absolute;left:60px;top:340px;width:300px;height:24px;background:red"></div>`,
    },
    { body: card(420), transition: { effect: "morph", durationMs: 800 } },
  ]);
  try {
    const p = await x.browser.newPage({
      viewport: { width: 1100, height: 750 },
      reducedMotion: "no-preference",
    });
    await p.goto(x.server.url);
    await p.waitForURL("**/#s0");
    await p.locator("#next").click();
    assert.ok(p.url().endsWith("#s0"));
    await p.waitForTimeout(180);
    await p.locator("#next").click();
    await p.locator(".shared-transition-layer").waitFor();
    assert.equal(await p.locator('[data-shared-key="card"]').count(), 1);
    await p.waitForURL("**/#s1");
    assert.equal(await p.locator("iframe").count(), 1);
    assert.equal(await p.locator(".shared-transition-layer").count(), 0);
    assert.equal(
      await p
        .frameLocator("iframe")
        .locator("[data-pptx-shared]")
        .evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
  } finally {
    await x.close();
  }
});

test("an earlier exit completion cannot hide a following after-previous entrance", async () => {
  const x = await setup([
    {
      body: `<div id="target" data-pptx="shape" data-pptx-id="box" data-pptx-motion='[{"effect":"fade-out","durationMs":200},{"effect":"fade-in","durationMs":600,"trigger":"after-previous"}]' style="width:200px;height:80px;background:red"></div>`,
    },
  ]);
  try {
    const p = await x.browser.newPage({ reducedMotion: "no-preference" });
    await p.goto(x.server.url + "/slide/s0");
    for (let i = 0; i < 4; i++) {
      await p.evaluate(() => ChaosPPT.motion.initialize());
      await p.evaluate(() => ChaosPPT.motion.next());
      await p.waitForTimeout(320);
      const s = await p.locator("#target").evaluate((e) => ({
        visibility: getComputedStyle(e).visibility,
        opacity: Number(getComputedStyle(e).opacity),
      }));
      assert.equal(s.visibility, "visible");
      assert.ok(s.opacity > 0 && s.opacity < 1);
    }
  } finally {
    await x.close();
  }
});

test("group hiding is atomic even for descendants with explicit visibility", async () => {
  const x = await setup([
    {
      body: `<div id="group" data-pptx-group="group" data-pptx-motion='[{"effect":"fade-in","durationMs":100},{"effect":"fade-out","durationMs":100}]' style="width:300px;height:150px"><div id="child" data-pptx="text" data-pptx-id="label" style="visibility:visible!important">Child</div></div>`,
    },
  ]);
  try {
    const p = await x.browser.newPage();
    await p.goto(x.server.url + "/slide/s0");
    const before = await p.locator("#child").getAttribute("style");
    await p.evaluate(() => ChaosPPT.motion.initialize());
    assert.equal(
      await p.locator("#child").evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    await p.evaluate(() => ChaosPPT.motion.next());
    await p.waitForTimeout(150);
    assert.equal(
      await p.locator("#child").evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
    await p.evaluate(() => ChaosPPT.motion.next());
    await p.waitForTimeout(150);
    assert.equal(
      await p.locator("#child").evaluate((e) => getComputedStyle(e).visibility),
      "hidden",
    );
    await p.evaluate(() => ChaosPPT.motion.canonical());
    assert.equal(await p.locator("#child").getAttribute("style"), before);
  } finally {
    await x.close();
  }
});

test("reduced motion preserves click steps but skips interpolation", async () => {
  const x = await setup([
    {
      body: `<div id="target" data-pptx="shape" data-pptx-id="box" data-pptx-motion='{"effect":"fly-in","durationMs":2000}' style="width:100px;height:60px;background:red"></div>`,
    },
  ]);
  try {
    const p = await x.browser.newPage({ reducedMotion: "reduce" });
    await p.goto(x.server.url + "/slide/s0");
    await p.evaluate(() => ChaosPPT.motion.initialize());
    await p.evaluate(() => ChaosPPT.motion.next());
    assert.equal(
      await p
        .locator("#target")
        .evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
    assert.equal(await p.evaluate(() => ChaosPPT.motion.state().busy), false);
  } finally {
    await x.close();
  }
});
