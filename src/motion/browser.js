import {
  compileTimeline,
  normalizeTransition,
  effectFrames,
  EFFECTS,
} from "./contract.js";
const controlSelector = "[data-pptx],[data-pptx-group]";
const idOf = (e) => e.dataset.pptxId || e.dataset.pptxGroup;
const kindOf = (e) =>
  e.dataset.pptxGroup !== undefined ? "group" : e.dataset.pptx;
const activeEvent = new Map();
let original = new Map(),
  animations = [],
  timers = [],
  generation = 0,
  plan = null,
  currentStep = 0,
  busy = false;
function collect() {
  const root = document.querySelector(".slide"),
    records = [],
    targets = [],
    shared = [],
    keys = new Set();
  for (const e of document.querySelectorAll(
    "[data-pptx-motion],[data-pptx-shared]",
  )) {
    if (!root?.contains(e) || !e.matches(controlSelector) || !idOf(e))
      throw new Error(
        "Motion/shared metadata requires an explicit control with an ID inside .slide",
      );
    if (
      getComputedStyle(e).display === "none" ||
      getComputedStyle(e).visibility !== "visible"
    )
      throw new Error(
        `Motion target ${idOf(e)} must be visible in the authored layout`,
      );
    if (kindOf(e) === "media" || e.querySelector("[data-pptx-media]"))
      throw new Error(
        "Media and groups containing media are not motion/shared targets in this version",
      );
    if (e.hasAttribute("data-pptx-motion")) {
      let value;
      try {
        value = JSON.parse(e.dataset.pptxMotion);
      } catch {
        throw new Error(`Invalid motion JSON on ${idOf(e)}`);
      }
      const list = Array.isArray(value) ? value : [value];
      if (!list.length || list.length > 32)
        throw new Error("Use 1..32 effects per target");
      for (const motion of list) {
        if (
          kindOf(e) === "raster" &&
          String(motion?.effect).startsWith("reveal")
        )
          throw new Error(
            "Reveal is not supported on alpha-trimmed raster controls",
          );
        records.push({ controlId: idOf(e), motion });
      }
      targets.push(e);
    }
    if (e.hasAttribute("data-pptx-shared")) {
      if (kindOf(e) === "raster" || e.querySelector('[data-pptx="raster"]'))
        throw new Error(
          "Shared elements cannot be alpha-trimmed raster controls or groups containing them",
        );
      const key = e.dataset.pptxShared;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(key) || keys.has(key))
        throw new Error("Shared keys must be nonempty and unique per page");
      keys.add(key);
      shared.push({
        key,
        controlId: idOf(e),
        kind: kindOf(e),
        geometry: ["shape", "text"].includes(kindOf(e))
          ? e.dataset.pptxShape ||
            (parseFloat(getComputedStyle(e).borderTopLeftRadius)
              ? "roundRect"
              : "rect")
          : null,
        structure:
          kindOf(e) === "group"
            ? [...e.querySelectorAll(controlSelector)]
                .filter((c) => {
                  const r = c.getBoundingClientRect(),
                    s = getComputedStyle(c);
                  return r.width && r.height && s.visibility === "visible";
                })
                .map((c) => [idOf(c), kindOf(c)])
            : null,
      });
    }
  }
  for (let i = 0; i < targets.length; i++)
    for (let j = i + 1; j < targets.length; j++)
      if (targets[i].contains(targets[j]) || targets[j].contains(targets[i]))
        throw new Error("Animate a group OR its descendants, not both");
  const sharedElements = shared.map((s) => find(s.controlId));
  for (let i = 0; i < sharedElements.length; i++)
    for (let j = i + 1; j < sharedElements.length; j++)
      if (
        sharedElements[i].contains(sharedElements[j]) ||
        sharedElements[j].contains(sharedElements[i])
      )
        throw new Error("Shared groups cannot contain another shared target");
  for (const s of sharedElements)
    for (const t of targets)
      if (s === t || s.contains(t) || t.contains(s))
        throw new Error(
          "Shared elements and their group trees cannot also have page-local effects",
        );
  const timeline = compileTimeline(records);
  for (const e of timeline.events) {
    const r = find(e.controlId).getBoundingClientRect();
    e.authoredBounds = { x: r.x, y: r.y, width: r.width, height: r.height };
    e.authoredOpacity = Number(getComputedStyle(find(e.controlId)).opacity);
  }
  return {
    ...timeline,
    compatibilityWarnings: targets.flatMap((target) => {
      const group = target.parentElement?.closest(
        '[data-pptx-group],[data-pptx="group"]',
      );
      return group
        ? [
            {
              severity: "warning",
              code: "MOTION_GROUP_CHILD_COMPATIBILITY",
              controlId: idOf(target),
              message: `Animated control ${idOf(target)} is inside native group ${idOf(group)}. WPS may omit grouped-child effects on import. For WPS, use unpainted layout containers for independently animated controls, or animate a top-level group as a whole. Verify playback in the target application.`,
            },
          ]
        : [];
    }),
    slideId: window.__CHAOSPPT_CONFIG__.slide.id,
    size: window.__CHAOSPPT_CONFIG__.size,
    shared,
    transition: normalizeTransition(
      window.__CHAOSPPT_CONFIG__.slide.transition,
    ),
  };
}
function find(id) {
  return [...document.querySelectorAll(controlSelector)].find(
    (e) => idOf(e) === id,
  );
}
function canonical() {
  generation++;
  for (const a of animations) a.cancel();
  animations = [];
  timers.forEach(clearTimeout);
  timers = [];
  for (const [e, style] of original) {
    if (style === null) e.removeAttribute("style");
    else e.setAttribute("style", style);
  }
  original.clear();
  activeEvent.clear();
  busy = false;
  plan = null;
  currentStep = 0;
}
function save(e) {
  if (!original.has(e)) original.set(e, e.getAttribute("style"));
}
function setVisible(e, visible) {
  for (const node of [e, ...e.querySelectorAll("*")]) {
    save(node);
    if (!visible) node.style.setProperty("visibility", "hidden", "important");
    else {
      const style = original.get(node);
      if (style === null) node.removeAttribute("style");
      else node.setAttribute("style", style);
    }
  }
}
function signal() {
  window.dispatchEvent(
    new CustomEvent("chaosppt-motion-state", { detail: state() }),
  );
}
function state() {
  return { step: currentStep, steps: plan?.steps || 0, busy };
}
function endEvent(e, event) {
  setVisible(e, EFFECTS[event.effect].enter);
}
function playStep(step) {
  const events = plan.events.filter((e) => e.step === step);
  currentStep = step;
  busy = events.length > 0;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const event of events) endEvent(find(event.controlId), event);
    busy = false;
    signal();
    return;
  }
  const token = generation;
  for (const event of events) {
    const e = find(event.controlId);
    save(e);
    const start = () => {
      if (token !== generation) return;
      activeEvent.set(event.controlId, event.eventId);
      setVisible(e, true);
      const frames = effectFrames(
        event,
        event.authoredBounds,
        window.__CHAOSPPT_CONFIG__.size,
      );
      const a = e.animate(frames, {
        duration: event.durationMs,
        fill: "both",
        easing: "linear",
      });
      animations.push(a);
      a.finished
        .then(() => {
          if (token !== generation) return;
          if (activeEvent.get(event.controlId) === event.eventId)
            endEvent(e, event);
          a.cancel();
        })
        .catch(() => {});
    };
    if (event.startMs === 0) start();
    else timers.push(setTimeout(start, event.startMs));
  }
  const duration = Math.max(0, ...events.map((e) => e.startMs + e.durationMs));
  if (events.length)
    timers.push(
      setTimeout(() => {
        if (token !== generation) return;
        busy = false;
        signal();
      }, duration + 1),
    );
  signal();
}
async function initialize({ autoplay = true } = {}) {
  canonical();
  await window.ChaosPPT.ready();
  plan = collect();
  for (const event of plan.events) {
    const e = find(event.controlId);
    if (!original.has(e)) {
      save(e);
      setVisible(e, !EFFECTS[event.effect].enter);
    }
  }
  if (autoplay) playStep(0);
  else signal();
  return state();
}
function finishStep() {
  generation++;
  timers.forEach(clearTimeout);
  timers = [];
  animations.forEach((a) => a.cancel());
  animations = [];
  for (const e of plan.events.filter((e) => e.step === currentStep))
    endEvent(find(e.controlId), e);
  busy = false;
  signal();
}
function next() {
  if (!plan) return false;
  if (busy) {
    finishStep();
    return true;
  }
  if (currentStep >= plan.steps) return false;
  playStep(currentStep + 1);
  return true;
}
window.ChaosPPT.motion = {
  collect,
  initialize,
  next,
  state,
  canonical,
  finishStep,
  getPlan: () => plan || collect(),
  start: () => {
    if (plan) playStep(0);
  },
};
