// Card renderers: the game card (hand, deck forge, rewards), the unit token on the board, and the champion card (a
// collection token: Rapture Chess's framed card with its foil). Colours: rarity frames the card, the element tints it.
import { describeCard, KEYWORDS } from "../engine/tessaract.js";
import { h, icon } from "./dom.js";
import { sigil } from "./sigil.js";

const KIND_RARITY = { God: "legendary", Titan: "epic", King: "rare", Demigod: "uncommon", Mortal: "common" };
const RARITY_NAME = { legendary: "Legendary", epic: "Epic", rare: "Rare", uncommon: "Uncommon", common: "Common" };
// Rules text: keywords and trigger labels are picked out (the text still goes in through textContent).
const TRIGGER_LABELS = ["On play", "Last words", "Each turn", "On attack"];
const RICH = new RegExp(`(${[...TRIGGER_LABELS, ...Object.keys(KEYWORDS)].join("|")})`, "gi");
function richLine(text) {
  return text.split(RICH).filter(Boolean).map((part) => {
    if (TRIGGER_LABELS.some((t) => t.toLowerCase() === part.toLowerCase())) return h("b", { class: "trig", text: part });
    if (Object.keys(KEYWORDS).includes(part.toLowerCase())) return h("b", { class: "kw", text: part });
    return part;
  });
}

const finePointer = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;

/** Pointer-follow tilt and foil: transform only, so it stays on the compositor. */
export function tilt(el, max = 10) {
  if (!finePointer) return el;
  let raf = 0;
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      el.style.transform = `perspective(700px) rotateY(${(x - 0.5) * max}deg) rotateX(${(0.5 - y) * max}deg) translateZ(0)`;
      el.style.setProperty("--fx", `${x * 100}%`);
      el.style.setProperty("--fy", `${y * 100}%`);
      el.classList.add("tilt");
    });
  });
  el.addEventListener("pointerleave", () => { cancelAnimationFrame(raf); el.style.transform = ""; el.classList.remove("tilt"); });
  return el;
}

/**
 * @param {object} app  game, artOf(def), elementColor(id), nameOf(id), byToken
 */
export function createCards(app) {
  const { game } = app;
  const tokenCard = new Map(game.cards.filter((c) => c.token).map((c) => [String(c.token.tokenId), c]));
  const describe = (def) => describeCard(def, app.nameOf);
  const keywordHelp = (def) => (def.keywords ?? []).map((k) => `${k}: ${KEYWORDS[k] ?? ""}`).join("\n");
  const elementName = (id) => game.elements.find((e) => e.id === id)?.name ?? id;
  const typeLine = (def) => [def.type === "unit" ? def.kind ?? "Unit" : def.type === "spell" ? "Spell" : "Relic", def.element && def.element !== "neutral" ? elementName(def.element) : null].filter(Boolean).join(" · ");
  const artBox = (def, cls) => {
    const art = app.artOf(def);
    return h("div", { class: cls }, art ? h("img", { src: art, alt: "", loading: "lazy", decoding: "async", draggable: false }) : sigil(def));
  };

  /** A full card. `tag` "button" makes it clickable; `small` is the relic size. */
  function cardFace(def, { tag = "div", small = false, cost = def.cost } = {}) {
    const text = describe(def);
    const el = h(tag, { class: `tcard t-${def.type}${small ? " small" : ""}`, data: { rarity: def.rarity ?? "common", el: def.element ?? "neutral" }, style: `--el:${app.elementColor(def.element)}`, title: keywordHelp(def) || undefined, ...(tag === "button" ? { type: "button" } : {}) },
      h("div", { class: "tc-frame" },
        artBox(def, "tc-art"),
        h("div", { class: def.name.length > 12 ? "tc-name long" : "tc-name", text: def.name }),
        h("div", { class: "tc-type", text: typeLine(def) }),
        h("div", { class: "tc-text" }, ...text.map((t) => h("p", null, ...richLine(t))))),
      h("span", { class: "tc-cost tabnum", text: cost }),
      def.type === "unit" ? h("span", { class: "tc-atk tabnum", text: def.attack }) : null,
      def.type === "unit" ? h("span", { class: "tc-hp tabnum", text: def.health }) : null,
      h("span", { class: "tc-gem" }),
      h("span", { class: "foil" }));
    el.setAttribute("aria-label", `${def.name}, costs ${def.cost}${def.type === "unit" ? `, ${def.attack} attack, ${def.health} health` : ""}${text.length ? `. ${text.join(". ")}` : ""}`);
    return el;
  }

  /** A unit on the board: its portrait, attack and health, and its keywords as frame states. */
  function unitToken(def, u) {
    const kws = def.keywords ?? [];
    const el = h("button", { type: "button", class: `unit${u.guard ? " guard" : ""}${u.shield ? " shielded" : ""}${u.ready ? "" : " tired"}`, data: { rarity: def.rarity ?? "common" }, style: `--el:${app.elementColor(def.element)}`, title: [def.name, ...describe(def), keywordHelp(def)].filter(Boolean).join("\n") },
      h("div", { class: "u-ring" }, artBox(def, "u-art")),
      h("span", { class: `u-atk tabnum${u.atk > (def.attack ?? 0) ? " up" : ""}`, text: u.atk }),
      h("span", { class: `u-hp tabnum${u.hp < (def.health ?? 0) ? " hurt" : u.hp > (def.health ?? 0) ? " up" : ""}`, text: u.hp }),
      h("span", { class: "u-name", text: def.name }),
      kws.length ? h("span", { class: "u-kw" }, ...kws.slice(0, 3).map((k) => h("i", { text: k }))) : null);
    el.setAttribute("aria-label", `${def.name}, ${u.atk} attack, ${u.hp} health${kws.length ? `, ${kws.join(", ")}` : ""}${u.ready ? "" : ", exhausted"}`);
    return el;
  }

  /** A collection token as a champion: Rapture Chess's framed card, rarity by Kind, element gem and foil. */
  function championCard(c, { tag = "div", owned = false, eager = false, tilted = false } = {}) {
    const def = tokenCard.get(String(c.tokenId));
    const rarity = def?.rarity ?? KIND_RARITY[c.kind] ?? "common";
    const el = h(tag, { class: "ccard", data: { rarity }, style: `--el:${app.elementColor(String(c.element ?? "").toLowerCase())}`, ...(tag === "button" ? { type: "button", title: c.name } : {}) },
      h("div", { class: "inner" },
        h("div", { class: "art" }, c.art ? h("img", { src: c.art, alt: c.name, loading: eager ? "eager" : "lazy", decoding: "async", draggable: false, on: { load: (e) => { e.currentTarget.dataset.loaded = "1"; } } }) : icon("user"),
          h("span", { class: "kind", text: c.kind ?? RARITY_NAME[rarity] }), h("span", { class: "gem", title: c.element ?? "" })),
        h("div", { class: "cplate" }, h("div", { class: "name", text: c.name }), h("div", { class: "sub", text: [c.element, c.faction].filter(Boolean).join(" · ") }))),
      h("span", { class: "foil" }),
      owned ? h("span", { class: "badge owned" }, icon("check"), "Held") : null);
    if (tilted || tag === "button") tilt(el);
    return el;
  }

  return { cardFace, unitToken, championCard, describe, RARITY_NAME, rarityOf: (c) => tokenCard.get(String(c.tokenId))?.rarity ?? KIND_RARITY[c.kind] ?? "common" };
}
