import { normalizeTransition } from "/__engine/motion/contract.js";
let deck,
  index = 0,
  revision = "",
  frame,
  navigating = false,
  polling = false;
const $ = (s) => document.querySelector(s),
  holder = $("#holder"),
  stage = $("#stage");
function error(e) {
  $("#error").textContent = e.message;
  $("#error").style.display = "block";
}
function fit() {
  if (!deck) return;
  const scale = Math.max(
    0.01,
    Math.min(
      (stage.clientWidth - 64) / deck.size.width,
      (stage.clientHeight - 64) / deck.size.height,
    ),
  );
  holder.style.width = deck.size.width * scale + "px";
  holder.style.height = deck.size.height * scale + "px";
  for (const e of holder.querySelectorAll(".scaled"))
    e.style.transform = `scale(${scale})`;
}
function updateStep() {
  const s = frame?.contentWindow?.ChaosPPT?.motion?.state();
  $("#motion-status").textContent = s?.steps
    ? `步骤 ${s.step} / ${s.steps}${s.busy ? " · 播放中" : ""}`
    : "";
}
function cloneVisual(source) {
  const target = source.cloneNode(false),
    style = source.ownerDocument.defaultView.getComputedStyle(source);
  target.style.cssText = [...style]
    .map((k) => `${k}:${style.getPropertyValue(k)};`)
    .join("");
  if (source.tagName === "IMG") target.src = source.currentSrc || source.src;
  if (source.tagName === "CANVAS") {
    target.width = source.width;
    target.height = source.height;
    target.getContext("2d").drawImage(source, 0, 0);
  }
  for (const n of source.childNodes)
    target.appendChild(n.nodeType === 1 ? cloneVisual(n) : n.cloneNode(true));
  return target;
}
function findControl(win, id) {
  return [
    ...win.document.querySelectorAll("[data-pptx],[data-pptx-group]"),
  ].find((e) => (e.dataset.pptxId || e.dataset.pptxGroup) === id);
}
const getComputedStyleFrom = (e) =>
  e.ownerDocument.defaultView.getComputedStyle(e);
const morphStyleKeys = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
];
function morphLeaf(layer, jobs, a, b, key, duration) {
  const ar = a.getBoundingClientRect(),
    br = b.getBoundingClientRect();
  const sameTree = (x, y) =>
    x.nodeName === y.nodeName &&
    x.childNodes.length === y.childNodes.length &&
    [...x.childNodes].every((n, i) =>
      n.nodeType === 1
        ? sameTree(n, y.childNodes[i])
        : n.textContent === y.childNodes[i].textContent,
    );
  const unchanged =
    sameTree(a, b) &&
    (a.tagName !== "IMG" ||
      (a.currentSrc || a.src) === (b.currentSrc || b.src));
  const options = { duration, easing: "linear", fill: "both" };
  if (unchanged) {
    const clone = cloneVisual(a);
    clone.dataset.sharedKey = key;
    Object.assign(clone.style, {
      position: "absolute",
      left: ar.x + "px",
      top: ar.y + "px",
      width: ar.width + "px",
      height: ar.height + "px",
      margin: "0",
      visibility: "visible",
    });
    layer.append(clone);
    const pair = (source, target, copy, isRoot) => {
      const fromStyle =
          source.ownerDocument.defaultView.getComputedStyle(source),
        toStyle = target.ownerDocument.defaultView.getComputedStyle(target),
        from = {},
        to = {};
      for (const prop of morphStyleKeys) {
        from[prop] = fromStyle[prop];
        to[prop] = toStyle[prop];
      }
      if (isRoot) {
        Object.assign(from, {
          left: ar.x + "px",
          top: ar.y + "px",
          width: ar.width + "px",
          height: ar.height + "px",
        });
        Object.assign(to, {
          left: br.x + "px",
          top: br.y + "px",
          width: br.width + "px",
          height: br.height + "px",
        });
      }
      jobs.push(copy.animate([from, to], options));
      for (let i = 0; i < source.children.length; i++)
        pair(source.children[i], target.children[i], copy.children[i], false);
    };
    pair(a, b, clone, true);
    return;
  }
  // Changed text/images cross-fade; unchanged text is never duplicated during the move.
  for (const [e, r, opacity] of [
    [a, ar, [1, 0]],
    [b, br, [0, 1]],
  ]) {
    const shell = document.createElement("div");
    shell.dataset.sharedKey = key;
    Object.assign(shell.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: r.width + "px",
      height: r.height + "px",
      transformOrigin: "top left",
    });
    const clone = cloneVisual(e);
    Object.assign(clone.style, {
      position: "absolute",
      left: "0",
      top: "0",
      margin: "0",
      width: r.width + "px",
      height: r.height + "px",
      visibility: "visible",
    });
    shell.append(clone);
    layer.append(shell);
    jobs.push(
      shell.animate(
        [
          {
            transform: `translate(${ar.x}px,${ar.y}px) scale(${ar.width / r.width},${ar.height / r.height})`,
            opacity: opacity[0],
          },
          {
            transform: `translate(${br.x}px,${br.y}px) scale(${br.width / r.width},${br.height / r.height})`,
            opacity: opacity[1],
          },
        ],
        options,
      ),
    );
  }
}
async function transition(old, next, kind, duration) {
  if (
    !old ||
    kind === "none" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    next.style.opacity = "1";
    return;
  }
  const jobs = [],
    hidden = [],
    layer = document.createElement("div");
  layer.className = "scaled shared-transition-layer";
  Object.assign(layer.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: deck.size.width + "px",
    height: deck.size.height + "px",
    transformOrigin: "top left",
    pointerEvents: "none",
  });
  try {
    if (kind === "morph") {
      const oldPlan = old.contentWindow.ChaosPPT.motion.getPlan(),
        newPlan = next.contentWindow.ChaosPPT.motion.getPlan();
      const before = new Map(oldPlan.shared.map((s) => [s.key, s]));
      const pairs = newPlan.shared.filter((s) => before.has(s.key));
      if (!pairs.length)
        throw new Error("Morph has no matching shared elements");
      holder.append(layer);
      fit();
      for (const to of pairs) {
        const from = before.get(to.key);
        if (
          from.kind !== to.kind ||
          from.geometry !== to.geometry ||
          JSON.stringify(from.structure) !== JSON.stringify(to.structure)
        )
          throw new Error("Shared control type changed: " + to.key);
        const a = findControl(old.contentWindow, from.controlId),
          b = findControl(next.contentWindow, to.controlId);
        if (from.kind === "group") {
          const leaves = [...a.querySelectorAll("[data-pptx]")].filter(
            (e) =>
              e.dataset.pptx !== "group" &&
              e.getBoundingClientRect().width &&
              e.getBoundingClientRect().height &&
              getComputedStyleFrom(e).visibility === "visible",
          );
          for (const leaf of leaves) {
            const target = findControl(next.contentWindow, leaf.dataset.pptxId);
            morphLeaf(layer, jobs, leaf, target, to.key, duration);
          }
        } else morphLeaf(layer, jobs, a, b, to.key, duration);
        for (const e of [a, b])
          for (const n of [e, ...e.querySelectorAll("*")]) {
            hidden.push([n, n.getAttribute("style")]);
            n.style.setProperty("visibility", "hidden", "important");
          }
      }
    }
    jobs.push(
      old.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration,
        easing: "linear",
        fill: "both",
      }),
    );
    jobs.push(
      next.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration,
        easing: "linear",
        fill: "both",
      }),
    );
    await Promise.all(jobs.map((a) => a.finished));
    next.style.opacity = "1";
  } finally {
    jobs.forEach((a) => a.cancel());
    layer.remove();
    for (const [e, style] of hidden) {
      if (style === null) e.removeAttribute("style");
      else e.setAttribute("style", style);
    }
  }
}
function timeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise(
      (_, reject) =>
        (timer = setTimeout(
          () => reject(new Error("Preview readiness timed out")),
          ms,
        )),
    ),
  ]).finally(() => clearTimeout(timer));
}
async function show(i, { animate = true, reload = false } = {}) {
  if (navigating) return;
  const target = Math.max(0, Math.min(deck.slides.length - 1, i));
  if (frame && target === index && !reload) return;
  navigating = true;
  $("#next").disabled = true;
  $("#prev").disabled = true;
  const previous = frame;
  let next;
  try {
    const s = deck.slides[target],
      spec = normalizeTransition(s.transition);
    if (spec.effect === "morph" && target === 0)
      throw new Error("First slide cannot use Morph");
    next = document.createElement("iframe");
    next.className = "scaled";
    next.title = s.title || s.id;
    next.width = deck.size.width;
    next.height = deck.size.height;
    next.setAttribute("sandbox", "allow-scripts allow-same-origin");
    const loaded = new Promise((resolve, reject) => {
      next.onload = resolve;
      next.onerror = () => reject(new Error("Slide failed to load"));
    });
    next.src = "/slide/" + s.id;
    holder.append(next);
    fit();
    await timeout(loaded, deck.render.timeoutMs);
    await timeout(
      next.contentWindow.ChaosPPT.motion.initialize({ autoplay: false }),
      deck.render.timeoutMs,
    );
    if (previous)
      for (const m of previous.contentDocument.querySelectorAll("video,audio"))
        m.pause();
    const effect = !animate
      ? "none"
      : spec.effect === "morph" && target !== index + 1
        ? "fade"
        : spec.effect;
    await transition(previous, next, effect, spec.durationMs);
    previous?.remove();
    frame = next;
    index = target;
    location.hash = s.id;
    document
      .querySelectorAll("nav button")
      .forEach((b, j) => b.classList.toggle("active", j === index));
    $("#counter").textContent = `${index + 1} / ${deck.slides.length}`;
    next.contentWindow.addEventListener("keydown", key);
    next.contentWindow.addEventListener("chaosppt-motion-state", updateStep);
    next.contentDocument.addEventListener("click", (e) => {
      if (!e.target.closest("video,audio,a,button,input,select,textarea"))
        advance();
    });
    next.contentWindow.ChaosPPT.motion.start();
    updateStep();
    $("#error").style.display = "none";
  } catch (e) {
    if (next !== frame) next?.remove();
    error(e);
  } finally {
    navigating = false;
    $("#next").disabled = false;
    $("#prev").disabled = false;
  }
}
function advance() {
  if (navigating || !frame) return;
  if (frame.contentWindow.ChaosPPT.motion.next()) {
    updateStep();
    return;
  }
  show(index + 1);
}
function key(e) {
  if (
    e.target?.isContentEditable ||
    e.target?.closest?.("input,textarea,select,video,audio")
  )
    return;
  if (["ArrowRight", "PageDown", " "].includes(e.key)) {
    e.preventDefault();
    advance();
  }
  if (["ArrowLeft", "PageUp"].includes(e.key)) {
    e.preventDefault();
    show(index - 1);
  }
  if (e.key === "Home") show(0);
  if (e.key === "End") show(deck.slides.length - 1);
  if (e.key.toLowerCase() === "f") $("#present").click();
}
async function fonts() {
  const old = document.getElementById("deck-fonts");
  old?.remove();
  const style = document.createElement("style");
  style.id = "deck-fonts";
  style.textContent = deck.fonts
    .map(
      (f) =>
        `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify("/files/" + f.file.split("/").map(encodeURIComponent).join("/"))});font-weight:${f.weight};font-style:${f.style}}`,
    )
    .join("\n");
  document.head.append(style);
  await Promise.all(
    deck.fonts.map((f) =>
      document.fonts.load(
        `${f.style} ${f.weight.split(/\s+/)[0]} 24px ${JSON.stringify(f.family)}`,
        f.sample,
      ),
    ),
  );
}
async function load() {
  const response = await fetch("/api/deck");
  if (!response.ok) throw new Error(await response.text());
  deck = await response.json();
  await timeout(fonts(), deck.render.timeoutMs);
  $("#title").textContent = deck.title;
  $("nav").replaceChildren();
  deck.slides.forEach((s, i) => {
    const b = document.createElement("button"),
      n = document.createElement("small"),
      t = document.createElement("span");
    n.textContent = String(i + 1).padStart(2, "0");
    t.textContent = s.title || s.id;
    b.append(n, t);
    b.onclick = () => show(i);
    $("nav").append(b);
  });
  const requested = deck.slides.findIndex(
    (s) => s.id === location.hash.slice(1),
  );
  await show(requested >= 0 ? requested : index, {
    animate: false,
    reload: true,
  });
}
$("#next").onclick = advance;
$("#prev").onclick = () => show(index - 1);
$("#present").onclick = () => {
  document.body.classList.toggle("present");
  fit();
};
window.addEventListener("keydown", key);
new ResizeObserver(fit).observe(stage);
window.addEventListener("hashchange", () => {
  const i = deck?.slides.findIndex((s) => s.id === location.hash.slice(1));
  if (i >= 0 && i !== index) show(i);
});
load().catch(error);
setInterval(async () => {
  if (polling || navigating) return;
  polling = true;
  try {
    const r = await fetch("/api/revision");
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    if (revision && data.revision !== revision) await load();
    revision = data.revision;
  } catch (e) {
    error(e);
  } finally {
    polling = false;
  }
}, 1200);
