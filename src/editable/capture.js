import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extractControls } from "./controls.js";
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
  const explicit = await page.evaluate(extractControls);
  if (explicit?.errors.length)
    throw new Error(explicit.errors.map((e) => e.message).join("; "));
  const scene = explicit?.scene || (await page.evaluate(extractScene));
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
        let bytes = media.length
          ? await captureBackground(page, media, options)
          : await page.screenshot(options);
        if (node.type === "fallback" && !node.captureDocument) {
          const cropped = await page.evaluate(
            async (data) => {
              const img = new Image();
              img.src = data;
              await img.decode();
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0);
              const w = canvas.width,
                h = canvas.height,
                pixels = ctx.getImageData(0, 0, w, h).data;
              let l = w,
                t = h,
                r = -1,
                b = -1;
              for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++)
                  if (pixels[(y * w + x) * 4 + 3]) {
                    l = Math.min(l, x);
                    r = Math.max(r, x);
                    t = Math.min(t, y);
                    b = Math.max(b, y);
                  }
              if (r < l) return null;
              const out = document.createElement("canvas");
              out.width = r - l + 1;
              out.height = b - t + 1;
              out
                .getContext("2d")
                .drawImage(
                  canvas,
                  l,
                  t,
                  out.width,
                  out.height,
                  0,
                  0,
                  out.width,
                  out.height,
                );
              return {
                png: out.toDataURL("image/png").split(",")[1],
                left: l,
                top: t,
                width: out.width,
                height: out.height,
                sourceWidth: w,
                sourceHeight: h,
              };
            },
            "data:image/png;base64," + bytes.toString("base64"),
          );
          if (cropped) {
            const original = { ...node.bounds };
            node.sourceBounds ??= original;
            node.bounds = {
              x:
                original.x +
                (cropped.left * original.width) / cropped.sourceWidth,
              y:
                original.y +
                (cropped.top * original.height) / cropped.sourceHeight,
              width: (cropped.width * original.width) / cropped.sourceWidth,
              height: (cropped.height * original.height) / cropped.sourceHeight,
            };
            bytes = Buffer.from(cropped.png, "base64");
          } else if (scene.authoringMode === "controls")
            throw new Error("Empty raster control: " + node.controlId);
        }
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
  if (scene.groups) {
    const objects = new Map(
      [
        ...scene.nodes,
        ...scene.groups,
        ...media.map((m) => ({
          objectName: `chaosppt-media-${m.index}`,
          bounds: m.bounds,
        })),
      ].map((n) => [n.objectName, n]),
    );
    for (const g of [...scene.groups].reverse()) {
      const boxes = [
        g.bounds,
        ...g.children.map((name) => objects.get(name)?.bounds).filter(Boolean),
      ];
      const x = Math.min(...boxes.map((b) => b.x)),
        y = Math.min(...boxes.map((b) => b.y));
      g.bounds = {
        x,
        y,
        width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
        height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
      };
    }
  }
  const counts = {
    text: 0,
    richtext: 0,
    group: scene.groups?.length || 0,
    shape: 0,
    image: 0,
    fallback: 0,
    media: media.length,
  };
  let editableTextCharacters = 0,
    rasterizedDomTextCharacters = 0;
  for (const n of scene.nodes) {
    counts[n.type]++;
    if (["text", "richtext"].includes(n.type))
      editableTextCharacters += [...n.text.replace(/\s/g, "")].length;
    else if (n.type === "fallback")
      rasterizedDomTextCharacters += n.textCharacters || 0;
  }
  scene.summary = {
    slideId,
    authoringMode: scene.authoringMode || "legacy-inference",
    controls: scene.controls || [],
    counts,
    fontRequirements: [
      ...new Set(
        scene.nodes
          .filter((n) => ["text", "richtext"].includes(n.type))
          .flatMap((n) =>
            n.type === "richtext"
              ? [
                  n.style.fontFace,
                  ...n.paragraphs.flatMap((p) =>
                    p.runs.map((r) => r.style.fontFace),
                  ),
                ]
              : [n.style.fontFace],
          ),
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
