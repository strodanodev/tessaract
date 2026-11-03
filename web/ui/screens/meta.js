// The meta loop's pages: the Gauntlet (eight seeded bot matches, one life), the daily puzzle (win this turn) and the
// profile (record, champions, match history with replays). The logic lives in the engine (src/meta); these only draw.
import { h, icon, stagger } from "../dom.js";
import { pageHead } from "../router.js";
import { tile, walletChip } from "../widgets.js";
import { sigil } from "../sigil.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const when = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const STAT_LABEL = { strength: "strength (unit attack)", agility: "agility (opening hand)", resilience: "resilience (life)", intelligence: "intelligence (spell power)" };
const LEVEL = ["", "Easy", "Normal", "Hard"];

const page = (app, cls, title, kicker, body) => h("section", { class: `page ${cls}` }, h("div", { class: "page-scrim" }), pageHead(title, kicker, walletChip(app)), h("div", { class: "page-wrap" }, body));

export function gauntletScreen(app) {
  const body = h("div", { class: "meta-body" });
  const el = page(app, "gauntlet-page", "The Gauntlet", "Eight foes · one life", body);
  const g = app.gauntlet;

  function render() {
    const run = app.profile().gauntlet.current;
    const road = h("ol", { class: `road${run ? "" : " preview"}` });
    const stage = run ? Math.min(run.wins + 1, g.stages) : 0;
    // every stage's foe follows from the run's seed, so the whole ladder can be shown up front; before a run, a
    // ladder seeded by the day shows the kind of foes waiting, in shadow and unnamed (a real run draws its own)
    const seeded = run ?? { seed: `preview-${new Date().toISOString().slice(0, 10)}` };
    const foes = Array.from({ length: g.stages }, (_, k) => g.opponent({ ...seeded, wins: k }));
    for (let i = 1; i <= g.stages; i++) {
      const state = run && i <= run.wins ? "won" : run && i === stage && !run.over ? "next" : run?.over && i === stage && !run.cleared ? "lost" : "";
      const opp = foes[i - 1], card = opp?.tokenId ? app.byToken.get(String(opp.tokenId)) : null;
      road.append(h("li", { class: `stage ${state}` },
        h("div", { class: "st-face" }, card?.art ? h("img", { src: card.art, alt: "", loading: "lazy", decoding: "async" }) : icon(i === g.stages ? "crown" : "foe"),
          state === "won" ? h("span", { class: "st-mark" }, icon("check")) : state === "lost" ? h("span", { class: "st-mark" }, icon("close")) : null),
        h("span", { class: "st-n", text: i === g.stages ? "Final" : `Stage ${i}` }),
        h("span", { class: "st-name", text: run && opp ? (card?.name ?? opp.name) : "" })));
    }
    const panel = h("div", { class: "panel frame meta-panel" });
    const head = (t, badge) => h("div", { class: "panel-head" }, h("h2", { text: t }), badge ? h("span", { class: "badge outline", text: badge }) : null);
    if (!run) {
      panel.append(head("A new run"), h("div", { class: "panel-body stack" },
        h("p", { class: "lede", text: "Eight bot matches, each harder than the last. Win and choose a reward: a better card for your deck, or a blessing for your champion. Lose once and the run is over." }),
        h("button", { class: "btn primary lg block pulse", type: "button", on: { click: () => void app.flows.choose("gauntlet") } }, icon("gauntlet"), app.snap.cards.length ? "Choose your champion" : "Begin the run")));
    } else {
      const blessed = Object.entries(run.blessings).filter(([, v]) => v > 0).map(([k, v]) => `+${Math.round(v / 655.35)}% ${k}`);
      const who = h("p", { class: "run-line", text: `${app.champName(run.champion.tokenId)}${blessed.length ? ` · ${blessed.join(", ")}` : ""}${run.deck.length ? ` · ${run.deck.length}-card deck` : ""}` });
      if (run.over) {
        panel.append(head(run.cleared ? "Gauntlet cleared" : `Fallen at stage ${stage}`, `${run.wins}/${g.stages} won`), h("div", { class: "panel-body stack" }, who,
          h("p", { class: "lede", text: run.cleared ? "All eight beaten. Start another run with a different champion." : "Your best is kept in your profile." }),
          h("button", { class: "btn primary lg block", type: "button", on: { click: () => app.flows.gauntletAbandon() } }, icon("refresh"), "New run")));
      } else if (run.offers.length) {
        const offers = h("div", { class: "offers" }, ...run.offers.map((r, i) => {
          const face = r.kind === "card" ? app.cards.cardFace(app.game.cards[r.card]) : h("div", { class: "bless" }, icon("spark"), h("b", { class: "display", text: "Blessing" }), h("span", { text: `+${Math.round(r.amount / 655.35)}% ${STAT_LABEL[r.stat]}` }));
          return h("div", { class: "offer" }, face, r.kind === "card" ? h("p", { class: "hint", text: `Replaces ${app.game.cards[r.replaces]?.name ?? "a card"}` }) : null,
            h("button", { class: "btn primary sm", type: "button", on: { click: () => app.flows.gauntletChoose(i) } }, "Take it"));
        }));
        panel.append(head(`Stage ${run.wins} won`, "Choose a reward"), h("div", { class: "panel-body stack" }, who, stagger(offers)));
      } else {
        const opp = g.opponent(run);
        const foe = opp.tokenId ? app.byToken.get(String(opp.tokenId)) : null;
        panel.append(head(`Stage ${stage}: ${opp.name}`, `${LEVEL[opp.level]} bot`), h("div", { class: "panel-body stage-body" },
          h("div", { class: "stage-foe" }, foe ? app.cards.championCard(foe, { eager: true }) : h("div", { class: "ccard base" }, h("div", { class: "inner" }, icon("foe")))),
          h("div", { class: "stack" }, who,
            h("p", { class: "lede", text: `${foe ? foe.name : "The base champion"} waits${opp.deck.length && stage > 1 ? " with a stronger deck than the last" : ""}.` }),
            h("button", { class: "btn primary lg block pulse", type: "button", on: { click: () => void app.flows.gauntletFight() } }, icon("swords"), "Fight"),
            h("button", { class: "link-btn", type: "button", on: { click: () => app.flows.gauntletAbandon() } }, icon("flag"), "Abandon run"))));
      }
    }
    body.replaceChildren(road, panel);
    stagger(road);
  }
  return { id: "gauntlet", el, render, enter() { app.arena.setMood("menu"); app.arena.setRealm("underworld"); render(); } };
}

export function puzzleScreen(app) {
  const body = h("div", { class: "meta-body narrow" });
  const el = page(app, "puzzle-page", "Daily puzzle", "Win this turn", body);
  function render() {
    const p = app.todaysPuzzle();
    const panel = h("div", { class: "panel frame meta-panel" });
    if (p === undefined) {
      panel.append(h("div", { class: "panel-body loading-row" }, h("i", { class: "spinner" }), h("span", { text: "Setting up today's puzzle…" })));
      app.ensurePuzzle(render);
    } else if (!p) {
      panel.append(h("div", { class: "panel-body" }, h("p", { class: "lede", text: "No puzzle today. Try again tomorrow." })));
    } else {
      const solved = app.profile().puzzles[p.date] ?? null;
      const stars = p.odds <= 0.03 ? 3 : p.odds <= 0.12 ? 2 : 1;
      panel.append(
        h("div", { class: "hero-art" }, sigil({ name: p.date, element: "neutral", type: "relic" })),
        h("div", { class: "panel-head" }, h("h2", { text: p.date }), h("span", { class: "badge outline", text: solved ? "Solved" : "Unsolved" })),
        h("div", { class: "panel-body stack" },
          h("div", { class: "stars", aria: { label: `Difficulty ${stars} of 3` } }, ...[1, 2, 3].map((i) => h("span", { class: i <= stars ? "on" : "" }, icon("gem")))),
          h("p", { class: "lede", text: "Every player gets the same position today, and it is always winnable. End your turn without winning and you can try again." }),
          h("div", { class: "tiles" }, tile(String(p.par), "actions the bot needed"), tile(String(app.summary().puzzleStreak), "day streak"), tile(solved ? String(solved.actions) : "–", "your solve")),
          h("button", { class: "btn primary lg block pulse", type: "button", on: { click: () => void app.flows.puzzlePlay() } }, icon("puzzle"), solved ? "Play again" : "Solve today's puzzle")));
    }
    body.replaceChildren(panel);
  }
  return { id: "puzzle", el, render, enter() { app.arena.setMood("menu"); render(); } };
}

export function profileScreen(app) {
  const body = h("div", { class: "meta-body" });
  const el = page(app, "profile-page", "Profile", "Your record", body);
  function render() {
    const prof = app.profile(), sum = app.summary();
    const tiles = h("div", { class: "tiles big" },
      tile(String(sum.played), sum.played === 1 ? "match" : "matches"),
      tile(sum.wins + sum.losses ? pct(sum.winRate) : "–", "win rate"),
      tile(String(sum.streak), `streak · best ${sum.bestStreak}`),
      tile(prof.gauntlet.bestStage ? `${prof.gauntlet.bestStage}/8` : "–", `Gauntlet · ${prof.gauntlet.cleared} cleared`),
      tile(String(sum.puzzleStreak), "puzzle streak"));
    const champs = sum.byChampion.length
      ? h("div", { class: "panel frame meta-panel" }, h("div", { class: "panel-head" }, h("h2", { text: "Your champions" })),
        h("ol", { class: "champ-records panel-body" }, ...sum.byChampion.slice(0, 6).map((c) => {
          const card = app.byToken.get(String(c.champion));
          return h("li", null, card?.art ? h("img", { src: card.art, alt: "" }) : icon("user"), h("span", { text: app.champName(c.champion) }), h("b", { class: "tabnum", text: `${c.wins}–${c.played - c.wins}` }));
        })))
      : null;
    const rows = prof.matches.slice(0, 20).map((m) => {
      const stale = m.ruleset !== app.game.litnode.rulesetId;
      return h("li", { class: `hrow ${m.result}` },
        h("span", { class: "h-result", text: m.result === "win" ? "Victory" : m.result === "loss" ? "Defeat" : "Draw" }),
        h("span", { class: "h-what", text: `${m.mode === "gauntlet" ? "Gauntlet" : m.mode === "relay" ? "Two-player" : "Practice"}${m.detail ? ` · ${m.detail}` : ""} · vs ${m.opponent ?? "?"}` }),
        h("span", { class: "h-when tabnum", text: `${when(m.at)} · ${m.turns} turns` }),
        m.replay ? h("button", { class: "btn ghost sm", type: "button", disabled: stale, title: stale ? "Recorded under an older version of the rules" : "Watch the replay", on: { click: () => void app.flows.watchCode(m.replay) } }, icon(stale ? "alert" : "replay"), stale ? "Old version" : "Watch") : h("span"));
    });
    const history = h("div", { class: "panel frame meta-panel" }, h("div", { class: "panel-head" }, h("h2", { text: "Recent matches" })),
      rows.length ? h("ol", { class: "history" }, ...rows) : h("div", { class: "panel-body" }, h("p", { class: "lede", text: "No matches yet. Play one and it shows up here, with its replay." })));
    const top = sum.byChampion[0], topCard = top ? app.byToken.get(String(top.champion)) : null;
    const hero = h("div", { class: "profile-hero panel frame" },
      h("div", { class: "ph-card" }, topCard ? app.cards.championCard(topCard, { eager: true }) : h("div", { class: "ccard base" }, h("div", { class: "inner" }, icon("emblem")))),
      h("div", { class: "ph-body" },
        h("span", { class: "eyebrow", text: topCard ? "Your most-played champion" : "Your record" }),
        h("h2", { class: "display ph-name", text: topCard ? topCard.name : "No matches yet" }),
        h("p", { class: "ph-record tabnum", text: `${sum.wins} won · ${sum.losses} lost` }),
        stagger(tiles)));
    body.replaceChildren(hero, h("div", { class: "profile-cols" }, history, champs));
  }
  return { id: "profile", el, render, enter() { app.arena.setMood("menu"); render(); } };
}
