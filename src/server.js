import http from "node:http";
import { parse, parseFragment, serialize } from "parse5";
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { engineRoot, safeFile, loadProject, fileUrl } from "./project.js";
const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const json = (s) => JSON.stringify(s).replace(/</g, "\\u003c");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".csv": "text/csv",
  ".mp4": "video/mp4",
};
export async function projectFingerprint(root) {
  const hash = createHash("sha256");
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      if (name.startsWith(".") || name === "node_modules" || name === "dist")
        continue;
      const p = path.join(dir, name),
        s = await stat(p);
      if (s.isDirectory()) {
        // Resolve before descent to avoid following directory symlinks outside the deck or loops.
        const { lstat } = await import("node:fs/promises");
        if ((await lstat(p)).isSymbolicLink())
          throw new Error("Directory symlinks are not supported");
        await walk(p);
      } else {
        await safeFile(root, path.relative(root, p));
        hash.update(path.relative(root, p));
        hash.update(await readFile(p));
      }
    }
  }
  await walk(root);
  return hash.digest("hex");
}
async function slideHTML(project, slide) {
  const { manifest: d, root } = project;
  let source = await readFile(await safeFile(root, slide.file), "utf8");
  const document = parse(source);
  const html = document.childNodes.find((n) => n.tagName === "html");
  const headNode = html.childNodes.find((n) => n.tagName === "head");
  const bodyNode = html.childNodes.find((n) => n.tagName === "body");
  let body = serialize(bodyNode);
  if (slide.master) {
    const master = await readFile(
      await safeFile(root, d.masters[slide.master]),
      "utf8",
    );
    if (master.split("{{content}}").length !== 2)
      throw new Error("Master must contain exactly one {{content}} slot");
    body = master
      .replace("{{content}}", body)
      .replaceAll(
        "{{page}}",
        String(d.slides.findIndex((s) => s.id === slide.id) + 1),
      )
      .replaceAll("{{total}}", String(d.slides.length))
      .replaceAll("{{title}}", escapeHTML(d.title));
  }
  const fonts = d.fonts
    .map(
      (f) =>
        `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(fileUrl(f.file))});font-weight:${f.weight};font-style:${f.style};font-display:block;}`,
    )
    .join("\n");
  const base = fileUrl(path.posix.dirname(slide.file)) + "/";
  const config = { fonts: d.fonts, size: d.size, slide, seed: d.render.seed };
  const injection = `<meta charset="utf-8"><base href="${escapeHTML(base)}"><link rel="icon" href="data:,"><script>window.__CHAOSPPT_CONFIG__=${json(config)};(()=>{let seed=${d.render.seed}>>>0;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);})();</script><script src="/__engine/runtime.js"></script><link rel="stylesheet" href="/__engine/runtime.css">${d.theme ? `<link rel="stylesheet" href="${escapeHTML(fileUrl(d.theme))}">` : ""}<style>${fonts}\n:root{--slide-width:${d.size.width}px;--slide-height:${d.size.height}px}@page{size:${d.size.width}px ${d.size.height}px;margin:0}</style>`;
  headNode.childNodes = [
    ...parseFragment(injection).childNodes,
    ...headNode.childNodes.filter((n) => n.tagName !== "base"),
  ];
  for (const n of headNode.childNodes) n.parentNode = headNode;
  if (slide.master) {
    bodyNode.childNodes = parseFragment(body).childNodes;
    for (const n of bodyNode.childNodes) n.parentNode = bodyNode;
  }
  document.childNodes = document.childNodes.filter(
    (n) => n.nodeName !== "#documentType",
  );
  return "<!doctype html>" + serialize(document);
}
export async function startServer(root, { port = 0 } = {}) {
  const initial = await loadProject(root);
  root = initial.root;
  const server = http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      // No wildcard CORS; host validation prevents DNS rebinding through arbitrary Host values.
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || "")) {
        res.writeHead(403);
        res.end("Invalid host");
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1"),
        p = decodeURIComponent(url.pathname);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      let result,
        type = "text/html; charset=utf-8";
      if (p === "/") {
        result = await readFile(path.join(engineRoot, "assets/player.html"));
      } else if (p === "/__engine/runtime.js") {
        result = await readFile(
          path.join(engineRoot, "src/browser-runtime.js"),
        );
        type = mime[".js"];
      } else if (p === "/__engine/runtime.css") {
        result = await readFile(path.join(engineRoot, "assets/runtime.css"));
        type = mime[".css"];
      } else if (p === "/api/deck") {
        result = JSON.stringify((await loadProject(root)).manifest);
        type = mime[".json"];
      } else if (p === "/api/revision") {
        result = JSON.stringify({ revision: await projectFingerprint(root) });
        type = mime[".json"];
      } else if (p.startsWith("/slide/")) {
        const project = await loadProject(root),
          slide = project.manifest.slides.find((s) => s.id === p.slice(7));
        if (!slide) {
          res.writeHead(404);
          res.end();
          return;
        }
        result = await slideHTML(project, slide);
      } else if (p.startsWith("/files/")) {
        const relative = p.slice(7);
        if (
          relative
            .split("/")
            .some(
              (s) => s.startsWith(".") || s === "node_modules" || s === "dist",
            )
        )
          throw new Error("Private path");
        const f = await safeFile(root, relative);
        result = await readFile(f);
        type =
          mime[path.extname(f).toLowerCase()] || "application/octet-stream";
      } else {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": type });
      res.end(req.method === "HEAD" ? undefined : result);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(e.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      }),
  };
}
