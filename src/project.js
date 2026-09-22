import path from "node:path";
import { readFile, realpath, stat, mkdir, readdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
export const engineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const relative = z
  .string()
  .min(1)
  .refine(
    (s) =>
      !path.isAbsolute(s) &&
      !s.split(/[\\/]/).includes("..") &&
      !/[\\\x00?#]/.test(s),
    "Use a project-relative file path without traversal, query, or fragment",
  );
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const font = z
  .object({
    family: z.string().min(1),
    file: relative,
    weight: z
      .string()
      .regex(/^(normal|bold|[1-9][0-9]{0,2}|1000)( (?:[1-9][0-9]{0,2}|1000))?$/)
      .default("400"),
    style: z.enum(["normal", "italic", "oblique"]).default("normal"),
    sample: z.string().default("ABC中文123"),
  })
  .strict();
const slide = z
  .object({
    id,
    file: relative,
    title: z.string().optional(),
    message: z.string().optional(),
    purpose: z.string().optional(),
    sources: z.array(z.string()).default([]),
    notes: z.string().default(""),
    master: id.optional(),
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    title: z.string().min(1),
    size: z
      .object({
        width: z.number().int().min(320).max(7680),
        height: z.number().int().min(240).max(4320),
      })
      .strict()
      .default({ width: 1600, height: 900 }),
    theme: relative.optional(),
    fonts: z.array(font).default([]),
    masters: z.record(id, relative).default({}),
    slides: z.array(slide).min(1).max(500),
    render: z
      .object({
        timeoutMs: z.number().int().min(1000).max(120000).default(15000),
        scale: z.number().min(1).max(4).default(2),
        allowRemote: z.boolean().default(false),
        seed: z.number().int().default(42),
      })
      .strict()
      .default({ timeoutMs: 15000, scale: 2, allowRemote: false, seed: 42 }),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = new Set();
    for (const s of d.slides) {
      if (ids.has(s.id))
        ctx.addIssue({
          code: "custom",
          message: `Duplicate slide id: ${s.id}`,
        });
      ids.add(s.id);
      if (s.master && !d.masters[s.master])
        ctx.addIssue({
          code: "custom",
          message: `Unknown master: ${s.master}`,
        });
    }
  });
export function validateManifest(value) {
  return schema.parse(value);
}
export async function safeFile(root, relativePath) {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("\0") ||
    relativePath.includes("\\")
  )
    throw new Error("Unsafe project path");
  const base = await realpath(root),
    target = path.resolve(base, relativePath);
  if (target !== base && !target.startsWith(base + path.sep))
    throw new Error("Path leaves project root");
  const actual = await realpath(target);
  if (actual !== base && !actual.startsWith(base + path.sep))
    throw new Error("Symlink leaves project root");
  if (!(await stat(actual)).isFile()) throw new Error("Expected a file");
  return actual;
}
export async function loadProject(root) {
  root = await realpath(root);
  const manifest = validateManifest(
    JSON.parse(await readFile(await safeFile(root, "deck.json"), "utf8")),
  );
  // Font/image failures are diagnosed by the browser. Page/theme/master failures are configuration errors.
  for (const f of [
    manifest.theme,
    ...Object.values(manifest.masters),
    ...manifest.slides.map((s) => s.file),
  ].filter(Boolean))
    await safeFile(root, f);
  return { root, manifest };
}
export async function initProject(destination) {
  const root = path.resolve(destination);
  await mkdir(root, { recursive: true });
  if ((await readdir(root)).length)
    throw new Error("Init destination must be empty");
  await cp(path.join(engineRoot, "templates/starter"), root, {
    recursive: true,
  });
  return { root, manifest: "deck.json" };
}
export function fileUrl(p) {
  return "/files/" + p.split("/").map(encodeURIComponent).join("/");
}
