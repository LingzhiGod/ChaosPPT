---
name: chaosppt
description: Use when designing presentations through HTML, CSS and JavaScript with the ChaosPPT engine, or delivering PDF and image-based PPTX from user materials. Also use for editing an existing deck.json project. Native editable PPTX objects are outside this workflow.
---

# ChaosPPT

Design freely in browser-native files. Treat HTML as the design source; PDF and PPTX are build outputs.

## General presentation design — always apply

Read [the design principles](references/design-principles.md) before planning layouts or choosing charts. Apply these defaults to every deck, together with the user's brand, template and audience requirements.

- Establish one deck-wide visual system in shared `theme.css` and masters: font roles and size hierarchy, palette, spacing/grid, safe margins, graphic treatments and chart styles. Keep the same entity/status mapped to the same color, label and unit across pages. Use deliberate theme variants for covers, sections or conclusions.
- Give each page one clear information goal and visual focus. Use hierarchy, contrast, alignment, proximity, repetition and whitespace to guide reading. Reorganize or split crowded content while maintaining readable text and chart labels.
- Choose visuals by the audience's analytical task: comparisons/rankings → bars or dots; trends → lines; composition → part-to-whole charts; distributions → histograms/box plots; relationships → scatter; exact lookup → tables; processes/hierarchies → diagrams. Check the selection guide for prerequisites and exceptions before implementation.
- Match visual encodings to evidence. Preserve denominators, units, periods, category order, missing values and negative values. Keep comparable axes/scales consistent; use zero-based bar lengths. Pair semantic colors with labels or shapes. Use decorative elements to reinforce the message and support legibility.
- Review both individual slides and the deck as a sequence before export: theme consistency, narrative flow, readable hierarchy, correct visual selection, truthful scales and useful labels. Follow the copy rules during that review. Rendering diagnostics provide layout measurements; the Agent performs the design review.

## Presentation copy style — always apply

Write for the audience's question and the strongest supported message. Read [the copy rules](references/copy-style.md) before drafting or revising visible slide text; they apply to every deck without a separate skill invocation.

- Keep authoring housekeeping out of titles, footers, badges, captions and tiny text. Do not add “待测”“待补充”“真实材料待补充”“数据待核实”“仅供参考”“以实际为准” or equivalent English disclaimers to compensate for missing input or unperformed checks.
- When evidence is missing, omit the unsupported metric/chart, narrow the claim, or use a factual qualitative explanation. Record production questions in `notes` or the handoff, away from the slide canvas. Never fabricate evidence or present synthetic numbers as measured results.
- Keep audience-relevant facts: requested test-plan statuses, decision-critical limitations, exact quotations, real citations, and a concise forecast/sample-data label when needed to interpret the content. State these once in ordinary readable content, with their actual scope.
- Before export, review **all visible copy**, including master footers, SVG text and Canvas labels. Remove unsolicited drafting reminders and self-protective fine print; shortening, shrinking, fading or moving them to another visible corner does not resolve the issue. Keep only text that advances the page's message or supplies necessary interpretation.

## Start

Resolve this skill's directory and call `node <skill-dir>/scripts/run.mjs --help`. The runner uses the bundled engine when installed, or the repository engine during development. Read [the engine reference](references/engine.md) before authoring; it defines the actual manifest and async APIs. Never guess a readiness API.

1. Map the user's materials to ordered pages, each with a purpose, sources and a visual choice justified by its information goal. Preserve supplied facts and follow the copy rules when handling gaps or synthetic data. Confirm only material missing requirements.
2. `init` an empty project directory. Set `deck.json` size, fonts, theme, masters and ordered slide IDs. Establish the shared visual system in project files before expanding the deck. Use local resources; remote access is off by default.
3. Design representative pages before the full deck. Use CSS Grid/Flex or custom HTML/SVG/Canvas. Apply the shared design principles and chart selection guide; vary compositions to fit the content while retaining the deck's visual identity. Use `data-element-id` on important elements.
4. Register asynchronous data/chart work immediately using `ChaosPPT.waitUntil(promise)`. Await fonts before drawing Canvas text. Use `onCapture` for a deterministic static state; stop application-owned animation loops there.
5. Run `inspect --json`, fix errors, then `render`. Review every generated PNG using the design and copy checklists; inspect Chinese glyphs, long titles, chart labels and clipping. Compare all pages together for theme drift and visual rhythm, using a thumbnail overview when useful. Diagnostics are heuristic, not a visual-quality verdict. Prefer reorganizing text to shrinking it below readable size. Use `data-allow-overflow` only for intentional decorations, never to hide content errors.
6. Run `export --format pdf,pptx`, then `verify`. Export blocks on errors. The `dist` directory is generated and replaced on successful builds; keep user sources elsewhere.
7. Deliver source project plus requested outputs. Explain that PPTX pages use image backgrounds with notes; explicitly marked MP4/GIF elements are native media overlays. For media authoring, read the embedding section of the engine reference and supply local MP4 posters. PDF defaults to browser text/vector output; use raster mode when requested for screenshot fidelity. Inspect PDF pages too; structural verification alone does not prove visual equivalence. Claim PowerPoint compatibility testing only if actually performed.

The runtime supports fixed canvases, browser layout, local fonts, masters, preview fade transitions, static PDF/PNG, and native MP4/GIF embedding in PPTX. It does not automatically paginate arbitrary HTML or convert HTML animations to PPTX transitions.
