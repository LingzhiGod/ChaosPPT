ChaosPPT.waitUntil(
  (async () => {
    const response = await fetch("../assets/data.json");
    if (!response.ok) throw new Error("Chart data failed to load");
    const data = await response.json();
    await document.fonts.load('400 24px "Noto Sans SC"');
    const canvas = document.getElementById("chart"),
      ctx = canvas.getContext("2d");
    // Keep a 2x backing store; coordinate system below is logical chart pixels.
    ctx.scale(2, 2);
    ctx.font = '18px "Noto Sans SC"';
    ctx.textAlign = "center";
    const width = canvas.width / 2,
      height = canvas.height / 2,
      left = 40,
      right = width - 20,
      baseline = height - 38;
    ctx.strokeStyle = "#c2cdba";
    ctx.lineWidth = 1;
    for (let y = baseline; y > 35; y -= 60) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    data.values.forEach((value, i) => {
      const x = 110 + i * 185,
        h = value * 2.4;
      ctx.fillStyle = i === 3 ? "#709743" : "#18352c";
      ctx.fillRect(x, baseline - h, 84, h);
      ctx.fillStyle = "#18352c";
      ctx.fillText(String(value), x + 42, baseline - h - 12);
      ctx.fillStyle = "#617168";
      ctx.fillText(data.labels[i], x + 42, baseline + 28);
    });
  })(),
);
