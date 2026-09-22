# Skill behavior validation

## Baseline (before SKILL.md)
Independent scenario: turn Chinese materials into ten slides with local fonts, long titles and async Canvas; export PDF and image-PPTX. The evaluator correctly requested missing engine contracts rather than guessing them. Observed gaps: actual manifest and ordering, font resolution, precise ready API, PDF media mode, export options, verify scope. Without these contracts the task could not be executed reproducibly.

## Skill intervention
The skill links one engine reference defining those contracts, provides a runner resolving repository or bundled engine, requires immediate promise registration and visual review, and distinguishes image-PPTX and structural validation from editable output and native-application verification.

## Forward test
Recorded after independent execution; see completion notes below.

Independent forward execution succeeded on a new `/tmp` project: three Chinese slides, local variable font, two-line long title, asynchronous Canvas data loaded through fetch, capture hook, source disclosure, and actual CLI init/inspect/render/export/verify. Results: 0 errors, 0 warnings, full three-page PDF/PPTX verification. The evaluator viewed all PNG and PDF pages. Added PDF QA command and project-external QA path guidance based on this run. The evaluator used raster PDF for final delivery; primary review also checked the retained vector PDF independently.

Review correction: the evaluator initially suspected vector-PDF label drift, then withdrew it after coordinate/hash comparison. The retained vector PDF renders correctly. No reproducible PDF rendering defect was found in this forward test.
