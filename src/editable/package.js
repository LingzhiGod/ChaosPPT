import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
// PptxGenJS media IDs derive from relationship IDs and can collide with earlier text/shape IDs.
// Keep media IDs (and their playback references) intact, and relocate ordinary object IDs.
export async function finalizeEditablePackage(file, scenes = []) {
  const zip = unzipSync(await readFile(file));
  for (const name of Object.keys(zip).filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(n),
  )) {
    const doc = new DOMParser().parseFromString(
      strFromU8(zip[name]),
      "application/xml",
    );
    const tree = doc.getElementsByTagName("p:spTree")[0];
    const objects = Array.from(tree.childNodes).filter((n) =>
      ["p:sp", "p:pic"].includes(n.nodeName),
    );
    const mediaIds = new Set(
      objects
        .filter((o) => o.getElementsByTagName("a:videoFile").length)
        .map((o) => o.getElementsByTagName("p:cNvPr")[0].getAttribute("id")),
    );
    let next = 1000;
    for (const o of objects) {
      if (o.getElementsByTagName("a:videoFile").length) continue;
      while (mediaIds.has(String(next))) next++;
      o.getElementsByTagName("p:cNvPr")[0].setAttribute("id", String(next++));
    }
    const scene = scenes[Number(name.match(/slide(\d+)/)[1]) - 1];
    if (scene?.authoringMode === "controls")
      assembleControls(doc, tree, objects, scene, next);
    zip[name] = strToU8(new XMLSerializer().serializeToString(doc));
  }
  await writeFile(file, zipSync(zip, { level: 6 }));
}

const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
};
function xml(doc, name, attrs = {}, children = []) {
  const e = doc.createElementNS(NS[name.split(":")[0]], name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const c of children) e.appendChild(c);
  return e;
}
function runProperties(doc, tag, s) {
  const e = xml(doc, tag, {
    lang: "zh-CN",
    sz: Math.round(s.fontSize * 75),
    b: s.bold ? 1 : 0,
    i: s.italic ? 1 : 0,
    spc: Math.round(s.charSpacing * 75),
    u: s.underline ? "sng" : "none",
    strike: s.strike ? "sngStrike" : "noStrike",
  });
  e.appendChild(
    xml(doc, "a:solidFill", {}, [
      xml(doc, "a:srgbClr", { val: s.color.color }, [
        xml(doc, "a:alpha", { val: Math.round(s.color.alpha * 100000) }),
      ]),
    ]),
  );
  for (const tag of ["a:latin", "a:ea", "a:cs"])
    e.appendChild(xml(doc, tag, { typeface: s.fontFace }));
  return e;
}
function assembleControls(doc, tree, objects, scene, next) {
  const names = new Map(
    objects.map((o) => [
      o.getElementsByTagName("p:cNvPr")[0].getAttribute("name"),
      o,
    ]),
  );
  for (const n of scene.nodes.filter((n) => n.type === "richtext")) {
    const object = names.get(n.objectName),
      body = object.getElementsByTagName("p:txBody")[0];
    const bodyPr=body.getElementsByTagName('a:bodyPr')[0];
    for(const [attr,index] of [['tIns',0],['rIns',1],['bIns',2],['lIns',3]])bodyPr.setAttribute(attr,String(Math.round(n.padding[index]*9525)));
    for (const child of [...Array.from(body.childNodes)])
      if (child.nodeName === "a:p") body.removeChild(child);
    for (const paragraph of n.paragraphs) {
      const p = xml(doc, "a:p");
      p.appendChild(
        xml(
          doc,
          "a:pPr",
          {
            algn: { left: "l", center: "ctr", right: "r", justify: "just" }[
              n.align
            ],
          },
          [
            xml(doc, "a:lnSpc", {}, [
              xml(doc, "a:spcPts", { val: Math.round(n.lineHeight * 75) }),
            ]),
            xml(doc, "a:spcBef", {}, [xml(doc, "a:spcPts", { val: 0 })]),
            xml(doc, "a:spcAft", {}, [xml(doc, "a:spcPts", { val: 0 })]),
          ],
        ),
      );
      for (const run of paragraph.runs) {
        const t = xml(doc, "a:t");
        t.setAttribute("xml:space", "preserve");
        t.appendChild(doc.createTextNode(run.text));
        p.appendChild(
          xml(doc, "a:r", {}, [runProperties(doc, "a:rPr", run.style), t]),
        );
      }
      p.appendChild(runProperties(doc, "a:endParaRPr", n.style));
      body.appendChild(p);
    }
    const geom = object.getElementsByTagName("a:prstGeom")[0];
    geom.setAttribute("prst", n.geometry);
    while (geom.firstChild) geom.removeChild(geom.firstChild);
    const av = xml(doc, "a:avLst");
    if (n.geometry === "roundRect")
      av.appendChild(
        xml(doc, "a:gd", {
          name: "adj",
          fmla:
            "val " +
            Math.round(
              (n.radius * 100000) / Math.min(n.bounds.width, n.bounds.height),
            ),
        }),
      );
    geom.appendChild(av);
  }
  const occupiedIds = new Set(
    Array.from(doc.getElementsByTagName("p:cNvPr")).map((e) =>
      e.getAttribute("id"),
    ),
  );
  const nextId = () => {
    while (occupiedIds.has(String(next))) next++;
    const value = next++;
    occupiedIds.add(String(value));
    return value;
  };
  const groupMap = new Map(scene.groups.map((g) => [g.objectName, g]));
  const used = new Set();
  const emu = (v) => Math.round(v * 9525);
  function build(name) {
    if (used.has(name))
      throw new Error("Duplicate object in control group tree");
    used.add(name);
    const g = groupMap.get(name);
    if (!g) {
      if (!names.has(name))
        throw new Error("Missing declared control object: " + name);
      return names.get(name);
    }
    const b = g.bounds,
      position = { x: emu(b.x), y: emu(b.y) },
      extent = { cx: emu(b.width), cy: emu(b.height) };
    const result = xml(doc, "p:grpSp", {}, [
      xml(doc, "p:nvGrpSpPr", {}, [
        xml(doc, "p:cNvPr", { id: nextId(), name: g.objectName }),
        xml(doc, "p:cNvGrpSpPr"),
        xml(doc, "p:nvPr"),
      ]),
      xml(doc, "p:grpSpPr", {}, [
        xml(doc, "a:xfrm", {}, [
          xml(doc, "a:off", position),
          xml(doc, "a:ext", extent),
          xml(doc, "a:chOff", position),
          xml(doc, "a:chExt", extent),
        ]),
      ]),
    ]);
    for (const child of g.children) result.appendChild(build(child));
    return result;
  }
  for (const o of objects) tree.removeChild(o);
  for (const name of scene.roots) tree.appendChild(build(name));
  if (used.size !== scene.controls.length)
    throw new Error("Control/object count mismatch");
}
