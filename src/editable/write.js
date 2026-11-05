import path from "node:path";
export function writeEditableScene(slide, scene, temp) {
  for (const n of scene.nodes) {
    const b = n.bounds,
      position = {
        x: b.x / 96,
        y: b.y / 96,
        w: b.width / 96,
        h: b.height / 96,
        objectName: n.objectName,
      };
    if (n.type === "text") {
      const s = n.style;
      slide.addText(n.text, {
        ...position,
        margin: 0,
        wrap: false,
        fit: "none",
        valign: "mid",
        fontFace: s.fontFace,
        fontSize: s.fontSize * 0.75,
        bold: s.bold,
        italic: s.italic,
        color: s.color.color,
        transparency: Math.round((1 - s.color.alpha) * 100),
        charSpacing: s.charSpacing * 0.75,
        underline: s.underline,
        strike: s.strike,
        paraSpaceAfter: 0,
        paraSpaceBefore: 0,
        breakLine: false,
      });
    } else if (n.type === "shape") {
      slide.addShape(n.geometry, {
        ...position,
        rectRadius: n.radius / 96,
        fill: n.fill
          ? {
              color: n.fill.color,
              transparency: Math.round((1 - n.fill.alpha) * 100),
            }
          : { color: "FFFFFF", transparency: 100 },
        line: n.line
          ? {
              color: n.line.color,
              transparency: Math.round((1 - n.line.alpha) * 100),
              width: n.line.width * 0.75,
            }
          : { color: "FFFFFF", transparency: 100, width: 0 },
      });
    } else if (["image", "fallback"].includes(n.type))
      slide.addImage({
        ...position,
        path: path.join(temp, n.asset.file),
        altText: n.sourceId || n.reason || n.type,
      });
    else throw new Error(`Unknown editable scene node: ${n.type}`);
  }
}
