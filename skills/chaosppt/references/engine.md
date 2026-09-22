# Engine reference — v0.1

## Invocation

Replace `RUNNER` below with the absolute path of this skill's `scripts/run.mjs`; `PROJECT` is the deck directory, not the engine repository. Quote paths with spaces.

```sh
node RUNNER init PROJECT
node RUNNER dev PROJECT --port 4173
node RUNNER inspect PROJECT --json
node RUNNER render PROJECT --slides cover,evidence --scale 2
node RUNNER export PROJECT --format pdf,pptx --pdf-mode vector
node RUNNER verify PROJECT --json
```

`--slides` supports inspect/render only and keeps manifest order, regardless of option order. `export` always builds all pages. `--scale` is 1–4 and affects PNG/PPTX resolution, not layout. PDF modes: `vector` (browser print, text where possible) and `raster` (one screenshot per page). Exit statuses: 0 success, 1 failed diagnostics/verification, 2 invocation/config/runtime error. Errors with `--json` are JSON on stdout. `dev` prints its URL and remains running until interrupted.

The engine bundles a three-page Chinese starter with a local OFL Noto Sans SC variable font. Keep its OFL notice when distributing the font. Installed skills carry the engine and dependencies in `assets/engine`; the repository installer prepares this bundle. If manually copying only the skill folder, set `CHAOSPPT_ENGINE` to an engine repository with dependencies installed.

## Manifest

`deck.json` is strict JSON; unknown properties are rejected. Paths are project-relative and must stay inside the project. The project root is the HTTP asset boundary. Do not place credentials in it.

```json
{
  "version": 1,
  "title": "季度回顾",
  "size": {"width":1600,"height":900},
  "theme": "theme.css",
  "fonts": [{"family":"Noto Sans SC","file":"assets/NotoSansSC.ttf","weight":"100 900","style":"normal","sample":"ABC中文123"}],
  "masters": {"content":"masters/content.html"},
  "render": {"timeoutMs":20000,"scale":2,"allowRemote":false,"seed":42},
  "slides": [
    {"id":"overview","file":"slides/overview.html","title":"季度概览","message":"本页核心结论","purpose":"支持资源决策","master":"content","sources":["materials/data.csv"],"notes":"讲者备注"}
  ]
}
```

Required: version/title/slides; each slide requires id/file. IDs contain letters, digits, underscore or hyphen; unique across the deck. Defaults: 1600×900, render timeout 15000ms, scale 2, no remote requests, seed 42. Font style is normal/italic/oblique; weight is one CSS weight or a variable-font range. Supported canvas: width 320–7680, height 240–4320. Timeout: 1000–120000ms. Font declarations load only declared files; a loaded face does not prove glyph coverage. Inspect actual Chinese/emoji/rare glyph output.

## HTML, resources, theme and master

Each slide is a complete HTML document or an HTML fragment. Without a master, it must contain exactly one `.slide` root. With a master, the master provides that root and the slide supplies its inner content. Keep per-page CSS in `<style>` within the head. Scripts can be inline, external JS, or browser ES modules; bare npm imports require bundling by the author. JSX/TypeScript are not transpiled by the engine.

Relative image/script/fetch paths resolve relative to the slide file, not the master. For shared master resources use `/files/assets/logo.svg`. CSS `url()` resolves relative to its CSS file. Engine routes inject CSS and `window.ChaosPPT` before user scripts.

Example master:
```html
<section class="slide">
  {{content}}
  <footer class="footer"><span>{{title}}</span><span>{{page}} / {{total}}</span></footer>
</section>
```

There must be exactly one `{{content}}` marker. Page numbers are one-based manifest positions. The other markers are optional. The injected `@page` uses canvas px at 96dpi; PDF points are px × 0.75, PPTX inches are px ÷ 96.

Theme variables: `--bg`, `--fg`, `--muted`, `--accent`, `--font-body`, `--font-display`, `--space`, `--safe`. Geometry variables `--slide-width`, `--slide-height` are owned by the engine. Helpers: `.slide`, `.slide-header`, `.eyebrow`, `.footer`, `.stack`, `.row`, `.grid`, `.cols-2`, `.cols-3`. They are optional outside the required root. All are ordinary CSS. A slide remains at fixed logical dimensions while the preview scales around it.

## Rendering lifecycle

```html
<canvas id="chart" width="1600" height="800" style="width:800px;height:400px"></canvas>
<script>
ChaosPPT.waitUntil((async () => {
  const response = await fetch('../assets/data.json');
  if (!response.ok) throw new Error('Chart data failed');
  const values = await response.json();
  await document.fonts.load('400 24px "Noto Sans SC"');
  const ctx = document.getElementById('chart').getContext('2d');
  ctx.scale(2, 2);
  ctx.font = '24px "Noto Sans SC"';
  ctx.fillText(String(values.total), 30, 50);
})());
ChaosPPT.onCapture(() => {
  // Stop your own timers/RAF loops here and draw a final state, if applicable.
});
</script>
```

Register `waitUntil` in initial script execution, not in an untracked future timer. It accepts a Promise; rejection is an error. Nested tracked work is drained. Capture callbacks may return Promises and run after initially registered work. Preparation disables CSS animation/transitions, pauses media/WAAPI, waits for explicit fonts, tracked work, capture hooks, image decode, and stable measured geometry. The renderer enforces a deadline. JavaScript animation loops and unregistered asynchronous work still require the author's cooperation; the engine does not infer Canvas readiness. `Math.random` is seeded; current time and external services are not made deterministic.

## Diagnostics and export outputs

`inspect` returns per-page issues plus named-element bounds and computed font-family stacks. It checks the root, out-of-canvas bounds, clipping/scroll-container overflow, text clipped by ancestors, small text, failed fonts/images/resources, script errors, blocked network and render deadlines. Arbitrary overlap, CSS visual effects, missing glyphs and factual correctness require visual/content review. `data-allow-overflow` exempts an explicitly marked decorative subtree from geometry checks.

`render` writes PNGs even when geometry diagnostics fail (deadline failures may have no PNG), and exits 1 for errors. `export` stops on any error and preserves the previous successful output. Warnings are nonblocking.

```
dist/
  .chaosppt-output
  slides/001-overview.png
  report.json
  build.json
  deck.pdf
  deck.pptx
```

Each successful render/export replaces the entire engine-owned dist; rendering PNGs after exporting removes the old exports. Keep delivery builds separate or export again as the final command. An existing dist without the ownership marker is protected. A per-project lock prevents concurrent builders.

`verify` checks source fingerprint, PNG hashes/dimensions, artifact hashes, PDF page count/size, PPTX slide order, embedded image hashes and full-page placement. It does not open PowerPoint or compare rasterized PDF pixels. `partial: true` indicates a selected-page build. Notes and source strings are written into PPTX notes; metadata does not automatically add visible citations to page content.

## Runtime boundary

The service binds to 127.0.0.1 and exposes project files, not arbitrary filesystem paths. Traversal and escaping symlinks are rejected. Rendering blocks remote HTTP/WebSocket access by default; opt in through allowRemote only when needed. This is a trusted-authoring browser environment, not isolation for hostile scripts. Use an OS/container boundary for untrusted projects. Avoid relying on mutable remote resources for reproducible exports.

## Visual PDF QA

If Poppler's `pdftoppm` is available, render the actual PDF pages for inspection:

```sh
mkdir -p /tmp/chaosppt-pdf-review
pdftoppm -scale-to 1600 -png PROJECT/dist/deck.pdf /tmp/chaosppt-pdf-review/page
```

Use an available image viewer to inspect all pages against the PNGs at a comparable scale. This optional QA tool is not bundled with the Node engine. Put QA images outside the deck project, otherwise creating them changes the source fingerprint. If a browser-print effect differs from the screenshot, use `--pdf-mode raster` for image fidelity, and verify/review the new final export again.
