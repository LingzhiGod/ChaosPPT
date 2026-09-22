import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { safeFile } from "./project.js";
const hash = (b) => createHash("sha256").update(b).digest("hex");

// Explicit opt-in keeps existing arbitrary HTML decks backwards-compatible.
export async function prepareMedia(page, root) {
  const raw = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("*")];
    const pointerStyles = nodes.map((e) => [
      e,
      e.style.getPropertyValue("pointer-events"),
      e.style.getPropertyPriority("pointer-events"),
    ]);
    // Hit-testing must include visible overlays even when authors disabled pointer events.
    for (const e of nodes)
      e.style.setProperty("pointer-events", "auto", "important");
    try {
      return [...document.querySelectorAll("[data-pptx-media]")]
        .map((e, index) => {
          const r = e.getBoundingClientRect(),
            s = getComputedStyle(e),
            errors = [];
          e.dataset.chaospptMediaIndex = String(index);
          if (!["VIDEO", "IMG"].includes(e.tagName))
            errors.push(["MEDIA_ELEMENT", "Mark a video or GIF img element"]);
          if (
            !r.width ||
            !r.height ||
            s.visibility === "hidden" ||
            s.display === "none"
          )
            return null;
          if (s.objectFit !== "fill")
            errors.push([
              "MEDIA_STYLE",
              "Use object-fit:fill and a matching aspect ratio; native media does not reproduce CSS cropping",
            ]);
          for (const key of [
            "borderTopWidth",
            "borderRightWidth",
            "borderBottomWidth",
            "borderLeftWidth",
            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",
          ])
            if (parseFloat(s[key]))
              errors.push([
                "MEDIA_STYLE",
                "Put padding and borders on a separate wrapper",
              ]);
          let a = e;
          while (a && a !== document.body.parentElement) {
            const c = getComputedStyle(a),
              ar = a.getBoundingClientRect();
            if (
              c.transform !== "none" ||
              c.filter !== "none" ||
              c.clipPath !== "none" ||
              c.maskImage !== "none" ||
              Number(c.opacity) !== 1 ||
              c.mixBlendMode !== "normal" ||
              c.perspective !== "none" ||
              c.rotate !== "none" ||
              c.scale !== "none" ||
              c.translate !== "none"
            )
              errors.push([
                "MEDIA_STYLE",
                "Native media requires untransformed, opaque, unmasked ancestors",
              ]);
            if (
              (a === e ||
                /hidden|clip|auto|scroll/.test(
                  c.overflowX + " " + c.overflowY,
                )) &&
              [
                c.borderTopLeftRadius,
                c.borderTopRightRadius,
                c.borderBottomLeftRadius,
                c.borderBottomRightRadius,
              ].some((v) => parseFloat(v))
            )
              errors.push([
                "MEDIA_STYLE",
                "Native media requires square corners",
              ]);
            if (
              /hidden|clip|auto|scroll/.test(c.overflowX + " " + c.overflowY) &&
              (r.left < ar.left - 0.5 ||
                r.top < ar.top - 0.5 ||
                r.right > ar.right + 0.5 ||
                r.bottom > ar.bottom + 0.5)
            )
              errors.push(["MEDIA_CLIPPED", "Media is clipped by an ancestor"]);
            a = a.parentElement;
          }
          // Probe each intersecting element as well as a regular grid to catch narrow captions.
          const points = [];
          for (const fx of [0.05, 0.5, 0.95])
            for (const fy of [0.05, 0.5, 0.95])
              points.push([r.x + r.width * fx, r.y + r.height * fy]);
          for (const other of nodes) {
            if (other === e || other.contains(e) || e.contains(other)) continue;
            const o = other.getBoundingClientRect();
            const left = Math.max(r.left, o.left),
              right = Math.min(r.right, o.right),
              top = Math.max(r.top, o.top),
              bottom = Math.min(r.bottom, o.bottom);
            if (right > left && bottom > top)
              points.push([(left + right) / 2, (top + bottom) / 2]);
          }
          for (const [x, y] of points) {
            const hit = document.elementFromPoint(x, y);
            if (hit && hit !== e && !e.contains(hit))
              errors.push([
                "MEDIA_OCCLUDED",
                "Keep embedded media topmost; captions belong outside its rectangle",
              ]);
          }
          return {
            index,
            tag: e.tagName,
            source:
              e.currentSrc || e.src || e.querySelector("source")?.src || "",
            poster: e.poster || "",
            elementId: e.dataset.elementId || e.id || null,
            bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
            errors,
          };
        })
        .filter(Boolean);
    } finally {
      for (const [e, value, priority] of pointerStyles) {
        if (value) e.style.setProperty("pointer-events", value, priority);
        else e.style.removeProperty("pointer-events");
      }
    }
  });
  const origin = new URL(page.url()).origin,
    media = [],
    issues = [];
  const local = async (url) => {
    const u = new URL(url);
    if (u.origin !== origin || !u.pathname.startsWith("/files/"))
      throw new Error("Use a local project asset for embedded media");
    const relative = decodeURIComponent(u.pathname.slice(7));
    await safeFile(root, relative);
    return relative;
  };
  for (const item of raw) {
    const issue = (code, message) =>
      issues.push({
        elementId: item.elementId,
        severity: "error",
        code,
        message,
      });
    for (const [code, message] of item.errors) issue(code, message);
    if (item.errors.length) continue;
    try {
      const source = await local(item.source),
        bytes = await readFile(await safeFile(root, source));
      const kind = item.tag === "VIDEO" ? "mp4" : "gif";
      if (path.extname(source).toLowerCase() !== "." + kind)
        throw new Error(`Expected a local .${kind} file`);
      if (kind === "gif" && !/^GIF8[79]a/.test(bytes.subarray(0, 6).toString()))
        throw new Error("Invalid GIF signature");
      if (
        kind === "mp4" &&
        (bytes.length < 12 || bytes.subarray(4, 8).toString() !== "ftyp")
      )
        throw new Error("Invalid MP4 file signature");
      if (kind === "mp4" && !item.poster) {
        issue(
          "MEDIA_POSTER_REQUIRED",
          "MP4 requires a poster image for deterministic PDF/PNG and PPTX preview",
        );
        continue;
      }
      let posterType;
      if (item.poster) {
        const posterFile = await local(item.poster),
          ext = path.extname(posterFile).toLowerCase();
        if (![".png", ".jpg", ".jpeg"].includes(ext))
          throw new Error(
            "MP4 poster must be a local PNG or JPEG; use a static cover asset",
          );
        posterType = ext === ".png" ? "image/png" : "image/jpeg";
      }
      await page.evaluate(
        async ({ index, kind, poster, posterType }) => {
          const e = document.querySelector(
            `[data-chaosppt-media-index="${index}"]`,
          );
          const style = getComputedStyle(e),
            css = [...style]
              .map((p) => `${p}:${style.getPropertyValue(p)};`)
              .join("");
          let src = poster;
          {
            if (!globalThis.ImageDecoder)
              throw new Error("Media capture requires Chromium ImageDecoder");
            const response = await fetch(
              kind === "gif" ? e.currentSrc || e.src : poster,
            );
            if (!response.ok) throw new Error("Media frame fetch failed");
            const decoder = new ImageDecoder({
              data: await response.arrayBuffer(),
              type: kind === "gif" ? "image/gif" : posterType,
            });
            try {
              const { image } = await decoder.decode({
                frameIndex: 0,
                completeFramesOnly: true,
              });
              const canvas = document.createElement("canvas");
              canvas.width = image.displayWidth;
              canvas.height = image.displayHeight;
              canvas.getContext("2d").drawImage(image, 0, 0);
              src = canvas.toDataURL("image/png");
              image.close();
            } finally {
              decoder.close();
            }
          }
          const img = document.createElement("img");
          for (const attr of e.attributes)
            if (
              ![
                "src",
                "srcset",
                "poster",
                "controls",
                "autoplay",
                "loop",
                "muted",
              ].includes(attr.name)
            )
              img.setAttribute(attr.name, attr.value);
          img.style.cssText = css;
          img.src = src;
          await img.decode();
          e.replaceWith(img);
        },
        { index: item.index, kind, poster: item.poster, posterType },
      );
      const after = await page
        .locator(`[data-chaosppt-media-index="${item.index}"]`)
        .boundingBox();
      if (
        !after ||
        ["x", "y", "width", "height"].some(
          (k) => Math.abs(after[k] - item.bounds[k]) > 0.5,
        )
      )
        throw new Error(
          "Media layout changed during poster replacement; use stable container dimensions",
        );
      media.push({ ...item, source, kind, sha256: hash(bytes), bytes });
    } catch (e) {
      issue("MEDIA_INVALID", e.message);
    }
  }
  return { media, issues };
}

export async function captureMedia(page, media, temp, slideId) {
  if (!media.length) return [];
  await mkdir(path.join(temp, "media"), { recursive: true });
  const result = [];
  for (const m of media) {
    const stem = `media/${slideId}-${m.index}`;
    const file = `${stem}.${m.kind}`;
    await writeFile(path.join(temp, file), m.bytes);
    const cover = `${stem}-poster.png`;
    const bytes = await page
      .locator(`[data-chaosppt-media-index="${m.index}"]`)
      .screenshot({ type: "png" });
    await writeFile(path.join(temp, cover), bytes);
    result.push({
      kind: m.kind,
      file,
      sha256: m.sha256,
      bounds: m.bounds,
      elementId: m.elementId,
      objectName: `chaosppt-media-${m.index}`,
      poster: { file: cover, sha256: hash(bytes) },
    });
  }
  return result;
}

export async function captureBackground(page, media, options) {
  // Clear image pixels, not the CSS box: retain the element's background for transparent GIFs.
  await page.evaluate(
    async (indices) => {
      await Promise.all(
        indices.map(async (i) => {
          const e = document.querySelector(
            `[data-chaosppt-media-index="${i}"]`,
          );
          e.dataset.chaospptPreviousSrc = e.src;
          e.src =
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
          await e.decode();
        }),
      );
    },
    media.map((m) => m.index),
  );
  try {
    return await page.screenshot(options);
  } finally {
    await page.evaluate(
      async (indices) => {
        await Promise.all(
          indices.map(async (i) => {
            const e = document.querySelector(
              `[data-chaosppt-media-index="${i}"]`,
            );
            e.src = e.dataset.chaospptPreviousSrc;
            delete e.dataset.chaospptPreviousSrc;
            await e.decode();
          }),
        );
      },
      media.map((m) => m.index),
    );
  }
}
