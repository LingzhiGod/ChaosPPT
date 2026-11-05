import { DOMParser } from "@xmldom/xmldom";
import { EFFECTS, DIRECTIONS } from "./contract.js";
const check = (ok, message) => {
  if (!ok) throw new Error("Verification failed: motion " + message);
};
const first = (e, tag) => e.getElementsByTagName(tag)[0];
const children = (e, tag) =>
  Array.from(e?.childNodes || []).filter((n) => n.nodeName === tag);
export function verifyNativeMotion(xml, plan) {
  const doc = new DOMParser().parseFromString(xml, "application/xml"),
    properties = Array.from(doc.getElementsByTagName("p:cNvPr"));
  const ids = new Map(
    properties.map((e) => [e.getAttribute("name"), e.getAttribute("id")]),
  );
  for (const s of [...plan.shared, ...(plan.nativeNames || [])])
    check(
      ids.has(s.nativeName),
      "shared/native object name " + (s.key || s.objectName),
    );
  const rows = Array.from(doc.getElementsByTagName("p:cTn")).filter((e) =>
    e.hasAttribute("presetID"),
  );
  check(rows.length === plan.events.length, "effect count");
  const timeIds = Array.from(doc.getElementsByTagName("p:cTn")).map((e) =>
    e.getAttribute("id"),
  );
  check(new Set(timeIds).size === timeIds.length, "unique timing IDs");
  const groups = plan.events.length
    ? children(
        first(
          Array.from(doc.getElementsByTagName("p:cTn")).find(
            (e) => e.getAttribute("nodeType") === "mainSeq",
          ),
          "p:childTnLst",
        ),
        "p:par",
      )
    : [];
  const stepNumbers = [...new Set(plan.events.map((e) => e.step))];
  check(groups.length === stepNumbers.length, "click group count");
  for (let j = 0; j < groups.length; j++) {
    const condition = first(groups[j], "p:stCondLst");
    check(
      children(condition, "p:cond").some(
        (c) => c.getAttribute("delay") === "indefinite",
      ),
      "click trigger anchor",
    );
    if (stepNumbers[j] === 0)
      check(
        children(condition, "p:cond").some(
          (c) =>
            c.getAttribute("evt") === "onBegin" &&
            first(c, "p:tn")?.getAttribute("val") === "2",
        ),
        "automatic step anchor",
      );
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i],
      e = plan.events[i],
      def = EFFECTS[e.effect],
      expectedId = ids.get(e.nativeName || e.objectName);
    check(!!expectedId, "target control exists");
    check(
      row.getAttribute("presetID") === String(def.presetID) &&
        row.getAttribute("presetClass") === (def.enter ? "entr" : "exit") &&
        row.getAttribute("presetSubtype") ===
          String(e.direction ? DIRECTIONS[e.direction] : 0),
      "native effect mapping",
    );
    check(
      row.getAttribute("nodeType") ===
        {
          "on-click": "clickEffect",
          "with-previous": "withEffect",
          "after-previous": "afterEffect",
        }[e.trigger],
      "trigger type",
    );
    check(
      first(first(row, "p:stCondLst"), "p:cond").getAttribute("delay") ===
        String(e.delayMs),
      "effect delay",
    );
    const wrapper = row.parentNode.parentNode.parentNode;
    check(wrapper.nodeName === "p:cTn", "timeline wrapper");
    check(
      first(first(wrapper, "p:stCondLst"), "p:cond").getAttribute("delay") ===
        String(e.startMs - e.delayMs),
      "timeline offset",
    );
    const targets = Array.from(row.getElementsByTagName("p:spTgt"));
    check(
      targets.length > 0 &&
        targets.every((t) => t.getAttribute("spid") === expectedId),
      "target shape/group ID",
    );
    const sets = Array.from(row.getElementsByTagName("p:set"));
    check(sets.length === 1, "visibility behavior");
    check(
      first(sets[0], "p:strVal").getAttribute("val") ===
        (def.enter ? "visible" : "hidden"),
      "visibility state",
    );
    check(
      first(first(sets[0], "p:stCondLst"), "p:cond").getAttribute("delay") ===
        String(def.enter ? 0 : Math.max(0, e.durationMs - 1)),
      "visibility timing",
    );
    if (def.family === "fly") {
      const anims = Array.from(row.getElementsByTagName("p:anim"));
      check(anims.length === 2, "Fly coordinate behaviors");
      const b = e.authoredBounds,
        s = plan.size,
        d = {
          left: [(-b.x - b.width) / s.width, 0],
          right: [(s.width - b.x) / s.width, 0],
          up: [0, (-b.y - b.height) / s.height],
          down: [0, (s.height - b.y) / s.height],
        }[e.direction];
      for (let j = 0; j < 2; j++) {
        check(
          first(anims[j], "p:cTn").getAttribute("dur") === String(e.durationMs),
          "Fly duration",
        );
        const axis = ["x", "y"][j],
          base = (def.enter ? "#" : "") + "ppt_" + axis,
          edge =
            d[j] === 0
              ? base
              : `${base}${d[j] >= 0 ? "+" : ""}${Number(d[j].toFixed(9))}`;
        check(
          first(anims[j], "p:attrName").textContent === "ppt_" + axis,
          "Fly axis",
        );
        const actual = Array.from(anims[j].getElementsByTagName("p:tav")).map(
          (v) => first(v, "p:strVal").getAttribute("val"),
        );
        check(
          JSON.stringify(actual) ===
            JSON.stringify(def.enter ? [edge, base] : [base, edge]),
          "Fly geometry",
        );
      }
    } else {
      const a = first(row, "p:animEffect");
      check(
        !!a &&
          a.getAttribute("filter") ===
            (def.family === "fade" ? "fade" : `wipe(${e.direction})`) &&
          a.getAttribute("transition") === (def.enter ? "in" : "out"),
        "filter/direction",
      );
      check(
        first(a, "p:cTn").getAttribute("dur") === String(e.durationMs),
        "duration",
      );
    }
  }
  const transitions = Array.from(doc.getElementsByTagName("p:transition"));
  if (plan.transition.effect === "none")
    check(transitions.length === 0, "unexpected transition");
  else {
    check(
      transitions.length === (plan.transition.effect === "morph" ? 2 : 1),
      "transition/fallback count",
    );
    for (const t of transitions)
      check(
        t.getAttribute("p14:dur") === String(plan.transition.durationMs),
        "transition duration",
      );
    if (plan.transition.effect === "fade")
      check(!!first(transitions[0], "p:fade"), "Fade transition");
    else {
      const choice = first(doc, "mc:Choice"),
        fallback = first(doc, "mc:Fallback");
      check(
        !!choice &&
          choice.getAttribute("Requires") === "p159" &&
          first(choice, "p159:morph")?.getAttribute("option") === "byObject",
        "Morph transition",
      );
      check(
        !!fallback && !!first(fallback, "p:fade"),
        "Morph compatibility fallback",
      );
    }
  }
}
