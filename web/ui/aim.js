// The targeting arrow: while a card, unit or hero power is picked, a glowing curved arrow runs from it to the pointer,
// snapping onto a valid target (red for a foe, green for an ally) the way shipped card games show an attack or spell
// being aimed. Mouse and pen only: on touch the player taps the target, and there is no pointer to follow.

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

/** Mount the arrow layer in `root` (the battle screen). Call update(sourceEl | null) after each render. */
export function createAim(root) {
  const fine = matchMedia("(pointer: fine)");
  const layer = svg("svg", { class: "aim", "aria-hidden": "true" });
  const glow = svg("path", { class: "aim-glow" });
  const line = svg("path", { class: "aim-line" });
  const head = svg("path", { class: "aim-head" });
  const ring = svg("circle", { class: "aim-ring", r: "26" });
  layer.append(glow, line, ring, head);
  root.append(layer);
  let source = null, px = null, py = null;

  const draw = () => {
    if (!source || !source.isConnected || !fine.matches) { layer.classList.remove("on"); return; }
    const s = source.getBoundingClientRect();
    const sx = s.left + s.width / 2, sy = s.top + s.height * 0.35;
    // over a valid target the arrow snaps to its centre; elsewhere it follows the pointer (or points up, before it moves)
    const hit = px === null ? null : document.elementFromPoint(px, py)?.closest(".target");
    let ex = px ?? sx, ey = py ?? sy - 160;
    if (hit) { const t = hit.getBoundingClientRect(); ex = t.left + t.width / 2; ey = t.top + t.height / 2; }
    layer.dataset.mode = hit ? (hit.classList.contains("ally") ? "ally" : "foe") : "free";
    // a bowed curve: the control point rises above the midpoint, more for longer shots
    const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1;
    const cx = (sx + ex) / 2 - (dy / len) * len * 0.12, cy = (sy + ey) / 2 - Math.abs(dx) * 0.12 - 40;
    const d = `M${sx.toFixed(1)},${sy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
    line.setAttribute("d", d); glow.setAttribute("d", d);
    // the head points along the curve's last tangent
    const a = Math.atan2(ey - cy, ex - cx), k = 18;
    const p = (r, t) => `${(ex + Math.cos(a + t) * r).toFixed(1)},${(ey + Math.sin(a + t) * r).toFixed(1)}`;
    head.setAttribute("d", `M${p(4, 0)} L${p(k, Math.PI * 0.84)} L${p(k * 0.45, Math.PI)} L${p(k, -Math.PI * 0.84)} Z`);
    ring.setAttribute("cx", ex.toFixed(1)); ring.setAttribute("cy", ey.toFixed(1));
    layer.classList.add("on");
  };

  let raf = 0;
  const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  root.addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; px = e.clientX; py = e.clientY; if (source) queue(); });
  addEventListener("resize", queue);
  return {
    update(el) { source = el; if (!el) px = py = null; queue(); },
  };
}
