export function resolveSceneMotion(scene, plan) {
  const byId = new Map(
    [...(scene.nodes || []), ...(scene.groups || [])]
      .filter((n) => n.controlId)
      .map((n) => [n.controlId, n]),
  );
  const events = plan.events.map((e) => {
    const n = byId.get(e.controlId);
    if (!n)
      throw new Error(
        `Motion target is not one native control: ${e.controlId}`,
      );
    if (
      e.effect.startsWith("reveal") &&
      ["x", "y", "width", "height"].some(
        (k) => Math.abs(n.bounds[k] - e.authoredBounds[k]) > 0.5,
      )
    )
      throw new Error(
        `Reveal bounds differ from authored control: ${e.controlId}`,
      );
    return { ...e, objectName: n.objectName };
  });
  const shared = plan.shared.map((s) => {
    const n = byId.get(s.controlId);
    if (!n) throw new Error(`Shared target is not native: ${s.controlId}`);
    n.nativeName = "!!chaosppt-shared-" + s.key;
    return {
      ...s,
      objectName: n.objectName,
      nativeName: n.nativeName,
      geometry: n.geometry || null,
    };
  });
  const all = new Map(
    [...scene.nodes, ...(scene.groups || [])].map((n) => [n.objectName, n]),
  );
  function nameMembers(group, key) {
    for (const name of group.children || []) {
      const n = all.get(name);
      if (!n) continue;
      n.nativeName =
        "!!chaosppt-member-" + key.length + "-" + key + "-" + n.controlId;
      nameMembers(n, key);
    }
  }
  for (const s of shared) {
    const n = byId.get(s.controlId);
    if (n.children) nameMembers(n, s.key);
  }
  const nativeNames = [];
  if (shared.length) {
    for (const n of [...scene.nodes, ...(scene.groups || [])]) {
      n.nativeName ??= "!!chaosppt-slide-" + scene.slideId + "-" + n.controlId;
      nativeNames.push({ objectName: n.objectName, nativeName: n.nativeName });
    }
    for (const e of events) e.nativeName = byId.get(e.controlId).nativeName;
  }
  return { ...plan, events, shared, nativeNames };
}
export function validateMotionDeck(plans) {
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i];
    if (p.transition.effect !== "morph") continue;
    if (!i)
      throw new Error("The first slide cannot Morph from a previous slide");
    const prev = new Map(plans[i - 1].shared.map((s) => [s.key, s]));
    const matches = p.shared.filter((s) => prev.has(s.key));
    if (!matches.length)
      throw new Error(`Morph slide ${i + 1} has no matching shared elements`);
    for (const s of matches) {
      const a = prev.get(s.key);
      if (
        a.kind !== s.kind ||
        a.geometry !== s.geometry ||
        JSON.stringify(a.structure) !== JSON.stringify(s.structure)
      )
        throw new Error(`Shared target changes control/shape type: ${s.key}`);
    }
  }
}
