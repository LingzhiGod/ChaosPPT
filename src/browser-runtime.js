(() => {
  const pending = new Set(),
    failures = [],
    captures = [];
  let closed = false;
  const api = {
    version: 1,
    waitUntil(promise) {
      if (closed)
        throw new Error(
          "Register async tasks during page initialization, before prepare completes",
        );
      const p = Promise.resolve(promise);
      pending.add(p);
      p.catch((e) => failures.push(String(e?.message || e))).finally(() =>
        pending.delete(p),
      );
      return p;
    },
    onCapture(callback) {
      if (typeof callback !== "function")
        throw new TypeError("Capture callback must be a function");
      captures.push(callback);
    },
    async prepare() {
      document.documentElement.setAttribute("data-chaosppt-capture", "");
      for (const a of document.getAnimations()) a.pause();
      for (const m of document.querySelectorAll("video,audio")) m.pause();
      await document.fonts.ready;
      for (const f of window.__CHAOSPPT_CONFIG__.fonts) {
        try {
          const faces = await document.fonts.load(
            `${f.style} ${f.weight.split(/\s+/)[0]} 24px ${JSON.stringify(f.family)}`,
            f.sample,
          );
          if (!faces.length || faces.some((x) => x.status !== "loaded"))
            throw new Error("Font face did not load");
        } catch (e) {
          failures.push(`FONT_LOAD_FAILED: ${f.family}: ${e.message}`);
        }
      }
      while (pending.size) await Promise.allSettled([...pending]);
      for (const callback of captures) await callback();
      for (const a of document.getAnimations()) a.pause();
      while (pending.size) await Promise.allSettled([...pending]);
      await Promise.all(
        [...document.images].map(async (img) => {
          try {
            await img.decode();
          } catch {
            failures.push(`IMAGE_DECODE_FAILED: ${img.getAttribute("src")}`);
          }
        }),
      );
      await document.fonts.ready;
      // Layout stability is a heuristic, not a substitute for waitUntil for Canvas/data tasks.
      let last = "",
        stable = 0;
      for (let i = 0; i < 25 && stable < 3; i++) {
        await new Promise((r) => setTimeout(r, 80));
        const current = JSON.stringify(
          [...document.querySelectorAll("body *")].map((e) => {
            const r = e.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height, e.scrollWidth, e.scrollHeight];
          }),
        );
        stable = current === last ? stable + 1 : 0;
        last = current;
      }
      if (stable < 3) failures.push("LAYOUT_UNSTABLE: layout kept changing");
      closed = true;
      return { failures };
    },
  };
  window.ChaosPPT = api;
})();
