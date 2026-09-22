import path from "node:path";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
  lstat,
  open,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import pptxgen from "pptxgenjs";
import { loadProject } from "./project.js";
import { startServer, projectFingerprint } from "./server.js";
import { prepareMedia, captureMedia, captureBackground } from "./media.js";
import { inspectDOM } from "./diagnostics.js";
import { verifyDirectory } from "./verify.js";
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
function withDeadline(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
function summarize(slides) {
  const issues = slides.flatMap((s) => s.issues);
  return {
    ok: !issues.some((i) => i.severity === "error"),
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    slides,
  };
}
export async function visitSlides(root, { ids, scale, onPage } = {}) {
  const project = await loadProject(root),
    d = project.manifest;
  if (ids?.some((id) => !d.slides.some((s) => s.id === id)))
    throw new Error("Unknown slide ID in --slides");
  const selected = d.slides.filter((s) => !ids || ids.includes(s.id));
  const server = await startServer(root);
  let browser;
  const reports = [];
  try {
    browser = await chromium.launch({ headless: true });
    for (const slide of selected) {
      const context = await browser.newContext({
        viewport: d.size,
        deviceScaleFactor: scale ?? d.render.scale,
        locale: "zh-CN",
        timezoneId: "UTC",
        colorScheme: "light",
        reducedMotion: "reduce",
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      const issues = [];
      const issue = (code, message) =>
        issues.push({
          slideId: slide.id,
          elementId: null,
          severity: "error",
          code,
          message,
        });
      await context.route("**/*", async (route) => {
        const url = route.request().url();
        if (
          !d.render.allowRemote &&
          !url.startsWith(server.url + "/") &&
          !/^(data|blob):/.test(url)
        ) {
          issue("REMOTE_RESOURCE_BLOCKED", url);
          await route.abort();
        } else await route.continue();
      });
      // WebSockets bypass ordinary HTTP routing; disable them in the default offline mode.
      if (!d.render.allowRemote)
        await context.routeWebSocket(/.*/, (ws) => ws.close());
      const page = await context.newPage();
      const inflight = new Set();
      page.on("request", (r) => inflight.add(r));
      page.on("requestfinished", (r) => inflight.delete(r));
      page.on("requestfailed", (r) => inflight.delete(r));
      page.setDefaultTimeout(d.render.timeoutMs);
      page.on("pageerror", (e) => issue("SCRIPT_ERROR", e.message));
      page.on("console", (m) => {
        if (m.type() === "error") issue("CONSOLE_ERROR", m.text());
      });
      page.on("response", (r) => {
        if (r.status() >= 400)
          issue("RESOURCE_FAILED", `${r.status()} ${r.url()}`);
      });
      page.on("requestfailed", (r) =>
        issue("REQUEST_FAILED", `${r.url()}: ${r.failure()?.errorText}`),
      );
      page.on("dialog", (dialog) => dialog.dismiss());
      let report = {
        slideId: slide.id,
        title: slide.title || slide.id,
        elements: [],
        issues: [],
      };
      let ready = false;
      let media = [];
      try {
        await withDeadline(
          (async () => {
            const response = await page.goto(
              `${server.url}/slide/${slide.id}`,
              { waitUntil: "load", timeout: d.render.timeoutMs },
            );
            if (!response?.ok())
              throw new Error("Slide document failed to load");
            const prepared = await page.evaluate(() =>
              window.ChaosPPT.prepare(),
            );
            for (const failure of prepared.failures)
              issue(
                failure.split(":")[0].includes("_")
                  ? failure.split(":")[0]
                  : "ASYNC_TASK_FAILED",
                failure,
              );
            const preparedMedia = await prepareMedia(page, root);
            media = preparedMedia.media;
            for (const item of preparedMedia.issues)
              issues.push({ ...item, slideId: slide.id });
            // Tasks can trigger CSS background requests after the load event. Drain these too.
            let quietSince = Date.now();
            while (inflight.size || Date.now() - quietSince < 120) {
              if (inflight.size) quietSince = Date.now();
              await new Promise((r) => setTimeout(r, 25));
            }
            await page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
            report = await page.evaluate(inspectDOM);
            ready = true;
          })(),
          d.render.timeoutMs,
          `RENDER_TIMEOUT: ${slide.id} exceeded ${d.render.timeoutMs}ms; check waitUntil tasks and resource loading`,
        );
        if (onPage)
          await withDeadline(
            onPage({ page, slide, manifest: d, report, issues, media }),
            d.render.timeoutMs * 2,
            "CAPTURE_TIMEOUT",
          );
      } catch (e) {
        issue(
          e.message.startsWith("RENDER_TIMEOUT")
            ? "RENDER_TIMEOUT"
            : "RENDER_FAILED",
          e.message,
        );
      } finally {
        reports.push({
          ...report,
          ready,
          issues: [...report.issues, ...issues],
        });
        await context.close();
      }
    }
    return { project, ...summarize(reports) };
  } finally {
    if (browser) await browser.close();
    await server.close();
  }
}
export async function inspectProject(root, options = {}) {
  const { project, ...report } = await visitSlides(root, options);
  return { project: project.root, ...report };
}
async function publish(root, temp) {
  const out = path.join(root, "dist"),
    backup = path.join(root, `.chaosppt-previous-${randomUUID()}`);
  let exists = false;
  try {
    const s = await lstat(out);
    if (s.isSymbolicLink() || !s.isDirectory())
      throw new Error(
        "dist must be an engine-owned directory, not a symlink or file",
      );
    await readFile(path.join(out, ".chaosppt-output"));
    exists = true;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    const s = await lstat(out).catch(() => null);
    if (s)
      throw new Error(
        "Refusing to overwrite an existing dist without .chaosppt-output marker",
      );
  }
  if (exists) await rename(out, backup);
  try {
    await rename(temp, out);
  } catch (e) {
    if (exists) await rename(backup, out);
    throw e;
  }
  if (exists) await rm(backup, { recursive: true, force: true });
  return out;
}
export async function buildProject(
  root,
  { formats = [], pdfMode = "vector", ids, scale } = {},
) {
  if (formats.some((f) => !["pdf", "pptx"].includes(f)))
    throw new Error("Supported export formats: pdf,pptx");
  if (!["vector", "raster"].includes(pdfMode))
    throw new Error("PDF mode must be vector or raster");
  const project = await loadProject(root);
  root = project.root;
  const lockPath = path.join(root, ".chaosppt-build.lock");
  const lock = await open(lockPath, "wx").catch((e) => {
    throw new Error(
      e.code === "EEXIST"
        ? "Another build holds .chaosppt-build.lock. Remove only after confirming no build is running."
        : e.message,
    );
  });
  let temp;
  try {
    await lock.writeFile(String(process.pid));
    const fingerprint = await projectFingerprint(root);
    temp = await mkdtemp(path.join(root, ".chaosppt-build-"));
    await mkdir(path.join(temp, "slides"));
    const pdf = await PDFDocument.create();
    pdf.setTitle(project.manifest.title);
    pdf.setCreator("ChaosPPT");
    const images = [];
    const result = await visitSlides(root, {
      ids,
      scale,
      onPage: async ({ page, slide, manifest: d, report, issues, media }) => {
        const index = images.length + 1,
          name = `slides/${String(index).padStart(3, "0")}-${slide.id}.png`;
        // Screen media keeps PDF layout consistent with screenshot; @page still sets physical size.
        await page.emulateMedia({ media: "screen" });
        const png = await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width: d.size.width, height: d.size.height },
          timeout: d.render.timeoutMs,
        });
        await writeFile(path.join(temp, name), png);
        const capturedMedia = await captureMedia(page, media, temp, slide.id);
        let background;
        if (media.length) {
          const bg = await captureBackground(page, media, {
            type: "png",
            clip: { x: 0, y: 0, width: d.size.width, height: d.size.height },
            timeout: d.render.timeoutMs,
          });
          const file = `slides/${String(index).padStart(3, "0")}-${slide.id}-background.png`;
          await writeFile(path.join(temp, file), bg);
          background = { file, sha256: sha(bg) };
        }
        images.push({
          ...(background ? { background, media: capturedMedia } : {}),
          id: slide.id,
          file: name,
          sha256: sha(png),
          notes: slide.notes,
          sources: slide.sources,
        });
        if (
          formats.includes("pdf") &&
          !report.issues.some((i) => i.severity === "error") &&
          !issues.length
        ) {
          if (pdfMode === "vector") {
            const bytes = await page.pdf({
              printBackground: true,
              preferCSSPageSize: true,
              width: `${d.size.width}px`,
              height: `${d.size.height}px`,
              margin: { top: 0, left: 0, bottom: 0, right: 0 },
              scale: 1,
            });
            const part = await PDFDocument.load(bytes);
            if (part.getPageCount() !== 1)
              throw new Error(
                `Expected one PDF page for ${slide.id}, got ${part.getPageCount()}`,
              );
            const [copied] = await pdf.copyPages(part, [0]);
            pdf.addPage(copied);
          } else {
            const image = await pdf.embedPng(png);
            const p = pdf.addPage([d.size.width * 0.75, d.size.height * 0.75]);
            p.drawImage(image, {
              x: 0,
              y: 0,
              width: p.getWidth(),
              height: p.getHeight(),
            });
          }
        }
      },
    });
    const { project: _, ...report } = result;
    if (formats.length && !report.ok) {
      const error = new Error(
        "Export stopped by diagnostic errors; run inspect --json or render to review",
      );
      error.report = report;
      throw error;
    }
    if ((await projectFingerprint(root)) !== fingerprint)
      throw new Error(
        "Project changed during build; retry after saving all source files",
      );
    const artifacts = [];
    if (formats.includes("pdf")) {
      const bytes = await pdf.save();
      await writeFile(path.join(temp, "deck.pdf"), bytes);
      artifacts.push({ file: "deck.pdf", format: "pdf", sha256: sha(bytes) });
    }
    if (formats.includes("pptx")) {
      const pptx = new pptxgen(),
        d = project.manifest;
      pptx.defineLayout({
        name: "CHAOSPPT",
        width: d.size.width / 96,
        height: d.size.height / 96,
      });
      pptx.layout = "CHAOSPPT";
      pptx.author = "ChaosPPT";
      pptx.subject = "Rendered HTML slides";
      pptx.title = d.title;
      pptx.lang = "zh-CN";
      for (const image of images) {
        const s = pptx.addSlide();
        s.addImage({
          path: path.join(temp, image.background?.file || image.file),
          x: 0,
          y: 0,
          w: d.size.width / 96,
          h: d.size.height / 96,
          altText: image.id,
        });
        for (const m of image.media || []) {
          const b = m.bounds,
            position = {
              x: b.x / 96,
              y: b.y / 96,
              w: b.width / 96,
              h: b.height / 96,
              objectName: m.objectName,
            };
          if (m.kind === "mp4")
            s.addMedia({
              ...position,
              type: "video",
              path: path.join(temp, m.file),
              extn: "mp4",
              cover:
                "image/png;base64," +
                (await readFile(path.join(temp, m.poster.file))).toString(
                  "base64",
                ),
            });
          else
            s.addImage({
              ...position,
              path: path.join(temp, m.file),
              altText: m.elementId || "Animated GIF",
            });
        }
        s.addNotes(
          [
            image.notes,
            ...image.sources.map((source) => `Source: ${source}`),
          ].join("\n"),
        );
      }
      await pptx.writeFile({
        fileName: path.join(temp, "deck.pptx"),
        compression: true,
      });
      artifacts.push({
        file: "deck.pptx",
        format: "pptx",
        sha256: sha(await readFile(path.join(temp, "deck.pptx"))),
      });
    }
    await writeFile(
      path.join(temp, "report.json"),
      JSON.stringify(report, null, 2),
    );
    const build = {
      version: 1,
      engine: "0.2.0",
      sourceFingerprint: fingerprint,
      createdAt: new Date().toISOString(),
      size: project.manifest.size,
      scale: scale ?? project.manifest.render.scale,
      pdfMode,
      ok: report.ok,
      slides: images.map(({ notes, sources, ...image }) => image),
      artifacts,
    };
    await writeFile(
      path.join(temp, "build.json"),
      JSON.stringify(build, null, 2),
    );
    await writeFile(
      path.join(temp, ".chaosppt-output"),
      "ChaosPPT generated output\n",
    );
    if (report.ok) await verifyDirectory(temp);
    const out = await publish(root, temp);
    temp = null;
    return {
      ...report,
      output: out,
      artifacts: artifacts.map((a) => path.join(out, a.file)),
      images: images.map((i) => path.join(out, i.file)),
    };
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
