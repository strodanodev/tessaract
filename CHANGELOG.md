# Changelog

Every rules or card change ships under a new `rulesetId`, so a game built on an older Deckwright keeps replaying exactly as it did.

## 0.9.11 (2026-11-06): phone rules strip and page polish

No rules change: every ruleset replays exactly as before.

- **Phones:**
  - a strip above the hand reads out the picked card's rules. With nothing picked, it shows "Tap a card to play it · hold it to read it";
  - the Gauntlet ladder shows all eight foes as a 4×2 grid, with brighter preview silhouettes.
- **Card art:** rendered illustrations are framed centrally and enlarged on unit tokens, so they read at board size.
- **Result text:** life is floored at 0, so it no longer says "-1 life left".
- **Tests:** the relay test reads Alice's seat instead of assuming seat 0. Seats follow hello order, so it was flaky.

## 0.9.10 (2026-11-06): card illustrations, a stone table and an arena grade

No rules change: every ruleset replays exactly as before.

- **Card illustrations:**
  - a game can name art for cards without a painting in an optional `assets/cards/art.json` (`{ "<card id>": "<file>" }`);
  - a card's art comes from its token's painting, then its `art`, then `art.json`, and otherwise falls back to the generated sigil;
  - local art paths reject schemes, `//host` and `..`.
- **The 3D table:**
  - a carved stone stadium table stands on a pedestal at the centre of the dais, with a gilt band and a glowing groove;
  - the page posts the board's on-screen box to the arena worker (a new `board` message), and the table is scaled and moved to sit under it;
  - the board's mat is semi-transparent, so the stone shows through.
- **Light and post:**
  - ambient occlusion (GTAO, half resolution, desktop only);
  - a final grade with a per-realm shadow tint, vignette and grain;
  - embers glow hotter, and the title camera sits lower;
  - the battle camera is lower and further back: a three-quarter view of the arena round the table.
- **Cards and hand:** long rules text steps down a size, and a fanned hand overlaps less.
- **Arena cost:** about 2.5–3.2 ms a frame on a GPU, with no main-thread blocking. The arena bundle is 183 KB gzipped.

## 0.9.9 (2026-11-06): named arena files

No rules change: every ruleset replays exactly as before.

- **A game can name its arena files.** `assets/arena/arena.json` maps each realm to its GLB, for example `{ "realms": { "valhalla": "valhalla.2.glb" } }`. Both the arena worker and the page read it. A rebuilt arena can then ship under a new file name, past a long-lived asset cache.
- **Without the file**, the arena is `<realm>.glb`, as before.

## 0.9.8 (2026-11-06): the battle look, statues and an art pass

No rules change: every ruleset replays exactly as before.

- **The battle table:**
  - the board is a tilted 3D table, with slots lying flat and units standing up;
  - units fill from the centre, and a glowing rune circle (`ui/runes.js`) rings the table, sharing its outline at every size;
  - slots are red on the enemy's side and blue on yours, and the table has a carved stone surface with a centre medallion;
  - the player plates are steel-framed stone with a blue life gem for you, hero powers glow in their element's colour, and a bronze gear sits behind End turn;
  - the battle camera is steeper, with the table at a 26° tilt.
- **The 3D arena:**
  - games may stand statues round the arena: `assets/arena/statues.json` lists GLBs and a ring per realm. They're skipped on phones;
  - Valhalla gets a stepped octagonal stone rim round the dais and cooler, teal light;
  - the stone gets carved relief, which fades out at a distance so it doesn't flicker;
  - Underworld crystals are glossy, faceted and ember red, its lava flows down the falls, and its ember bands glow deep orange;
  - the title camera sits lower and looks across the arena.
- **Cards and pages:**
  - spell and relic art shows an emblem for what the card does, and relics set it in a hex socket;
  - gems, badges and stat tiles use Inter with tabular figures, so 11 no longer reads as "II";
  - long card names step down a size instead of being cut off;
  - before a run, the Gauntlet shows shadowed, day-seeded foes, and champion portraits shimmer while they load.
- **Readability and phones:**
  - the narration has a backing, and enemy attacks read "their X";
  - the hand fan stays on screen, and stats with small ranges show as pips;
  - on phones, units fit their frame and the hand fades at the edge to show it scrolls;
  - replays use a smaller hand, and champion select hides the big card on screens 700px tall or less.
- **Arena cost:** about 1.3–1.8 ms a frame on a GPU, with no main-thread blocking.

## 0.9.7 (2026-10-25): the battle layout, rebuilt

No rules change: every ruleset replays exactly as before.

- **The board is seated in the arena:** the lanes sit on a gilt-rimmed table mat, with contact shadows under the units.
- **Hero plates:** compact plates of up to 640px, with 80px portraits that break out of them.
- **Bigger units:** on wide screens the turn medallion moves to the top-left, so the board gains a row and units grow to `clamp(72px, 18vh, 160px)`.
- **Low life:** a plate turns red below a quarter of its champion's life (or at 5). When it's your own champion, the screen edges pulse as well.
- **Fixes from the third review:**
  - phone chips and hand names no longer clip;
  - the replay bar no longer covers the hand's stat gems;
  - the result glow, tag size, champion-select spacing and profile mini card are corrected.

## 0.9.6 (2026-10-25): card frames, illustrated pages and arena light

No rules change: every ruleset replays exactly as before.

- **Card frames are art-directed:**
  - a chamfered name ribbon edged in the rarity's colour;
  - a bevelled art window;
  - the type line between hairlines;
  - framed rules text a size larger, with keywords in gold and trigger labels in the element's colour.
- **Pages:**
  - the Gauntlet shows a ladder of eight foe portraits, seeded by the run: won stages gilded, the next lit, a lost one red;
  - the daily puzzle has an illustrated banner;
  - the profile opens on a hero section with your top champion and record.
- **The 3D arena sits in its light:**
  - static shadows, rendered once per realm load and cast by chosen materials only (off on phones);
  - about 640 GPU-animated motes in one draw: dust in Valhalla, embers in the Underworld;
  - about 1.1 ms a frame on a GPU (was 0.5), 25 draws, no main-thread blocking.
- **Fixes:**
  - your own replays read "Your turn", "Your champion" and "You win" (0.9.5 printed "You's turn" and "You wins");
  - the Gauntlet's first stage no longer promises "a stronger deck than the last".

## 0.9.5 (2026-10-25): polish from a second review

No rules change: every ruleset replays exactly as before.

- **Cards:**
  - hand cards no longer cover each other's stats;
  - keyword tags stack inside the unit;
  - the shield bubble follows the token's shape and sits under the stat gems.
- **Screens:**
  - the result overlay is fully opaque;
  - the versus screen names both champions;
  - the title's featured champion has a scrim behind it.
- **Wording:** your own replays call you "You", and attacks read "Your X attacked…".
- **Phone:** the gems on hand cards are no longer clipped.

## 0.9.4 (2026-10-25): art for cards without a painting

No rules change: every ruleset replays exactly as before.

- **Spells, relics and tokens without art get an illustration** instead of a stock icon. `ui/sigil.js` draws a seeded SVG scene per card:
  - god rays and a rune circle in the element's colour;
  - the element's motif and the card type's emblem;
  - drifting embers.
- The layout is seeded by the card, so every card looks different and always the same.
- No art files are involved, and only numbers and fixed markup go into the SVG.

## 0.9.3 (2026-10-25): a weathered arena

No rules change: every ruleset replays exactly as before.

- **The 3D arena stops looking like greybox.** Its untextured surfaces (bone, obsidian, gold, banners, stone) get procedural weathering (`weather()` in `src/arena3d/realm.ts`): world-space noise varies colour and roughness, and grime darkens toward the floor. It needs no textures or UVs.
- **Tuning:** bone is darker, the runes no longer read as a white band from the battle camera, and the crystals glow a little more.
- **Cost:** about 0.5 ms a frame on a GPU, with the same 25 draws and no main-thread blocking.

## 0.9.2 (2026-10-25): the re-review

No rules change: every ruleset replays exactly as before.

- The 3D arena blurs behind menu pages.
- Champion select keeps "Enter the arena" in a fixed footer.
- The result screen says "You conceded" after a concede.
- The Gauntlet's loading tip shows only in the Gauntlet.
- "1 match", not "1 matches".
- More phone layout fixes.

## 0.9.1 (2026-10-25): the visual review

No rules change: every ruleset replays exactly as before.

- **Client, from an independent visual review:**
  - the battle board: slot plates, bigger units, hero frames, hand sizing, and the replay bar no longer clips the hand;
  - the rarity gem moves off card names, and cards without art get glowing element art;
  - the phone layout: the versus screen, champion select and the HUD dock;
  - the result screen lays out its primary button, secondary row and links; it no longer repeats the turn count;
  - centred short screens, stat grids, the deck panel's call to action, and the "Build your own" page no longer overflows.
- `?arena=css` keeps the CSS arena (for comparisons, or for players who prefer it).
- `scripts/profile-web.mjs --isolate` profiles each load in a fresh browser profile.

## 0.9.0 (2026-10-24): Deckwright is now Tessaract

No rules change: every ruleset replays exactly as before.

- **Renamed:** the package, the CLI (`tessaract`), the Claude Code plugin and skill (`/plugin install tessaract@tessaract`), the engine bundle (`web/engine/tessaract.js`) and the repo (github.com/strodanodev/tessaract).
  - `deckwright` still works as a CLI alias, and GitHub redirects the old repo URL.
  - Browser storage keys keep their `deckwright.` prefix, so players keep their decks, profiles and settings.
- **Products moved out:** Tessaract is the SDK only.
  - The Rapture game, its art, its collection snapshot and the arena models moved to Rapture TCG (github.com/strodanodev/rapture-tcg). Games without arena models keep the CSS arena.
  - The client in `web/` is the template `create` copies, built here with the starter game.
  - Tests and CI use a neutral generated sample collection (`test/fixtures/sample-duel.game.json`).
- `create` sets the page title to the game's title.
- `relay` defaults to the project's only `games/*.game.json` when `TCG_GAME` is unset.

## 0.8.0 (2026-10-24): the real arena

No rules change: every ruleset replays exactly as before.

**Rapture Chess's level, live.** The Valhalla and Underworld arenas are now the Blender-built models from Rapture Chess, rendered with three.js behind every screen:
- the realm's sky dome with aurora and stars, fog, and its key, rim and hemisphere lighting;
- the arena with its flowing lava shader and flickering fire;
- bloom on what is hot, and AgX tone mapping.

The camera circles the arena on the title screen and looks down over the dais in battle. The port is `src/arena3d` (stage, realm and a worker entry), bundled to `web/arena3d.js`.

**Off the main thread.** The arena renders in a Web Worker on an OffscreenCanvas: three.js, the model parse, shader compiles and every frame run there. The page only creates the canvas and relays size, visibility, realm, mood and hits.

**Loading**
- The 3D arena loads after the title screen, when the page is idle. It needs OffscreenCanvas WebGL and a real GPU, which the worker checks. Software renderers, data-saver mode and Safari keep the CSS arena; three.js's texture loading needs the DOM on Safari.
- The models were decoded from Draco and quantized (KHR_mesh_quantization), so three.js reads them with no decoder, WebAssembly or worker.
- Shaders compile in the background (`compileAsync`).
- If anything fails, or the frame rate can't hold even at reduced resolution, the client keeps the CSS arena. `#arena[data-fallback]` says why.
- The only security-policy change: `connect-src` allows `blob:`, which three.js uses to decode the models' embedded textures.

**Cost control**
- Resolution steps from 1.5× down to 0.75× if the frame rate drops.
- The arena draws at 30 fps behind the battle and nothing in a hidden tab.
- `window.deckwright.arenaStats()` reports frame rate, frame time, draw calls and triangles.

**Measured** (`scripts/profile-web.mjs`, 5 warm loads each, Intel Iris Xe):
- **Main-thread blocking after the title:** from about 0.45 s locally and 1 s live (median) when the arena ran on the main thread, to **0 ms** with the worker, on both the GPU and the software path.
- **Frame cost:** about 157 fps headless on the GPU, 0.4–1.4 ms of CPU per frame, 24–25 draw calls.

**Profiling:** `node scripts/profile-web.mjs <url> [--runs 5] [--gpu] [--detail]`. It drives headless Chrome over the DevTools protocol, with one cold load and N warm ones, and reports:
- time to the title screen, page-ready and load times;
- JS bytes;
- main-thread long tasks after the title, attributed to `arena:*` marks;
- which arena ran, and its frame stats.

**Battle layout:** the fanned hand hangs below your plate instead of covering it.

## 0.7.0 (2026-10-24): the game client

No rules change: every ruleset replays exactly as before. The web client is rebuilt as a game, in Rapture Chess's design.

**Screens**
- A boot screen and a title screen over a live arena: the gilded logo, the main menu, and a featured champion card with foil and tilt.
- Champion select: framed cards by rarity, stat meters, the hero power, the battlefield, and the bot's strength (easy, normal, hard).
- The deck forge: real card faces, your deck, a mana curve, and suggested or wallet decks.
- The Gauntlet's road, the daily puzzle and the profile as their own pages, plus "Build your own" on the demo.
- A versus loader (a two-player match waits there for the opponent), then the battle.
- Gilded iris transitions between screens.

**Battle**
- Plates for both champions (portrait, life, energy, hero power, relics), a turn medallion and narration.
- Arched unit tokens on the dais, and a fanned hand that lifts on hover.
- The end-turn medallion, turn banners, damage floaters, the fallen feed, a battle menu (Esc), and the replay and spectator dock.
- A result screen with the match in four numbers, your champion, Rematch, Watch replay and Share replay.

**The arena:** Rapture Chess's two realms, Valhalla and the Underworld, as layered CSS and SVG: sky, aurora or lava glow, skyline, a perspective floor with the octagonal dais, pillars, braziers and embers. It needs no 3D engine.

**Architecture**
- `web/app.js` is now only the wiring: data, wallet, profile and the flows between screens.
- `web/ui/`: a DOM helper, the router, the arena, the cards and one module per screen.
- `web/styles/`: theme, arena, cards, screens and battle.
- Loading: `index.html` preloads every module and the game data, so they download in parallel instead of one import level at a time (a test keeps the list equal to the files). Boot waits only for the featured champion's art, not six images. A `deckwright:title` performance mark times the title screen.
- `web/meta.js` and `web/app.css` are gone. Scaffolded games get `ui/` and `styles/`. Without the funnel marker in `index.html`, the client leaves out "Build your own" and credits Deckwright on the title screen.

## 0.6.0 (2026-10-24): the meta loop

No rules change: every ruleset replays exactly as before. Everything below runs in the browser, with no server.

- **Profile** (`src/meta/profile.ts`):
  - match history with replays, win rate, current and best streak, records per champion, Gauntlet bests, and the daily-puzzle streak;
  - kept in local storage under the game's rulesetId without its version, so a profile survives balance patches.
- **Gauntlet** (`src/meta/gauntlet.ts`):
  - eight seeded bot matches, with rising opponent stats, rarer opponent decks, and easy, then normal, then hard bots;
  - after each win you pick a reward: a card that replaces your weakest (declared-deck games), or a blessing of +12,000 to one champion stat;
  - one loss ends the run.
  - Tuned so a normal-bot player wins stages 3–7 about 50–75% of the time; the final boss is the wall.
- **Daily puzzle** (`src/meta/puzzle.ts`):
  - "win this turn" from the winner's final turn of a seeded bot match, so it's always solvable and the same for everyone on a UTC date;
  - random playouts rate its difficulty;
  - a solution is an ordinary match record.
- **Bot levels:** `greedyBot(rules, { level: 1 | 2 | 3 })`. Easy is a seeded pick among its top three moves; hard looks one action deeper. Bot opponents can be given a deck (`LocalBotSession` `foeDeck`). New `PuzzleSession`.
- **Site:** a mode bar (Practice, Gauntlet, Daily puzzle, Profile); finished matches go into the profile, with Watch buttons for their replays.

## 0.5.0 (2026-10-24): replays and spectators

No rules change: every ruleset replays exactly as before.

**Replays**
- Match records (`src/client/replay.ts`): the ruleset, seed, players, hydrated champions and input log. That is exactly what LitNode replays, so a record is also proof of a result.
- Share links: the record is compressed into the URL fragment (`#replay=…`), which browsers never send to a server.
- Every session has `record()`. The new `ReplaySession` rebuilds every state with the same rules and moves by move or by turn.
- Links are untrusted input: sizes are capped, shapes are checked, stats are normalized, and a record from another ruleset is refused.
- `deckwright replay <link | code | record.json>` prints a match's result, scores and a final-state digest. `--out` saves the record.

**Spectators**
- The relay accepts `{ t: 'watch' }`: a spectator gets the log so far, then every new entry, and can't act.
- `TCG_SPECTATORS` caps spectators (default 64; 0 turns watching off).
- `TCG_WATCH_DELAY_MS` holds entries back from spectators (default 0, or 2 minutes in ranked) against live coaching.
- A LitNode node's gateway forwards any connection for a room, so watching works for placed matches too.

**Site**
- Results have Watch replay and Share replay.
- Two-player matches have Copy watch link; `?relay=…&watch=1` opens the spectator view.
- A replay bar: play or pause, move by move or by turn (arrow keys and space), a scrubber, flip view and copy link.

## 0.4.0 (2026-10-24): the fun pass

**Rules**
- Effect library (`src/core/effects.ts`): every op is defined once (checks, targets, resolution, card text). New ops: `shield` and `summon`.
- Targets: chosen (`enemy`, `enemy-unit`, `own-unit`, `any-unit`) or automatic (`all-enemy-units`, `weakest-enemy`, `this`, and more).
- Keywords: `rush`, `lifesteal`, `shield`, `poison` and `elusive`, joining `guard` and `haste`.
- Unit abilities fire on `play` (can aim), `death` (can chain), `turnStart` and `attack`.
- Hero powers (`champion.powers`, action op 6): once per turn. Each champion's power is chosen by its card's element, its kind, or its highest stat.
- Draws mix the seed with the entropy of every accepted action up to the turn's start, so nobody can read draws ahead. Replays stay exact.

**Tools**
- `sim` prints fun targets and hero power win rates. `--strict` fails on any miss, and CI runs it.
- `import` applies a design kit: each element gets an archetype, with tiered keywords and abilities, element spells and relics, a token unit and a hero power. `--plain` skips it.
- The bot values keywords, sees lethal coming, and plays energy and draw cards.

**Games**
- `rapture-duel.v4`:
  - element hero powers (Lava Strike, Water Bolt, Earth Ward, Metal Forge);
  - life 20–26;
  - passes every fun target with suggested, random and base-stat decks.
- `starter-duel.v3` shows off the ability system, with life 18–24.

**Site:** card text comes from the effect library. Adds keyword tooltips, shields, hero power buttons with targeting, and powers in the champion picker.

## 0.3.0 (2026-10-23): trust and balance

**Champions and the relay**
- `normalizeStats` is the one way every surface turns a champion into stats. A missing champion or stat is 0, matching LitNode.
- The relay reads champion stats on chain and ignores what clients claim. In placed matches, the PlayerProfile wallet must own the champion.
- Owned-only decks (`TCG_OWNED=1`, the default for ranked): the relay rejects collection cards the wallet doesn't hold.

**Tools and rules**
- `sim --decks suggested|random|mixed` and `--stats random|base`, with per-card deck win rates.
- New optional rule `secondPlayerCards`.

**Games:** `rapture-duel.v3` (36-card decks) and `starter-duel.v2`, both with first-player wins of 45–55%.

## 0.2.0 (2026-10-23): wallet decks and the Claude Code plugin

- **Wallet decks:** `deckRules.mode: "declared"`. Decks are declared card by card in the match log. `rapture-duel.v2` has 30-card wallet decks.
- **Site:** a deck builder (suggested, wallet or manual) and a "Build your own" section.
- **Claude Code plugin:** install with `/plugin marketplace add strodanodev/deckwright`, then `/plugin install deckwright@deckwright`.
- **CI:** typecheck, tests, the engine bundle matching its source, and a create, sim and title smoke test.

## 0.1.0 (2026-10-23): first release

- One JSON file is a game. Any ERC-721 collection becomes cards, and ERC-6699 stats make champions.
- The browser, the match relay and a LitNode ruleset all run the same pure rules core, so every match replays.
- Commands: `create`, `new`, `snapshot`, `import`, `sim`, `title`, `web`, `dev`, `relay`.
