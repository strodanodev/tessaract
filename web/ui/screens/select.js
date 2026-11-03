// Champion select: the collection as framed cards, the chosen champion's numbers and hero power, the battlefield, and
// (practice) the bot's strength. The arena behind previews the champion's realm.
import { h, icon, stagger } from "../dom.js";
import { pageHead } from "../router.js";
import { REALMS, realmFor } from "../arena.js";
import { walletChip } from "../widgets.js";

const LEVELS = [[1, "Easy"], [2, "Normal"], [3, "Hard"]];
const MODE_COPY = {
  practice: ["Choose your champion", "Practice · against the house bot", "Enter the arena"],
  gauntlet: ["Choose your champion", "Gauntlet · a new run", "Begin the run"],
  relay: ["Choose your champion", "Two-player match", "Take your seat"],
};

export function selectScreen(app) {
  let mode = "practice", filter = "all", chosen = null;
  const grid = h("div", { class: "champ-grid" });
  const filters = h("div", { class: "seg filter-seg", role: "group", aria: { label: "Show" } });
  const detail = h("div", { class: "champ-detail panel frame" });
  const title = h("h1", { class: "display" });
  const kicker = h("span", { class: "kicker" });
  const confirm = h("button", { class: "btn primary lg block pulse", type: "button", on: { click: () => void app.flows.confirmChampion(chosen, { realm: app.prefs.realm, level: app.prefs.level, mode }) } });

  const stats = (c) => {
    const ch = app.rules.champion(app.statsOf(c));
    const m = app.game.champion;
    const row = (label, value, map, accent) => {
      const span = Math.max(1, map.max - map.min);
      // a stat that only counts to a few reads as pips (1 of 3), not a bar that is full at 1
      const scale = map.max <= 8
        ? h("div", { class: "pips", style: `--accent:${accent}`, aria: { label: `${value} of ${map.max}` } }, ...Array.from({ length: map.max }, (_, i) => h("i", { class: i < value ? "on" : "" })))
        : h("div", { class: "meter", style: `--accent:${accent}` }, h("i", { style: `--v:${Math.round(((value - map.min) / span) * 100)}%` }));
      return h("div", { class: "stat-row" }, h("span", { class: "sr-k", text: label }), h("b", { class: "tabnum", text: value }), scale);
    };
    return h("div", { class: "stat-rows" },
      row("Life", ch.life, m.life, "var(--danger)"),
      row("Spell power", ch.spellPower, m.spellPower, "var(--mana)"),
      row("Unit attack", ch.unitAttack, m.unitAttack, "var(--gold-2)"),
      row("Opening hand", ch.openingHand, m.openingHand, "var(--ok)"));
  };

  const seg = (options, current, onPick) => h("div", { class: "seg" }, ...options.map(([v, label]) => h("button", { type: "button", class: current === v ? "on" : "", text: label, on: { click: () => onPick(v) } })));

  function renderDetail() {
    const c = chosen;
    const realmChoice = app.prefs.realm;
    const shownRealm = realmChoice === "auto" ? realmFor(c) : realmChoice;
    app.arena.setRealm(shownRealm);
    const power = c ? app.heroPowerOf(c) : null;
    detail.replaceChildren(h("div", { class: "cd-scroll" },
      h("div", { class: "cd-card" }, c ? app.cards.championCard(c, { owned: app.owned.has(String(c.tokenId)), eager: true, tilted: true }) : h("div", { class: "ccard base" }, h("div", { class: "inner" }, icon("emblem")))),
      h("div", { class: "cd-body" },
        h("span", { class: "eyebrow", text: c ? [c.element, c.kind].filter(Boolean).join(" · ") : "No champion" }),
        h("h2", { class: "display cd-name", text: c ? c.name : "The base champion" }),
        c?.epithet ? h("p", { class: "epithet", text: c.epithet }) : h("p", { class: "hint", text: "Every stat at zero: the floor of each range." }),
        stats(c),
        power ? h("div", { class: "cd-power" }, h("span", { class: "eyebrow" }, "Hero power"), h("p", null, h("b", { text: `${power.name} · ${power.cost}` }), h("span", { text: power.text }))) : null,
        h("div", { class: "field" }, h("span", { text: `Battlefield · ${REALMS[shownRealm].name}` }),
          seg([["auto", "Auto"], ["valhalla", REALMS.valhalla.name], ["underworld", REALMS.underworld.name]], realmChoice, (v) => { app.setPref("realm", v); renderDetail(); })),
        mode !== "relay" ? h("div", { class: "field" }, h("span", { text: mode === "gauntlet" ? "Foes get stronger each stage" : "House bot" }),
          mode === "practice" ? seg(LEVELS, app.prefs.level, (v) => { app.setPref("level", v); renderDetail(); }) : null) : null)),
      h("div", { class: "cta-dock" }, confirm));
    confirm.replaceChildren(icon("swords"), MODE_COPY[mode][2]);
  }

  function renderGrid() {
    filters.replaceChildren(...[["all", "All"], ["owned", `Held (${app.owned.size})`]].map(([v, label]) => h("button", { type: "button", class: filter === v ? "on" : "", text: label, on: { click: () => { filter = v; renderGrid(); } } })));
    filters.hidden = !app.hasWallet;
    const list = app.snap.cards.filter((c) => filter === "all" || app.owned.has(String(c.tokenId)));
    grid.replaceChildren(...(list.length ? list : []).map((c) => {
      const b = app.cards.championCard(c, { tag: "button", owned: app.owned.has(String(c.tokenId)) });
      if (chosen === c) b.classList.add("chosen");
      b.addEventListener("click", () => { chosen = c; for (const x of grid.children) x.classList.toggle("chosen", x === b); renderDetail(); });
      return b;
    }));
    if (!list.length) grid.append(h("p", { class: "lede empty", text: app.snap.cards.length ? `No ${app.snap.collection.name} cards in this wallet yet. Pick any champion under All.` : "This game has no NFT collection yet, so both sides fight with the base champion." }));
    stagger(grid);
  }

  const el = h("section", { class: "page select" },
    h("div", { class: "page-scrim" }),
    pageHead("", "", walletChip(app)),
    h("div", { class: "select-wrap" },
      h("div", { class: "select-list" }, filters, grid),
      detail));
  el.querySelector(".page-title").replaceChildren(kicker, title);
  app.onWallet(() => { if (!el.hidden) renderGrid(); });

  return {
    id: "select", el,
    /** Open for a mode: "practice", "gauntlet" or "relay". */
    setMode(m) { mode = m; },
    enter() {
      app.arena.setMood("menu");
      [title.textContent, kicker.textContent] = MODE_COPY[mode];
      if (chosen && !app.snap.cards.includes(chosen)) chosen = null;
      chosen ??= app.snap.cards.find((c) => app.owned.has(String(c.tokenId))) ?? app.snap.cards[0] ?? null;
      renderGrid();
      renderDetail();
    },
  };
}
