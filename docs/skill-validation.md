# Skill behavior validation

## Baseline (before SKILL.md)
Independent scenario: turn Chinese materials into ten slides with local fonts, long titles and async Canvas; export PDF and image-PPTX. The evaluator correctly requested missing engine contracts rather than guessing them. Observed gaps: actual manifest and ordering, font resolution, precise ready API, PDF media mode, export options, verify scope. Without these contracts the task could not be executed reproducibly.

## Skill intervention
The skill links one engine reference defining those contracts, provides a runner resolving repository or bundled engine, requires immediate promise registration and visual review, and distinguishes image-PPTX and structural validation from editable output and native-application verification.

## Forward test
Recorded after independent execution; see completion notes below.

Independent forward execution succeeded on a new `/tmp` project: three Chinese slides, local variable font, two-line long title, asynchronous Canvas data loaded through fetch, capture hook, source disclosure, and actual CLI init/inspect/render/export/verify. Results: 0 errors, 0 warnings, full three-page PDF/PPTX verification. The evaluator viewed all PNG and PDF pages. Added PDF QA command and project-external QA path guidance based on this run. The evaluator used raster PDF for final delivery; primary review also checked the retained vector PDF independently.

Review correction: the evaluator initially suspected vector-PDF label drift, then withdrew it after coordinate/hash comparison. The retained vector PDF renders correctly. No reproducible PDF rendering defect was found in this forward test.

## 2026-10-22: audience-facing copy constraint

Baseline behavior was reproduced with an independent agent using the prior Skill. Given a business-facing product introduction with confirmed layout/export/media capabilities but no performance measurements or native Office playback acceptance, it added a visible footer: “待验证：吞吐量与耗时测试、原生 Office 播放验收。” The audience had not requested a test-status slide.

The revised Skill loads copy rules before authoring, distinguishes production housekeeping from audience-relevant facts, and requires a visible-copy review before export. Rules are built in and link to the supplied anti-defensive-writing reference for attribution; no runtime download or separate skill is required. Starter and demo copy now use one concise synthetic-data label instead of a repeated badge/disclaimer.

An independent forward test used the updated Skill for three requests:

- Product capabilities: supported capabilities retained; performance/playback work items stayed in notes; no visible pending-work footer or unsupported claims.
- Explicit test-status page: both passing checks and the user-supplied Office playback “待测” status retained.
- Synthetic quarterly chart: one synthetic-data label, correct Q1–Q4 data and 32% Q1-to-Q4 growth, no repeated defensive footer.

Skill frontmatter validation passed. A fresh project initialized from the updated starter rendered its evidence page with zero errors and zero warnings. This checks authoring behavior and template layout; the renderer does not perform semantic copy enforcement or keyword deletion.

## 2026-10-22: shared visual system and general design principles

A baseline agent planned a six-page operating review using the previous Skill. Its choices were sensible, but it identified chart prerequisites, semantic color mappings, scales, missing values and whole-deck theme details as decisions left to its own judgment. The new rules make these reusable decisions explicit in the Skill entrypoint and its required design reference.

The update covers a shared CSS/master visual system, theme variants, hierarchy/alignment/proximity/contrast/whitespace, readability, sixteen task-based visual choices, truthful data encodings and both slide-level and sequence-level review. User brands and concrete themes remain project choices.

An independent forward test read the revised Skill and references and completed two planning tasks:

- Six-page operating review: shared blue/teal theme and a coordinated dark conclusion; trends with a missing-month gap and negative values; ranked regional bars; 100% channel composition; paired-observation scatter without causal claims; a precise budget table; and ordered conversion bars with correct denominators and a 16% overall conversion rate. The review plan included semantic colors, common scales, legibility, source checks and whole-deck comparison.
- Unsupported visual requests: a mean alone remained a key number rather than an invented box plot; overlapping channels without a total became independent counts instead of a part-to-whole chart; decorative error bars were omitted. Material collection tasks stayed in notes while audience-relevant counting scope remained visible.

No substantive conflict between the design and copy rules was found. These were independent design-planning evaluations, not rendered presentation or engine regression tests. Frontmatter validation and local-reference resolution passed for repository and installed Skill. Runtime and renderer files were unchanged.
