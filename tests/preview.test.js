import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { startServer } from "../src/server.js";
test("preview fits canvas, supports keys, and reloads saved changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "chaosppt-preview-"));
  await writeFile(
    path.join(root, "deck.json"),
    JSON.stringify({
      version: 1,
      title: "Live test",
      size: { width: 800, height: 450 },
      slides: [
        { id: "one", file: "one.html" },
        { id: "two", file: "two.html" },
      ],
    }),
  );
  await writeFile(
    path.join(root, "one.html"),
    '<section class="slide">First</section>',
  );
  await writeFile(
    path.join(root, "two.html"),
    '<section class="slide">Second</section>',
  );
  const s = await startServer(root),
    browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    await page.goto(s.url);
    await page.frameLocator("iframe").locator(".slide").waitFor();
    assert.equal(await page.locator("#counter").textContent(), "1 / 2");
    await page.keyboard.press("ArrowRight");
    await page.waitForURL("**/#two");
    assert.equal(
      await page.frameLocator("iframe").locator(".slide").textContent(),
      "Second",
    );
    await page.waitForTimeout(1500);
    await writeFile(
      path.join(root, "two.html"),
      '<section class="slide">Changed</section>',
    );
    await page
      .frameLocator("iframe")
      .getByText("Changed", { exact: true })
      .waitFor({ timeout: 5000 });
    const holder = await page.locator("#holder").boundingBox();
    assert.ok(holder.width <= 1200 - 220 - 64);
    assert.ok(Math.abs(holder.width / holder.height - 800 / 450) < 0.01);
    await page.screenshot({ path: "/tmp/chaosppt-preview-test.png" });
  } finally {
    await browser.close();
    await s.close();
    await rm(root, { recursive: true, force: true });
  }
});
