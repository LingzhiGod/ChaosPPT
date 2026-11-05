// One pure contract is imported by both browser playback and native export.
export const EFFECTS = Object.freeze({
  "fade-in": { family: "fade", enter: true, presetID: 10 },
  "fade-out": { family: "fade", enter: false, presetID: 10 },
  "fly-in": { family: "fly", enter: true, presetID: 2 },
  "fly-out": { family: "fly", enter: false, presetID: 2 },
  "reveal-in": { family: "wipe", enter: true, presetID: 22 },
  "reveal-out": { family: "wipe", enter: false, presetID: 22 },
});
export const DIRECTIONS = Object.freeze({ left: 8, right: 2, up: 1, down: 4 });
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
function fields(v, allowed, label) {
  if (!object(v)) throw new Error(`${label} must be an object`);
  for (const k of Object.keys(v))
    if (!allowed.includes(k)) throw new Error(`Unknown ${label} field: ${k}`);
}
function integer(v, min, max, label) {
  if (!Number.isInteger(v) || v < min || v > max)
    throw new Error(`${label} must be an integer in ${min}..${max}`);
  return v;
}
export function normalizeMotion(v) {
  fields(
    v,
    ["effect", "direction", "durationMs", "delayMs", "trigger", "order"],
    "motion",
  );
  if (!Object.hasOwn(EFFECTS, v.effect))
    throw new Error(`Unsupported motion effect: ${v.effect}`);
  const def = EFFECTS[v.effect];
  if (def.family === "fade" && v.direction !== undefined)
    throw new Error("Fade has no direction");
  const direction =
    def.family === "fade"
      ? null
      : v.direction === undefined
        ? "left"
        : v.direction;
  if (
    def.family !== "fade" &&
    (typeof direction !== "string" || !Object.hasOwn(DIRECTIONS, direction))
  )
    throw new Error("Direction must be left/right/up/down");
  const trigger = v.trigger === undefined ? "on-click" : v.trigger;
  if (!["on-click", "with-previous", "after-previous"].includes(trigger))
    throw new Error("Unsupported motion trigger");
  return {
    effect: v.effect,
    direction,
    durationMs: integer(
      v.durationMs === undefined ? 500 : v.durationMs,
      1,
      10000,
      "durationMs",
    ),
    delayMs: integer(
      v.delayMs === undefined ? 0 : v.delayMs,
      0,
      10000,
      "delayMs",
    ),
    trigger,
    order: integer(v.order === undefined ? 0 : v.order, 0, 10000, "order"),
  };
}
export function normalizeTransition(v) {
  if (v === undefined) return { effect: "none", durationMs: 0 };
  fields(v, ["effect", "durationMs"], "transition");
  if (!["none", "fade", "morph"].includes(v.effect))
    throw new Error(`Unsupported transition: ${v.effect}`);
  if (v.effect === "none") {
    if (v.durationMs !== undefined && v.durationMs !== 0)
      throw new Error("none transition duration must be zero");
    return { effect: "none", durationMs: 0 };
  }
  return {
    effect: v.effect,
    durationMs: integer(
      v.durationMs === undefined ? 600 : v.durationMs,
      100,
      5000,
      "transition durationMs",
    ),
  };
}
export function compileTimeline(records) {
  if (records.length > 256) throw new Error("At most 256 effects per page");
  const rows = records
    .map((r, i) => ({
      ...normalizeMotion(r.motion),
      controlId: r.controlId,
      sourceIndex: i,
    }))
    .sort((a, b) => a.order - b.order || a.sourceIndex - b.sourceIndex);
  let step = 0,
    previous = null;
  const previousForTarget = new Map(),
    states = new Map();
  const events = rows.map((r, i) => {
    if (r.trigger === "on-click") step++;
    const startMs =
      r.trigger === "on-click"
        ? r.delayMs
        : (previous
            ? r.trigger === "with-previous"
              ? previous.startMs
              : previous.startMs + previous.durationMs
            : 0) + r.delayMs;
    if (startMs + r.durationMs > 60000)
      throw new Error("A click group cannot exceed 60 seconds");
    const prev = previousForTarget.get(r.controlId);
    if (prev && prev.step === step && prev.startMs + prev.durationMs > startMs)
      throw new Error(`Overlapping effects on ${r.controlId}`);
    const enters = EFFECTS[r.effect].enter;
    let visible = states.get(r.controlId);
    if (visible === undefined) visible = !enters;
    if (visible === enters)
      throw new Error(
        `Motion visibility sequence is invalid for ${r.controlId}; alternate entrance and exit effects`,
      );
    states.set(r.controlId, enters);
    const e = { ...r, eventId: `motion-${i + 1}`, step, startMs };
    previous = e;
    previousForTarget.set(r.controlId, e);
    return e;
  });
  return { version: 1, events, steps: step };
}
export function effectFrames(event, bounds, size) {
  const def = EFFECTS[event.effect];
  let from, to;
  if (def.family === "fade") {
    from = { opacity: 0 };
    to = { opacity: event.authoredOpacity ?? 1 };
  } else if (def.family === "fly") {
    const offsets = {
      left: [-bounds.x - bounds.width, 0],
      right: [size.width - bounds.x, 0],
      up: [0, -bounds.y - bounds.height],
      down: [0, size.height - bounds.y],
    };
    const [x, y] = offsets[event.direction];
    from = { transform: `translate(${x}px, ${y}px)` };
    to = { transform: "translate(0px, 0px)" };
  } else {
    const clips = {
      left: "inset(0 100% 0 0)",
      right: "inset(0 0 0 100%)",
      up: "inset(0 0 100% 0)",
      down: "inset(100% 0 0 0)",
    };
    // Wipe out erases starting at the named edge; it is not an in-wipe played backwards.
    const opposite = { left: "right", right: "left", up: "down", down: "up" };
    from = {
      clipPath: clips[def.enter ? event.direction : opposite[event.direction]],
    };
    to = { clipPath: "inset(0 0 0 0)" };
  }
  return def.enter ? [from, to] : [to, from];
}
