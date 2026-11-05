import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { EFFECTS, DIRECTIONS } from "./contract.js";
const NS = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  p14: "http://schemas.microsoft.com/office/powerpoint/2010/main",
  p159: "http://schemas.microsoft.com/office/powerpoint/2015/09/main",
  mc: "http://schemas.openxmlformats.org/markup-compatibility/2006",
};
const first = (n, t) => n.getElementsByTagName(t)[0];
function el(doc, name, attrs = {}, children = []) {
  const e = doc.createElementNS(NS[name.split(":")[0]], name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const c of children)
    e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
  return e;
}
function timing(doc, plan, ids) {
  let number = 3;
  const id = () => number++;
  const tgt = (spid) => el(doc, "p:tgtEl", {}, [el(doc, "p:spTgt", { spid })]);
  const cond = (delay) =>
    el(doc, "p:stCondLst", {}, [el(doc, "p:cond", { delay })]);
  const behavior = (spid, dur, attr, delay) =>
    el(
      doc,
      "p:cBhvr",
      { ...(attr && attr.startsWith("ppt_") ? { additive: "base" } : {}) },
      [
        el(
          doc,
          "p:cTn",
          { id: id(), dur, fill: "hold" },
          delay !== undefined ? [cond(delay)] : [],
        ),
        tgt(spid),
        ...(attr
          ? [el(doc, "p:attrNameLst", {}, [el(doc, "p:attrName", {}, [attr])])]
          : []),
      ],
    );
  const visibility = (spid, value, delay) =>
    el(doc, "p:set", {}, [
      behavior(spid, 1, "style.visibility", delay),
      el(doc, "p:to", {}, [el(doc, "p:strVal", { val: value })]),
    ]);
  function row(event) {
    const def = EFFECTS[event.effect],
      spid = ids.get(event.objectName);
    if (!spid)
      throw new Error("Missing native animation target " + event.objectName);
    const children = [];
    if (def.enter) children.push(visibility(spid, "visible", 0));
    if (def.family === "fly") {
      const b = event.authoredBounds,
        s = plan.size;
      const delta = {
        left: [(-b.x - b.width) / s.width, 0],
        right: [(s.width - b.x) / s.width, 0],
        up: [0, (-b.y - b.height) / s.height],
        down: [0, (s.height - b.y) / s.height],
      }[event.direction];
      ["x", "y"].forEach((axis, j) => {
        const base = (def.enter ? "#" : "") + "ppt_" + axis,
          edge =
            delta[j] === 0
              ? base
              : `${base}${delta[j] >= 0 ? "+" : ""}${Number(delta[j].toFixed(9))}`;
        const values = def.enter ? [edge, base] : [base, edge];
        const keyframes = values.map((value, k) =>
          el(doc, "p:tav", { tm: k ? 100000 : 0 }, [
            el(doc, "p:val", {}, [el(doc, "p:strVal", { val: value })]),
          ]),
        );
        children.push(
          el(doc, "p:anim", { calcmode: "lin", valueType: "num" }, [
            behavior(spid, event.durationMs, "ppt_" + axis),
            el(doc, "p:tavLst", {}, keyframes),
          ]),
        );
      });
    } else
      children.push(
        el(
          doc,
          "p:animEffect",
          {
            transition: def.enter ? "in" : "out",
            filter: def.family === "fade" ? "fade" : `wipe(${event.direction})`,
          },
          [behavior(spid, event.durationMs)],
        ),
      );
    if (!def.enter)
      children.push(
        visibility(spid, "hidden", Math.max(0, event.durationMs - 1)),
      );
    return el(doc, "p:par", {}, [
      el(
        doc,
        "p:cTn",
        {
          id: id(),
          presetID: def.presetID,
          presetClass: def.enter ? "entr" : "exit",
          presetSubtype: event.direction ? DIRECTIONS[event.direction] : 0,
          fill: "hold",
          grpId: 0,
          nodeType: {
            "on-click": "clickEffect",
            "with-previous": "withEffect",
            "after-previous": "afterEffect",
          }[event.trigger],
        },
        [cond(event.delayMs), el(doc, "p:childTnLst", {}, children)],
      ),
    ]);
  }
  const steps = [...new Set(plan.events.map((e) => e.step))].map((step) => {
    const events = plan.events.filter((e) => e.step === step);
    const rows = events.map((e) =>
      el(doc, "p:par", {}, [
        el(doc, "p:cTn", { id: id(), fill: "hold" }, [
          cond(e.startMs - e.delayMs),
          el(doc, "p:childTnLst", {}, [row(e)]),
        ]),
      ]),
    );
    const conditions = [el(doc, "p:cond", { delay: "indefinite" })];
    if (step === 0)
      conditions.push(
        el(doc, "p:cond", { evt: "onBegin", delay: 0 }, [
          el(doc, "p:tn", { val: 2 }),
        ]),
      );
    return el(doc, "p:par", {}, [
      el(doc, "p:cTn", { id: id(), fill: "hold" }, [
        el(doc, "p:stCondLst", {}, conditions),
        el(doc, "p:childTnLst", {}, rows),
      ]),
    ]);
  });
  const navigation = (event) =>
    el(doc, "p:cond", { evt: event, delay: 0 }, [
      el(doc, "p:tgtEl", {}, [el(doc, "p:sldTgt")]),
    ]);
  return el(doc, "p:timing", {}, [
    el(doc, "p:tnLst", {}, [
      el(doc, "p:par", {}, [
        el(
          doc,
          "p:cTn",
          { id: 1, dur: "indefinite", restart: "never", nodeType: "tmRoot" },
          [
            el(doc, "p:childTnLst", {}, [
              el(doc, "p:seq", { concurrent: 1, nextAc: "seek" }, [
                el(
                  doc,
                  "p:cTn",
                  { id: 2, dur: "indefinite", nodeType: "mainSeq" },
                  [el(doc, "p:childTnLst", {}, steps)],
                ),
                el(doc, "p:prevCondLst", {}, [navigation("onPrev")]),
                el(doc, "p:nextCondLst", {}, [navigation("onNext")]),
              ]),
            ]),
          ],
        ),
      ]),
    ]),
    el(
      doc,
      "p:bldLst",
      {},
      [...new Set(plan.events.map((e) => ids.get(e.objectName)))].map((spid) =>
        el(doc, "p:bldP", { spid, grpId: 0 }),
      ),
    ),
  ]);
}
function transition(doc, value) {
  if (value.effect === "none") return null;
  const t = (effect) => {
    const n = el(doc, "p:transition", { spd: "med", advClick: 1 });
    n.setAttributeNS(NS.p14, "p14:dur", String(value.durationMs));
    n.appendChild(effect);
    return n;
  };
  if (value.effect === "fade") return t(el(doc, "p:fade"));
  const choice = el(doc, "mc:Choice", { Requires: "p159" }, [
    t(el(doc, "p159:morph", { option: "byObject" })),
  ]);
  choice.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:p159", NS.p159);
  return el(doc, "mc:AlternateContent", {}, [
    choice,
    el(doc, "mc:Fallback", {}, [t(el(doc, "p:fade"))]),
  ]);
}
export async function applyNativeMotion(file, plans) {
  const zip = unzipSync(await readFile(file));
  const receipts = [];
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index],
      name = `ppt/slides/slide${index + 1}.xml`,
      doc = new DOMParser().parseFromString(
        strFromU8(zip[name]),
        "application/xml",
      ),
      root = doc.documentElement;
    const properties = Array.from(doc.getElementsByTagName("p:cNvPr")),
      byName = new Map(properties.map((e) => [e.getAttribute("name"), e]));
    const ids = new Map(
      properties.map((e) => [e.getAttribute("name"), e.getAttribute("id")]),
    );
    for (const s of plan.nativeNames || plan.shared) {
      const e = byName.get(s.objectName);
      if (!e) throw new Error("Missing shared control " + s.controlId);
      e.setAttribute("name", s.nativeName);
    }
    // Preserve any media timing generated by the underlying writer; merging two main sequences is not safe.
    if (plan.events.length && doc.getElementsByTagName("p:timing").length)
      throw new Error(
        "Existing native timing cannot be merged with control motion",
      );
    const anchor =
      Array.from(root.childNodes).find((e) => e.nodeName === "p:extLst") ||
      null;
    if (plan.transition.effect !== "none") {
      root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:p14", NS.p14);
      root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:mc", NS.mc);
      root.setAttributeNS(NS.mc, "mc:Ignorable", "p14");
    }
    const trans = transition(doc, plan.transition);
    if (trans) root.insertBefore(trans, anchor);
    if (plan.events.length) root.insertBefore(timing(doc, plan, ids), anchor);
    zip[name] = strToU8(new XMLSerializer().serializeToString(doc));
    receipts.push({
      slideId: plan.slideId,
      transition: plan.transition,
      shared: plan.shared,
      nativeNames: plan.nativeNames || [],
      events: plan.events.map((e) => ({
        ...e,
        shapeId: ids.get(e.objectName),
      })),
    });
  }
  await writeFile(file, zipSync(zip, { level: 6 }));
  return receipts;
}
