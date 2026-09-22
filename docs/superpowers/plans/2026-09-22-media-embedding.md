# MP4 / GIF embedding implementation plan

**Goal:** Embed local MP4 video and animated GIF into PPTX while retaining deterministic static PDF/PNG output.

**Architecture:** Explicit `data-pptx-media` HTML markers identify media. A browser capture pass measures flat, topmost rectangles and freezes MP4 to its required poster and GIF to frame zero. PPTX receives a separate background without the marked media plus native video/image objects. Original bytes, hashes, geometry and poster are recorded and verified.

**Tech stack:** Existing Chromium/Playwright, PptxGenJS addMedia/addImage, ImageDecoder for GIF first frame, local asset path checks.

- [x] Add failing tests using small generated MP4, animated transparent GIF and poster fixtures.
- [x] Implement source/path/signature checks, browser media preparation and geometry constraints in src/media.js.
- [x] Integrate prepare/inspect/static capture/native embedding into renderer without altering default unmarked pages.
- [x] Extend verify with per-object media relationships, bytes and placement plus static/background hashes.
- [x] Provide runnable examples/media, tests for missing poster, wrong format, clipping/transforms, GIF determinism and old output preservation.
- [x] Update Skill/reference/README and installed engine; perform full tests and independent code review.

Contract: `<video data-pptx-media src="../assets/clip.mp4" poster="../assets/poster.png" controls>`; `<img data-pptx-media src="../assets/animation.gif">`. Rectangular top-layer media, no CSS crop/masks/transforms/opacity effects; layout in CSS px maps to PPTX inches. MP4 poster required for codec-independent static output. HTML retains normal playback; PPTX uses native playback behavior, not promised autoplay/loop equivalence. No automatic GitHub push in this task.
