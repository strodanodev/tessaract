// The title screen over the live arena (Rapture Chess's main menu): the game's logo, the menu, a featured champion
// that cycles, and the wallet.
import { h, icon, stagger } from "../dom.js";
import { go } from "../router.js";
import { realmFor } from "../arena.js";
import { walletChip } from "../widgets.js";

export function homeScreen(app) {
  const item = (ico, title, sub, onClick) => {
    const s = h("span", { class: "s" });
    const b = h("button", { class: "menu-item", type: "button", on: { click: onClick } },
      h("span", { class: "mi-ico" }, icon(ico)), h("span", { class: "mi-text" }, h("span", { class: "t", text: title }), s), h("span", { class: "mi-arrow" }, icon("next")));
    return { b, refresh: () => { s.textContent = sub(); } };
  };
  const sum = () => app.summary();
  const items = app.relay
    ? []
    : [
      item("gauntlet", "Gauntlet", () => { const r = app.profile().gauntlet; return r.current && !r.current.over ? `Run in progress · stage ${Math.min(r.current.wins + 1, 8)} of 8` : `Eight foes, one life · best ${r.bestStage}/8`; }, () => void go("gauntlet")),
      item("puzzle", "Daily puzzle", () => (app.puzzleSolvedToday() ? "Solved today · come back tomorrow" : `Win in one turn · streak ${sum().puzzleStreak}`), () => void go("puzzle")),
      item("user", "Profile", () => { const s = sum(); return s.played ? `${s.wins}W ${s.losses}L · ${s.played} ${s.played === 1 ? "match" : "matches"}` : "Your matches and replays"; }, () => void go("profile")),
      ...(app.funnel ? [item("hammer", "Build your own", () => "Make a TCG from any NFT collection", () => void go("forge"))] : []),
    ];
  const play = h("button", { class: "btn primary lg pulse play-btn", type: "button", on: { click: () => void app.flows.choose("practice") } }, icon("play"), app.relay ? "Join the match" : "Play");
  const menu = h("nav", { class: "home-menu", aria: { label: "Main menu" } }, play, ...items.map((i) => i.b));

  // The featured champion: legendary ones first, held ones first, cycling every few seconds.
  const featureSlot = h("div", { class: "feature-card" });
  const featureCap = h("div", { class: "feature-cap" });
  const feature = h("aside", { class: "home-feature" }, h("span", { class: "eyebrow", text: "Featured champion" }), featureSlot, featureCap);
  let fi = 0, timer = null;
  const pool = () => {
    const ranked = [...app.snap.cards].sort((a, b) => ["legendary", "epic", "rare", "uncommon", "common"].indexOf(app.cards.rarityOf(a)) - ["legendary", "epic", "rare", "uncommon", "common"].indexOf(app.cards.rarityOf(b)));
    const top = ranked.slice(0, 12);
    return [...top.filter((c) => app.owned.has(String(c.tokenId))), ...top.filter((c) => !app.owned.has(String(c.tokenId)))];
  };
  // the arena takes the first champion's realm and keeps it: a world swapping every few seconds reads as a glitch
  const showFeature = (andRealm = false) => {
    const list = pool();
    if (!list.length) { feature.hidden = true; return; }
    const c = list[fi++ % list.length];
    const card = app.cards.championCard(c, { owned: app.owned.has(String(c.tokenId)), eager: true, tilted: true });
    card.classList.add("swap-in");
    featureSlot.replaceChildren(card);
    const power = app.heroPowerOf(c);
    featureCap.replaceChildren(
      c.epithet ? h("p", { class: "epithet", text: c.epithet }) : null,
      h("p", { class: "kicker", text: [c.element, c.kind].filter(Boolean).join(" · ") }),
      power ? h("p", { class: "power-line" }, icon("bolt"), h("span", { text: `${power.name}: ${power.text}` })) : null);
    if (andRealm) app.arena.setRealm(realmFor(c));
  };

  const title = app.game.title;
  const words = title.split(/\s+/);
  const logo = h("div", { class: "logo" },
    h("div", { class: "logo-emblem" }, icon("emblem"), h("div", { class: "logo-ring" })),
    h("p", { class: "kicker", text: app.funnel ? "Tessaract presents" : "A Tessaract game" }),
    h("h1", { class: "logo-word" }, h("span", { class: "gilded", text: words.length > 1 ? words.slice(0, -1).join(" ") : title }), words.length > 1 ? h("span", { class: "logo-sub", text: words[words.length - 1] }) : null),
    h("p", { class: "tagline", text: app.snap.cards.length ? `${app.snap.cards.length} champions of ${app.snap.collection.name}. Their on-chain stats shape every duel.` : app.game.description ?? "A trading card game." }));

  const el = h("section", { class: "home", aria: { label: "Main menu" } },
    h("div", { class: "home-scrim" }),
    h("header", { class: "home-top" }, h("span", { class: "badge outline live", text: app.relay ? (app.watch ? "Spectating" : "Two-player match") : `Season 0 · ${app.snap.collection.name || "Practice"}` }), walletChip(app)),
    h("div", { class: "home-main" }, logo, menu),
    feature,
    h("footer", { class: "home-foot" }, app.funnel ? h("span", { text: "Built with Tessaract · settled on LitNode" }) : h("span", null, "Made with ", h("a", { href: "https://github.com/strodanodev/tessaract", rel: "noopener", text: "Tessaract" }))));

  app.onWallet(() => { for (const i of items) i.refresh(); });
  return {
    id: "home", el, noBack: false,
    /** The champion the title screen shows first: the one image worth waiting for during boot. */
    firstFeature: () => pool()[0] ?? null,
    enter() {
      app.arena.setMood("menu");
      for (const i of items) i.refresh();
      stagger(menu, 260);
      if (!timer) { showFeature(true); timer = setInterval(() => showFeature(), 7000); }
    },
    leave() { if (timer) clearInterval(timer); timer = null; },
  };
}
