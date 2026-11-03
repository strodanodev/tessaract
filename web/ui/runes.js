// The rune circle round the battle table: a band of glowing glyphs following the table's stadium outline. Each glyph
// is a stave with a few branches, seeded by its place in the ring, so the ring is the same every match. The SVG is
// drawn to the table's measured size (glyphs never stretch) and redrawn when it resizes. Only numbers go in.

const NS = "http://www.w3.org/2000/svg";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;

/** One glyph as a path, centred on 0,0 and `h` tall: a stave and one to three branches, like an elder rune. */
function glyph(r, h) {
  const w = h * 0.55, top = -h / 2, step = h / 4;
  const sx = r() < 0.5 ? 0 : (r() < 0.5 ? -w / 2 : w / 2);
  let d = `M${f(sx)} ${f(top)}V${f(-top)}`;
  const branches = 1 + Math.floor(r() * 3);
  for (let i = 0; i < branches; i++) {
    const y0 = top + step * Math.floor(r() * 4), dir = r() < 0.5 ? -1 : 1, drop = (r() < 0.5 ? 1 : -1) * step;
    const x1 = sx + dir * w * (sx === 0 ? 0.5 : 1);
    d += `M${f(sx)} ${f(y0)}L${f(Math.max(-w / 2, Math.min(w / 2, x1)))} ${f(y0 + drop)}`;
  }
  return d;
}

/**
 * Points every `gap` px along a stadium (a rounded rectangle whose ends are half circles) inset into w × h, with the
 * tangent at each, and the outline as a path. A tall table (a phone) is an upright stadium; its runes run only round
 * the two curved ends, so the band never crosses the lanes down its sides.
 */
function stadium(w, h, inset, gap) {
  const wide = w >= h, L = wide ? w : h, S = wide ? h : w;
  const r = S / 2 - inset, a0 = S / 2, a1 = L - S / 2, c = S / 2;
  const straight = Math.max(0, a1 - a0), arc = Math.PI * r;
  // walk the outline in "long axis" coordinates (u along the length, v across), then map to x, y
  const at = (s) => {
    if (s < straight) return { u: a0 + s, v: c - r, a: 0 };
    if ((s -= straight) < arc) { const t = s / r - Math.PI / 2; return { u: a1 + Math.cos(t) * r, v: c + Math.sin(t) * r, a: t + Math.PI / 2 }; }
    if ((s -= arc) < straight) return { u: a1 - s, v: c + r, a: Math.PI };
    s -= straight; const t = s / r + Math.PI / 2; return { u: a0 + Math.cos(t) * r, v: c + Math.sin(t) * r, a: t + Math.PI / 2 };
  };
  const toXY = (p) => (wide ? { x: p.u, y: p.v, deg: (p.a * 180) / Math.PI } : { x: p.v, y: p.u, deg: 90 - (p.a * 180) / Math.PI });
  const pts = [];
  const spans = wide ? [[0, 2 * straight + 2 * arc]] : [[straight, straight + arc], [2 * straight + arc, 2 * straight + 2 * arc]];
  for (const [from, to] of spans) {
    const n = Math.max(6, Math.floor((to - from) / gap));
    for (let i = 0; i < n; i++) pts.push(toXY(at(from + ((i + 0.5) / n) * (to - from))));
  }
  const P = (u, v) => (wide ? `${f(u)} ${f(v)}` : `${f(v)} ${f(u)}`);
  const sweep = wide ? 1 : 0;
  const outline = `M${P(a0, c - r)}L${P(a1, c - r)}A${f(r)} ${f(r)} 0 0 ${sweep} ${P(a1, c + r)}L${P(a0, c + r)}A${f(r)} ${f(r)} 0 0 ${sweep} ${P(a0, c - r)}Z`;
  // an upright table carries the band only on its curved ends
  const ends = wide ? outline : `M${P(a1, c - r)}A${f(r)} ${f(r)} 0 0 ${sweep} ${P(a1, c + r)}M${P(a0, c + r)}A${f(r)} ${f(r)} 0 0 ${sweep} ${P(a0, c - r)}`;
  return { pts, outline, ends };
}

/**
 * Fill `host` (the table mat) with the rune circle, and keep it fitted to the host's size. `avoid()` returns rects in
 * the host's coordinates (the lanes) that glyphs must not cover: on a narrow table the ring would cross them, so those
 * glyphs and the dark band are left out there and only the thin rim runs past. Returns { refresh() } for when the
 * rects change.
 */
export function runeRing(host, avoid = () => []) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "tm-runes");
  svg.setAttribute("aria-hidden", "true");
  host.append(svg);
  let last = "";
  const draw = () => {
    const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
    const keep = avoid().filter(Boolean);
    const key = `${w}x${h}|${keep.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(";")}`;
    if (!w || !h || key === last) return;
    last = key;
    const size = Math.max(8, Math.min(18, Math.min(w, h) * (w >= h ? 0.045 : 0.034))), inset = size * 1.4;
    const { pts, outline, ends } = stadium(w, h, inset, size * 1.9);
    const near = (pad) => (p) => keep.some((r) => p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad);
    const over = near(size * 0.5);
    // the band is dropped only where the ring truly runs through a lane, not where it just passes close
    const crossed = pts.some(near(0));
    const rand = rng(7);
    let glyphs = "";
    for (const p of pts) { const d = glyph(rand, size); if (!over(p)) glyphs += `<path transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.deg)})" d="${d}"/>`; }
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    // the edge (wider) under the band gives the band its gilt rim; the glyphs glow on top
    svg.innerHTML = `<path class="tm-rim" d="${outline}"/>`
      + (crossed ? "" : `<path class="tm-edge" d="${ends}" stroke-width="${f(size * 2.1 + 3)}"/><path class="tm-band" d="${ends}" stroke-width="${f(size * 2.1)}"/>`)
      + `<g class="tm-glyphs" stroke-width="${f(Math.max(1.2, size * 0.12))}">${glyphs}</g>`;
  };
  new ResizeObserver(draw).observe(host);
  return { refresh: draw };
}
