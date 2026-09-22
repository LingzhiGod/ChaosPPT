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
