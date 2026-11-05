// Browser-side collector: serialized into the page by Playwright; no external imports.
export function extractScene() {
  const { size, slide } = window.__CHAOSPPT_CONFIG__;
  const nodes = [],
    notices = [];
  let sequence = 0;
  const all = [...document.querySelectorAll("body *")];
  all.forEach((e, i) => e.setAttribute("data-chaosppt-export-id", String(i)));
  const root = document.querySelector(".slide");
  const rect = (r) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  const color = (value) => {
    const m = value.match(
      /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
    );
    if (!m) return null;
    return {
      color: m
        .slice(1, 4)
        .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
      alpha: m[4] === undefined ? 1 : Number(m[4]),
    };
  };
  const push = (e, type, props) =>
    nodes.push({
      objectName: `native-${String(sequence++).padStart(4, "0")}`,
      type,
      sourceId: e.dataset?.elementId || e.id || null,
      domId: e.getAttribute("data-chaosppt-export-id"),
      ...props,
    });
  function fallback(e, reason) {
    const value = e.innerText || "";
    push(e, "fallback", {
      bounds: { x: 0, y: 0, width: size.width, height: size.height },
      reason,
      textCharacters: [...value.replace(/\s/g, "")].length,
    });
  }
  function unsupported(e, s) {
    if (e.dataset.pptxExport === "raster") return "explicit-raster";
    if (e.shadowRoot || e.tagName.includes("-")) return "web-component";
    if (
      [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) &&
      [...e.children].some((c) => {
        const cs = getComputedStyle(c);
        return (
          cs.position !== "static" ||
          cs.zIndex !== "auto" ||
          !["inline", "inline-block", "contents", "none"].includes(cs.display)
        );
      })
    )
      return "mixed-text-paint-order";
    if (e.namespaceURI !== "http://www.w3.org/1999/xhtml")
      return "svg-or-foreign-content";
    if (
      [
        "CANVAS",
        "SVG",
        "VIDEO",
        "IFRAME",
        "OBJECT",
        "EMBED",
        "INPUT",
        "SELECT",
        "TEXTAREA",
        "BUTTON",
        "MATH",
      ].includes(e.tagName)
    )
      return "rendered-" + e.tagName.toLowerCase();
    if (
      s.transform !== "none" ||
      s.rotate !== "none" ||
      s.translate !== "none" ||
      s.scale !== "none" ||
      s.perspective !== "none"
    )
      return "transform";
    if (
      s.filter !== "none" ||
      s.backdropFilter !== "none" ||
      s.mixBlendMode !== "normal" ||
      s.clipPath !== "none" ||
      s.maskImage !== "none" ||
      Number(s.opacity) !== 1
    )
      return "compositing-effect";
    if (s.boxShadow !== "none" || s.textShadow !== "none") return "shadow";
    if (s.backgroundImage !== "none") return "background-image-or-gradient";
    if (
      (s.whiteSpace.startsWith("pre") || s.whiteSpace === "break-spaces") &&
      [...e.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.includes("\t"),
      )
    )
      return "preserved-tab-spacing";
    if (s.writingMode !== "horizontal-tb" || s.direction !== "ltr")
      return "text-direction";
    if (
      s.textAlign === "justify" ||
      parseFloat(s.wordSpacing) ||
      s.textDecorationStyle !== "solid" ||
      (s.textDecorationLine !== "none" && s.textDecorationColor !== s.color)
    )
      return "advanced-text-spacing-or-decoration";
    if (
      (s.textTransform !== "none" &&
        !(
          s.textTransform === "uppercase" &&
          e.textContent === e.textContent.toUpperCase()
        ) &&
        !(
          s.textTransform === "lowercase" &&
          e.textContent === e.textContent.toLowerCase()
        )) ||
      parseFloat(s.webkitTextStrokeWidth) ||
      !["normal", "none"].includes(s.fontVariantCaps)
    )
      return "text-effect";
    if (s.columnCount !== "auto" && s.columnCount !== "1") return "multicolumn";
    if (s.display === "list-item") return "list-marker";
    if (["TABLE", "RUBY"].includes(e.tagName))
      return "semantic-" + e.tagName.toLowerCase();
    for (const p of ["::before", "::after"]) {
      const ps = getComputedStyle(e, p);
      if (ps.display !== "none" && !["none", "normal"].includes(ps.content))
        return "pseudo-element";
    }
    const sides = ["Top", "Right", "Bottom", "Left"];
    if (
      sides.some(
        (k) =>
          parseFloat(s[`border${k}Width`]) > 0 &&
          !["solid", "none"].includes(s[`border${k}Style`]),
      )
    )
      return "border-style";
    const radii = [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomRightRadius",
      "borderBottomLeftRadius",
    ].map((k) => s[k]);
    if (
      radii.some((r) => r.includes(" ") || r.includes("%")) ||
      new Set(radii).size !== 1
    )
      return "asymmetric-or-percentage-radius";
    if (
      parseFloat(radii[0]) &&
      sides.some(
        (k) =>
          s[`border${k}Width`] !== s.borderTopWidth ||
          s[`border${k}Color`] !== s.borderTopColor,
      )
    )
      return "rounded-asymmetric-border";
    if (
      e !== root &&
      /hidden|clip|auto|scroll/.test(s.overflowX + " " + s.overflowY) &&
      e.children.length
    )
      return "clipping-container";
    if (s.backgroundColor !== "rgba(0, 0, 0, 0)" && !color(s.backgroundColor))
      return "color-space";
    if (!color(s.color)) return "text-color-space";
    if (e.getClientRects().length > 1) return "fragmented-inline-box";
    // A nested stacking context can escape a non-stacking parent. Keep the nearest whole subtree.
    if (
      [...e.children].some((c) =>
        [...c.querySelectorAll("*")].some(
          (d) => getComputedStyle(d).zIndex !== "auto",
        ),
      )
    )
      return "nested-stacking-context";
    return null;
  }
  function shape(e, s, r) {
    const bg = color(s.backgroundColor),
      bw = parseFloat(s.borderTopWidth),
      bc = color(s.borderTopColor);
    const uniform = ["Right", "Bottom", "Left"].every(
      (k) =>
        s[`border${k}Width`] === s.borderTopWidth &&
        s[`border${k}Color`] === s.borderTopColor &&
        s[`border${k}Style`] === s.borderTopStyle,
    );
    const radius = Math.min(
      parseFloat(s.borderTopLeftRadius) || 0,
      r.width / 2,
      r.height / 2,
    );
    if ((bg?.alpha || 0) > 0 || (uniform && bw > 0 && bc?.alpha > 0)) {
      const inset = uniform ? bw / 2 : 0;
      push(e, "shape", {
        bounds: {
          x: r.x + inset,
          y: r.y + inset,
          width: Math.max(0.01, r.width - 2 * inset),
          height: Math.max(0.01, r.height - 2 * inset),
        },
        geometry: radius ? "roundRect" : "rect",
        radius: Math.max(0, radius - inset),
        fill: bg?.alpha ? bg : null,
        line: uniform && bw && bc?.alpha ? { ...bc, width: bw } : null,
      });
    }
    if (!uniform) {
      const specs = [
        ["Top", r.x, r.y, r.width, parseFloat(s.borderTopWidth)],
        [
          "Bottom",
          r.x,
          r.bottom - parseFloat(s.borderBottomWidth),
          r.width,
          parseFloat(s.borderBottomWidth),
        ],
        ["Left", r.x, r.y, parseFloat(s.borderLeftWidth), r.height],
        [
          "Right",
          r.right - parseFloat(s.borderRightWidth),
          r.y,
          parseFloat(s.borderRightWidth),
          r.height,
        ],
      ];
      for (const [side, x, y, width, height] of specs) {
        const fill = color(s[`border${side}Color`]);
        if (width > 0 && height > 0 && fill?.alpha)
          push(e, "shape", {
            bounds: { x, y, width, height },
            geometry: "rect",
            radius: 0,
            fill,
            line: null,
          });
      }
    }
  }
  function text(t) {
    const e = t.parentElement,
      s = getComputedStyle(e);
    if (!t.textContent.trim() || s.visibility !== "visible") return;
    const fontSize = parseFloat(s.fontSize),
      family = s.fontFamily
        .split(",")[0]
        .trim()
        .replace(/^['"]|['"]$/g, "");
    const style = {
      fontSize,
      fontFace: family,
      bold: Number(s.fontWeight) >= 600,
      italic: s.fontStyle !== "normal",
      color: color(s.color),
      charSpacing: parseFloat(s.letterSpacing) || 0,
      underline: s.textDecorationLine.includes("underline"),
      strike: s.textDecorationLine.includes("line-through"),
    };
    let current = null;
    const flush = () => {
      if (current?.value.trim())
        push(e, "text", { bounds: current.bounds, text: current.value, style });
      current = null;
    };
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    for (const part of segmenter.segment(t.textContent)) {
      const range = document.createRange();
      range.setStart(t, part.index);
      range.setEnd(t, part.index + part.segment.length);
      const boxes = [...range.getClientRects()].filter(
        (b) => b.width > 0.05 && b.height > 0.05,
      );
      if (!boxes.length) continue;
      const b = boxes[0],
        value = /^\s+$/.test(part.segment) ? " " : part.segment;
      if (
        current &&
        (Math.abs(current.bounds.y - b.y) > 1 ||
          Math.abs(current.bounds.height - b.height) > 1 ||
          b.x < current.bounds.x - 1)
      )
        flush();
      if (!current) current = { bounds: rect(b), value };
      else {
        current.value += value;
        current.bounds.width =
          Math.max(current.bounds.x + current.bounds.width, b.right) -
          current.bounds.x;
      }
    }
    flush();
  }
  function walk(e) {
    if (
      [
        "SCRIPT",
        "STYLE",
        "LINK",
        "META",
        "BR",
        "TEMPLATE",
        "NOSCRIPT",
      ].includes(e.tagName)
    )
      return;
    const s = getComputedStyle(e),
      r = e.getBoundingClientRect();
    if (s.display === "none") return;
    if (s.visibility !== "visible") {
      if (
        [...e.querySelectorAll("*")].some(
          (c) => getComputedStyle(c).visibility === "visible",
        )
      )
        fallback(e, "hidden-container-with-visible-descendant");
      return;
    }
    if (!r.width || !r.height) {
      if (e.children.length || e.textContent.trim())
        fallback(e, "boxless-container");
      return;
    }
    if (e.hasAttribute("data-pptx-media")) return; // existing native media objects are appended topmost
    const reason = unsupported(e, s);
    if (reason) {
      fallback(e, reason);
      return;
    }
    if (e.tagName === "IMG") {
      // Browser-rendered image pixels retain fit/crop, while the result is a separately replaceable picture.
      push(e, "image", {
        bounds: rect(r),
        reason: "rendered-picture",
        textCharacters: 0,
      });
      return;
    }
    shape(e, s, r);
    const children = [...e.childNodes];
    const elements = children.filter((n) => n.nodeType === 1);
    const positioned = elements.filter((n) => {
      const c = getComputedStyle(n);
      return c.position !== "static" || c.zIndex !== "auto";
    });
    const negative = positioned.filter(
      (n) => Number(getComputedStyle(n).zIndex) < 0,
    );
    // Negative stacks may paint behind ancestor backgrounds: retain the whole container instead.
    if (negative.length) {
      throw new Error("negative stack escaped preflight");
    }
    const sorted = [...elements].sort((a, b) => {
      const sa = getComputedStyle(a),
        sb = getComputedStyle(b);
      const rank = (s) =>
        s.zIndex !== "auto" ? 2 : s.position !== "static" ? 1 : 0;
      return (
        rank(sa) - rank(sb) ||
        (rank(sa) === 2 ? Number(sa.zIndex) - Number(sb.zIndex) : 0) ||
        (s.display.includes("flex") || s.display.includes("grid")
          ? Number(sa.order) - Number(sb.order)
          : 0)
      );
    });
    // Normal inline content needs DOM order to retain rich-text run sequence.
    if (children.some((n) => n.nodeType === 3 && n.textContent.trim())) {
      for (const n of children) {
        if (n.nodeType === 3) text(n);
        else if (n.nodeType === 1) walk(n);
      }
    } else for (const c of sorted) walk(c);
  }
  if (!root) throw new Error("Expected a .slide root");
  const body = getComputedStyle(document.body),
    html = getComputedStyle(document.documentElement);
  const bg = color(body.backgroundColor),
    htmlBg = color(html.backgroundColor);
  push(root, "shape", {
    bounds: { x: 0, y: 0, width: size.width, height: size.height },
    geometry: "rect",
    radius: 0,
    fill: htmlBg?.alpha ? htmlBg : { color: "FFFFFF", alpha: 1 },
    line: null,
  });
  if (bg?.alpha)
    push(root, "shape", {
      bounds: { x: 0, y: 0, width: size.width, height: size.height },
      geometry: "rect",
      radius: 0,
      fill: bg,
      line: null,
    });
  const negative = [...root.querySelectorAll("*")].some(
    (e) => Number(getComputedStyle(e).zIndex) < 0,
  );
  const backdropDependent = [root, ...root.querySelectorAll("*")].some((e) => {
    const s = getComputedStyle(e);
    return s.mixBlendMode !== "normal" || s.backdropFilter !== "none";
  });
  const globalEffect = [body, html].some(
    (s) =>
      s.backgroundImage !== "none" ||
      s.filter !== "none" ||
      s.transform !== "none" ||
      Number(s.opacity) !== 1,
  );
  if (negative || globalEffect || backdropDependent) {
    nodes.length = 0;
    fallback(
      root,
      backdropDependent
        ? "backdrop-dependent-compositing"
        : negative
          ? "negative-stacking-context"
          : "document-effect",
    );
    nodes[0].captureDocument = true;
  } else walk(root);
  return {
    version: 1,
    slideId: slide.id,
    size,
    nodes,
    notices,
    textPolicy: "visual-line-fragments",
    limitations: [
      "Office font substitution and text metrics can differ from Chromium",
      "Tables/charts/SVG/Canvas are raster fallbacks in this release",
    ],
  };
}
