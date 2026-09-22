// Serialized by Playwright: keep this function dependency-free.
export function inspectDOM() {
  const { size, slide } = window.__CHAOSPPT_CONFIG__;
  const issues = [],
    elements = [];
  const issue = (e, code, message, severity = "error", extra = {}) =>
    issues.push({
      slideId: slide.id,
      elementId: e?.dataset?.elementId || e?.id || null,
      code,
      severity,
      message,
      ...extra,
    });
  const roots = document.querySelectorAll(".slide");
  if (roots.length !== 1)
    issue(
      null,
      "SLIDE_ROOT",
      `Expected one .slide root, found ${roots.length}`,
    );
  const root = roots[0];
  if (root) {
    const r = root.getBoundingClientRect();
    if (
      Math.abs(r.width - size.width) > 1 ||
      Math.abs(r.height - size.height) > 1 ||
      Math.abs(r.x) > 1 ||
      Math.abs(r.y) > 1
    )
      issue(
        root,
        "SLIDE_SIZE",
        "Slide root must match the fixed canvas at origin",
      );
  }
  for (const e of document.querySelectorAll("body *")) {
    if (["SCRIPT", "STYLE", "LINK", "TEMPLATE"].includes(e.tagName)) continue;
    const s = getComputedStyle(e),
      r = e.getBoundingClientRect();
    if (
      s.display === "none" ||
      s.visibility === "hidden" ||
      !r.width ||
      !r.height
    )
      continue;
    const elementId = e.dataset.elementId || e.id || null;
    if (elementId)
      elements.push({
        elementId,
        tag: e.tagName,
        bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        fontSize: s.fontSize,
        fontFamily: s.fontFamily,
      });
    // Mark intentionally bleeding decoration; do not suppress diagnostics on its siblings.
    if (e.closest("[data-allow-overflow]")) continue;
    if (
      r.left < -0.75 ||
      r.top < -0.75 ||
      r.right > size.width + 0.75 ||
      r.bottom > size.height + 0.75
    )
      issue(
        e,
        "OUT_OF_BOUNDS",
        "Element extends beyond slide canvas",
        "error",
        { bounds: { x: r.x, y: r.y, width: r.width, height: r.height } },
      );
    if (
      e.namespaceURI === "http://www.w3.org/1999/xhtml" &&
      ((/hidden|clip|auto|scroll/.test(s.overflowX) &&
        e.scrollWidth > e.clientWidth + 2) ||
        (/hidden|clip|auto|scroll/.test(s.overflowY) &&
          e.scrollHeight > e.clientHeight + 2)) &&
      s.display !== "inline"
    ) {
      issue(e, "CONTENT_OVERFLOW", "Content exceeds element box", "error", {
        overflowPx: {
          x: Math.max(0, e.scrollWidth - e.clientWidth),
          y: Math.max(0, e.scrollHeight - e.clientHeight),
        },
        suggestions: [
          "Increase container space",
          "Rebalance the layout",
          "Shorten text without dropping evidence",
        ],
      });
    }
    const directText = [...e.childNodes].filter(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    if (directText.length && parseFloat(s.fontSize) < 14)
      issue(e, "SMALL_TEXT", "Text is below 14 CSS px", "warning");
    // Inline text does not expose meaningful client dimensions; measure its text ranges instead.
    for (const n of directText) {
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const t of range.getClientRects()) {
        let ancestor = e;
        while (ancestor && ancestor !== document.body) {
          const a = getComputedStyle(ancestor),
            ar = ancestor.getBoundingClientRect();
          if (
            /hidden|clip|auto|scroll/.test(a.overflowX + " " + a.overflowY) &&
            (t.right > ar.right + 2 ||
              t.bottom > ar.bottom + 2 ||
              t.left < ar.left - 2 ||
              t.top < ar.top - 2)
          ) {
            issue(e, "TEXT_CLIPPED", "Text is clipped by an ancestor");
            ancestor = null;
            break;
          }
          ancestor = ancestor.parentElement;
        }
      }
    }
  }
  return {
    slideId: slide.id,
    title: slide.title || slide.id,
    issues,
    elements,
  };
}
