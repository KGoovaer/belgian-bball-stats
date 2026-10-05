const NS = "http://www.w3.org/2000/svg";
const tip = () => document.getElementById("tip");

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
}

/** Round tick step (1, 2, 5 x 10^n) giving about four gridlines for a value range. */
export function niceStep(max) {
  const raw = Math.max(max, 1) / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * exp >= raw) return m * exp;
  return 10 * exp;
}

function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  moveTip(ev);
}
function moveTip(ev) {
  const t = tip();
  const pad = 14;
  const w = t.offsetWidth;
  const x = ev.clientX + pad + w > innerWidth ? ev.clientX - pad - w : ev.clientX + pad;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${ev.clientY + pad}px`;
}
function hideTip() { tip().hidden = true; }

/** Path for a bar with the two top corners rounded (anchored to the baseline). */
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Grouped bar chart.
 * groups: [{ label, values: number[], tip: html }]
 * series: [{ name, color }]   (CSS color / var())
 * ref:    optional { value, label }  horizontal reference line
 */
export function barChart(host, { groups, series, ref, ariaLabel, height = 230, showValues = true }) {
  host.replaceChildren();
  host.classList.add("chart");
  if (series.length > 1) {
    const lg = document.createElement("div");
    lg.className = "legend";
    for (const s of series) {
      const sp = document.createElement("span");
      sp.innerHTML = `<i style="background:${s.color}"></i>`;
      sp.append(s.name);
      lg.appendChild(sp);
    }
    host.appendChild(lg);
  }
  const W = 720, H = height, m = { l: 34, r: 8, t: 16, b: 26 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": ariaLabel });
  host.appendChild(svg);

  const all = groups.flatMap((g) => g.values);
  const top = Math.max(ref?.value ?? 0, ...all, 1);
  const step = niceStep(top);
  const ticks = Math.ceil(top / step);
  const max = step * ticks;
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const y = (v) => m.t + ih - (v / max) * ih;

  for (let i = 0; i <= ticks; i++) {
    const v = step * i;
    el("line", { class: "grid", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, svg);
    const t = el("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, svg);
    t.textContent = Number.isInteger(v) ? v : v.toFixed(1);
  }

  const n = groups.length;
  const slot = iw / n;
  const gap = 2; // surface gap between adjacent fills
  const inner = Math.min(slot * 0.72, 44 * series.length);
  const bw = (inner - gap * (series.length - 1)) / series.length;

  groups.forEach((g, i) => {
    const cx = m.l + slot * i + slot / 2;
    const col = el("g", { class: "col", tabindex: 0 }, svg);
    el("rect", { class: "hit", x: m.l + slot * i, y: m.t, width: slot, height: ih }, col);
    g.values.forEach((v, j) => {
      const x = cx - inner / 2 + j * (bw + gap);
      const h = ih - (y(v) - m.t);
      const p = el("path", { d: barPath(x, y(v), bw, h, 4), fill: series[j].color }, col);
      if (showValues && n <= 14 && series.length <= 2 && bw >= 14) {
        const t = el("text", { class: "val", x: x + bw / 2, y: y(v) - 4, "text-anchor": "middle" }, col);
        t.textContent = v;
      }
      return p;
    });
    const lab = el("text", { x: cx, y: H - 8, "text-anchor": "middle" }, svg);
    if (n <= 20 || i % 2 === 0) lab.textContent = g.label;
    const on = (ev) => showTip(g.tip, ev);
    col.addEventListener("mouseenter", on);
    col.addEventListener("mousemove", moveTip);
    col.addEventListener("mouseleave", hideTip);
    col.addEventListener("focus", () => {
      const r = col.getBoundingClientRect();
      showTip(g.tip, { clientX: r.left + r.width / 2, clientY: r.top });
    });
    col.addEventListener("blur", hideTip);
  });

  if (ref) {
    el("line", { class: "ref", x1: m.l, x2: W - m.r, y1: y(ref.value), y2: y(ref.value) }, svg);
    const t = el("text", { class: "reflabel", x: W - m.r, y: y(ref.value) - 5, "text-anchor": "end" }, svg);
    t.textContent = ref.label;
  }
}
