---
name: chaosppt
description: Use when designing presentations through HTML, CSS and JavaScript with the ChaosPPT engine, or delivering PDF and image-based PPTX from user materials. Also use for editing an existing deck.json project. Native editable PPTX objects are outside this workflow.
---

# ChaosPPT

Design freely in browser-native files. Treat HTML as the design source; PDF and PPTX are build outputs.

## Start

Resolve this skill's directory and call `node <skill-dir>/scripts/run.mjs --help`. The runner uses the bundled engine when installed, or the repository engine during development. Read [the engine reference](references/engine.md) before authoring; it defines the actual manifest and async APIs. Never guess a readiness API.

1. Map the user's materials to ordered pages, each with a purpose and sources. Preserve supplied facts; label any synthetic data. Confirm only material missing requirements.
2. `init` an empty project directory. Set `deck.json` size, fonts, theme, masters and ordered slide IDs. Use local resources; remote access is off by default.
3. Design representative pages before the full deck. Use CSS Grid/Flex or custom HTML/SVG/Canvas. Keep visual language consistent without repeating one layout. Use `data-element-id` on important elements.
4. Register asynchronous data/chart work immediately using `ChaosPPT.waitUntil(promise)`. Await fonts before drawing Canvas text. Use `onCapture` for a deterministic static state; stop application-owned animation loops there.
5. Run `inspect --json`, fix errors, then `render`. Review every generated PNG, including Chinese glyphs, long titles, chart labels, clipping and overall visual rhythm. Diagnostics are heuristic, not a visual-quality verdict. Prefer reorganizing text to shrinking it below readable size. Use `data-allow-overflow` only for intentional decorations, never to hide content errors.
6. Run `export --format pdf,pptx`, then `verify`. Export blocks on errors. The `dist` directory is generated and replaced on successful builds; keep user sources elsewhere.
7. Deliver source project plus requested outputs. Explain that PPTX pages are full-page images with notes. PDF defaults to browser text/vector output; use raster mode when requested for screenshot fidelity. Inspect PDF pages too; structural verification alone does not prove visual equivalence. Claim PowerPoint compatibility testing only if actually performed.

The runtime supports fixed canvases, browser layout, local fonts, masters, preview fade transitions and static exports. It does not automatically paginate arbitrary HTML or convert HTML animations to PPTX transitions.
