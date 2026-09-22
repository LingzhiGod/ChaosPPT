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
