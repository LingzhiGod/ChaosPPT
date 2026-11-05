# Phase-one verification record

Environment: macOS arm64, Node v22.23.2, locked Playwright Chromium.

## Automated
- Unit/integration/browser/CLI tests: `npm test`.
- Dependency audit: `npm audit` reports zero known vulnerabilities at execution.
- Engine-owned output publication, source hashes, PDF page count and size, PPTX slide order and embedded screenshot hashes verified through `verify`.
- Skill YAML/frontmatter validated with the skill-creator validator.

## Independent checks
- Code reviewer reproduced late CSS-image failure, lost body attributes and screenshot-induced WAAPI movement; all three were fixed and independently retested. Regression tests are retained.
- Skill evaluator used only the Skill/reference/runner to create a separate Chinese deck in /tmp and export/verify it. No substantive documentation/API blocker remained.

## Visual checks
- All three demo PNG pages inspected.
- All three pages of the actual vector PDF were rasterized with Poppler and inspected.
- Preview navigation, fixed-ratio fitting and saved-file reload exercised by Playwright.
- PPTX package placement, picture identity and page ordering verified directly; no claim of native PowerPoint/WPS application testing.

## Scope of certainty
`verify` is structural/integrity verification, not OCR, factual validation, full visual comparison or an application compatibility certification. Custom projects still need visual inspection, especially unusual fonts, intentional overlap, filters and user-managed animations.

## v0.2 media embedding

- 27 automated tests pass, including 9 media-specific integration/regression cases.
- MP4 and GIF original bytes, native relationships, poster hashes, object count and positions verified in actual PPTX packages.
- GIF static screenshots match across repeated builds; a transparent GIF background pixel regression checks preservation of element CSS color without baking frame zero underneath.
- Reviewer reproduced pointer-events:none foregrounds, transparent CSS backgrounds, ancestor rounded clipping, and animated video posters; all four are fixed and regression-tested. The last two original repros were independently rechecked after fixes.
- Actual media-example PNG and rasterized vector PDF inspected. Media fixtures are synthetic, locally generated with ffmpeg/Pillow; these tools are not export runtime dependencies.
- Installed Skill updated after comparing installed files with the prior Git baseline and backing them up outside the Skill directory.
- Native Office application playback has not been tested; MP4 codec/GIF playback support remains target-application dependent.

## v0.3 editable export (2026-11-05)

- Baseline v0.2: 27 tests passed. New full suite: 37 tests passed.
- Compatible remains the default. Default/explicit-compatible output image hashes match for a deterministic test deck.
- Editable tests inspect real DrawingML text, shapes, media object identity, placement and embedded raster assets. Corrupting scene receipts or native text (even after refreshing the outer PPTX hash) is detected.
- Independent review identified and reproduced hidden/boxless visible descendants, backdrop blending, mixed direct-text/positioned-child paint order, and preserved tabs. All were corrected with conservative fallback and regression tests; the reviewer rechecked the fixes.
- Demo and media decks exported in editable mode; the editable showcase exported and verified in both modes. Conversion receipts disclose text/shape/image/fallback counts and required fonts.
- Actual editable PPTX was rendered through bundled LibreOffice. Initial rendering without CJK fonts exposed missing glyphs; rendering with the same Noto Sans SC family supplied through a temporary Fontconfig file retained Chinese text. Fonts are not embedded in PPTX and must be available on the recipient system.
- Native text uses visual-line/run fragments, not full paragraph reflow. SVG/Canvas, charts/tables and complex styles are raster fallbacks. No claim of 95% editability, pixel-identical native typography, or native PowerPoint playback/compatibility certification.
- Preserved the newer main-branch design-principles and audience-focused copy rules while integrating the export changes.
- Final dependency audit identified a newly reported Zod advisory in 4.6.5; the locked dependency was upgraded to 4.6.6 and the subsequent audit reported zero known vulnerabilities. The unavailable local proxy was bypassed per-command without changing user proxy settings.

## v0.4 explicit controls (2026-11-05)

- Full suite: 53 tests pass, including explicit rich text, real nested group structure, one-to-one object counts, media inside groups, group-coordinate tampering, invalid declaration rejection, old-output preservation, and the new two-page starter.
- Text controls preserve paragraph breaks, inline emphasis, Unicode NBSP/full-width spaces and nowrap. Asymmetric CSS padding is written directly to the correct OOXML insets. Nested underline emphasis is retained.
- Independent review reproduced hidden-run visible descendants, overly broad whitespace collapse, nowrap/indentation and unmarked outlines. The original repros were rechecked after correction; unsupported structures are rejected, not silently discarded.
- Actual two-page control PPTX rendered with bundled LibreOffice using the supplied Noto Sans SC font. The XML contains genuine p:grpSp and a single p:txBody per text control. No claim of native PowerPoint UI testing.
- Explicit raster and legacy local fallback images are alpha-trimmed. The old showcase Canvas is now at x=1190,y=588,w=338,h=170 instead of a full-slide transparent picture.
- Installed Skill staged with its complete engine/templates and dependency audit: zero known vulnerabilities. New authoring uses explicit controls; compatibility export and old unmarked inference remain migration paths.
- Same-input transaction check: baseline produces no native group and fragmented text; modified produces one group and one text frame; rollback restores original source hashes and baseline behavior. Artifacts and literal outputs are recorded outside version control under artifacts/editable-transaction, retaining the previous transaction history.
