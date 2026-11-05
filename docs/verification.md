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


## v0.5 control motion (2026-11-05)

- Full suite: 73 tests pass. Coverage includes strict schema/null/falsy rejection, click/with/after timing, repeated exit/entrance state, atomic group hiding, static canonical capture, reduced motion, native targets/presets/directions/durations, shared-key Morph, static-mode guards and tampering detection.
- Browser playback was exercised at intermediate fly/reveal/shared states, not only at endpoints. Unchanged shared text uses one interpolated instance to avoid duplicate glyphs during the transition.
- Independent review reproduced a previous-effect completion race, group-child visibility leakage and falsy-direction validation. All three original repros were independently rerun after fixes.
- The four-page native example contains 10 control effects. Bundled LibreOffice imported the PPTX as real entrance/exit Fade, Fly and Wipe behaviors with direction and trigger modes; it falls back to Fade for Morph. The import receipt is in artifacts/motion/native-import-check.json outside version control.
- Morph uses stable !! names for shared objects/members and page-unique names for others. Verification checks actual native timing and requested/applied correspondence, not just metadata presence.
- This is semantic effect correspondence, not cross-software frame identity. Native PowerPoint/WPS slideshow playback was not certified. Media targets, media-containing groups and arbitrary CSS animation are not silently mapped.


## Motion example refinement (2026-11-05)

- P2/P3 shared focus-card now has identical 530×300 bounds; title/body widths are 474px and relative offsets/font sizes stay equal. This is a recommended authoring constraint, not an engine-level ban on resizing or a claim that all native playback issues are fixed.
- P1 chart matches the supplied reference values: planning 54/36, layout 68/47, collaboration 81/63, delivery 94/72. The 0–100 axis uses 5.6 CSS px per unit, with 8 native colored bars and native numeric labels.
- Each click reveals one category's orange/blue bars; the blue bar starts 120ms later, and both values fade in after the bars finish. The full example now has 23 native effects.
- Export/verify, native widths/colors/values, browser intermediate visibility and equal-size shared geometry were checked. LibreOffice imports all 23 native effects; this remains import verification rather than PowerPoint/WPS slideshow certification.
