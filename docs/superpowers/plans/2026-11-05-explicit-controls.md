# Explicit controls and native groups

**Goal:** One explicitly declared HTML control maps to one PPTX object, text stays one rich-text frame, groups become actual nested p:grpSp, raster exceptions use tight visible bounds.

**Architecture:** Strict browser-side controls collector → flat leaf scene plus group tree/control receipts → existing native emitter → OOXML rich-text/group assembly → recursive independent verification. Existing compatibility mode and legacy inference remain available. New starter/Skill use explicit controls.

**Contract:** `.slide[data-pptx-layout="controls"]`; `data-pptx="text|shape|image|raster|group|media"` and unique `data-pptx-id`; `data-pptx-group="card"` aliases the group control. Unmarked layout-only divs may use Grid/Flex but cannot add visible text or paints. Text controls contain inline rich text and br; unsupported CSS/structure fails with control ID rather than silently splitting. Group backgrounds are explicit shape controls. Explicit raster is the escape hatch.

- [x] Failing tests for one text frame with bold runs/newlines, real nested groups, duplicate IDs/unmarked content errors, and tight Canvas bounds.
- [x] Browser controls collector and inspect validation, preserving legacy routes.
- [x] Rich-text OOXML and group assembly with absolute child coordinates and matching group transforms.
- [x] Recursive object/control/paragraph/style verification and transparency cropping.
- [x] Explicit default starter, example, Skill/reference/docs and installed runtime.
- [x] Full suite, independent review, dual-mode exports, actual PPTX render, original/modified/rollback check.

Native charts/tables, animation, font embedding and arbitrary CSS support are not claimed. Group transforms are identity on export, with child coordinates preserved, so Office can move/resize/ungroup normally.
