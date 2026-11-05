// Strict declarative authoring. Serialized into Chromium; keep helpers local.
export function extractControls() {
  const root = document.querySelector(".slide");
  if (
    !root ||
    (!root.hasAttribute("data-pptx-layout") &&
      !root.querySelector("[data-pptx],[data-pptx-group]"))
  )
    return null;
  const { size, slide } = window.__CHAOSPPT_CONFIG__,
    nodes = [],
    groups = [],
    controls = [],
    roots = [];
  const err = (e, message) => {
    throw new Error(
      `[${e?.dataset?.pptxId || e?.dataset?.pptxGroup || e?.id || e?.tagName || "slide"}] ${message}`,
    );
  };
  const rect = (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const color = (v, e) => {
    const m = v.match(
      /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
    );
    if (!m) err(e, "Use RGB/hex colors");
    return {
      color: m
        .slice(1, 4)
        .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
      alpha: m[4] === undefined ? 1 : Number(m[4]),
    };
  };
  const visible = (e) => {
    const s = getComputedStyle(e);
    return s.display !== "none" && s.visibility === "visible";
  };
  const type = (e) =>
    e.hasAttribute("data-pptx-group") ? "group" : e.getAttribute("data-pptx");
  function common(e, s, { raster = false } = {}) {
    if (!raster && s.outlineStyle !== "none" && parseFloat(s.outlineWidth))
      err(e, "Outline requires an explicit shape or raster control");
    if (s.zIndex !== "auto")
      err(e, "Use DOM order, not z-index, for control stacking");
    if (
      s.transform !== "none" ||
      s.rotate !== "none" ||
      s.translate !== "none" ||
      s.scale !== "none" ||
      s.perspective !== "none"
    )
      err(
        e,
        "Transformed controls are not supported; put the transformed content inside an explicit raster control",
      );
    if (s.mixBlendMode !== "normal" || s.backdropFilter !== "none")
      err(e, "Backdrop-dependent effects cannot be isolated as a control");
    if (
      !raster &&
      (s.filter !== "none" ||
        s.boxShadow !== "none" ||
        s.textShadow !== "none" ||
        s.clipPath !== "none" ||
        s.maskImage !== "none" ||
        Number(s.opacity) !== 1)
    )
      err(e, "Effects require an explicit raster control");
    if (!raster)
      for (const p of ["::before", "::after"]) {
        const c = getComputedStyle(e, p);
        if (c.display !== "none" && !["none", "normal"].includes(c.content))
          err(
            e,
            "Pseudo-element content must be an explicit control or raster",
          );
      }
  }
  function transparentContainer(e, s) {
    if (
      color(s.backgroundColor, e).alpha ||
      s.backgroundImage !== "none" ||
      ["Top", "Right", "Bottom", "Left"].some((k) =>
        parseFloat(s[`border${k}Width`]),
      )
    )
      err(
        e,
        "Layout/group containers cannot paint backgrounds or borders; add a shape control",
      );
    if (/hidden|clip|scroll|auto/.test(s.overflowX + " " + s.overflowY))
      err(
        e,
        "Layout/group clipping is not supported; use raster for clipped components",
      );
  }
  function surface(e, s) {
    if (s.backgroundImage !== "none")
      err(e, "Gradients/images need an explicit raster control");
    if (s.backgroundClip !== "border-box")
      err(e, "Use border-box background clipping or raster");
    const sides = ["Top", "Right", "Bottom", "Left"],
      width = parseFloat(s.borderTopWidth);
    if (
      sides.some(
        (k) =>
          s[`border${k}Width`] !== s.borderTopWidth ||
          s[`border${k}Color`] !== s.borderTopColor ||
          (parseFloat(s[`border${k}Width`]) &&
            !["solid", "none"].includes(s[`border${k}Style`])),
      )
    )
      err(e, "One control requires a uniform solid border");
    const radii = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map(
      (k) => s[`border${k}Radius`],
    );
    const geometry =
      e.getAttribute("data-pptx-shape") ||
      ((parseFloat(radii[0]) || 0) > 0 ? "roundRect" : "rect");
    if (!["rect", "roundRect", "ellipse"].includes(geometry))
      err(e, "Supported shapes: rect, roundRect, ellipse");
    if (new Set(radii).size !== 1 || radii.some((v) => v.includes(" ")))
      err(e, "Use a uniform corner radius");
    if (radii[0].includes("%") && geometry !== "ellipse")
      err(e, "Percentage corner radii require ellipse or raster");
    if (geometry === "rect" && parseFloat(radii[0]))
      err(e, "rect must have zero CSS border-radius");
    if (geometry === "roundRect" && !parseFloat(radii[0]))
      err(e, "roundRect requires a positive CSS border-radius");
    if (
      geometry === "ellipse" &&
      radii[0] !== "50%" &&
      parseFloat(radii[0]) < Math.max(rect(e).width, rect(e).height) / 2
    )
      err(e, "ellipse requires CSS border-radius:50%");
    const fill = color(s.backgroundColor, e),
      line = color(s.borderTopColor, e),
      b = rect(e);
    return {
      geometry,
      radius: Math.min(parseFloat(radii[0]) || 0, b.width / 2, b.height / 2),
      fill: fill.alpha ? fill : null,
      line: width && line.alpha ? { ...line, width } : null,
    };
  }
  function textStyle(e) {
    const s = getComputedStyle(e);
    common(e, s);
    if (parseFloat(s.textIndent))
      err(
        e,
        "Text indentation is not mapped; use padding or a separate control",
      );
    if (
      s.textDecorationStyle !== "solid" ||
      (s.textDecorationLine !== "none" && s.textDecorationColor !== s.color) ||
      s.fontVariantCaps !== "normal" ||
      s.fontFeatureSettings !== "normal" ||
      s.fontVariationSettings !== "normal"
    )
      err(e, "Advanced font or decoration effects require raster");
    if (
      s.writingMode !== "horizontal-tb" ||
      s.direction !== "ltr" ||
      s.textTransform !== "none" ||
      parseFloat(s.wordSpacing) ||
      parseFloat(s.webkitTextStrokeWidth)
    )
      err(
        e,
        "Unsupported text effect/direction; author ordinary inline rich text",
      );
    if (!["normal", "nowrap"].includes(s.whiteSpace))
      err(e, "Use normal whitespace and <br> for explicit newlines");
    let decorations=s.textDecorationLine;
    for(let ancestor=e;ancestor;ancestor=ancestor.parentElement){const a=getComputedStyle(ancestor);if(a.textDecorationLine!=='none'){if(a.textDecorationStyle!=='solid'||a.textDecorationColor!==s.color)err(e,'Nested decoration color/style cannot be represented by this text control');decorations+=' '+a.textDecorationLine;}if(ancestor.getAttribute('data-pptx')==='text')break;}
    return {
      fontFace: s.fontFamily
        .split(",")[0]
        .trim()
        .replace(/^['"]|['"]$/g, ""),
      fontSize: parseFloat(s.fontSize),
      bold: Number(s.fontWeight) >= 600,
      italic: s.fontStyle !== "normal",
      color: color(s.color, e),
      charSpacing: parseFloat(s.letterSpacing) || 0,
      underline: decorations.includes("underline"),
      strike: decorations.includes("line-through"),
    };
  }
  function richtext(e) {
    const s = getComputedStyle(e),
      runs = [];
    if (!["block", "inline", "inline-block"].includes(s.display))
      err(e, "Text controls require ordinary block/inline flow, not Flex/Grid");
    const allowed = new Set([
      "SPAN",
      "B",
      "STRONG",
      "I",
      "EM",
      "U",
      "S",
      "STRIKE",
      "BR",
    ]);
    function collect(n) {
      if (n.nodeType === 3) {
        let value = n.textContent.replace(/[ \t\r\n\f]+/g, " ");
        const last = runs.at(-1);
        if (!last || last.text.endsWith(" ") || last.text.endsWith("\n"))
          value = value.replace(/^ +/, "");
        if (value)
          runs.push({ text: value, style: textStyle(n.parentElement) });
        return;
      }
      if (n.nodeType !== 1) return;
      if (!visible(n)) {
        if (
          getComputedStyle(n).display !== "none" &&
          [...n.querySelectorAll("*")].some(visible)
        )
          err(
            n,
            "Hidden text runs with visible descendants require restructuring",
          );
        return;
      }
      if (n !== e) {
        if (
          n.hasAttribute("data-pptx") ||
          n.hasAttribute("data-pptx-group") ||
          !allowed.has(n.tagName)
        )
          err(
            n,
            "Text controls contain only inline span/b/strong/em/i/u/s and br; nested controls are not text runs",
          );
        const cs = getComputedStyle(n);
        common(n, cs);
        if (
          cs.position !== "static" ||
          !["inline", "none"].includes(cs.display)
        )
          err(n, "Text runs must stay in normal inline flow");
        transparentContainer(n, cs);
        if (
          ["Top", "Right", "Bottom", "Left"].some(
            (k) =>
              parseFloat(cs["padding" + k]) || parseFloat(cs["margin" + k]),
          )
        )
          err(n, "Text runs cannot have independent padding/margins");
      }
      if (n.tagName === "BR") {
        if (runs.length) runs.at(-1).text = runs.at(-1).text.replace(/ +$/, "");
        runs.push({ text: "\n", style: textStyle(e) });
        return;
      }
      for (const c of n.childNodes) collect(c);
    }
    collect(e);
    if (runs.length) runs.at(-1).text = runs.at(-1).text.replace(/ +$/, "");
    const style = textStyle(e);
    if (!runs.some((r) => r.text.trim())) err(e, "Empty text control");
    const paragraphs = [{ runs: [] }];
    for (const run of runs) {
      const pieces = run.text.split("\n");
      for (let i = 0; i < pieces.length; i++) {
        if (i) paragraphs.push({ runs: [] });
        if (pieces[i])
          paragraphs.at(-1).runs.push({ text: pieces[i], style: run.style });
      }
    }
    return {
      paragraphs,
      text: paragraphs
        .map((p) => p.runs.map((r) => r.text).join(""))
        .join("\n"),
      style,
      wrap: s.whiteSpace !== "nowrap",
      align: ["left", "center", "right", "justify"].includes(s.textAlign)
        ? s.textAlign
        : "left",
      lineHeight:
        s.lineHeight === "normal"
          ? style.fontSize * 1.2
          : parseFloat(s.lineHeight),
      padding: ["Top", "Right", "Bottom", "Left"].map(
        (k) =>
          parseFloat(s["padding" + k]) + parseFloat(s["border" + k + "Width"]),
      ),
      ...surface(e, s),
    };
  }
  try {
    if (
      root.hasAttribute("data-pptx-layout") &&
      root.dataset.pptxLayout !== "controls"
    )
      err(root, "Unknown data-pptx-layout");
    for (const e of document.body.querySelectorAll("*")) {
      if (
        e === root ||
        root.contains(e) ||
        e.contains(root) ||
        ["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE"].includes(e.tagName) ||
        !visible(e)
      )
        continue;
      const b = rect(e);
      if (
        b.width > 0 &&
        b.height > 0 &&
        b.x < size.width &&
        b.y < size.height &&
        b.x + b.width > 0 &&
        b.y + b.height > 0
      )
        err(e, "Visible slide content must be inside the .slide root");
    }
    const identifiers = new Set();
    for (const e of root.querySelectorAll("[data-pptx],[data-pptx-group]")) {
      const id = e.dataset.pptxId || e.dataset.pptxGroup;
      if (!id || !/^[-A-Za-z0-9_]+$/.test(id))
        err(
          e,
          "Every control needs a unique data-pptx-id (letters/digits/_/-)",
        );
      if (identifiers.has(id)) err(e, "Duplicate control ID: " + id);
      identifiers.add(id);
      if (
        e.hasAttribute("data-pptx-group") &&
        ((e.dataset.pptx && e.dataset.pptx !== "group") ||
          (e.dataset.pptxId && e.dataset.pptxId !== e.dataset.pptxGroup))
      )
        err(e, "Conflicting group declarations");
    }
    [...document.querySelectorAll("body *")].forEach((e, i) =>
      e.setAttribute("data-chaosppt-export-id", String(i)),
    );
    function walk(e, children) {
      if (
        ["STYLE", "SCRIPT", "LINK", "META", "TEMPLATE", "NOSCRIPT"].includes(
          e.tagName,
        )
      )
        return;
      if (!visible(e)) {
        if (
          getComputedStyle(e).display !== "none" &&
          [...e.querySelectorAll("*")].some(visible)
        )
          err(e, "Hidden containers with visible descendants require raster");
        return;
      }
      const s = getComputedStyle(e),
        kind = type(e);
      common(e, s, { raster: kind === "raster" });
      if (!kind) {
        if (
          ![
            "DIV",
            "SECTION",
            "MAIN",
            "HEADER",
            "FOOTER",
            "ARTICLE",
            "ASIDE",
            "NAV",
          ].includes(e.tagName)
        )
          err(
            e,
            "Visible content requires an explicit control; only layout containers may be unmarked",
          );
        transparentContainer(e, s);
        for (const n of e.childNodes) {
          if (n.nodeType === 3 && n.textContent.trim())
            err(e, "Visible text must be inside an explicit text control");
          if (n.nodeType === 1) walk(n, children);
        }
        return;
      }
      if (
        !["group", "text", "shape", "image", "raster", "media"].includes(kind)
      )
        err(e, "Unknown control type: " + kind);
      const id = e.dataset.pptxId || e.dataset.pptxGroup,
        bounds = rect(e);
      if (bounds.width <= 0 || bounds.height <= 0)
        err(e, "Controls require a nonempty CSS box");
      const objectName =
        kind === "media"
          ? `chaosppt-media-${e.dataset.chaospptMediaIndex}`
          : `control-${id}`;
      const base = {
        objectName,
        controlId: id,
        sourceId: id,
        domId: e.dataset.chaospptExportId,
        bounds,
      };
      children.push(objectName);
      controls.push({ id, type: kind, objectName });
      if (kind === "group") {
        transparentContainer(e, s);
        const group = { ...base, children: [] };
        groups.push(group);
        for (const n of e.childNodes) {
          if (n.nodeType === 3 && n.textContent.trim())
            err(e, "Group text needs its own text control");
          if (n.nodeType === 1) walk(n, group.children);
        }
        if (!group.children.length) err(e, "Empty group");
        return;
      }
      if (kind !== "text" && e.querySelector("[data-pptx],[data-pptx-group]"))
        err(e, "Only groups may contain other controls");
      if (kind === "text") {
        nodes.push({ ...base, type: "richtext", ...richtext(e) });
        return;
      }
      if (kind === "shape") {
        if (e.children.length || e.textContent.trim())
          err(
            e,
            "Shape controls cannot contain text/children; use a text control with fill or a group",
          );
        nodes.push({ ...base, type: "shape", ...surface(e, s) });
        return;
      }
      if (kind === "media") {
        if (
          !e.hasAttribute("data-pptx-media") ||
          !e.hasAttribute("data-chaosppt-media-index")
        )
          err(
            e,
            "Media control requires data-pptx-media and a prepared local MP4/GIF",
          );
        return;
      }
      if (kind === "image" && e.tagName !== "IMG")
        err(e, "Image controls must use <img>; use raster for arbitrary HTML");
      if (
        kind === "image" &&
        (s.backgroundImage !== "none" ||
          parseFloat(s.borderTopLeftRadius) ||
          parseFloat(s.borderTopWidth))
      )
        err(e, "Styled image effects require raster");
      if (kind === "raster" && e.querySelector("[data-pptx-media]"))
        err(
          e,
          "Native media cannot be hidden inside raster; give it a separate media control",
        );
      nodes.push({
        ...base,
        type: kind === "image" ? "image" : "fallback",
        sourceBounds: bounds,
        bounds:
          kind === "raster"
            ? { x: 0, y: 0, width: size.width, height: size.height }
            : bounds,
        reason: kind === "raster" ? "explicit-raster" : "rendered-picture",
        textCharacters: [...(e.innerText || "").replace(/\s/g, "")].length,
      });
    }
    common(root, getComputedStyle(root));
    if (
      ["Top", "Right", "Bottom", "Left"].some((k) =>
        parseFloat(getComputedStyle(root)["border" + k + "Width"]),
      ) ||
      parseFloat(getComputedStyle(root).borderTopLeftRadius)
    )
      err(root, "Slide border/corners must be an explicit shape control");
    for (const e of [root, document.body, document.documentElement]) {
      const s = getComputedStyle(e);
      common(e, s);
      if (s.backgroundImage !== "none")
        err(e, "Use an explicit raster background control");
    }
    const backgrounds = [document.documentElement, document.body, root]
      .map((e) => color(getComputedStyle(e).backgroundColor, e))
      .filter((c) => c.alpha);
    if (backgrounds.some((c) => c.alpha !== 1))
      err(root, "Slide background must be opaque or transparent");
    for (const n of root.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim())
        err(root, "Visible text must be an explicit control");
      if (n.nodeType === 1) walk(n, roots);
    }
    if (!controls.length) err(root, "No visible controls");
    const mediaElements = root.querySelectorAll("[data-pptx-media]");
    for (const e of mediaElements)
      if (visible(e) && type(e) !== "media")
        err(
          e,
          'Marked media needs data-pptx="media" and data-pptx-id in controls mode',
        );
    return {
      errors: [],
      scene: {
        version: 1,
        authoringMode: "controls",
        slideId: slide.id,
        size,
        background: backgrounds.at(-1) || { color: "FFFFFF", alpha: 1 },
        nodes,
        groups,
        roots,
        controls,
        textPolicy: "one-richtext-frame-per-control",
        limitations: [
          "Target fonts must be installed; native text reflow may differ from browser",
        ],
      },
    };
  } catch (e) {
    return {
      errors: [
        {
          code: "CONTROL_INVALID",
          severity: "error",
          elementId: null,
          message: e.message,
        },
      ],
      scene: null,
    };
  }
}
