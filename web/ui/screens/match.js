// The battle: Rapture Chess's match HUD over the arena. Plates for both champions (portrait, life, energy, hero power,
// relics), the two lanes on the dais, your hand fanned along the bottom, the turn medallion and the narration, turn
// banners, damage floaters, the fallen feed, the battle menu, the result, and (replays, spectators) the view dock.
// The rules decide everything: the HUD only asks them what is legal and draws the state.
import { decode, Op, ENEMY_CHAMPION, enemyUnit, ownUnit, endTurn, describeEffect, PuzzleSession } from "../../engine/tessaract.js";
import { h, icon, stagger, toast } from "../dom.js";
import { createResult } from "../result.js";

export function matchScreen(app) {
  const { game, rules } = app;
  let session = null, ctx = {}, pick = null, prev = null, recent = [], announcedTurn = null, finishedOnce = false;
  let tally = null;   // this match's numbers for the result screen, counted as states arrive

  // ------------------------------------------------------------------ layout
  const plate = (side) => {
    const portrait = h("button", { class: "pl-face", type: "button" });
    const life = h("div", { class: "pl-life tabnum" });
    const name = h("span", { class: "pl-name" });
    const sub = h("span", { class: "pl-chips" });
    const energy = h("div", { class: "pl-energy" });
    const power = h("div", { class: "pl-power" });
    const relics = h("div", { class: "pl-relics" });
    const floats = h("div", { class: "pl-floats", aria: { hidden: "true" } });
    const el = h("div", { class: `plate ${side}` }, h("div", { class: "pl-hero" }, portrait, life, floats), h("div", { class: "pl-id" }, name, sub, energy), power, relics);
    return { el, portrait, life, name, sub, energy, power, relics, floats };
  };
  const foeP = plate("top"), meP = plate("bottom");
  const medallion = h("div", { class: "medallion" }, h("i", { class: "md-ring" }), h("span", { class: "md-text" }));
  const status = h("p", { class: "hud-status", role: "status", aria: { live: "polite" } });
  const foeLane = h("div", { class: "lane foe-lane", aria: { label: "Opponent units" } });
  const myLane = h("div", { class: "lane my-lane", aria: { label: "Your units" } });
  const hand = h("div", { class: "hand", aria: { label: "Your hand" } });
  const endBtn = h("button", { class: "end-turn", type: "button", on: { click: () => act(endTurn()) } }, h("span", { class: "et-ring" }), h("span", { class: "et-label display", text: "End turn" }));
  const menuBtn = h("button", { class: "icon-btn", type: "button", title: "Battle menu (Esc)", aria: { label: "Battle menu" }, on: { click: () => openMenu() } }, icon("menu"));
  const dock = h("div", { class: "dock" }, menuBtn, endBtn);
  // On a phone, End turn sits in your plate and the menu in the enemy's, clear of the board.
  const phone = matchMedia("(max-width: 760px)");
  const placeControls = () => {
    if (phone.matches) { meP.el.append(endBtn); foeP.el.append(menuBtn); } else dock.append(menuBtn, endBtn);
  };
  phone.addEventListener("change", placeControls);
  const feed = h("div", { class: "killfeed", aria: { live: "polite" } });
  const cineWord = h("b", { class: "display" });
  const cineSub = h("span");
  const cine = h("div", { class: "cine", aria: { hidden: "true" } }, cineWord, h("div", { class: "cine-line" }), cineSub);
  const fx = h("div", { class: "screen-fx", aria: { hidden: "true" } });
  const result = createResult(app);

  // the view dock (replays and spectators)
  const vbtn = (ico, label, onClick) => h("button", { class: "icon-btn sm", type: "button", title: label, aria: { label }, on: { click: onClick } }, icon(ico));
  const replaying = () => session?.role === "replay";
  const viewing = () => !!session && session.role !== "player";
  const stepTo = (k) => { if (!replaying()) return; session.pause(); session.seek(k); };
  const vb = {
    first: vbtn("first", "Back to the start", () => stepTo(session.cursor > session.playStart ? session.playStart : 0)),
    prevTurn: vbtn("prevTurn", "Previous turn", () => stepTo(session.turnStart(session.cursor, -1))),
    prev: vbtn("prev", "Previous move (←)", () => stepTo(session.cursor - 1)),
    play: h("button", { class: "icon-btn vb-play", type: "button", title: "Play (space)", aria: { label: "Play" }, on: { click: () => { if (replaying()) { if (session.playing) session.pause(); else session.play(); } } } }, icon("play")),
    next: vbtn("next", "Next move (→)", () => stepTo(session.cursor + 1)),
    nextTurn: vbtn("nextTurn", "Next turn", () => stepTo(session.turnStart(session.cursor, 1))),
    last: vbtn("last", "Jump to the end", () => stepTo(session.length)),
  };
  const scrub = h("input", { type: "range", class: "vb-scrub", min: "0", max: "0", value: "0", aria: { label: "Move in the match" }, on: { input: (e) => stepTo(Number(e.target.value)) } });
  const pos = h("span", { class: "vb-pos tabnum", aria: { live: "polite" } });
  const viewbar = h("div", { class: "viewbar panel", hidden: true },
    h("span", { class: "badge vb-badge" }),
    h("div", { class: "vb-steps" }, vb.first, vb.prevTurn, vb.prev, vb.play, vb.next, vb.nextTurn, vb.last),
    scrub, pos,
    h("div", { class: "vb-more" },
      vbtn("flip", "Flip view", () => flip()),
      vbtn("link", "Copy link", () => void app.flows.copyViewLink(session)),
      vbtn("close", "Exit", () => void app.flows.exitView())));

  const mat = h("div", { class: "table-mat", aria: { hidden: "true" } }, h("i", { class: "tm-ring" }), h("i", { class: "tm-seat foe" }), h("i", { class: "tm-seat you" }));
  const board = h("div", { class: "battlefield" }, mat, foeLane, h("div", { class: "lane-line" }), myLane);
  const el = h("section", { class: "match", aria: { label: "Battle" } },
    fx, foeP.el, h("div", { class: "hud-center" }, medallion, status), board, meP.el, hand, dock, feed, cine, viewbar, result.el);

  // ------------------------------------------------------------------ battle menu
  let menu = null;
  function openMenu() {
    if (menu || result.open) return;
    const close = () => { menu?.remove(); menu = null; };
    let armed = false;
    const concede = h("button", { class: "btn danger block", type: "button" }, icon("flag"), "Concede");
    concede.addEventListener("click", () => {
      if (!armed) { armed = true; concede.lastChild.textContent = "Really concede?"; return; }
      close(); session?.concede();
    });
    const rows = viewing()
      ? [h("button", { class: "btn ghost block", type: "button", on: { click: () => { close(); void app.flows.exitView(); } } }, icon("close"), "Leave")]
      : [
        ctx.kind === "relay" ? h("button", { class: "btn ghost block", type: "button", on: { click: () => void app.flows.copyViewLink(session) } }, icon("eye"), "Copy watch link") : null,
        ctx.kind !== "puzzle" && !session.state?.over ? concede : null,
        h("button", { class: "btn ghost block", type: "button", on: { click: () => { close(); void app.flows.leaveMatch(); } } }, icon("back"), ctx.kind === "relay" ? "Leave the match" : "Leave to the menu"),
      ];
    menu = h("div", { class: "pause", on: { pointerdown: (e) => { if (e.target === menu) close(); } } },
      h("div", { class: "pause-panel panel frame" },
        h("div", { class: "panel-head" }, icon("swords"), h("h2", { text: "Battle menu" }), h("button", { class: "icon-btn sm close", type: "button", aria: { label: "Resume" }, on: { click: close } }, icon("close"))),
        h("div", { class: "panel-body pause-body" },
          h("button", { class: "btn primary block", type: "button", on: { click: close } }, icon("play"), "Resume"),
          ...rows,
          h("p", { class: "hint", text: `${ctx.label ?? "Match"} · ${game.title}` }))));
    el.append(menu);
  }

  // ------------------------------------------------------------------ inspect: hold (touch) or right-click any card to read it
  let inspector = null;
  function inspect(def) {
    inspector?.remove();
    const big = app.cards.cardFace(def);
    big.classList.add("inspect-card");
    inspector = h("div", { class: "inspect", role: "dialog", aria: { label: def.name }, on: { pointerdown: () => { inspector?.remove(); inspector = null; } } },
      big, h("p", { class: "hint", text: "Tap anywhere to close" }));
    el.append(inspector);
  }
  function inspectable(node, def) {
    node.addEventListener("contextmenu", (e) => { e.preventDefault(); inspect(def); });
    let timer = 0, held = false;
    node.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      held = false;
      timer = setTimeout(() => { held = true; inspect(def); }, 450);
    });
    const cancel = () => clearTimeout(timer);
    node.addEventListener("pointerup", cancel);
    node.addEventListener("pointerleave", cancel);
    node.addEventListener("pointercancel", cancel);
    // a hold opens the card; the click that ends it must not also play or pick it
    node.addEventListener("click", (e) => { if (held) { held = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    return node;
  }
  /** Empty slot plates either side of a side's units (units fill from the centre), so the board shows its shape. */
  const slot = () => h("div", { class: "slot", aria: { hidden: "true" } });
  const framed = (units) => {
    const empty = Math.max(0, (game.rules.boardSlots ?? 5) - units.length);
    return [...Array.from({ length: Math.floor(empty / 2) }, slot), ...units, ...Array.from({ length: Math.ceil(empty / 2) }, slot)];
  };

  // ------------------------------------------------------------------ helpers
  const act = (x) => { pick = null; session?.act(x); };
  const shortId = (id) => (/^[0-9a-f]{64}$/i.test(id) ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);
  /** "You" in your own replays reads "Your turn", "You win": English needs its own forms for it. */
  const possessive = (name) => (name === "You" ? "Your" : `${name}'s`);
  const playerName = (id) => (id === "you" ? "You" : id === "bot" ? "House bot" : shortId(String(id)));
  const champOf = (id) => app.byToken.get(String(session?.champions?.[id]?.tokenId)) ?? null;
  const cardName = (c) => game.cards[c]?.name ?? "a card";

  function banner(word, sub = "", kind = "") {
    cine.dataset.kind = kind;
    cineWord.textContent = word; cineSub.textContent = sub;
    cine.classList.remove("show"); void cine.offsetWidth; cine.classList.add("show");
  }
  function flash(kind) {
    const i = h("i", { class: `fx-${kind}` });
    fx.append(i);
    setTimeout(() => i.remove(), 1700);
  }
  function floater(p, text, kind) {
    const f = h("span", { class: `float ${kind}`, text });
    p.floats.append(f);
    setTimeout(() => f.remove(), 1300);
  }
  function fallen(def, foeSide) {
    const e = h("div", { class: `kf${foeSide ? "" : " mine"}` }, app.artOf(def) ? h("img", { src: app.artOf(def), alt: "" }) : icon("sword"), icon("skull"), h("span", null, h("b", { text: def.name }), " fell"));
    feed.prepend(e);
    while (feed.children.length > 4) feed.lastChild.remove();
    setTimeout(() => { e.classList.add("gone"); setTimeout(() => e.remove(), 500); }, 3600);
  }

  /** One line about what just happened, read from the action against the state before it. */
  function narrate(before, s, meIdx) {
    const x = s.last;
    if (!before || !x) return;
    const { op, a, target } = decode(x);
    const actor = before.turn, P = before.p[actor], E = before.p[actor === 0 ? 1 : 0];
    const watching = viewing();
    const who = watching ? playerName(P.id) : actor === meIdx ? "You" : "Opponent";
    const enemyChampion = watching ? `${possessive(playerName(E.id))} champion` : actor === meIdx ? "the enemy champion" : "your champion";
    const theirs = watching ? possessive(playerName(E.id)) : actor === meIdx ? "their" : "your";
    const tgt = () => (target === ENEMY_CHAMPION ? enemyChampion : target < 10 ? `${theirs} ${cardName(E.board[target - 1]?.c)}` : target === 10 ? "" : cardName(P.board[target - 11]?.c));
    let line = "";
    if (op === Op.Play) line = `${who} played ${cardName(P.hand[a])}${target ? ` → ${tgt()}` : ""}`;
    else if (op === Op.Power) line = `${who} used ${game.champion.powers?.[P.power]?.name ?? "a power"}${target ? ` → ${tgt()}` : ""}`;
    else if (op === Op.Attack) line = `${possessive(who)} ${cardName(P.board[a]?.c)} attacked ${tgt()}`;
    else if (op === Op.End) line = `${who} ended the turn`;
    else if (op === Op.Concede) line = watching ? `${playerName(s.p[s.winner === 0 ? 1 : 0].id)} conceded` : `${s.winner === meIdx ? "Opponent" : "You"} conceded`;
    if (line) recent = [...recent, line].slice(-2);
  }

  /** What changed between two states: floaters, a quake on a hit to you, the fallen feed, and the result tally. */
  function effects(before, s, meIdx, live) {
    if (!before || before.p[meIdx].id !== s.p[meIdx].id) return;
    const foeIdx = meIdx === 0 ? 1 : 0;
    for (const [idx, p] of [[meIdx, meP], [foeIdx, foeP]]) {
      const d = s.p[idx].life - before.p[idx].life;
      if (d < 0) { floater(p, String(d), "dmg"); if (live && idx === meIdx) app.arena.quake(); }
      else if (d > 0) floater(p, `+${d}`, "heal");
    }
    // Units that left the board: compare the multiset of cards on each side.
    for (const idx of [meIdx, foeIdx]) {
      const after = new Map();
      for (const u of s.p[idx].board) after.set(u.c, (after.get(u.c) ?? 0) + 1);
      for (const u of before.p[idx].board) {
        const n = after.get(u.c) ?? 0;
        if (n > 0) after.set(u.c, n - 1);
        else { if (live) fallen(game.cards[u.c], idx === foeIdx); if (tally && idx === foeIdx) tally.kills++; }
      }
    }
    if (tally) {
      tally.dealt += Math.max(0, before.p[foeIdx].life - s.p[foeIdx].life);
      tally.taken += Math.max(0, before.p[meIdx].life - s.p[meIdx].life);
      if (s.last && decode(s.last).op === Op.Play && before.turn === meIdx) tally.played++;
    }
  }

  // ------------------------------------------------------------------ the plates
  function renderPlate(P, p, champ, label, { mine, moves, targets, foe }) {
    P.el.dataset.el = champ ? String(champ.element ?? "").toLowerCase() : "neutral";
    P.el.style.setProperty("--el", app.elementColor(String(champ?.element ?? "neutral").toLowerCase()));
    P.portrait.replaceChildren(champ?.art ? h("img", { src: champ.art, alt: "" }) : icon(mine ? "you" : "foe"));
    const aim = foe ? targets.get(ENEMY_CHAMPION) : undefined;
    P.portrait.classList.toggle("target", aim !== undefined);
    P.portrait.onclick = aim !== undefined ? () => act(aim) : null;
    P.portrait.setAttribute("aria-label", `${label}: ${p.life} life`);
    P.life.textContent = String(p.life);
    P.life.classList.toggle("low", p.life <= Math.max(5, Math.round(p.maxLife * 0.25)));
    P.name.replaceChildren(...(champ ? [h("span", { class: "pl-who", text: `${label} · ` }), champ.name] : [label]));
    P.sub.replaceChildren(...[
      h("span", { class: "chip-mini", title: `${p.deck.length} cards left in the deck` }, h("i", { class: "cardback" }), h("b", { class: "tabnum", text: p.deck.length })),
      h("span", { class: "chip-mini", title: `${p.hand.length} cards in hand` }, icon("cards"), h("b", { class: "tabnum", text: p.hand.length })),
      p.spellPower ? h("span", { class: "chip-mini buff", title: `Spell power +${p.spellPower}` }, icon("spark"), h("b", { text: `+${p.spellPower}` })) : null,
      p.unitAttack ? h("span", { class: "chip-mini buff", title: `Unit attack +${p.unitAttack}` }, icon("sword"), h("b", { text: `+${p.unitAttack}` })) : null].filter(Boolean));
    const n = Math.max(p.energyCap, p.energy);
    P.energy.replaceChildren(...Array.from({ length: n }, (_, i) => h("i", { class: i < p.energy ? "full" : "" })), h("span", { class: "tabnum", text: `${p.energy}/${p.energyCap}` }));
    P.energy.title = `energy ${p.energy}/${p.energyCap}`;
    // the hero power
    const pw = p.power >= 0 ? game.champion.powers?.[p.power] : null;
    P.power.replaceChildren();
    if (pw) {
      const uses = mine ? moves.filter((m) => m.op === Op.Power) : [];
      const b = h("button", { class: `power${p.powerUsed ? " used" : ""}${pick?.kind === "power" && mine ? " picked" : ""}`, type: "button", disabled: !uses.length, title: `${pw.name} (${pw.cost}): ${describeEffect(pw.effect, app.nameOf)}` },
        h("span", { class: "pw-cost tabnum", text: pw.cost }), icon("bolt"), h("span", { class: "pw-name", text: pw.name }));
      b.addEventListener("click", () => {
        if (uses.length === 1 && uses[0].target === 0) { act(uses[0].x); return; }
        pick = pick?.kind === "power" ? null : { kind: "power", index: 0 };
        render();
      });
      P.power.append(b);
    }
    P.relics.replaceChildren(...p.relics.map((c) => inspectable(app.cards.cardFace(game.cards[c], { small: true }), game.cards[c])));
  }

  // ------------------------------------------------------------------ render
  function renderViewbar(s) {
    viewbar.querySelector(".vb-badge").textContent = replaying() ? "Replay" : "Spectating";
    viewbar.classList.toggle("live", !replaying());
    if (!replaying()) { pos.textContent = session?.status ?? ""; return; }
    const r = session;
    scrub.max = String(r.length);
    scrub.value = String(r.cursor);
    pos.textContent = !s ? "" : s.phase === "decks" ? `deck building · ${r.cursor}/${r.length}` : `turn ${s.turnNo} · move ${r.cursor}/${r.length}`;
    vb.play.replaceChildren(icon(r.playing ? "pause" : r.cursor >= r.length ? "replay" : "play"));
    vb.play.setAttribute("aria-label", r.playing ? "Pause" : "Play");
    vb.first.disabled = vb.prev.disabled = vb.prevTurn.disabled = r.cursor <= 0;
    vb.last.disabled = vb.next.disabled = vb.nextTurn.disabled = r.cursor >= r.length;
  }

  function render() {
    const s = session?.state;
    if (!s) { status.textContent = session?.status ?? ""; medallion.querySelector(".md-text").textContent = "Waiting"; renderViewbar(null); return; }
    const watching = viewing();
    const meIdx = s.p[0].id === session.you ? 0 : 1;
    if (s.phase === "decks") {
      // Two-player: waiting for both declarations (the relay fills a missing deck with the suggested one at its deadline).
      for (const n of [foeLane, myLane, hand, foeP.relics, meP.relics]) n.replaceChildren();
      const [a, b] = watching ? [playerName(s.p[meIdx].id), playerName(s.p[1 - meIdx].id)] : ["You", "Opponent"];
      medallion.querySelector(".md-text").textContent = "Declaring decks";
      status.textContent = `${a} ${s.decl[meIdx].length}/${game.deckRules?.size ?? 0} · ${b} ${s.decl[1 - meIdx].length}/${game.deckRules?.size ?? 0}`;
      endBtn.disabled = true;
      renderViewbar(s);
      return;
    }
    const me = s.p[meIdx], foe = s.p[meIdx === 0 ? 1 : 0];
    // A replay can jump anywhere: compare with the state just before the cursor, and narrate the last moves.
    const before = replaying() ? session.states[session.cursor - 1] ?? null : prev;
    if (replaying()) {
      recent = [];
      for (let k = Math.max(session.playStart + 1, session.cursor - 1); k <= session.cursor; k++) narrate(session.states[k - 1], session.states[k], meIdx);
      if (before && session.cursor > session.playStart) effects(before, s, meIdx, session.playing);
    } else if (s !== prev) { narrate(prev, s, meIdx); effects(prev, s, meIdx, true); }
    prev = s;

    const myTurn = !watching && !s.over && s.turn === meIdx;
    const moves = (myTurn ? rules.legalActions(s) : []).map((x) => ({ x, ...decode(x) }));
    const targets = new Map();   // target code -> action, for the current pick
    const pickOp = { hand: Op.Play, unit: Op.Attack, power: Op.Power };
    if (pick) for (const m of moves) if (m.op === pickOp[pick.kind] && m.a === pick.index) targets.set(m.target, m.x);

    const foeChamp = watching ? champOf(foe.id) : ctx.foe ?? champOf(foe.id);
    const myChamp = watching ? champOf(me.id) : ctx.mine ?? null;
    renderPlate(foeP, foe, foeChamp, watching ? playerName(foe.id) : ctx.foeLabel ?? ctx.opponent ?? "Opponent", { mine: false, moves, targets, foe: true });
    renderPlate(meP, me, myChamp, watching ? playerName(me.id) : "You", { mine: true, moves, targets, foe: false });
    foeP.el.classList.toggle("active", !s.over && s.turn !== meIdx);
    meP.el.classList.toggle("active", !s.over && s.turn === meIdx);
    const low = (p) => !s.over && p.life <= Math.max(5, Math.round(p.maxLife * 0.25));
    foeP.el.classList.toggle("low", low(foe));
    meP.el.classList.toggle("low", low(me));
    el.classList.toggle("danger", !watching && low(me));

    foeLane.replaceChildren(...framed(foe.board.map((u, slot) => {
      const b = inspectable(app.cards.unitToken(game.cards[u.c], u), game.cards[u.c]);
      const x = targets.get(enemyUnit(slot));
      if (x !== undefined) { b.classList.add("target"); b.addEventListener("click", () => act(x)); }
      return b;
    })));
    myLane.replaceChildren(...framed(me.board.map((u, slot) => {
      const b = inspectable(app.cards.unitToken(game.cards[u.c], u), game.cards[u.c]);
      const buff = targets.get(ownUnit(slot));
      const canAttack = moves.some((m) => m.op === Op.Attack && m.a === slot);
      if (buff !== undefined) { b.classList.add("target", "ally"); b.addEventListener("click", () => act(buff)); }
      else if (canAttack) {
        b.classList.add("can");
        if (pick?.kind === "unit" && pick.index === slot) b.classList.add("picked");
        b.addEventListener("click", () => { pick = pick?.kind === "unit" && pick.index === slot ? null : { kind: "unit", index: slot }; render(); });
      }
      return b;
    })));
    const n = me.hand.length;
    hand.style.setProperty("--n", String(Math.max(1, n)));
    hand.replaceChildren(...me.hand.map((c, index) => {
      const def = game.cards[c];
      const b = inspectable(app.cards.cardFace(def, { tag: "button" }), def);
      b.style.setProperty("--i", String(index - (n - 1) / 2));
      const plays = moves.filter((m) => m.op === Op.Play && m.a === index);
      if (watching) return b;   // spectators and replays see the hand (open information) but don't play it
      if (!plays.length) { b.classList.add("dead"); b.setAttribute("aria-disabled", "true"); return b; }
      b.classList.add("can");
      if (pick?.kind === "hand" && pick.index === index) b.classList.add("picked");
      // A card needs a target pick when the rules offer more than one, or one that isn't the default (0).
      const aimed = plays.length > 1 || plays[0].target !== 0;
      b.addEventListener("click", () => {
        if (!aimed) { act(plays[0].x); return; }
        pick = pick?.kind === "hand" && pick.index === index ? null : { kind: "hand", index };
        render();
      });
      return b;
    }));
    hand.style.setProperty("--n", String(n));
    el.classList.toggle("aiming", !!pick);

    endBtn.disabled = !myTurn;
    endBtn.classList.toggle("ready", myTurn && !moves.some((m) => m.op !== Op.End));
    const watchingTurn = watching ? `${possessive(playerName(s.p[s.turn].id))} turn` : null;
    const outcome = s.winner === 2 ? "A draw" : s.winner >= 0 ? `${watching ? playerName(s.p[s.winner].id) : s.winner === meIdx ? "You" : "Opponent"} won` : "";
    medallion.querySelector(".md-text").textContent = s.over ? outcome : watchingTurn ?? (myTurn ? `Your turn · ${s.turnNo}` : `Enemy turn · ${s.turnNo}`);
    medallion.classList.toggle("yours", myTurn);
    medallion.dataset.side = s.turn === meIdx ? "0" : "1";
    const hint = !myTurn ? "" : pick?.kind === "hand" ? `Choose a target for ${cardName(me.hand[pick.index])}` : pick?.kind === "power" ? "Choose a target for your hero power" : pick?.kind === "unit" ? "Choose what to attack" : "";
    status.textContent = hint || recent.join(" · ") || (replaying() ? "" : session.status && !/^practice|^live$|^watching|^puzzle$/.test(session.status) ? session.status : "");

    // Turn banners, live only.
    if (!replaying() && !s.over && announcedTurn !== `${s.turnNo}`) {
      announcedTurn = `${s.turnNo}`;
      if (myTurn) banner("Your turn", `Turn ${s.turnNo}`);
      else if (!watching && ctx.kind === "relay") banner("Enemy turn", "", "foe");
    }
    renderViewbar(s);

    // Players and spectators get the result screen; a replay just stops on its last move. A puzzle ends with its turn.
    const puzzleState = session instanceof PuzzleSession ? app.puzzles.status(session.puzzle, s) : null;
    const finished = puzzleState ? puzzleState !== "playing" : s.over;
    if (finished && !replaying() && !finishedOnce) {
      finishedOnce = true;
      const won = puzzleState ? puzzleState === "solved" : s.winner === meIdx;
      const outcomeKind = puzzleState ? (won ? "win" : "loss") : s.winner === 2 ? "draw" : watching ? "win" : won ? "win" : "loss";
      flash(outcomeKind === "win" ? "victory" : outcomeKind === "loss" ? "defeat" : "victory");
      banner(puzzleState ? (won ? "Solved" : "Not this time") : s.winner === 2 ? "Draw" : watching ? (playerName(s.p[s.winner].id) === "You" ? "You win" : `${playerName(s.p[s.winner].id)} wins`) : won ? "Victory" : "Defeat", "", outcomeKind === "loss" ? "red" : "");
      setTimeout(() => app.flows.finished({ session, state: s, meIdx, puzzleState, tally: { ...tally }, outcome: outcomeKind, watching, champion: myChamp }), 1400);
    } else if (s.over && !replaying() && ctx.kind === "relay" && !watching && result.open) {
      result.setDetail(`${s.turnNo} turns · ${me.life} life left · ${session.status}`);   // settlement status updates
    }
  }

  function flip() {
    if (replaying()) { session.flip(); return; }
    const ids = session?.state?.p.map((p) => p.id);
    if (ids) { session.you = ids.find((id) => id !== session.you); prev = null; render(); }
  }

  document.addEventListener("keydown", (e) => {
    if (el.hidden || e.target instanceof HTMLInputElement) return;
    if (e.key === "Escape") { if (inspector) { inspector.remove(); inspector = null; } else if (pick) { pick = null; render(); } else if (menu) { menu.remove(); menu = null; } else openMenu(); return; }
    if (!replaying()) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); stepTo(session.cursor - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); stepTo(session.cursor + 1); }
    else if (e.key === " ") { e.preventDefault(); vb.play.click(); }
  });
  // A click on empty battlefield cancels a pick.
  board.addEventListener("click", (e) => { if (pick && (e.target === board || e.target.classList?.contains("lane"))) { pick = null; render(); } });

  return {
    id: "match", el, noBack: true,
    /** Attach a session. ctx: { kind: practice|gauntlet|puzzle|relay|replay|watch, label, opponent, detail, mine, foe } */
    attach(next, context) {
      session?.close?.();
      session = next; ctx = context; pick = null; prev = null; recent = []; announcedTurn = null; finishedOnce = false;
      tally = { dealt: 0, taken: 0, played: 0, kills: 0 };
      result.hide(); menu?.remove(); menu = null; feed.replaceChildren();
      viewbar.hidden = !viewing();
      dock.hidden = viewing();
      el.classList.toggle("viewing", viewing());
      session.onChange(render);
      placeControls();
      render();
    },
    detach() { session?.close?.(); session = null; menu?.remove(); menu = null; },
    get session() { return session; },
    result,
    render,
    /** Retry a puzzle in place. */
    retry() { result.hide(); finishedOnce = false; prev = null; recent = []; tally = { dealt: 0, taken: 0, played: 0, kills: 0 }; session.retry(); },
    enter() { app.arena.setMood("battle"); stagger(hand); },
    toast,
  };
}
