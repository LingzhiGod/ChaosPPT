# Engine reference — v0.5

Deck planning and visual review follow the built-in [design principles](design-principles.md): shared theme/masters, stable semantic encodings, task-based chart selection and whole-deck review. These guide Agent decisions and do not add automatic design checks to the renderer.

Visible slide text follows the built-in [copy rules](copy-style.md), including master footers and chart labels. Production TODOs belong in `notes` or the handoff; sources and audience-relevant data labels retain their factual role. The renderer does not remove text by keyword.

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

New projects use a two-page Chinese explicit-controls starter with a local OFL Noto Sans SC variable font. Keep its OFL notice when distributing the font. Installed skills carry the engine and dependencies in `assets/engine`; the repository installer prepares this bundle. If manually copying only the skill folder, set `CHAOSPPT_ENGINE` to an engine repository with dependencies installed.

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

`verify` checks source fingerprint, PNG hashes/dimensions, artifact hashes, PDF page count/size, PPTX slide order, embedded image hashes and full-page placement, plus native media bytes/relationships/posters/geometry. It does not open PowerPoint or compare rasterized PDF pixels. `partial: true` indicates a selected-page build. Notes and source strings are written into PPTX notes; metadata does not automatically add visible citations to page content.

## Runtime boundary

The service binds to 127.0.0.1 and exposes project files, not arbitrary filesystem paths. Traversal and escaping symlinks are rejected. Rendering blocks remote HTTP/WebSocket access by default; opt in through allowRemote only when needed. This is a trusted-authoring browser environment, not isolation for hostile scripts. Use an OS/container boundary for untrusted projects. Avoid relying on mutable remote resources for reproducible exports.

## Visual PDF QA

If Poppler's `pdftoppm` is available, render the actual PDF pages for inspection:

```sh
mkdir -p /tmp/chaosppt-pdf-review
pdftoppm -scale-to 1600 -png PROJECT/dist/deck.pdf /tmp/chaosppt-pdf-review/page
```

Use an available image viewer to inspect all pages against the PNGs at a comparable scale. This optional QA tool is not bundled with the Node engine. Put QA images outside the deck project, otherwise creating them changes the source fingerprint. If a browser-print effect differs from the screenshot, use `--pdf-mode raster` for image fidelity, and verify/review the new final export again.


## Native MP4 / animated GIF embedding (v0.2)

Opt in with a boolean HTML attribute. Unmarked elements keep their existing flattened behavior.

```html
<video data-pptx-media data-element-id="demo-video"
  src="../assets/demo.mp4" poster="../assets/poster.png"
  controls preload="metadata"
  style="width:640px;height:360px;object-fit:fill"></video>

<img data-pptx-media data-element-id="process-gif"
  src="../assets/process.gif" alt="Process animation"
  style="width:640px;height:360px;object-fit:fill">
```

- Use local project MP4/GIF files. `<video><source src="...mp4"></video>` is also supported. Remote URLs, blob/data sources and other media extensions are rejected for native embedding, even when allowRemote is enabled.
- MP4 requires a local `poster` image; this avoids relying on a decoded random video frame. Poster assets must be PNG/JPEG; their first frame is rasterized too, so an APNG poster is deterministic. Match media dimensions/aspect ratio to avoid stretching. MP4 bytes are preserved, not transcoded; playback codec support depends on the receiving presentation app.
- GIF bytes, frames, transparency and loop metadata are preserved in PPTX. PDF/PNG freeze the first GIF frame using Chromium ImageDecoder. MP4 uses the poster in static outputs.
- Native overlays require plain, topmost rectangles: square corners, object-fit:fill, no padding/border on the media itself, no transformed/filtered/masked/translucent ancestors, no clipping or foreground captions over media. Put decorative frames and captions in separate surrounding containers. Unsupported styling is diagnosed instead of silently approximated. The occlusion checks are geometric heuristics; inspect complex layering manually.
- The PPTX background excludes the static media pixels but preserves the underlying CSS background. This prevents a GIF's frozen first frame leaking through later transparent frames.
- Browser controls/autoplay/muted/loop attributes govern HTML preview only. Native MP4 uses the presentation app's playback controls; autoplay, audio settings and loop are not mapped from HTML. GIF animation is a slideshow-view capability and varies across apps/versions; edit view may display one frame.
- A PPTX contains the actual local media, not a network link. No separate video files are needed by its recipient. `dist/media/` stores source bytes and captured posters for verification; build.json records each media object's geometry and hash plus a separate slide background.
- `verify` checks embedded MP4/GIF and poster hashes, native relationships, object counts and positions. It is not a native PowerPoint/WPS playback test. Confirm playback in the target app before an important presentation.

Supply your own local MP4/GIF files and MP4 poster using the declarations above. ffmpeg is not required by the export engine.


## PPTX export modes (v0.3)

```sh
node RUNNER export PROJECT --format pdf,pptx --pptx-mode compatible
node RUNNER export PROJECT --format pdf,pptx --pptx-mode editable
```

`compatible` is the unchanged default: a browser-rendered full-page image (with marked native media on top). It is the preferred visual-fidelity route. `editable` is an opt-in hybrid route. Both preserve the same reference PNG/PDF capture and native MP4/GIF behavior. The mode is a CLI export option, not a deck.json field. Each successful build replaces dist, so copy completed outputs outside the project before building another mode.

Legacy inference mappings (unmarked pre-v0.4 pages only; new pages follow the [explicit controls contract](controls.md)):
- Visible text becomes native text boxes using measured visual lines/runs; bold, italic, color, font size, tracking and basic decorations are mapped. Mixed formatting and wrapped paragraphs can become multiple text boxes. Reflow, semantic paragraph structure, hyperlinks and accessibility semantics are not reconstructed.
- Solid backgrounds, rectangles, uniform rounded cards, solid borders and simple lines become native shapes. Flex/Grid is resolved by the browser to fixed positions, not exported as responsive layout rules.
- Ordinary `<img>` becomes a separately movable/resizable/replaceable picture using its browser-rendered pixels. Cropping is baked into those pixels, so this is not recovery of original image regions beyond the visible crop.
- SVG/Canvas, tables, list markers, CSS gradients/shadows/filters, custom components and unsupported layouts fall back to isolated transparent raster layers. They are not reported as native geometry/data charts/tables. Complex nested stacking and backdrop-dependent effects may require a larger subtree or whole-page fallback.
- Set `data-pptx-export="raster"` on a container to explicitly preserve that subtree as an image. This is an export hint, not a way to suppress ordinary overflow/resource diagnostics.

Inspect `dist/conversion.json`: per-page text/shape/image/fallback/media counts, required fonts, native DOM-text character counts, rasterized DOM-text counts, and every fallback's source ID/reason. Add `data-element-id` to meaningful content so these reports are actionable. DOM-text statistics exclude lettering inside images/Canvas and are NOT an overall editability or visual-fidelity percentage. Fallbacks are expected nonblocking outcomes in this mode.

`dist/editable/` holds the scene JSON and captured assets; build.json records their hashes. `verify` additionally parses actual PPTX objects and checks scene hashes, object order/types/positions, text content/font size, image bytes and native media links. It is structural verification, not a pixel-diff or semantic understanding test.

Fonts are NOT embedded in editable PPTX. Install the reported font families on the target presentation machine; otherwise substitution, changed spacing or missing glyphs can occur. The bundled example font may be loaded by HTML without being installed for Office. Inspect native PPTX with the same fonts available. PNG/PDF remain useful browser references, not evidence that the native PPTX looks identical. Use compatible mode when appearance takes priority.

Editable export provides native text/basic shapes/pictures; native data charts/tables, SVG path editing, automatic font embedding remain separate future features; declared native motion/transitions are described in [motion.md](motion.md).


## Explicit authoring (v0.4)

New `init` projects use `.slide[data-pptx-layout="controls"]` and explicit control IDs. Any data-pptx or data-pptx-group declaration also activates strict controls mode for that page. Read [controls.md](controls.md) for required markup, supported styles and 1:1 semantics. `inspect` validates declarations; editable export blocks invalid controls, while compatible export can still capture their browser appearance.

Text controls emit one rich-text frame, preserving semantic inline runs and explicit paragraph breaks. Groups emit native nested `p:grpSp`. Raster controls—and legacy local fallback assets—are trimmed to their nontransparent bounds before PPTX insertion; complete-scene compositing fallbacks stay complete scenes. The conversion report records authoringMode, control IDs, richtext/group counts and fonts. Structural verify checks group hierarchy, neutral child transforms, one-to-one control identity, text paragraphs/runs and run formatting. Old HTML remains an explicit migration path, not the recommended new-authoring surface.


## Motion (v0.5)

See [motion.md](motion.md) before adding effects. `data-pptx-motion` adds a validated page-local effect sequence to a control; `data-pptx-shared` plus `slides[].transition` declares shared-object page transitions. `--motion-mode native|static` controls whether PPTX preserves declared effects (default native). Source layout stays canonical for PDF/PNG. New reports include `motion.json`; native export refuses unsupported mode combinations rather than silently dropping animations.
