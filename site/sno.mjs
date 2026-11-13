// Snø i julehodet. Står stille når enheten ber om mindre bevegelse, og stopper når hodet er ute av syne.
export function sno() {
  const c = document.getElementById("sno");
  const ctx = c?.getContext("2d");
  if (!ctx) return;
  let w = 0, h = 0, fnugg = [], synlig = true, kjorer = false;
  const lag = () => {
    const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    w = r.width; h = r.height;
    c.width = Math.round(w * d); c.height = Math.round(h * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    fnugg = Array.from({ length: Math.round(w / 12) }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: 0.7 + Math.random() * 1.9, v: 0.15 + Math.random() * 0.45, s: Math.random() * 6.28,
    }));
  };
  const tegnFnugg = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    for (const f of fnugg) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill(); }
  };
  const steg = () => {
    if (!synlig) { kjorer = false; return; }
    for (const f of fnugg) {
      f.y += f.v; f.s += 0.012; f.x += Math.sin(f.s) * 0.25;
      if (f.y > h + 3) { f.y = -3; f.x = Math.random() * w; }
    }
    tegnFnugg();
    requestAnimationFrame(steg);
  };
  lag();
  tegnFnugg();
  addEventListener("resize", () => { lag(); tegnFnugg(); });
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  new IntersectionObserver(([e]) => {
    synlig = e.isIntersecting;
    if (synlig && !kjorer) { kjorer = true; requestAnimationFrame(steg); }
  }).observe(c);
}
