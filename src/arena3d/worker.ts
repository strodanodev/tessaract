/**
 * The 3D arena's Web Worker: Rapture Chess's stage and realms rendered on an OffscreenCanvas the page hands over, so
 * three.js, the model parse, shader compiles and every frame stay off the main thread and never stall the menus or
 * the battle. Bundled by scripts/build-arena3d.mjs into web/arena3d.js; web/ui/arena.js starts it.
 *
 * Page → worker: init { canvas, width, height, dpr, coarse, still, base, realm, mood }, size, realm, mood, quake, visible,
 *   board { rect } (the battle board's box on screen, CSS px, or null).
 * Worker → page: ready { gpu, ms }, failed { reason }, tooSlow, stats { fps, frameMs, drawCalls, triangles, pixelRatio }.
 */
import { Realm, type RealmId } from './realm';
import { type Mood, Stage } from './stage';

type In =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number; coarse: boolean; still: boolean; base: string; realm: RealmId; mood: Mood }
  | { type: 'size'; width: number; height: number; dpr: number }
  | { type: 'realm'; id: RealmId }
  | { type: 'mood'; mood: Mood }
  | { type: 'quake' }
  | { type: 'board'; rect: { x: number; y: number; w: number; h: number } | null }
  | { type: 'visible'; visible: boolean };

const post = (m: unknown): void => (self as unknown as Worker).postMessage(m);
let stage: Stage | null = null;
let realm: Realm | null = null;

async function init(m: Extract<In, { type: 'init' }>): Promise<void> {
  const t0 = performance.now();
  try {
    stage = new Stage(m.canvas, { still: m.still, coarse: m.coarse, width: m.width, height: m.height, dpr: m.dpr });
  } catch (e) {
    post({ type: 'failed', reason: `no WebGL in a worker (${(e as Error).message})` });
    return;
  }
  // A software renderer compiles shaders on the CPU and can't hold a frame rate: leave the CSS arena in place.
  const gpu = stage.gpuName();
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) { stage.dispose(); stage = null; post({ type: 'failed', reason: `software rendering (${gpu})` }); return; }
  const t1 = performance.now();
  stage.onTooSlow = () => post({ type: 'tooSlow' });
  realm = new Realm(stage, m.base);
  stage.setMood(m.mood);
  stage.start();
  if (!(await realm.load(m.realm))) { stage.dispose(); stage = null; post({ type: 'failed', reason: `arena model ${m.realm} unavailable` }); return; }
  post({ type: 'ready', gpu, ms: { stage: Math.round(t1 - t0), realm: Math.round(performance.now() - t1) } });
  setInterval(() => { if (stage) post({ type: 'stats', stats: stage.getStats() }); }, 2000);
}

self.onmessage = (e: MessageEvent<In>): void => {
  const m = e.data;
  if (m.type === 'init') { void init(m); return; }
  if (!stage) return;
  if (m.type === 'size') stage.setSize(m.width, m.height, m.dpr);
  else if (m.type === 'realm') void realm?.load(m.id);
  else if (m.type === 'mood') stage.setMood(m.mood);
  else if (m.type === 'quake') stage.quake();
  else if (m.type === 'board') stage.board = m.rect;
  else if (m.type === 'visible') stage.hidden = !m.visible;
};
