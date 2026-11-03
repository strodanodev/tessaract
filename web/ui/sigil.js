// Illustrations for cards with no painting (spells, relics, tokens): a small SVG scene drawn from the card itself.
// God rays and a rune circle in the element's colour, the element's motif (flames, waves, shards, a gear, forge
// sparks), the card type's emblem in the middle, and drifting embers. The layout is seeded by the card's name, so
// every card looks different and always the same. Only numbers and fixed markup go into the SVG.

// the centre sits above the middle: the card name plate covers the bottom of the art box
const W = 140, H = 100, CX = 70, CY = 44;
// gradient ids must be unique per page: a gradient takes currentColor from where it is defined, not where it is used
let uid = 0;

/** A small deterministic generator (mulberry32) seeded by an FNV-1a hash of the text. */
function rng(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;

function rays(r, id) {
  const n = 14 + Math.floor(r() * 10);
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2, w = 0.035 + r() * 0.05, len = 46 + r() * 34;
    const x1 = CX + Math.cos(a - w) * len, y1 = CY + Math.sin(a - w) * len, x2 = CX + Math.cos(a + w) * len, y2 = CY + Math.sin(a + w) * len;
    out += `<path d="M${CX} ${CY}L${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}Z" opacity="${f(0.08 + r() * 0.16)}"/>`;
  }
  return `<g fill="url(#sg-ray${id})">${out}</g>`;
}

function runeRing(r) {
  let ticks = "";
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, long = i % 3 === 0, r0 = 31, r1 = long ? 36 : 33.5;
    ticks += `M${f(CX + Math.cos(a) * r0)} ${f(CY + Math.sin(a) * r0)}L${f(CX + Math.cos(a) * r1)} ${f(CY + Math.sin(a) * r1)}`;
  }
  const spin = Math.round(r() * 360);
  return `<g fill="none" stroke="currentColor" opacity=".55" transform="rotate(${spin} ${CX} ${CY})">
    <circle cx="${CX}" cy="${CY}" r="38" stroke-width=".6" opacity=".6"/>
    <circle cx="${CX}" cy="${CY}" r="30" stroke-width=".9"/>
    <circle cx="${CX}" cy="${CY}" r="25" stroke-width=".5" stroke-dasharray="1.5 3"/>
    <path d="${ticks}" stroke-width=".8"/></g>`;
}

const MOTIFS = {
  lava(r, id) {
    let out = "";
    for (let i = 0; i < 7; i++) {
      const x = 8 + i * 21 + r() * 8, top = 48 + r() * 26, w = 9 + r() * 8, sway = (r() - 0.5) * 14;
      out += `<path d="M${f(x - w)} ${H}C${f(x - w)} ${f(top + 18)} ${f(x + sway - 3)} ${f(top + 10)} ${f(x + sway)} ${f(top)}C${f(x + sway + 4)} ${f(top + 12)} ${f(x + w)} ${f(top + 16)} ${f(x + w)} ${H}Z" opacity="${f(0.35 + r() * 0.35)}"/>`;
    }
    return `<g fill="url(#sg-up${id})">${out}</g>`;
  },
  water(r) {
    let out = "";
    for (let i = 0; i < 4; i++) {
      const y = 70 + i * 8, amp = 3 + r() * 3, ph = r() * 40;
      let d = `M0 ${H}L0 ${f(y)}`;
      for (let x = 0; x <= W; x += 10) d += `L${x} ${f(y + Math.sin((x + ph) / 11) * amp)}`;
      out += `<path d="${d}L${W} ${H}Z" opacity="${f(0.16 + i * 0.1)}"/>`;
    }
    return `<g fill="currentColor">${out}</g>`;
  },
  earth(r) {
    let out = "";
    for (let i = 0; i < 9; i++) {
      const x = 4 + i * 16 + r() * 6, h = 14 + r() * 30, w = 5 + r() * 7, lean = (r() - 0.5) * 8;
      out += `<path d="M${f(x - w)} ${H}L${f(x + lean)} ${f(H - h)}L${f(x + w)} ${H}Z" opacity="${f(0.3 + r() * 0.4)}"/>`;
      out += `<path d="M${f(x + lean)} ${f(H - h)}L${f(x + w)} ${H}L${f(x + lean * 0.3)} ${H}Z" fill="#fff" opacity=".12"/>`;
    }
    return `<g fill="currentColor">${out}</g>`;
  },
  metal(r) {
    const teeth = 12 + Math.floor(r() * 4), R = 44, rIn = 39;
    let d = "";
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2, a1 = a0 + (Math.PI / teeth) * 0.9;
      const p = (a, rad) => `${f(CX + Math.cos(a) * rad)} ${f(CY + Math.sin(a) * rad)}`;
      d += `${i ? "L" : "M"}${p(a0, rIn)}L${p(a0 + 0.04, R)}L${p(a1 - 0.04, R)}L${p(a1, rIn)}`;
    }
    return `<g fill="none" stroke="currentColor"><path d="${d}Z" stroke-width="1.6" opacity=".45"/><circle cx="${CX}" cy="${CY}" r="34" stroke-width="3" opacity=".25"/></g>`;
  },
  neutral(r) {
    let out = "";
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.6, d0 = 16 + r() * 10, d1 = d0 + 6 + r() * 16, y0 = 76;
      out += `<path d="M${f(CX + Math.cos(a) * d0)} ${f(y0 + Math.sin(a) * d0)}L${f(CX + Math.cos(a) * d1)} ${f(y0 + Math.sin(a) * d1)}" opacity="${f(0.3 + r() * 0.6)}"/>`;
    }
    // an anvil under the shower of sparks
    return `<g stroke="#ffd58a" stroke-width=".9" stroke-linecap="round">${out}</g>
      <path d="M44 76h52l-8 5h-6v5h10v4H48v-4h10v-5h-8z" fill="currentColor" opacity=".6"/>`;
  },
};

const EMBLEMS = {
  // a sharp eight-pointed star
  spell: (id) => {
    let d = "";
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, rad = i % 2 ? 7.5 : i % 4 ? 15 : 23; d += `${i ? "L" : "M"}${f(CX + Math.cos(a) * rad)} ${f(CY + Math.sin(a) * rad)}`; }
    return `<circle cx="${CX}" cy="${CY}" r="12" fill="currentColor" opacity=".45"/><path d="${d}Z" fill="url(#sg-core${id})"/><circle cx="${CX}" cy="${CY}" r="4" fill="#fff"/>`;
  },
  // a faceted gem
  relic: (id) => `<path d="M56 32h28l10 11-24 26-24-26z" fill="url(#sg-core${id})"/>
    <path d="M56 32l5 11h18l5-11M46 43h48M61 43l9 26 9-26" fill="none" stroke="#fff" stroke-width=".8" opacity=".75"/>`,
  // single-target damage: a lightning bolt
  bolt: (id) => `<path d="M76 20L60 47H70L63 70L82 40H72L80 20Z" fill="url(#sg-core${id})"/><path d="M76 20L60 47H70" fill="none" stroke="#fff" stroke-width=".9" opacity=".7"/>`,
  // damage to every unit: a broken shockwave round a hot core
  quake: (id) => {
    let cracks = "";
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; cracks += `M${f(CX + Math.cos(a) * 9)} ${f(CY + Math.sin(a) * 9)}L${f(CX + Math.cos(a) * 13)} ${f(CY + Math.sin(a) * 13)}`; }
    return `<circle cx="${CX}" cy="${CY}" r="8" fill="url(#sg-core${id})"/><circle cx="${CX}" cy="${CY}" r="15.5" fill="none" stroke="url(#sg-core${id})" stroke-width="3" stroke-dasharray="7 4"/>`
      + `<circle cx="${CX}" cy="${CY}" r="23" fill="none" stroke="url(#sg-core${id})" stroke-width="2" stroke-dasharray="3 6" opacity=".8"/><path d="${cracks}" stroke="#fff" stroke-width="1.2" opacity=".75"/>`;
  },
  // a buff: three rising chevrons
  buff: (id) => [22, 34, 46].map((y, i) => `<path d="M54 ${y + 14}L70 ${y}L86 ${y + 14}L86 ${y + 21}L70 ${y + 7}L54 ${y + 21}Z" fill="url(#sg-core${id})" opacity="${[0.55, 0.8, 1][i]}"/>`).join(""),
  // energy: a faceted crystal
  energy: (id) => `<path d="M70 18L83 33L79 60L70 70L61 60L57 33Z" fill="url(#sg-core${id})"/><path d="M70 18V70M57 33H83M61 60H79" fill="none" stroke="#fff" stroke-width=".8" opacity=".6"/>`,
  // a shield: a heater shield with a boss
  shield: (id) => `<path d="M70 19C77 23 85 24 89 24V42C89 56 81 64 70 70C59 64 51 56 51 42V24C55 24 63 23 70 19Z" fill="url(#sg-core${id})"/>`
    + `<path d="M70 24V66M55 42H85" stroke="#120d18" stroke-width="1.4" opacity=".45"/><circle cx="70" cy="42" r="5" fill="#fff" opacity=".85"/>`,
  // drawing cards: a fan of three
  draw: (id) => [-18, 0, 18].map((a) => `<rect x="61" y="24" width="18" height="27" rx="2.5" transform="rotate(${a} 70 66)" fill="url(#sg-core${id})" stroke="#120d18" stroke-width="1" stroke-opacity=".6"/>`).join(""),
  // a helm for tokens (and summons)
  unit: (id) => `<path d="M70 22c-12 0-19 9-19 20v12l6 8h26l6-8V42c0-11-7-20-19-20z" fill="url(#sg-core${id})"/>
    <path d="M55 41h30v5H55z" fill="#120d18"/><path d="M70 22v15" stroke="#fff" stroke-width="1.4" opacity=".7"/>
    <path d="M63 51v7M70 51v8M77 51v7" stroke="#120d18" stroke-width="1.8" stroke-linecap="round"/>`,
};

function embers(r) {
  let out = "";
  for (let i = 0; i < 22; i++) out += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(0.3 + r() * 1.1)}" opacity="${f(0.25 + r() * 0.6)}"/>`;
  return `<g fill="#fff">${out}</g>`;
}

/** The illustration for a card without a painting, as an <svg> element (class "sigil"). */
export function sigil(def) {
  const r = rng(`${def.name}|${def.element}|${def.type}`);
  const motif = MOTIFS[def.element] ?? MOTIFS.neutral;
  // the emblem says what the card does; a relic carries its emblem in a hexagonal socket
  const op = def.effect?.op, target = String(def.effect?.target ?? "");
  const key = def.type === "unit" || op === "summon" ? "unit" : op === "damage" ? (target.startsWith("all") ? "quake" : "bolt")
    : ["buff", "energy", "shield", "draw"].includes(op) ? op : def.type === "relic" ? "relic" : "spell";
  const emblem = EMBLEMS[key];
  const socket = def.type === "relic" ? `<path d="${Array.from({ length: 6 }, (_, i) => `${i ? "L" : "M"}${f(CX + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * 30)} ${f(CY + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * 30)}`).join("")}Z" fill="rgba(10,8,14,.35)" stroke="#fff" stroke-opacity=".4" stroke-width="1.2"/>` : "";
  const id = ++uid;
  const svg = `<svg class="sigil" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="sg-ray${id}" cx="${CX}" cy="${CY}" r="80" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient>
      <linearGradient id="sg-up${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="currentColor"/><stop offset=".7" stop-color="currentColor" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient>
      <radialGradient id="sg-core${id}" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".55"/></radialGradient>
    </defs>
    ${rays(r, id)}${motif(r, id)}${runeRing(r)}${embers(r)}${socket}<g class="sg-emblem">${emblem(id)}</g></svg>`;
  const holder = document.createElement("span");
  holder.innerHTML = svg;
  return holder.firstElementChild;
}
