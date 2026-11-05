import test from "node:test";
import assert from "node:assert/strict";
import {
  compileTimeline,
  normalizeMotion,
  normalizeTransition,
  effectFrames,
} from "../src/motion/contract.js";
test("strict motion schema rejects unknown effects, properties and invalid timing", () => {
  for (const x of [
    { effect: "bounce" },
    { effect: "fade-in", durationMs: -1 },
    { effect: "fade-in", direction: "left" },
    { effect: "fly-in", direction: "diagonal" },
    { effect: "fade-in", easing: "spring" },
  ])
    assert.throws(() => normalizeMotion(x));
  assert.equal(normalizeMotion({ effect: "fade-in" }).durationMs, 500);
});
test("timeline shares click groups with with/after previous offsets", () => {
  const p = compileTimeline([
    {
      controlId: "a",
      motion: { effect: "fade-in", durationMs: 400, trigger: "on-click" },
    },
    {
      controlId: "b",
      motion: {
        effect: "reveal-in",
        direction: "left",
        durationMs: 300,
        trigger: "with-previous",
        delayMs: 100,
      },
    },
    {
      controlId: "c",
      motion: { effect: "fly-in", trigger: "after-previous", delayMs: 50 },
    },
    { controlId: "a", motion: { effect: "fade-out", trigger: "on-click" } },
  ]);
  assert.deepEqual(
    p.events.map((e) => [e.step, e.startMs]),
    [
      [1, 0],
      [1, 100],
      [1, 450],
      [2, 0],
    ],
  );
});
test("transition validates supported effects", () => {
  assert.equal(normalizeTransition({ effect: "morph" }).durationMs, 600);
  assert.throws(() => normalizeTransition({ effect: "flip" }));
});
test("falsy directions never bypass the enum", () => {
  for (const direction of ["", false, 0])
    assert.throws(
      () => normalizeMotion({ effect: "fly-in", direction }),
      /Direction/,
    );
});
test("wipe entrance reveals from the edge, exit erases from that edge", () => {
  const b = { x: 0, y: 0, width: 100, height: 50 },
    size = { width: 800, height: 450 };
  assert.equal(
    effectFrames({ effect: "reveal-in", direction: "left" }, b, size)[0]
      .clipPath,
    "inset(0 100% 0 0)",
  );
  assert.equal(
    effectFrames({ effect: "reveal-out", direction: "left" }, b, size)[1]
      .clipPath,
    "inset(0 0 0 100%)",
  );
});

test("explicit null does not silently become a default", () => {
  for (const [field, value] of [
    ["direction", null],
    ["durationMs", null],
    ["delayMs", null],
    ["trigger", null],
    ["order", null],
  ])
    assert.throws(() => normalizeMotion({ effect: "fly-in", [field]: value }));
  assert.throws(() =>
    normalizeTransition({ effect: "fade", durationMs: null }),
  );
});
