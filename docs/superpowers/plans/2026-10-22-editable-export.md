# Editable export implementation plan

**Goal:** Add opt-in editable PPTX alongside unchanged compatibility export, with measured browser layout, typed conversion receipts and explicit raster fallback.

**Architecture:** A browser-side extractor walks a supported paint-order subset into an ordered scene (shape, text line, image, fallback, media). Complex subtrees are captured in isolation at their original coordinates. A native writer emits PptxGenJS objects; the existing PDF/PNG capture and compatible media path stay intact. Build verification dispatches by mode and checks every native object's identity/type/geometry/content or embedded image hash.

**Tech stack:** Existing Playwright, PptxGenJS, fflate, plus an XML parser for independent OOXML verification.

## Implementation checkpoints
- [x] Add failing tests: `buildProject(root,{formats:['pptx'],pptxMode:'editable'})` has real `a:t` text, shape geometry, editable image assets, local Canvas/SVG fallback and receipts. Default vs explicit compatible mode preserve embedded full-slide PNG hashes.
- [x] Implement `src/editable/extract.js`: resolved rectangles, safe colors, visual-line text runs, supported backgrounds/borders, stable object IDs, ordered element traversal, conservative fallback reasons for effects/transforms/z-index/complex clipping.
- [x] Implement `src/editable/capture.js`: isolated transparent subtree screenshots, image loading, no duplicate baked text; restore DOM after capture. Canvas/SVG remain raster assets in this release; report them as fallback, not native geometry/charts.
- [x] Implement `src/editable/write.js`: native shape/text/image objects and scene media placeholders, no full-slide image in a normally convertible deck.
- [x] Extend renderer/CLI with `--pptx-mode compatible|editable`, default compatible. Produce `conversion.json` plus scene assets; keep PDF/PNG unchanged and transaction/error protection intact.
- [x] Extend verify: backward-compatible manifests; scene and conversion-report hashes; actual shape-tree order, content, dimensions, image assets and media relationships. Add deliberate tampering tests.
- [x] Create editable showcase and dual-mode smoke exports; inspect actual PPTX render using bundled LibreOffice where available. Native Office text may differ; do not claim pixel identity or a measured 95% conversion rate.
- [x] Run all tests and independent code review; update README/Skill/reference; sync tested changes back to main workspace and installed skill without automatic GitHub push.

## Acceptance
```sh
npm test
node src/cli.js export examples/editable --pptx-mode editable
node src/cli.js verify examples/editable
node src/cli.js export examples/demo --pptx-mode compatible
```
Editable mode retains visible body text as native text where supported, resolves Flex/Grid to fixed coordinates, separates background/border paints, embeds regular images, preserves native MP4/GIF, and inventories every fallback. It is a hybrid export, not full arbitrary-CSS support. Compatible mode remains the reference for maximum visual retention; its bitmap/media nature and application-dependent playback remain unchanged.
