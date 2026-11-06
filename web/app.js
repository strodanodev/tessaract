// Tessaract — the game client. One JSON file is the game (engine/tessaract.js and data/, built by `tessaract web`);
// the rules here are the same code the relay and the LitNode ruleset run, so every match replays identically.
//
//   ./                                   title screen: practice, Gauntlet, daily puzzle, profile
//   ?relay=ws://127.0.0.1:7830&name=a    a two-player match on a dev relay (`TCG_DEV=1 tessaract relay`)
//   ?relay=…&watch=1                     spectate it
//   #replay=<code>                       replay a shared match (the code is the whole match record)
//
// This file wires the data, the wallet, the profile and the flows between screens. The screens are in ui/screens,
// the level behind them in ui/arena.js, the design in styles/. Every name on the page goes in through textContent.
import {
  decode, Op, compileGame, createRules, LocalBotSession, RelaySession, ReplaySession, PuzzleSession, encodeRecord, decodeRecord, REPLAY_PARAM,
  statsFromCore, describeEffect, createGauntlet, createPuzzles, loadProfile, saveProfile, addMatch, summarize, utcDate,
} from "./engine/tessaract.js";
import { createWallet } from "./lib/wallet.js";
import { createHoldings } from "./lib/holdings.js";
import { shortAddress } from "./lib/util.js";
import { toast, wait } from "./ui/dom.js";
import { go, register, resetStack } from "./ui/router.js";
import { createArena, REALMS, realmFor } from "./ui/arena.js";
import { createCards } from "./ui/cards.js";
import { homeScreen } from "./ui/screens/home.js";
import { selectScreen } from "./ui/screens/select.js";
import { deckScreen } from "./ui/screens/deck.js";
import { gauntletScreen, puzzleScreen, profileScreen } from "./ui/screens/meta.js";
import { forgeScreen } from "./ui/screens/forge.js";
import { versusScreen } from "./ui/screens/versus.js";
import { matchScreen } from "./ui/screens/match.js";

// ------------------------------------------------------------------ boot
const bootBar = document.getElementById("boot-bar"), bootText = document.getElementById("boot-text");
const boot = (p, text) => { if (bootBar) bootBar.style.transform = `scaleX(${p})`; if (bootText && text) bootText.textContent = text; };
const bootDone = () => document.getElementById("boot")?.classList.add("done");

const q = new URLSearchParams(location.search);
const RELAY = q.get("relay");
const WATCH = !!RELAY && q.get("watch") === "1";
const randomSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

boot(0.15, "Reading the game");
// assets/cards/art.json (optional) names an illustration for cards with no painting: { "<card id>": "<file>" }
const [game, snap, cardArt] = await Promise.all([fetch("./data/game.json").then((r) => r.json()), fetch("./data/collection.json").then((r) => r.json()),
  fetch("./assets/cards/art.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))]);
boot(0.45, "Forging the rules");
const rules = createRules(compileGame(game));
const byToken = new Map(snap.cards.map((c) => [String(c.tokenId), c]));
document.title = game.title;

// Element accents come from the game config (elements[].color), else the theme's defaults (styles/theme.css).
const ELEMENT_COLOR = Object.fromEntries(game.elements.filter((e) => /^#[0-9a-f]{3,8}$/i.test(e.color ?? "")).map((e) => [e.id, e.color]));
const elementColor = (id) => ELEMENT_COLOR[id] ?? `var(--${/^[a-z]+$/.test(id ?? "") ? id : "neutral"}, var(--neutral))`;
// A card's art: its token's painting from the collection snapshot, else a local image the game names in "art", else
// one from assets/cards/art.json (the CSP serves same-origin images only, so remote and ipfs:// URLs are skipped).
// No art at all: the card draws a generated sigil (ui/sigil.js).
const localArt = (src) => (typeof src === "string" && src && !/^[a-z]+:/i.test(src) && !src.startsWith("//") && !src.includes("..") ? src : null);
const artOf = (def) => (def.token ? byToken.get(String(def.token.tokenId))?.art : null) ?? localArt(def.art) ?? (localArt(cardArt[def.id]) ? `./assets/cards/${cardArt[def.id]}` : null);
const nameOf = (id) => game.cards.find((c) => c.id === id)?.name ?? id;
const statsOf = (c) => (c ? statsFromCore(c.stats) : undefined);
const claimOf = (c) => (c ? { tokenId: String(c.tokenId), stats: statsOf(c) } : undefined);

// ------------------------------------------------------------------ preferences, profile, wallet
const store = (() => { try { return window.localStorage; } catch { return null; } })();
const prefs = (() => { try { return { realm: "auto", level: 2, ...JSON.parse(store?.getItem("deckwright.prefs") ?? "{}") }; } catch { return { realm: "auto", level: 2 }; } })();
let profile = loadProfile(store, game.litnode.rulesetId);
const saveProf = () => saveProfile(store, profile);
const gauntlet = createGauntlet(rules);
const puzzles = createPuzzles(rules);
let todaysPuzzle;   // undefined until generated; null when the day has none
let puzzleBusy = false;

const wallet = createWallet();
// A game built without a collection has no contract to read: no wallet, base champions only.
const holdings = /^0x[0-9a-fA-F]{40}$/.test(snap.collection.address ?? "") ? createHoldings({ collection: { ...snap.collection, cards: snap.cards } }) : null;
const walletListeners = [];
const owned = new Set();
async function refreshOwned() {
  const { address } = wallet.snapshot();
  owned.clear();
  if (address && holdings) {
    try {
      const read = await holdings.read(address);
      for (const c of (await holdings.identify(read.tokens)).values()) if (c) owned.add(String(c.tokenId));
    } catch (e) { console.warn("[tessaract] could not read holdings", e); }
  }
  for (const fn of walletListeners) fn();
}
wallet.subscribe(() => { void refreshOwned(); });

// ------------------------------------------------------------------ the app: what every screen reads
const arena = createArena(document.getElementById("arena"));
const app = {
  game, rules, snap, byToken, arena, prefs, owned, gauntlet, puzzles, toast,
  relay: !!RELAY, watch: WATCH, requireOwned: !!RELAY && q.get("owned") === "1",
  funnel: !!document.querySelector('meta[name="tessaract-funnel"]'),
  hasWallet: !!holdings,
  elementColor, artOf, nameOf, statsOf,
  champName: (tokenId) => (tokenId ? byToken.get(String(tokenId))?.name ?? `#${tokenId}` : "Base champion"),
  heroPowerOf(c) {
    const p = rules.heroPower(claimOf(c) ?? {});
    return p ? { name: p.name, cost: p.cost, text: describeEffect(p.effect, nameOf) } : null;
  },
  setPref(k, v) { prefs[k] = v; try { store?.setItem("deckwright.prefs", JSON.stringify(prefs)); } catch { /* not remembered */ } },
  profile: () => profile,
  summary: () => summarize(profile),
  puzzleSolvedToday: () => !!profile.puzzles[utcDate(Date.now())],
  todaysPuzzle: () => todaysPuzzle,
  ensurePuzzle(done) {
    // Generating takes a moment (a seeded bot match plus difficulty playouts): the page draws first.
    if (puzzleBusy || todaysPuzzle !== undefined) return;
    puzzleBusy = true;
    setTimeout(() => { todaysPuzzle = puzzles.daily(utcDate(Date.now())); puzzleBusy = false; done(); }, 40);
  },
  onWallet: (fn) => { walletListeners.push(fn); },
  walletShort: () => { const a = wallet.snapshot().address; return a ? shortAddress(a) : ""; },
  async toggleWallet() { if (wallet.snapshot().address) await wallet.disconnect(); else await wallet.connect(); await refreshOwned(); },
};
app.cards = createCards(app);

// ------------------------------------------------------------------ screens
const home = homeScreen(app);
const select = selectScreen(app);
const deck = game.deckRules?.mode === "declared" ? deckScreen(app) : null;
const gauntletPage = gauntletScreen(app);
const puzzlePage = puzzleScreen(app);
const profilePage = profileScreen(app);
const versus = versusScreen(app);
const match = matchScreen(app);
for (const s of [home, select, deck, gauntletPage, puzzlePage, profilePage, app.funnel ? forgeScreen(app) : null, versus, match]) if (s) register(s);

// ------------------------------------------------------------------ flows
let last = null;   // the last practice or two-player setup, for Rematch: { champion, deck, opts }
let context = { kind: "practice" };
let recorded = false;

const realmName = (realm) => REALMS[realm]?.name ?? realm;
const pickRealm = (champion, choice = prefs.realm) => (choice === "auto" ? realmFor(champion) : choice);

/** Show the versus screen, wait for `ready` (and at least its animation), then wipe into the battle. */
async function versusInto(session, ctx, { names, subs, champs, realm }, ready = () => true) {
  context = ctx; recorded = false;
  versus.show({ names, subs, champs, realm: realmName(realm), kind: ctx.kind });
  await go("versus", { wipe: true, before: () => arena.setRealm(realm) });
  const t0 = performance.now();
  for (;;) {
    const p = Math.min(1, (performance.now() - t0) / 1700);
    const ok = ready();
    versus.progress(ok ? p : Math.min(p, 0.82), ok ? (p < 1 ? "Raising the banners" : "To battle") : session.status || "Waiting for the opponent");
    if (p >= 1 && ok) break;
    await wait(60);
  }
  await go("match", { wipe: true, before: () => match.attach(session, ctx) });
}

/** Start a practice match (or a two-player one on the relay) with a champion and, for declared decks, a deck. */
async function startMatch(champion, declaredDeck, opts = {}) {
  last = { champion, deck: declaredDeck, opts };
  const realm = pickRealm(champion, opts.realm);
  if (RELAY) {
    const session = RelaySession.dev(rules, RELAY, q.get("name") ?? `player-${randomSeed().slice(0, 6)}`, claimOf(champion), wallet.snapshot().address ?? undefined);
    if (declaredDeck) session.declareDeck(declaredDeck);
    await versusInto(session, { kind: "relay", label: "Two-player match", opponent: "Opponent", mine: champion },
      { names: [champion?.name ?? "Base champion", "Opponent"], subs: ["You", "Joining…"], champs: [champion, null], realm },
      () => !!session.state);
    return;
  }
  const others = snap.cards.filter((c) => c !== champion);
  const foe = others.length ? others[Math.floor(Math.random() * others.length)] : null;
  const level = opts.level ?? prefs.level;
  const session = new LocalBotSession(rules, randomSeed(), claimOf(champion), claimOf(foe), { level });
  if (declaredDeck) session.declareDeck(declaredDeck);
  await versusInto(session, { kind: "practice", label: "Practice", opponent: foe?.name ?? "House bot", foeLabel: "House bot", mine: champion, foe },
    { names: [champion?.name ?? "Base champion", foe?.name ?? "House bot"], subs: ["You", `${["", "Easy", "Normal", "Hard"][level]} bot`], champs: [champion, foe], realm });
}

function closeRun() {
  const run = profile.gauntlet.current;
  if (run && !run.counted) {
    profile.gauntlet.runs++;
    profile.gauntlet.bestStage = Math.max(profile.gauntlet.bestStage, run.wins);
    if (run.cleared) profile.gauntlet.cleared++;
  }
  profile.gauntlet.current = null;
  saveProf();
}

async function startReplay(record, code) {
  let session;
  try { session = new ReplaySession(rules, record); }
  catch (e) { toast(`Can't play this replay: ${e.message}`, "err"); await go("home"); return; }
  const c0 = byToken.get(String(record.agents[record.participants[0]]?.tokenId)) ?? null;
  shareCode = code;
  context = { kind: "replay", label: "Replay" };
  await go("match", { wipe: true, before: () => { arena.setRealm(pickRealm(c0, "auto")); match.attach(session, context); } });
}
let shareCode = null;

async function loadReplayFromHash() {
  const m = new RegExp(`^#${REPLAY_PARAM}=([A-Za-z0-9_-]+)$`).exec(location.hash);
  if (!m) return false;
  try { await startReplay(await decodeRecord(m[1]), m[1]); return true; }
  catch (e) { toast(`Couldn't open that replay link: ${e.message}`, "err"); return false; }
}

const replayUrl = (code) => `${location.origin}${location.pathname}#${REPLAY_PARAM}=${code}`;
const watchUrl = () => `${location.origin}${location.pathname}?relay=${encodeURIComponent(RELAY)}&watch=1`;

app.flows = {
  /** Open champion select for a mode; a game without a collection skips straight on with the base champion. */
  async choose(mode) {
    select.setMode(RELAY ? "relay" : mode);
    if (!snap.cards.length) { await app.flows.confirmChampion(null, { mode: RELAY ? "relay" : mode }); return; }
    await go("select");
  },
  async confirmChampion(champion, opts = {}) {
    if (opts.mode === "gauntlet") {
      profile.gauntlet.current = gauntlet.start(randomSeed(), claimOf(champion));
      saveProf();
      resetStack();
      await go("gauntlet", { push: false });
      return;
    }
    if (deck) {
      deck.open((list) => void startMatch(champion, list, opts));
      await go("deck");
      return;
    }
    await startMatch(champion, null, opts);
  },
  async gauntletFight() {
    const run = profile.gauntlet.current;
    if (!run || run.over || run.offers.length) return;
    const opp = gauntlet.opponent(run), me = gauntlet.player(run);
    const mine = me.tokenId ? byToken.get(me.tokenId) ?? null : null;
    const foe = opp.tokenId ? byToken.get(opp.tokenId) ?? null : null;
    const session = new LocalBotSession(rules, `${run.seed}-stage-${opp.stage}`, { tokenId: me.tokenId, stats: me.stats }, { tokenId: opp.tokenId, stats: opp.stats }, { level: opp.level, foeDeck: opp.deck });
    if (deck) session.declareDeck(me.deck);
    await versusInto(session, { kind: "gauntlet", label: `Gauntlet · stage ${opp.stage}`, opponent: opp.name, foeLabel: opp.name, detail: `stage ${opp.stage}`, mine, foe },
      { names: [mine?.name ?? "Base champion", opp.name], subs: ["You", `Stage ${opp.stage} of ${gauntlet.stages}`], champs: [mine, foe], realm: opp.stage >= gauntlet.stages ? "underworld" : pickRealm(foe, "auto") });
  },
  gauntletChoose(i) { profile.gauntlet.current = gauntlet.choose(profile.gauntlet.current, i); saveProf(); gauntletPage.render(); },
  gauntletAbandon() { closeRun(); gauntletPage.render(); },
  async puzzlePlay() {
    const p = todaysPuzzle;
    if (!p) return;
    const session = new PuzzleSession(rules, p);
    const mine = byToken.get(String(p.agents[p.participants[p.side]].tokenId)) ?? null;
    const foe = byToken.get(String(p.agents[p.participants[1 - p.side]].tokenId)) ?? null;
    await versusInto(session, { kind: "puzzle", label: "Daily puzzle", opponent: "Rival", detail: p.date, mine, foe },
      { names: ["You", "Rival"], subs: ["Win this turn", p.date], champs: [mine, foe], realm: pickRealm(mine, "auto") });
  },
  async watchCode(code) {
    try { history.replaceState(null, "", `${location.pathname}#${REPLAY_PARAM}=${code}`); await startReplay(await decodeRecord(code), code); }
    catch (e) { toast(`Couldn't open that replay: ${e.message}`, "err"); }
  },
  async copyViewLink(session) {
    const url = session?.role === "replay" ? replayUrl(shareCode ?? await encodeRecord(session.record())) : watchUrl();
    try { await navigator.clipboard.writeText(url); toast(session?.role === "replay" ? "Replay link copied" : "Watch link copied"); }
    catch { toast("Couldn't copy the link", "err"); }
  },
  async exitView() {
    match.detach();
    // A spectator URL would rejoin the relay on reload: leave it for the plain page.
    if (WATCH) { location.assign(location.pathname); return; }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    resetStack();
    await go("home", { wipe: true });
  },
  async leaveMatch() {
    match.detach();
    resetStack();
    const to = context.kind === "gauntlet" ? "gauntlet" : context.kind === "puzzle" ? "puzzle" : "home";
    await go(to, { wipe: true });
  },

  /** A match ended: record it in the profile (with its replay) and show the result screen. */
  async finished({ session, state: s, meIdx, puzzleState, tally, outcome, watching, champion }) {
    const kind = context.kind;
    let replay = null;
    if (!watching && !recorded) {
      recorded = true;
      if (kind === "puzzle") {
        // Attempts aren't matches: a solve counts once per day, toward the puzzle streak.
        if (puzzleState === "solved" && !profile.puzzles[session.puzzle.date]) { profile.puzzles[session.puzzle.date] = { at: Date.now(), actions: session.actions }; saveProf(); }
      } else {
        const won = s.winner === meIdx;
        if (kind === "gauntlet" && profile.gauntlet.current) {
          const run = gauntlet.result(profile.gauntlet.current, won);
          profile.gauntlet.current = run;
          if (run.over) { closeRun(); profile.gauntlet.current = { ...run, counted: true }; }
        }
        try { replay = await encodeRecord(session.record()); } catch { /* the result still counts without a replay */ }
        profile = addMatch(profile, { at: Date.now(), mode: kind, result: s.winner === 2 ? "draw" : won ? "win" : "loss", turns: s.turnNo, ruleset: game.litnode.rulesetId, ...(champion ? { champion: String(champion.tokenId) } : {}), opponent: context.opponent, ...(replay ? { replay } : {}), ...(context.detail ? { detail: context.detail } : {}) });
        saveProf();
      }
    }
    const me = s.p[meIdx], foe = s.p[meIdx === 0 ? 1 : 0];
    const conceded = s.winner !== 2 && decode(s.last ?? 0).op === Op.Concede;
    const name = (id) => (id === "you" ? "You" : id === "bot" ? "House bot" : String(id).slice(0, 10));
    const headline = puzzleState ? (puzzleState === "solved" ? "Solved" : "Not this time")
      : s.winner === 2 ? "Draw" : watching ? (name(s.p[s.winner].id) === "You" ? "You win" : `${name(s.p[s.winner].id)} wins`) : s.winner === meIdx ? "Victory" : "Defeat";
    const sub = puzzleState
      ? (puzzleState === "solved" ? `${session.actions} actions. The bot needed ${session.puzzle.par}.` : "Your turn ended without a win. Try another line.")
      : conceded ? (watching ? `${name(s.p[s.winner === 0 ? 1 : 0].id)} conceded` : s.winner === meIdx ? "Your opponent conceded" : "You conceded")
      : `${watching ? `${name(me.id)} ${Math.max(0, me.life)} life · ${name(foe.id)} ${Math.max(0, foe.life)} life` : `${Math.max(0, me.life)} life left`}${kind === "relay" && !watching ? ` · ${session.status}` : ""}${kind === "gauntlet" ? ` · ${context.detail}` : ""}`;
    const watchReplay = { text: "Watch replay", icon: "replay", onClick: async () => { const rec = session.record(); const code = await encodeRecord(rec); history.replaceState(null, "", `${location.pathname}${location.search}#${REPLAY_PARAM}=${code}`); await startReplay(rec, code); } };
    const menu = { text: "Menu", icon: "back", link: true, onClick: () => void app.flows.leaveMatch() };
    let buttons;
    if (watching) buttons = [watchReplay, { text: "Leave", icon: "close", onClick: () => void app.flows.exitView() }];
    else if (kind === "puzzle") buttons = puzzleState === "solved" ? [{ text: "Back to the puzzle", icon: "puzzle", primary: true, onClick: () => void app.flows.leaveMatch() }] : [{ text: "Retry", icon: "refresh", primary: true, onClick: () => { recorded = false; match.retry(); } }, menu];
    else if (kind === "gauntlet") {
      const run = profile.gauntlet.current;
      buttons = [{ text: run?.over ? (run.cleared ? "Gauntlet cleared" : "Run over") : "Choose your reward", icon: "gauntlet", primary: true, onClick: () => void app.flows.leaveMatch() }, watchReplay];
    } else if (kind === "relay") buttons = [watchReplay, menu];
    else buttons = [{ text: "Rematch", icon: "swords", primary: true, onClick: () => void startMatch(last.champion, last.deck, last.opts) }, watchReplay, { text: "New champion", icon: "user", onClick: async () => { match.detach(); resetStack(); await go("home", { push: false }); await app.flows.choose("practice"); } }, menu];
    match.result.show({
      outcome, headline, sub,
      numbers: puzzleState ? [[session.actions ?? 0, "actions"], [tally.dealt, "to their champion"], [tally.played, "cards played"], [tally.kills, "foes felled"]]
        : [[s.turnNo, "turns"], [tally.dealt, "to their champion"], [tally.played, "cards played"], [tally.kills, "foes felled"]],
      champion: watching ? null : champion,
      championNote: kind === "gauntlet" ? context.detail : undefined,
      buttons,
      shareLink: kind === "puzzle" ? null : async () => replayUrl(replay ?? await encodeRecord(session.record())),
    });
  },
};

// ------------------------------------------------------------------ start
boot(0.75, "Lighting the braziers");
// Warm only the art the title screen shows first (the featured champion), so it doesn't pop in; never wait long.
const featured = home.firstFeature()?.art;
if (featured) await Promise.race([new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = featured; }), wait(800)]);
boot(1, "Ready");
wallet.restore?.().catch(() => {});
void refreshOwned();
window.addEventListener("hashchange", () => { void loadReplayFromHash(); });
// A replay fragment wins over ?watch=1: "Watch replay" from the spectator view keeps the relay query in the URL.
const opened = location.hash.startsWith(`#${REPLAY_PARAM}=`) && (await loadReplayFromHash());
setTimeout(bootDone, 150);
if (!opened) {
  if (WATCH) {
    const session = RelaySession.watch(rules, RELAY);
    void versusInto(session, { kind: "watch", label: "Spectating" }, { names: ["Player one", "Player two"], subs: ["Spectating", "Live"], champs: [null, null], realm: "valhalla" }, () => !!session.state);
  } else void go("home").then(() => performance.mark("tessaract:title"));   // time to the title screen, for profiling
}
// Rapture Chess's real 3D arena loads after the first screen is up, so it never delays it (the CSS arena stays as the
// fallback). Its frame rate and draw calls are on window.tessaract.arenaStats(), for profiling.
// Measured (scripts/profile-web.mjs --gpu --detail): about 0.3-0.45 s of main-thread work, once, so it waits for an
// idle moment rather than landing on the player's first click.
const upgradeArena = () => { void arena.upgrade().then((ok) => { if (ok) performance.mark("tessaract:arena3d"); }); };
// ?arena=css keeps the CSS arena (for comparisons, and for players who prefer it).
if (q.get("arena") === "css") document.getElementById("arena").dataset.fallback = "turned off (?arena=css)";
else setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(upgradeArena, { timeout: 2000 }) : upgradeArena()), 400);
// Champion select is most players' first click: warm its portraits (about 2 MB) at low priority once the title is up,
// so the grid doesn't open on empty frames over a cold cache. Skipped under data saver.
const warmed = [];   // held so the requests aren't dropped with their images
if (!navigator.connection?.saveData) setTimeout(() => { for (const c of snap.cards) { const src = localArt(c.art); if (src) { const i = new Image(); i.decoding = "async"; i.fetchPriority = "low"; i.src = src; warmed.push(i); } } }, 1200);
window.tessaract = { arenaStats: () => arena.stats() };
