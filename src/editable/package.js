import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
// PptxGenJS media IDs derive from relationship IDs and can collide with earlier text/shape IDs.
// Keep media IDs (and their playback references) intact, and relocate ordinary object IDs.
export async function finalizeEditablePackage(file) {
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
    zip[name] = strToU8(new XMLSerializer().serializeToString(doc));
  }
  await writeFile(file, zipSync(zip, { level: 6 }));
}
