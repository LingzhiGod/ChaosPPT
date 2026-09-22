import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { safeFile, loadProject } from "./project.js";
import { projectFingerprint } from "./server.js";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const check = (condition, message) => {
  if (!condition) throw new Error(`Verification failed: ${message}`);
};
export async function verifyDirectory(directory) {
  const build = JSON.parse(
    await readFile(await safeFile(directory, "build.json"), "utf8"),
  );
  check(
    build.version === 1 && build.ok,
    "build contains diagnostics errors or unsupported metadata",
  );
  check(build.slides.length > 0, "empty build");
  for (const slide of build.slides) {
    for (const m of slide.media || []) {
      check(["mp4", "gif"].includes(m.kind), "media kind");
      const b = m.bounds;
      check(
        [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
          b.x >= 0 &&
          b.y >= 0 &&
          b.width > 0 &&
          b.height > 0 &&
          b.x + b.width <= build.size.width + 0.5 &&
          b.y + b.height <= build.size.height + 0.5,
        "media bounds",
      );
      for (const asset of [m, m.poster])
        check(
          sha(await readFile(await safeFile(directory, asset.file))) ===
            asset.sha256,
          `Media hash ${asset.file}`,
        );
    }
    for (const s of [slide, ...(slide.background ? [slide.background] : [])]) {
      const b = await readFile(await safeFile(directory, s.file));
      check(sha(b) === s.sha256, `PNG hash ${s.id}`);
      check(
        b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        `PNG signature ${s.id}`,
      );
      check(
        Math.abs(b.readUInt32BE(16) - build.size.width * build.scale) <= 1 &&
          Math.abs(b.readUInt32BE(20) - build.size.height * build.scale) <= 1,
        `PNG dimensions ${s.id}`,
      );
    }
  }
  for (const artifact of build.artifacts) {
    const b = await readFile(await safeFile(directory, artifact.file));
    check(sha(b) === artifact.sha256, `${artifact.file} hash`);
    if (artifact.format === "pdf") {
      const pdf = await PDFDocument.load(b);
      check(pdf.getPageCount() === build.slides.length, "PDF page count");
      for (const p of pdf.getPages())
        check(
          Math.abs(p.getWidth() - build.size.width * 0.75) < 1 &&
            Math.abs(p.getHeight() - build.size.height * 0.75) < 1,
          "PDF page dimensions",
        );
    } else if (artifact.format === "pptx") {
      const zip = unzipSync(b),
        text = (name) => {
          check(!!zip[name], `Missing PPTX part ${name}`);
          return strFromU8(zip[name]);
        };
      const presentation = text("ppt/presentation.xml");
      const size = presentation.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
      check(!!size, "PPTX page size metadata");
      check(
        Math.abs(Number(size[1]) - build.size.width * 9525) <= 1 &&
          Math.abs(Number(size[2]) - build.size.height * 9525) <= 1,
        "PPTX dimensions",
      );
      const relations = new Map(
        [
          ...text("ppt/_rels/presentation.xml.rels").matchAll(
            /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g,
          ),
        ].map((m) => [m[1], m[2]]),
      );
      const order = [
        ...presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g),
      ].map((m) => m[1]);
      check(order.length === build.slides.length, "PPTX slide count");
      for (let i = 0; i < order.length; i++) {
        check(relations.has(order[i]), "PPTX slide relationship");
        const slidePath = path.posix.normalize(
            "ppt/" + relations.get(order[i]),
          ),
          xml = text(slidePath);
        const embed = xml.match(/<a:blip[^>]*r:embed="([^"]+)"/);
        check(!!embed, "Slide image");
        const relPath = path.posix.join(
          path.posix.dirname(slidePath),
          "_rels",
          path.posix.basename(slidePath) + ".rels",
        );
        const rel = [
          ...text(relPath).matchAll(
            /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g,
          ),
        ].find((m) => m[1] === embed[1]);
        check(!!rel, "Image relationship");
        const imagePath = path.posix.normalize(
          path.posix.join(path.posix.dirname(slidePath), rel[2]),
        );
        check(!!zip[imagePath], "Image media");
        check(
          sha(zip[imagePath]) ===
            (build.slides[i].background || build.slides[i]).sha256,
          `PPTX image/order at page ${i + 1}`,
        );
        const pics = [...xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)].map(
          (m) => m[0],
        );
        const expected = build.slides[i].media || [];
        check(pics.length === expected.length + 1, "PPTX media object count");
        const relationXml = text(relPath);
        const readRelation = (rid) => {
          const matches = [
            ...relationXml.matchAll(
              /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g,
            ),
          ];
          const r = matches.find((m) => m[1] === rid);
          check(
            !!r && !r[0].includes('TargetMode="External"'),
            "Embedded media relationship",
          );
          const target = path.posix.normalize(
            path.posix.join(path.posix.dirname(slidePath), r[2]),
          );
          check(!!zip[target], "Embedded media file");
          return zip[target];
        };
        for (const m of expected) {
          const pic = pics.find((p) => p.includes(`name="${m.objectName}"`));
          check(!!pic, "Native media object");
          const off = pic.match(/<a:off x="(-?\d+)" y="(-?\d+)"/),
            ext = pic.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
          check(!!off && !!ext, "Media geometry");
          [m.bounds.x, m.bounds.y, m.bounds.width, m.bounds.height].forEach(
            (v, j) =>
              check(
                Math.abs(
                  Number([off[1], off[2], ext[1], ext[2]][j]) -
                    Math.round(v * 9525),
                ) <= 1,
                "Native media placement",
              ),
          );
          const imageId = pic.match(/<a:blip[^>]*r:embed="([^"]+)"/)?.[1];
          check(!!imageId, "Media cover/image");
          if (m.kind === "gif")
            check(
              sha(readRelation(imageId)) === m.sha256,
              "GIF original bytes",
            );
          else {
            const videoId = pic.match(/<a:videoFile[^>]*r:link="([^"]+)"/)?.[1],
              nativeId = pic.match(/<p14:media[^>]*r:embed="([^"]+)"/)?.[1];
            check(!!videoId && !!nativeId, "MP4 native playback links");
            check(
              sha(readRelation(videoId)) === m.sha256 &&
                sha(readRelation(nativeId)) === m.sha256,
              "MP4 original bytes",
            );
            check(
              sha(readRelation(imageId)) === m.poster.sha256,
              "MP4 poster bytes",
            );
          }
        }
        check(
          xml.includes(`<a:off x="0" y="0"/>`) &&
            xml.includes(`<a:ext cx="${size[1]}" cy="${size[2]}"/>`),
          "PPTX image fills canvas",
        );
      }
    } else throw new Error(`Unknown artifact format: ${artifact.format}`);
  }
  return {
    ok: true,
    pages: build.slides.length,
    formats: build.artifacts.map((a) => a.format),
    checks: [
      "source image hashes and dimensions",
      "artifact hashes",
      "PDF page count and dimensions",
      "PPTX page order, embedded image hashes and placement",
      "MP4/GIF original bytes, relationships, posters and placement",
    ],
  };
}
export async function verifyProject(root) {
  const p = await loadProject(root),
    directory = path.join(p.root, "dist");
  const result = await verifyDirectory(directory);
  const build = JSON.parse(
    await readFile(path.join(directory, "build.json"), "utf8"),
  );
  check(
    build.sourceFingerprint === (await projectFingerprint(p.root)),
    "source changed since build",
  );
  const ids = new Set(build.slides.map((s) => s.id));
  check(
    p.manifest.slides
      .filter((s) => ids.has(s.id))
      .map((s) => s.id)
      .join("|") === build.slides.map((s) => s.id).join("|"),
    "manifest slide order",
  );
  return {
    ...result,
    output: directory,
    partial: build.slides.length !== p.manifest.slides.length,
  };
}
