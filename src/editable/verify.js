import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { safeFile } from "../project.js";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const check = (ok, message) => {
  if (!ok) throw new Error("Verification failed: " + message);
};
const first = (e, tag) => e.getElementsByTagName(tag)[0];
const parse = (xml) => new DOMParser().parseFromString(xml, "application/xml");
export async function verifyEditableSlide({
  directory,
  slide,
  xml,
  zip,
  slidePath,
  relXml,
}) {
  check(!!slide.editable, "editable scene receipt");
  const sceneBytes = await readFile(
    await safeFile(directory, slide.editable.file),
  );
  check(sha(sceneBytes) === slide.editable.sha256, "editable scene hash");
  const scene = JSON.parse(sceneBytes);
  check(
    scene.version === 1 &&
      scene.slideId === slide.id &&
      Array.isArray(scene.nodes),
    "editable scene schema/identity",
  );
  const tree = first(parse(xml), "p:spTree");
  check(!!tree, "editable shape tree");
  let objects = Array.from(tree.childNodes).filter((n) =>
    ["p:sp", "p:pic", "p:graphicFrame", "p:grpSp", "p:cxnSp"].includes(
      n.nodeName,
    ),
  );
  const media = slide.media || [];
  if (scene.authoringMode === "controls") {
    const definitions = new Map(
      [...scene.nodes, ...scene.groups, ...media].map((n) => [n.objectName, n]),
    );
    const leaves = new Map(),
      all = [];
    function children(parent) {
      return Array.from(parent.childNodes).filter((n) =>
        ["p:sp", "p:pic", "p:grpSp", "p:graphicFrame", "p:cxnSp"].includes(
          n.nodeName,
        ),
      );
    }
    function treeCheck(expected, actual) {
      check(expected.length === actual.length, "control group child count");
      for (let i = 0; i < expected.length; i++) {
        const name = expected[i],
          o = actual[i],
          n = definitions.get(name);
        check(!!n, "declared group/control");
        position(o, n);
        all.push(o);
        if (n.children) {
          check(o.nodeName === "p:grpSp", "native group object");
          const transform = first(o, "a:xfrm"),
            off = first(transform, "a:off"),
            ext = first(transform, "a:ext"),
            childOff = first(transform, "a:chOff"),
            childExt = first(transform, "a:chExt");
          check(
            !!childOff &&
              !!childExt &&
              off.getAttribute("x") === childOff.getAttribute("x") &&
              off.getAttribute("y") === childOff.getAttribute("y") &&
              ext.getAttribute("cx") === childExt.getAttribute("cx") &&
              ext.getAttribute("cy") === childExt.getAttribute("cy"),
            "group child coordinate mapping",
          );
          treeCheck(n.children, children(o));
        } else {
          check(!leaves.has(name), "duplicate leaf control");
          leaves.set(name, o);
        }
      }
    }
    treeCheck(scene.roots, objects);
    check(
      all.length === scene.controls.length,
      "one PPT object per declared control",
    );
    const ids = all.map((o) => first(o, "p:cNvPr")?.getAttribute("id"));
    check(new Set(ids).size === ids.length, "unique group/control ids");
    objects = [...scene.nodes, ...media].map((n) => leaves.get(n.objectName));
    check(objects.every(Boolean), "all declared control leaves present");
  }
  check(
    objects.length === scene.nodes.length + media.length,
    "editable object count",
  );
  const ids = objects.map((o) => first(o, "p:cNvPr")?.getAttribute("id"));
  check(new Set(ids).size === ids.length, "unique editable object ids");
  const relations = Array.from(
    parse(relXml).getElementsByTagName("Relationship"),
  );
  const assetBytes = (rid) => {
    const rel = relations.find((r) => r.getAttribute("Id") === rid);
    check(
      !!rel && rel.getAttribute("TargetMode") !== "External",
      "native internal relationship",
    );
    const target = path.posix.normalize(
      path.posix.join(
        path.posix.dirname(slidePath),
        rel.getAttribute("Target"),
      ),
    );
    check(!!zip[target], "native related part");
    return zip[target];
  };
  function position(o, n) {
    const name = first(o, "p:cNvPr")?.getAttribute("name");
    check(name === n.objectName, "editable object order/identity");
    const xfrm = first(o, "a:xfrm");
    check(!!xfrm, "editable transform");
    const off = first(xfrm, "a:off"),
      ext = first(xfrm, "a:ext");
    check(!!off && !!ext, "editable geometry");
    const actual = [
        off.getAttribute("x"),
        off.getAttribute("y"),
        ext.getAttribute("cx"),
        ext.getAttribute("cy"),
      ].map(Number),
      b = n.bounds;
    [b.x, b.y, b.width, b.height].forEach((v, j) =>
      check(
        Number.isFinite(v) && Math.abs(actual[j] - Math.round(v * 9525)) <= 1,
        "editable object position",
      ),
    );
  }
  for (let i = 0; i < scene.nodes.length; i++) {
    const n = scene.nodes[i],
      o = objects[i];
    position(o, n);
    if (n.type === "richtext") {
      check(o.nodeName === "p:sp", "rich text control object");
      const body = first(o, "p:txBody");
      check(!!body, "rich text body");
      check(
        first(body, "a:bodyPr").getAttribute("wrap") ===
          (n.wrap ? "square" : "none"),
        "rich text wrapping policy",
      );
      const bodyPr=first(body,'a:bodyPr');for(const [attr,index] of [['tIns',0],['rIns',1],['bIns',2],['lIns',3]])check(Number(bodyPr.getAttribute(attr))===Math.round(n.padding[index]*9525),'rich text CSS padding');
      const paragraphs = Array.from(body.childNodes).filter(
        (e) => e.nodeName === "a:p",
      );
      check(
        paragraphs.length === n.paragraphs.length,
        "native paragraph count",
      );
      for (let p = 0; p < paragraphs.length; p++) {
        const runs = Array.from(paragraphs[p].childNodes).filter(
          (e) => e.nodeName === "a:r",
        );
        check(
          runs.length === n.paragraphs[p].runs.length,
          "native rich text run count",
        );
        for (let r = 0; r < runs.length; r++) {
          const expected = n.paragraphs[p].runs[r],
            props = first(runs[r], "a:rPr");
          check(
            first(runs[r], "a:t")?.textContent === expected.text,
            "rich text content",
          );
          check(
            Number(props.getAttribute("sz")) ===
              Math.round(expected.style.fontSize * 75) &&
              props.getAttribute("b") === (expected.style.bold ? "1" : "0") &&
              props.getAttribute("i") === (expected.style.italic ? "1" : "0"),
            "rich text run formatting",
          );
          check(
            first(props, "a:srgbClr")?.getAttribute("val") ===
              expected.style.color.color &&
              first(props, "a:latin")?.getAttribute("typeface") ===
                expected.style.fontFace,
            "rich text run color/font",
          );
        }
      }
    } else if (n.type === "text") {
      check(
        o.nodeName === "p:sp" && !!first(o, "p:txBody"),
        "native text object",
      );
      const text = Array.from(o.getElementsByTagName("a:t"))
        .map((t) => t.textContent)
        .join("");
      check(text === n.text, "native text content");
      const properties = first(o, "a:rPr");
      check(
        !!properties &&
          Math.abs(
            Number(properties.getAttribute("sz")) -
              Math.round(n.style.fontSize * 75),
          ) <= 1,
        "native font size",
      );
    } else if (n.type === "shape") {
      check(
        o.nodeName === "p:sp" &&
          first(o, "a:prstGeom")?.getAttribute("prst") === n.geometry,
        "native shape geometry",
      );
    } else if (["image", "fallback"].includes(n.type)) {
      check(o.nodeName === "p:pic", "native picture object");
      const bytes = await readFile(await safeFile(directory, n.asset.file));
      check(sha(bytes) === n.asset.sha256, "scene image hash");
      const id = first(o, "a:blip")?.getAttribute("r:embed");
      check(
        !!id && sha(assetBytes(id)) === n.asset.sha256,
        "scene embedded image bytes",
      );
    } else check(false, "unknown native scene node");
  }
  for (let i = 0; i < media.length; i++) {
    const n = media[i],
      o = objects[scene.nodes.length + i];
    position(o, n);
    check(o.nodeName === "p:pic", "native media type");
    const imageId = first(o, "a:blip")?.getAttribute("r:embed");
    check(!!imageId, "native media cover");
    if (n.kind === "gif")
      check(sha(assetBytes(imageId)) === n.sha256, "native GIF bytes");
    else {
      const videoId = first(o, "a:videoFile")?.getAttribute("r:link"),
        nativeId = first(o, "p14:media")?.getAttribute("r:embed");
      check(!!videoId && !!nativeId, "native MP4 links");
      check(
        sha(assetBytes(videoId)) === n.sha256 &&
          sha(assetBytes(nativeId)) === n.sha256,
        "native MP4 bytes",
      );
      check(sha(assetBytes(imageId)) === n.poster.sha256, "native MP4 poster");
    }
  }
  return scene;
}
