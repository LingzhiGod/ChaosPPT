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
  const objects = Array.from(tree.childNodes).filter((n) =>
    ["p:sp", "p:pic", "p:graphicFrame", "p:grpSp", "p:cxnSp"].includes(
      n.nodeName,
    ),
  );
  const media = slide.media || [];
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
    if (n.type === "text") {
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
