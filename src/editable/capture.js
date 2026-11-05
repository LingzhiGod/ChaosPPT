import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extractScene } from "./extract.js";
import { captureBackground } from "../media.js";
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function isolate(page, domId) {
  await page.evaluate((id) => {
    const target = document.querySelector(`[data-chaosppt-export-id="${id}"]`);
    if (!target) throw new Error("Missing capture target");
    const keep = [target, ...target.querySelectorAll("*")].filter(
      (e) => getComputedStyle(e).visibility === "visible",
    );
    keep.forEach((e) => e.setAttribute("data-chaosppt-capture-keep", ""));
    const style = document.createElement("style");
    style.id = "chaosppt-isolation-style";
    style.textContent =
      "html,body { background:transparent!important; } body,body * { visibility:hidden!important; } [data-chaosppt-capture-keep] { visibility:visible!important; }";
    document.head.append(style);
  }, domId);
}
async function restore(page) {
  await page.evaluate(() => {
    document.getElementById("chaosppt-isolation-style")?.remove();
    document
      .querySelectorAll("[data-chaosppt-capture-keep]")
      .forEach((e) => e.removeAttribute("data-chaosppt-capture-keep"));
  });
}
export async function captureEditableScene(page, media, temp, slideId) {
  const scene = await page.evaluate(extractScene);
  await mkdir(path.join(temp, "editable"), { recursive: true });
  try {
    for (const node of scene.nodes) {
      if (!["image", "fallback"].includes(node.type)) continue;
      try {
        if (!node.captureDocument) await isolate(page, node.domId);
        const options = {
          type: "png",
          omitBackground: true,
          clip: node.bounds,
        };
        const bytes = media.length
          ? await captureBackground(page, media, options)
          : await page.screenshot(options);
        const file = `editable/${slideId}-${node.objectName}.png`;
        await writeFile(path.join(temp, file), bytes);
        node.asset = { file, sha256: sha(bytes) };
      } finally {
        await restore(page);
      }
    }
  } finally {
    await page.evaluate(() =>
      document
        .querySelectorAll("[data-chaosppt-export-id]")
        .forEach((e) => e.removeAttribute("data-chaosppt-export-id")),
    );
  }
  const counts = {
    text: 0,
    shape: 0,
    image: 0,
    fallback: 0,
    media: media.length,
  };
  let editableTextCharacters = 0,
    rasterizedDomTextCharacters = 0;
  for (const n of scene.nodes) {
    counts[n.type]++;
    if (n.type === "text")
      editableTextCharacters += [...n.text.replace(/\s/g, "")].length;
    else if (n.type === "fallback")
      rasterizedDomTextCharacters += n.textCharacters || 0;
  }
  scene.summary = {
    slideId,
    counts,
    fontRequirements: [
      ...new Set(
        scene.nodes
          .filter((n) => n.type === "text")
          .map((n) => n.style.fontFace),
      ),
    ],
    fontsEmbedded: false,
    editableTextCharacters,
    rasterizedDomTextCharacters,
    textMetricScope:
      "DOM text only; excludes text painted inside images/Canvas and is not an overall editability score",
    fallbacks: scene.nodes
      .filter((n) => n.type === "fallback")
      .map(({ objectName, sourceId, reason, textCharacters }) => ({
        objectName,
        sourceId,
        reason,
        textCharacters,
      })),
  };
  const bytes = Buffer.from(JSON.stringify(scene, null, 2)),
    file = `editable/${slideId}-scene.json`;
  await writeFile(path.join(temp, file), bytes);
  return {
    scene,
    receipt: { file, sha256: sha(bytes) },
    summary: scene.summary,
  };
}
