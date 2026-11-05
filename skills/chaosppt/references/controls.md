# Explicit controls — v0.4

## Authoring contract

New pages use `.slide[data-pptx-layout="controls"]`. Every visible object has `data-pptx` and a page-unique `data-pptx-id` (letters, digits, `-`, `_`). IDs are stable editing/verification anchors. One visible control maps to one PPTX object; a group maps to one native group containing its separately declared children. Slide background is presentation metadata, not an extra authored control.

```html
<section class="slide" data-pptx-layout="controls">
  <div data-pptx-group="card" style="position:relative;width:640px;height:300px">
    <div data-pptx="shape" data-pptx-id="card-bg"
      style="position:absolute;inset:0;background:#e4ebdc;border-radius:12px"></div>
    <div style="position:relative;padding:28px">
      <div data-pptx="text" data-pptx-id="body"
        style="font-size:28px;line-height:1.5">
        一个完整的段落，包含 <b>局部加粗</b>。<br>
        换行仍然在同一个文本框内。
      </div>
    </div>
  </div>
</section>
```

`data-pptx-group="card"` aliases `data-pptx="group" data-pptx-id="card"`. Nested groups work. Group/layout containers are unpainted: backgrounds and borders belong to explicit shape controls or to a text control's own fill/border. Use DOM order for stacking; non-auto z-index and transforms are rejected. Controls are isolated paint units, matching the atomic stacking behavior of native PPT objects.

## Control types

| Type | Native result | Input |
| --- | --- | --- |
| text | One text shape with rich-text runs and paragraphs | A div/h1/h2/etc containing text, span, b/strong, i/em, u, s/strike, br |
| shape | One native shape | Empty element with solid fill/uniform solid border and rect/roundRect/ellipse geometry |
| image | One replaceable picture | img; browser-rendered fit/crop is baked into image pixels |
| group | One real PPT group | Declared child controls, nested groups and optional unpainted layout divs |
| media | One native MP4/GIF object | Existing data-pptx-media contract plus data-pptx="media" and ID |
| raster | One tightly cropped picture | Explicit exception for Canvas, SVG, shadows or supported isolated complex HTML |

Shape geometry is inferred from uniform CSS corner radius or explicitly set by `data-pptx-shape="rect|roundRect|ellipse"`. Ellipse gets border-radius:50% in the runtime stylesheet. The geometry and CSS must agree. Native data charts/tables are not yet declared control types; use a deliberate raster control when needed.

## Text is one frame, not a group of fragments

Use one text control for the whole intended text box. Inline spans may set font family, size, bold/italic, color, tracking, underline/strike. Use br for explicit paragraph breaks; normal browser wraps are left to the single native text frame, so editing can reflow. Inline `<p>`, positioned spans, nested controls and independent run padding/margins are rejected rather than split into extra objects. Text controls may have a solid fill/uniform border/corner radius and padding in that same single shape.

`white-space:normal` maps to wrapping; `white-space:nowrap` maps to no wrapping (use for intrinsically sized badges and footer labels). NBSP and full-width spaces are preserved. Unsupported indentation, advanced font effects, complex decoration or hidden runs with visible descendants produce CONTROL_INVALID. Use ordinary flow, installed fonts and generous fixed text-box widths; Office font metrics can differ from browser layout. Fonts remain unembedded.

## Layout and escape hatches

Unmarked div/section/main/header/footer/article/aside/nav containers may use Grid/Flex for layout, but may not paint backgrounds, borders, outlines or visible text. Every visible item must belong to a declared control. Do not insert unmarked Canvas, SVG, images, buttons or anonymous text.

For a raster exception, wrap only the content that must be rasterized:

```html
<div data-pptx="raster" data-pptx-id="illustration">
  <svg><!-- complex drawing --></svg>
</div>
```

Raster content is isolated and captured with transparency, then alpha-trimmed with its slide coordinates adjusted. It does not create a full-page transparent selection box for a small Canvas. Keep native media as separate media controls, not inside raster. Backdrop-dependent effects that cannot be isolated must be redesigned or use compatible export; unsupported explicit controls never silently fall back.

## Commands and validation

```sh
node RUNNER init PROJECT
node RUNNER inspect PROJECT --json
node RUNNER export PROJECT --pptx-mode editable
node RUNNER verify PROJECT --json
```

`conversion.json` lists `authoringMode: controls`, declared IDs and object types, group/richtext counts, raster exceptions and required fonts. `verify` validates actual native group hierarchy/child-coordinate transforms, control count/order/identity, paragraph/run contents and formatting, and media/image hashes. It does not certify exact Office rendering or playback.

Compatible mode remains the visual-fidelity escape hatch. Existing unmarked decks still use legacy inference under editable mode; migrate them by marking coherent text boxes and groups instead of relying on automatic fragmentation. The new starter and `examples/controls` demonstrate the recommended structure.
