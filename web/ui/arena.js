// The arena: the level that sits behind every screen (styles/arena.css). Two realms, from Rapture Chess:
// Valhalla (stone, gold and aurora) and the Underworld (basalt and a lava moat). The silhouettes are drawn here once;
// switching realm only flips a data attribute, so the CSS cross-fades the layers.
import { embers, h } from "./dom.js";

export const REALMS = {
  valhalla: { name: "Valhalla", blurb: "The hall of stone and gold under the aurora", embers: ["#ffd27a", "#9fd0ff", "#ffe2a0"] },
  underworld: { name: "Underworld", blurb: "The basalt crater and its lava moat", embers: ["#ff6a2a", "#ffb547", "#ff2e10"] },
};

/** A champion's home realm: its faction if the collection names one, else its element (fire and metal go below). */
export function realmFor(champion) {
  if (!champion) return "valhalla";
  if (/horde/i.test(champion.faction ?? "")) return "underworld";
  if (/alliance/i.test(champion.faction ?? "")) return "valhalla";
  return /lava|fire|metal/i.test(champion.element ?? "") ? "underworld" : "valhalla";
}

const svg = (cls, viewBox, body, aspect = "xMidYMax slice") =>
  `<svg class="${cls}" viewBox="${viewBox}" preserveAspectRatio="${aspect}" aria-hidden="true">${body}</svg>`;

// Valhalla's far skyline: mountains, then a colonnade and a pediment, rim-lit in aurora blue.
const VH_FAR = svg("vh", "0 0 1200 300", `
  <defs><linearGradient id="vhm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2a4c"/><stop offset="1" stop-color="#0a1020"/></linearGradient>
  <linearGradient id="vhc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26324e"/><stop offset="1" stop-color="#0c1120"/></linearGradient></defs>
  <path d="M0 210 120 120 210 170 320 80 430 160 520 110 610 150 700 70 820 150 920 100 1030 160 1120 110 1200 140V300H0z" fill="url(#vhm)"/>
  <path d="M0 210 120 120 210 170 320 80 430 160 520 110 610 150 700 70 820 150 920 100 1030 160 1120 110 1200 140" fill="none" stroke="#9fd0ff" stroke-opacity=".35" stroke-width="1.5"/>
  <g fill="url(#vhc)">
    <path d="M440 150h320l-30-34H470z"/><rect x="455" y="150" width="290" height="10"/>
    ${[470, 512, 554, 596, 638, 680, 722].map((x) => `<rect x="${x}" y="160" width="14" height="96"/>`).join("")}
    <rect x="445" y="256" width="310" height="12"/><path d="M0 268h1200v32H0z"/>
  </g>
  <path d="M470 116h260" stroke="#ffd27a" stroke-opacity=".5"/>`);

// The Underworld's far skyline: the crater rim, spires, and cracks that glow.
const UW_FAR = svg("uw", "0 0 1200 300", `
  <defs><linearGradient id="uwr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c0806"/><stop offset="1" stop-color="#070203"/></linearGradient></defs>
  <path d="M0 230 80 150 130 190 190 90 230 170 300 130 360 60 400 150 470 120 540 180 600 100 660 170 720 40 770 150 850 120 910 190 980 80 1030 160 1100 120 1200 190V300H0z" fill="url(#uwr)"/>
  <path d="M190 90 230 170M360 60 400 150M720 40 770 150M980 80 1030 160" stroke="#ff6a2a" stroke-opacity=".55" stroke-width="2"/>
  <path d="M0 230 80 150 130 190 190 90 230 170 300 130 360 60 400 150 470 120 540 180 600 100 660 170 720 40 770 150 850 120 910 190 980 80 1030 160 1100 120 1200 190" fill="none" stroke="#ff5a2a" stroke-opacity=".4" stroke-width="1.5"/>
  <path d="M0 262h1200v38H0z" fill="#050102"/>`);

// Near pillars: a fluted column with a gilded band (Valhalla); a basalt obelisk with a glowing rune seam (Underworld).
const VH_NEAR = (side) => svg(`vh ${side}`, "0 0 220 900", `
  <defs><linearGradient id="vhp${side}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05070e"/><stop offset=".55" stop-color="#1a2032"/><stop offset=".8" stop-color="#2e3850"/><stop offset="1" stop-color="#0b0e18"/></linearGradient></defs>
  <path d="M30 0h150v40H30z" fill="#141a2a"/><path d="M20 40h170v22H20z" fill="#1d2438"/>
  <path d="M45 62h120v760H45z" fill="url(#vhp${side})"/>
  ${[70, 95, 120, 145].map((x) => `<path d="M${x} 70v744" stroke="#000" stroke-opacity=".35" stroke-width="3"/>`).join("")}
  <path d="M45 300h120v14H45z" fill="#c98a28"/><path d="M45 300h120" stroke="#ffe2a0" stroke-opacity=".8"/>
  <path d="M163 62v760" stroke="#9fd0ff" stroke-opacity=".45" stroke-width="2"/>
  <path d="M25 822h160v30H25zM10 852h190v48H10z" fill="#141a2a"/>`, "xMinYMax meet");
const UW_NEAR = (side) => svg(`uw ${side}`, "0 0 220 900", `
  <defs><linearGradient id="uwp${side}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#030102"/><stop offset=".6" stop-color="#1e0d0c"/><stop offset=".85" stop-color="#3a1610"/><stop offset="1" stop-color="#0a0303"/></linearGradient></defs>
  <path d="M60 900 80 120 110 30 140 110 170 900z" fill="url(#uwp${side})"/>
  <path d="M110 150 100 260 118 330 104 450 120 560 108 700" fill="none" stroke="#ff6a2a" stroke-width="3" stroke-linecap="round"/>
  <path d="M110 150 100 260 118 330 104 450 120 560 108 700" fill="none" stroke="#ffd27a" stroke-width="1" stroke-opacity=".8"/>
  <path d="M140 110 170 900" stroke="#ff5a2a" stroke-opacity=".4" stroke-width="2"/>
  <path d="M20 860 60 820h110l30 40v40H20z" fill="#0c0405"/>`, "xMinYMax meet");

/** Build the level into `root` (the #arena element). Returns { setRealm, setMood, quake, realm }. */
export function createArena(root) {
  const layer = (cls, html) => { const e = h("div", { class: cls }); if (html) e.innerHTML = html; return e; };
  const brazier = (n) => h("div", { class: `ar-brazier b${n}` }, h("i", { class: "halo" }), h("i", { class: "bowl" }), h("i", { class: "flame" }));
  const floor = h("div", { class: "ar-floor" }, h("div", { class: "ar-dais" }, h("i", { class: "moat" }), h("i", { class: "ring" }), h("i", { class: "top" }), h("i", { class: "sigil" })));
  let sparks = embers(22, REALMS.valhalla.embers);
  root.replaceChildren(
    layer("ar-sky"), layer("ar-stars"), h("div", { class: "ar-aurora" }, h("i"), h("i")), layer("ar-glow"),
    layer("ar-far", VH_FAR + UW_FAR),
    h("div", { class: "ar-stage" }, floor),
    layer("ar-fog"),
    brazier(3), brazier(4),
    layer("ar-near", VH_NEAR("l") + VH_NEAR("r") + UW_NEAR("l") + UW_NEAR("r")),
    brazier(1), brazier(2),
    sparks,
    layer("ar-shade"), layer("ar-vignette"));
  let three = null;   // the 3D arena once it runs (see upgrade)
  const api = {
    realm: "valhalla",
    mood: "menu",
    setRealm(id) {
      if (!REALMS[id] || id === api.realm) return;
      api.realm = id;
      root.dataset.realm = id;
      const next = embers(22, REALMS[id].embers);
      sparks.replaceWith(next);
      sparks = next;
      void three?.setRealm(id);
    },
    /** "menu" shows the level in full; "battle" dims it behind the board. */
    setMood(mood) { api.mood = mood; root.dataset.mood = mood; three?.setMood(mood); },
    quake() { root.classList.remove("quake"); void root.offsetWidth; root.classList.add("quake"); three?.quake(); },
    /** The battle board's box on screen (a DOMRect, or null): the 3D table is fitted under it. */
    setBoard(rect) { three?.setBoard(rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null); },
    /** Frame rate, resolution and draw calls of the 3D arena, or null while the CSS arena is showing. */
    stats: () => three?.stats() ?? null,
    upgrade: () => upgrade(),
  };

  /**
   * Swap the CSS level for Rapture Chess's real one: the Blender-built arenas rendered live with three.js in a Web
   * Worker on an OffscreenCanvas (web/arena3d.js, built from src/arena3d), so none of its work lands on the main
   * thread. Only after the title screen is up, and only where it can run well: OffscreenCanvas WebGL, a hardware
   * GPU (the worker checks), no data saver, and the arena models present (a scaffolded game ships none; drop GLBs
   * into assets/arena/ to add your own). Anything that fails, or a device that can't hold the frame rate, keeps the
   * CSS arena, and #arena[data-fallback] says why.
   */
  async function upgrade() {
    if (three || root.classList.contains("three-failed")) return false;
    const base = new URL("./assets/arena/", location.href).href;
    let canvas = null, worker = null;
    try {
      if (navigator.connection?.saveData) throw new Error("data saver is on");
      if (!("transferControlToOffscreen" in HTMLCanvasElement.prototype) || typeof Worker !== "function") throw new Error("no OffscreenCanvas");
      // Safari's three.js texture path needs the DOM, which a worker doesn't have
      if (/^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)) throw new Error("Safari: OffscreenCanvas textures unsupported");
      // assets/arena/arena.json may name each realm's file (a rebuilt arena ships under a new name past the cache)
      const files = await fetch(`${base}arena.json`).then((r) => (r.ok ? r.json() : null)).then((m) => m?.realms ?? {}, () => ({}));
      const head = await fetch(`${base}${files[api.realm] ?? `${api.realm}.glb`}`, { method: "HEAD" });
      if (!head.ok) throw new Error(`no arena model (${head.status})`);
      canvas = h("canvas", { class: "ar-3d", aria: { hidden: "true" } });
      root.prepend(canvas);
      const offscreen = canvas.transferControlToOffscreen();
      worker = new Worker("./arena3d.js");
      let lastStats = null;
      const size = () => worker.postMessage({ type: "size", width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 });
      const visible = () => worker.postMessage({ type: "visible", visible: !document.hidden });
      const stop = () => { worker?.terminate(); canvas?.remove(); removeEventListener("resize", size); document.removeEventListener("visibilitychange", visible); };
      const ready = new Promise((resolve, reject) => {
        worker.onerror = (e) => reject(new Error(`worker error: ${e.message || "failed to start"}`));
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.type === "ready") resolve(m);
          else if (m.type === "failed") reject(new Error(m.reason));
          else if (m.type === "stats") lastStats = m.stats;
          else if (m.type === "tooSlow") {
            console.info("[arena] the 3D arena can't keep up here: using the CSS arena");
            stop(); three = null; root.classList.remove("three"); root.classList.add("three-failed"); root.dataset.fallback = "too slow on this device";
          }
        };
        setTimeout(() => reject(new Error("timed out")), 30000);
      });
      worker.postMessage({ type: "init", canvas: offscreen, width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1, coarse: matchMedia("(pointer: coarse)").matches, still: matchMedia("(prefers-reduced-motion: reduce)").matches, base, realm: api.realm, mood: api.mood }, [offscreen]);
      const info = await ready;
      addEventListener("resize", size);
      document.addEventListener("visibilitychange", visible);
      three = {
        setRealm: (id) => worker.postMessage({ type: "realm", id }),
        setMood: (mood) => worker.postMessage({ type: "mood", mood }),
        quake: () => worker.postMessage({ type: "quake" }),
        setBoard: (rect) => worker.postMessage({ type: "board", rect }),
        stats: () => (lastStats ? { ...lastStats, gpu: info.gpu, setupMs: info.ms } : { gpu: info.gpu, setupMs: info.ms }),
        dispose: stop,
      };
      // the realm or mood may have changed while it loaded
      three.setRealm(api.realm); three.setMood(api.mood);
      root.classList.add("three");
      return true;
    } catch (e) {
      worker?.terminate(); canvas?.remove();
      console.info(`[arena] CSS arena: ${e.message}`);
      root.dataset.fallback = e.message;   // why, for DevTools and scripts/profile-web.mjs
      root.classList.add("three-failed");
      return false;
    }
  }
  root.dataset.realm = "valhalla";
  root.dataset.mood = "menu";
  return api;
}
