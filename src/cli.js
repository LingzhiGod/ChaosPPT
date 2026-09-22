#!/usr/bin/env node
import { parseArgs } from "node:util";
import { initProject } from "./project.js";
import { startServer } from "./server.js";
import { inspectProject, buildProject } from "./renderer.js";
import { verifyProject } from "./verify.js";
const help = `ChaosPPT 0.2.0 — HTML presentation engine

Usage: chaosppt <command> <project-dir> [options]

  init       Create a Chinese 3-page starter in an empty directory
  dev        Local preview with keyboard navigation and live reload
  inspect    Diagnose all slides without writing artifacts
  render     Render PNGs and report to <project>/dist
  export     Export PNGs plus PDF and/or image-based PPTX to dist
  verify     Check current source fingerprint and generated artifacts

Options:
  --json                Structured output (all commands)
  --slides id1,id2       Select pages for inspect/render in manifest order
  --scale 1..4           PNG pixel ratio for inspect/render/export
  --format pdf,pptx     Export formats (default: pdf,pptx)
  --pdf-mode vector     vector (default) or raster
  --port 4173           Dev server port (default: auto)
  --help                Show this help

Exit codes: 0 success; 1 diagnostics/verification failure; 2 usage/configuration/runtime error.
Only engine-owned dist directories are replaced. Failed exports preserve prior output.
`;
let json = process.argv.includes("--json");
try {
  const { values: v, positionals: p } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      slides: { type: "string" },
      scale: { type: "string" },
      format: { type: "string" },
      "pdf-mode": { type: "string" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  json = !!v.json;
  if (v.help || p.length === 0) {
    process.stdout.write(help);
  } else {
    const [command, root] = p;
    if (!root || p.length !== 2)
      throw new Error("Expected command and project directory; use --help");
    const allowed = {
      init: [],
      dev: ["port"],
      inspect: ["slides", "scale"],
      render: ["slides", "scale"],
      export: ["format", "pdf-mode", "scale"],
      verify: [],
    };
    if (!Object.hasOwn(allowed, command))
      throw new Error(`Unknown command: ${command}`);
    for (const key of Object.keys(v))
      if (!["json", "help"].includes(key) && !allowed[command].includes(key))
        throw new Error(`--${key} is not supported by ${command}`);
    const scale = v.scale === undefined ? undefined : Number(v.scale);
    if (
      scale !== undefined &&
      (!Number.isFinite(scale) || scale < 1 || scale > 4)
    )
      throw new Error("--scale must be between 1 and 4");
    const ids = v.slides?.split(",");
    if (ids && (ids.some((s) => !s) || new Set(ids).size !== ids.length))
      throw new Error("--slides requires unique, nonempty IDs");
    let result;
    if (command === "init") result = { ok: true, ...(await initProject(root)) };
    if (command === "dev") {
      const port = v.port === undefined ? 0 : Number(v.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw new Error("--port must be an integer from 0 to 65535");
      const s = await startServer(root, { port });
      result = { ok: true, url: s.url };
      for (const signal of ["SIGINT", "SIGTERM"])
        process.once(signal, () => {
          s.close().then(() => process.exit(0));
        });
    }
    if (command === "inspect")
      result = await inspectProject(root, { ids, scale });
    if (command === "render") result = await buildProject(root, { ids, scale });
    if (command === "export")
      result = await buildProject(root, {
        formats: (v.format || "pdf,pptx").split(","),
        pdfMode: v["pdf-mode"] || "vector",
        scale,
      });
    if (command === "verify") result = await verifyProject(root);
    process.stdout.write(JSON.stringify(result, null, json ? 0 : 2) + "\n");
    if (!result.ok) process.exitCode = 1;
  }
} catch (e) {
  const result = {
    ok: false,
    error: e.message,
    ...(e.report ? { report: e.report } : {}),
  };
  (json ? process.stdout : process.stderr).write(
    JSON.stringify(result, null, json ? 0 : 2) + "\n",
  );
  process.exitCode =
    e.report || e.message.startsWith("Verification failed") ? 1 : 2;
}
