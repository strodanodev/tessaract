/**
 * The realms, ported from Rapture Chess (src/scene/realm.ts): Valhalla (the Alliance's hall of stone, gold and aurora)
 * and the Underworld (the Horde's basalt crater with a lava moat). Each is a Blender-built arena GLB plus a sky, fog
 * and lighting preset, and a couple of animated materials (flowing lava, flickering fire).
 *
 * A game names its arena files in assets/arena/arena.json ({ realms: { valhalla: "valhalla.2.glb", ... } }), so a
 * rebuilt arena can ship under a new name past a long-lived asset cache; without it, the file is <realm>.glb.
 *
 * A game may also stand statues round the arena: assets/arena/statues.json lists GLBs (in statues/) and a ring per
 * realm ({ files: [...], realms: { valhalla: { radius, height, offset?, ground? } } }: ground is the floor's height there). They stand on plinths facing the table,
 * in the realm's weathered stone, and skip phones. Valhalla's dais also gets a raised, stepped octagonal rim.
 *
 * The GLBs are the Rapture Chess arenas with their Draco compression decoded at build time and the meshes quantized
 * (KHR_mesh_quantization), so three.js reads them with no decoder, WebAssembly or worker.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SkyColors, Stage } from './stage';

export type RealmId = 'valhalla' | 'underworld';

interface StatueRing { radius: number; height: number; offset?: number; ground?: number }
interface StatueManifest { files: string[]; realms?: Partial<Record<RealmId, StatueRing>> }

interface Preset {
  sky: SkyColors;
  aurora: number;
  stars: number;
  key: { color: number; intensity: number; position: [number, number, number] };
  rim: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  envIntensity: number;
  floorRadius: number;
  motes: { color: number; rise: number; size: number; opacity: number };
  /** The hue the shadows take in the final grade (multiplied in, so 1 is neutral). */
  grade: number;
  /** Mountain silhouettes on the horizon, near and far (unlit, already blended toward the sky): depth past the level. */
  ridges: [number, number];
  /** The practical lights' colour and strength (braziers in Valhalla, the lava moat in the Underworld). */
  practical: { color: number; intensity: number };
}

const PRESETS: Record<RealmId, Preset> = {
  valhalla: {
    // fog in the horizon's own blue (it was near-black under a teal horizon: a hard seam where the ground ended)
    sky: { top: 0x060d16, bottom: 0x14283a, glow: 0x2f6f84, fog: 0x1b3346, fogDensity: 0.026 },
    aurora: 1, stars: 0.9,
    key: { color: 0xfff3e0, intensity: 2.4, position: [6, 12, 5] },
    rim: { color: 0x7fe6ff, intensity: 60 },
    hemi: { sky: 0x3a6878, ground: 0x14120e, intensity: 0.6 },
    envIntensity: 0.6, floorRadius: 9.05,
    motes: { color: 0xbff6ff, rise: 0.12, size: 1, opacity: 0.55 },
    grade: 0xd2f0ff,
    ridges: [0x0a141e, 0x132636],
    practical: { color: 0xff9a3c, intensity: 16 },
  },
  underworld: {
    // the fog is the horizon's own red and thick enough that the crater floor melts into it, with no hard edge
    sky: { top: 0x050102, bottom: 0x2a0806, glow: 0x7a1a08, fog: 0x3c0c06, fogDensity: 0.03 },
    aurora: 0, stars: 0.25,
    key: { color: 0xffd0b0, intensity: 1.8, position: [-5, 10, -6] },
    rim: { color: 0xff5a2a, intensity: 70 },
    hemi: { sky: 0x4a1a10, ground: 0x200404, intensity: 0.7 },
    envIntensity: 0.5, floorRadius: 0,
    motes: { color: 0xff7a2a, rise: 0.55, size: 1.2, opacity: 0.9 },
    grade: 0xffd2c0,
    ridges: [0x0e0302, 0x1c0504],
    practical: { color: 0xff5a1a, intensity: 12 },
  },
};

/** Multipliers on the textured stone: photo-real stone would otherwise outshine everything in front of it. */
const TINT: Record<string, number> = {
  vh_stone: 0x8e887c, vh_floor: 0x8a8274, vh_blocks: 0x6e675e,
  uw_basalt: 0x3e3236, uw_rock: 0x4e3e3a, uw_ash: 0x5e4e46,
};

export class Realm {
  readonly group = new THREE.Group();
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<RealmId, Promise<THREE.Group | null>>();
  private animated: THREE.ShaderMaterial[] = [];
  private fires: THREE.MeshStandardMaterial[] = [];
  /** Statues and the dais rim, rebuilt for each realm. */
  private readonly dressing = new THREE.Group();
  /** The battle table: fitted under the HTML board in battle (see fitTable), a smaller centrepiece on the title. */
  private table: THREE.Group | null = null;
  private tableSettled = false;   // its shadow is redrawn once each time it comes to rest
  private readonly ray = new THREE.Raycaster();
  private readonly tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TABLE_TOP);
  private statues: Promise<{ manifest: StatueManifest; models: THREE.Object3D[] } | null> | null = null;
  private files: Promise<Partial<Record<RealmId, string>>> | null = null;
  id: RealmId | null = null;
  /** The realm whose model is on screen, and who waits for the current one to be (see shown()). */
  private shownId: RealmId | null = null;
  private waiting: Array<() => void> = [];

  constructor(private readonly stage: Stage, private readonly base: string) {
    stage.scene.add(this.group);
    stage.onUpdate((dt, t) => this.update(dt, t));
  }

  /** Light the stage for a realm at once, and swap in its arena when the model has loaded (each loads once). */
  async load(id: RealmId): Promise<boolean> {
    if (this.id === id) return true;
    this.id = id;
    let model = this.cache.get(id);
    if (!model) {
      this.files ??= fetch(`${this.base}arena.json`).then((r) => (r.ok ? r.json() : null)).then((m: { realms?: Partial<Record<RealmId, string>> } | null) => m?.realms ?? {}, () => ({}));
      model = this.files.then((files) => this.loader.loadAsync(`${this.base}${files[id] ?? `${id}.glb`}`)).then(async (g) => {
        this.dress(g.scene, id);
        // compile its shaders off the main thread (KHR_parallel_shader_compile) before it is ever drawn, so the first
        // frame with the arena doesn't stall the menu while the driver compiles
        await this.stage.renderer.compileAsync(g.scene, this.stage.camera, this.stage.scene);
        return g.scene;
      }, (e) => { console.warn('[arena] realm failed', id, e); this.cache.delete(id); return null; });
      this.cache.set(id, model);
    }
    const scene = await model;
    if (!scene || this.id !== id) return !!scene;
    // the sky, light and grade change with the model, never ahead of it (a red sky over Valhalla's stone)
    const p = PRESETS[id], s = this.stage;
    s.setSky(p.sky, p.aurora, p.stars);
    s.keyLight.color.set(p.key.color); s.keyLight.intensity = p.key.intensity; s.keyLight.position.set(...p.key.position);
    s.rimLight.color.set(p.rim.color); s.rimLight.intensity = p.rim.intensity;
    s.hemi.color.set(p.hemi.sky); s.hemi.groundColor.set(p.hemi.ground); s.hemi.intensity = p.hemi.intensity;
    s.scene.environmentIntensity = p.envIntensity;
    s.setFloorRadius(p.floorRadius);
    s.setMotes(p.motes.color, p.motes.rise, p.motes.size, p.motes.opacity);
    s.setGrade(p.grade);
    this.group.clear();
    this.animated = scene.userData.animated ?? [];
    this.fires = scene.userData.fires ?? [];
    this.group.add(scene, this.dressing);
    this.shownId = id;
    if (this.shownId === this.id) for (const w of this.waiting.splice(0)) w();
    this.stage.refreshShadows();
    void this.dressRealm(id);
    return true;
  }

  /**
   * Resolves once the current realm's model is on screen. A realm switch while the first model loads makes that
   * load step aside (it is no longer current), so "loaded" is not "showing": the page must not swap its CSS arena
   * for an empty stage.
   */
  shown(): Promise<void> {
    return this.shownId === this.id ? Promise.resolve() : new Promise((resolve) => this.waiting.push(resolve));
  }

  /** The statue models and their manifest, fetched once; null if the game has none. */
  private loadStatues(): Promise<{ manifest: StatueManifest; models: THREE.Object3D[] } | null> {
    this.statues ??= fetch(`${this.base}statues.json`).then((r) => (r.ok ? r.json() : null)).then(async (manifest: StatueManifest | null) => {
      if (!manifest?.files?.length) return null;
      const models = await Promise.all(manifest.files.map((f) => this.loader.loadAsync(`${this.base}statues/${f}`).then((g) => g.scene, () => null)));
      const ok = models.filter((m): m is THREE.Group => !!m);
      return ok.length ? { manifest, models: ok } : null;
    }).catch(() => null);
    return this.statues;
  }

  /** Stand this realm's statues on their plinths and raise the dais rim; then re-render the static shadows. */
  private async dressRealm(id: RealmId): Promise<void> {
    this.dressing.clear();
    const p = PRESETS[id];
    const stone = (color: number): THREE.MeshStandardMaterial => weather(new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.04, envMapIntensity: 0.3 }), 1.7, 0.5, 0.35, 0.45);
    if (p.floorRadius > 0) this.dressing.add(daisRim(p.floorRadius, stone(id === 'valhalla' ? 0x56565a : 0x3a3034)));
    // the battle table: a carved stone slab on a pedestal at the centre of the dais, gilt-edged; the HTML board lies
    // over it in battle, and on the title it is the arena's centrepiece
    this.table = battleTable(stone(id === 'valhalla' ? 0x3c5a60 : 0x4a2e2a), stone(id === 'valhalla' ? 0x2c2c32 : 0x231a1c), id === 'valhalla' ? 0x7fe6ff : 0xff6a2a);
    this.table.position.y = this.stage.inBattle ? 0 : id === 'underworld' ? TABLE_ALTAR : TABLE_SINK;
    this.dressing.add(this.table);
    const found = this.stage.coarse ? null : await this.loadStatues();
    const ring = found?.manifest.realms?.[id];
    if (found && ring && this.id === id) {
      const plinth = stone(id === 'valhalla' ? 0x4a4a4e : 0x5a4842);
      const block = new THREE.BoxGeometry(1.5, 1.1, 1.5), slab = new THREE.BoxGeometry(1.85, 0.2, 1.85);
      const n = found.models.length;
      for (let i = 0; i < n; i++) {
        const a = (ring.offset ?? 0) + (i / n) * Math.PI * 2;
        // the statue GLBs are static (their pose is baked when they're made), so a plain clone is safe
        const statue = found.models[i].clone(true);
        this.dressStatue(statue);
        const box = new THREE.Box3().setFromObject(statue), size = box.getSize(new THREE.Vector3());
        const k = ring.height / Math.max(0.001, size.y);
        statue.scale.setScalar(k);
        statue.position.y = 1.3 - box.min.y * k;
        const base = new THREE.Mesh(block, plinth), top = new THREE.Mesh(slab, plinth);
        base.position.y = 0.55; top.position.y = 1.2;
        const spot = new THREE.Group();
        spot.add(base, top, statue);
        spot.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
        spot.position.set(Math.sin(a) * ring.radius, ring.ground ?? 0, Math.cos(a) * ring.radius);
        spot.lookAt(0, ring.ground ?? 0, 0);
        this.dressing.add(spot);
      }
    }
    // the title camera faces the first statue across the dais
    if (ring) this.stage.menuAngle = (ring.offset ?? 0) + Math.PI;
    this.dressing.add(ridges(46, 1.5, 5.5, p.ridges[0], 3), ridges(66, 3, 9, p.ridges[1], 7));   // low, inside the horizon's glow: silhouettes, not a wall
    this.lightFlames(id);
    if (this.id !== id) return;
    await this.stage.renderer.compileAsync(this.dressing, this.stage.camera, this.stage.scene);
    this.stage.refreshShadows();
  }

  /** Swap the Blender placeholder materials for the stage's: animated lava, glowing fire, worn stone and metal. */
  /**
   * The statues are the champions themselves: they keep their own chrome, gold and bone (as in the collection's art),
   * double-sided because their bodies are thin faceted shells, and only join the shadows. The arena's stone
   * weathering made them grey and, single-sided, tore their bodies into shards.
   */
  private dressStatue(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true; o.receiveShadow = true;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.side = THREE.DoubleSide;
        // polished, not mirror-bright: at the source's gloss every facet's highlight blooms into a white blob
        if (m instanceof THREE.MeshStandardMaterial && /chrome|statue/.test(m.name)) { m.envMapIntensity = 0.7; m.roughness = Math.max(m.roughness, 0.3); }
      }
    });
  }

  private dress(root: THREE.Object3D, id: RealmId): void {
    const mats = new Map<string, THREE.Material>();
    const animated: THREE.ShaderMaterial[] = [], fires: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // the set grounds itself in the static shadow map. Each GLB mesh is one material across the whole arena, so
      // casting is chosen by material: the overhead beams and banners and the crater wall would shade the whole dais,
      // and lava is its own light
      o.castShadow = !/lava|dark|banner|basalt|floor|ash|fire|ember/.test((o.material as THREE.Material).name);
      o.receiveShadow = true;
      const src = o.material as THREE.MeshStandardMaterial;
      let m = mats.get(src.name);
      if (!m) {
        m = this.material(src, id, animated, fires);
        // a double-sided source stays double-sided: thin shells (the statues' faceted bodies) lose every far facet otherwise
        if (src.side === THREE.DoubleSide && !(m instanceof THREE.ShaderMaterial)) m.side = THREE.DoubleSide;
        mats.set(src.name, m);
      }
      o.material = m;
    });
    root.userData.animated = animated;
    root.userData.fires = fires;
  }

  private material(src: THREE.MeshStandardMaterial, id: RealmId, animated: THREE.ShaderMaterial[], fires: THREE.MeshStandardMaterial[]): THREE.Material {
    const n = src.name;
    if (/lava/.test(n)) { const m = lava(); animated.push(m); return m; }
    if (/fire|ember/.test(n)) {
      const m = src.clone();
      // fire flickers hot; the spires' ember bands only smoulder (at fire's heat, bloom turns them into white bars)
      m.userData.heat = /fire/.test(n) ? 3.0 : 0.9;
      m.emissiveIntensity = m.userData.heat;
      m.color.set(0x1a0805);
      if (!/fire/.test(n)) m.emissive.set(0xff2a00);
      else m.emissive.set(0xff7424);   // the source's pale gold tone-mapped to a beige egg; orange stays a flame   // embers glow a deep orange: brighter or paler, AgX washes them to salmon
      fires.push(m);
      return m;
    }
    // runes glow, but under the bloom threshold's knee: brighter reads as a white band from the battle camera
    // a soft glow: at full white the pillar bands read as tape
    if (/rune/.test(n)) { const m = src.clone(); m.emissiveIntensity = 0.75; m.emissive.set(id === 'valhalla' ? 0x58c4ff : 0xff6a2a); m.color.set(0x05050a); return m; }
    if (src.map) {
      // Poly Haven stone, ground and rock: keep the colour and normal maps, darken them to the realm's mood, matte
      const m = src.clone();
      m.color.set(TINT[n] ?? 0x8a8478);
      m.metalnessMap = null; m.roughnessMap = null;
      m.metalness = 0; m.roughness = 0.9; m.envMapIntensity = 0.25;
      return m;
    }
    // crystals: glossy, faceted and iridescent, lit from within, instead of flat glowing triangles
    if (/crystal/.test(n)) {
      // deep ember red (pale pink blooms to white, and AgX turns orange-pink to salmon)
      const glow = id === 'underworld' ? new THREE.Color(0xc41e04) : src.emissive.clone().multiply(new THREE.Color(0.85, 0.55, 0.4));
      return new THREE.MeshPhysicalMaterial({ color: glow.clone().multiplyScalar(0.3), emissive: glow, emissiveIntensity: 0.7, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.7, iridescenceIOR: 1.6, envMapIntensity: 2.4, flatShading: true });
    }
    // the untextured surfaces get weathering (see weather()), or they read as flat greybox next to the photo stone
    if (/banner/.test(n)) return weather(new THREE.MeshStandardMaterial({ color: 0x14284a, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), 5, 0.35, 0.2, 0.25);
    if (/gold/.test(n)) return weather(new THREE.MeshStandardMaterial({ color: 0xffbf5e, roughness: 0.32, metalness: 1, envMapIntensity: 1.2 }), 3, 0.3, 0.35, 0.3);
    if (/obsidian/.test(n)) return weather(new THREE.MeshPhysicalMaterial({ color: 0x08060a, roughness: 0.4, metalness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.6 }), 1.4, 0.55, 0.3, 0.15);   // volcanic glass, dark: glossier streaks read as melted chocolate
    if (/statue|chrome|accent/.test(n)) return weather(new THREE.MeshStandardMaterial({ color: id === 'valhalla' ? 0x7c8687 : 0x5e4c48, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.4 }), 2.6, 0.45, 0.45, 0.55);
    if (/bone/.test(n)) return weather(new THREE.MeshStandardMaterial({ color: id === 'underworld' ? 0x56483a : 0x80735c, roughness: 0.82, metalness: 0 }), 2.2, 0.6, 0.75, 0.6);   // soot-stained, or it reads as flat beige
    if (/basalt/.test(n)) return weather(new THREE.MeshStandardMaterial({ color: 0x15111a, roughness: 0.9, metalness: 0.08 }), 1.6, 0.5, 0.3, 0.55);
    if (/dark/.test(n)) return weather(new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: 0.7, metalness: 0.15 }), 2, 0.45, 0.3);
    return weather(new THREE.MeshStandardMaterial({ color: id === 'valhalla' ? 0x4a443c : 0x2a2226, roughness: 0.92, metalness: 0.05, envMapIntensity: 0.35 }), 1.8, 0.5, 0.45, 0.55);
  }

  /**
   * Fit the table under the HTML board: cast rays through the middle of each edge of the board's box on screen onto
   * the table-top plane, and scale and move the table to that footprint, so the stone lies exactly under the board at
   * any viewport. Without a board (the title), it is a smaller centrepiece. Eased, so layout changes glide.
   */
  private fitTable(dt: number): void {
    if (!this.table) return;
    const s = this.stage, b = s.inBattle ? s.board : null;
    // outside battle the table waits below the dais, so the title shows the level, not a bare slab; it rises for a match
    // (the Underworld's dais is a pit: there the table settles into it as an altar rather than vanishing)
    let sx = 0.7, sz = 0.7, px = 0, pz = 0, py = this.id === 'underworld' ? TABLE_ALTAR : TABLE_SINK;
    if (b && b.w > 0 && b.h > 0) {
      const hit = (x: number, y: number): THREE.Vector3 | null => {
        this.ray.setFromCamera(s.toNdc(x, y), s.camera);
        return this.ray.ray.intersectPlane(this.tablePlane, new THREE.Vector3());
      };
      const l = hit(b.x, b.y + b.h / 2), r = hit(b.x + b.w, b.y + b.h / 2), top = hit(b.x + b.w / 2, b.y), bot = hit(b.x + b.w / 2, b.y + b.h);
      if (!l || !r || !top || !bot) return;
      sx = (Math.abs(r.x - l.x) / TABLE_L) * 1.03;   // a hair larger: the gilt band frames the board's edge
      sz = (Math.abs(bot.z - top.z) / TABLE_D) * 1.03;
      px = (l.x + r.x) / 2; pz = (top.z + bot.z) / 2; py = 0;
    }
    const k = Math.min(1, dt * 6), T = this.table;
    T.scale.x += (sx - T.scale.x) * k; T.scale.z += (sz - T.scale.z) * k;
    T.position.x += (px - T.position.x) * k; T.position.z += (pz - T.position.z) * k;
    T.position.y += (py - T.position.y) * Math.min(1, dt * 2.5);
    T.visible = T.position.y > TABLE_SINK + 0.02;
    const settled = Math.abs(py - T.position.y) < 0.004 && Math.abs(sx - T.scale.x) < 0.004 && Math.abs(px - T.position.x) < 0.01;
    if (settled && !this.tableSettled) this.stage.refreshShadows();
    this.tableSettled = settled;
  }

  private glows: THREE.Sprite[] = [];

  /**
   * Flames that glow and light the hall: an additive glow over every flame in the model (found by clustering the fire
   * mesh's vertices), and the four practical lights on the lowest ones (the braziers), or round the lava moat.
   */
  private lightFlames(id: RealmId): void {
    const p = PRESETS[id], model = this.group.children.find((c) => c !== this.dressing);
    const spots = new Map<string, { sum: THREE.Vector3; n: number }>();
    const v = new THREE.Vector3();
    model?.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !/fire/.test((o.material as THREE.Material).name)) return;
      const pos = o.geometry.getAttribute('position');
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const key = `${Math.round(v.x / 1.5)},${Math.round(v.z / 1.5)}`;
        const s = spots.get(key) ?? { sum: new THREE.Vector3(), n: 0 };
        s.sum.add(v); s.n++; spots.set(key, s);
      }
    });
    const flames = [...spots.values()].map((s) => s.sum.divideScalar(s.n));
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: p.practical.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.85 });
    this.glows = flames.map((f) => { const g = new THREE.Sprite(mat); g.position.copy(f); g.position.y += 0.15; g.scale.setScalar(f.y < 3 ? 2.6 : 2.0); g.userData.base = g.scale.x; return g; });
    if (this.glows.length) this.dressing.add(...this.glows);
    // the practical lights: on the lowest flames (braziers), else round the lava moat
    const low = flames.filter((f) => f.y < 3).sort((a, c) => Math.atan2(a.z, a.x) - Math.atan2(c.z, c.x)).slice(0, 4);
    const ring = (k: number): THREE.Vector3 => new THREE.Vector3(Math.cos(Math.PI / 4 + k * Math.PI / 2) * 7.6, 0.4, Math.sin(Math.PI / 4 + k * Math.PI / 2) * 7.6);
    const at = low.length ? low.map((f) => f.clone().setY(f.y + 0.6)) : [0, 1, 2, 3].map(ring);
    this.stage.practicals.forEach((l, i) => {
      const spot = at[i];
      l.color.set(p.practical.color);
      l.userData.base = spot ? p.practical.intensity : 0;
      l.intensity = l.userData.base;
      if (spot) l.position.copy(spot);
    });
  }

  private update(dt: number, t: number): void {
    this.fitTable(dt);
    const fog = this.stage.scene.fog as THREE.FogExp2;
    for (const m of this.animated) { m.uniforms.time.value = t; (m.uniforms.fogColor.value as THREE.Color).copy(fog.color); m.uniforms.fogDensity.value = fog.density; }
    for (let i = 0; i < this.fires.length; i++) { const heat = this.fires[i].userData.heat ?? 3.0; this.fires[i].emissiveIntensity = heat * (1 + 0.27 * Math.sin(t * 7 + i * 1.7) * Math.sin(t * 3.1 + i)); }
    // flames flicker: their glows breathe and the practical lights waver about 20%
    for (let i = 0; i < this.glows.length; i++) this.glows[i].scale.setScalar(this.glows[i].userData.base * (1 + 0.12 * Math.sin(t * 6.3 + i * 2.1) * Math.sin(t * 2.7 + i)));
    this.stage.practicals.forEach((l, i) => { l.intensity = (l.userData.base ?? 0) * (1 + 0.2 * Math.sin(t * 7.1 + i * 1.9) * Math.sin(t * 3.3 + i * 0.7)); });
  }
}

/** The battle table's size (m) before it is fitted, and the height of its top. */
const TABLE_L = 15, TABLE_D = 7.6, TABLE_TOP = 0.74;
/** Where the table waits, below the dais floor, when there is no battle. */
const TABLE_SINK = -1.05;
/** Where it rests in the Underworld's pit outside battle, its top just above the rim. */
const TABLE_ALTAR = -0.45;

/** A stadium outline (a rectangle whose short ends are half circles), length along x, as a three.js Shape. */
function stadiumShape(length: number, depth: number): THREE.Shape {
  const r = depth / 2, half = length / 2 - r, s = new THREE.Shape();
  s.moveTo(-half, -r);
  s.lineTo(half, -r);
  s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-half, r);
  s.absarc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}

/** Extrude a shape upward (it lies in the x-z plane) from `bottom` by `height`, with a bevelled edge. */
function slab(shape: THREE.Shape, height: number, bottom: number, mat: THREE.Material, bevel = 0.06): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = bottom;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * The battle table: a stadium-shaped stone slab (15 x 7.6 m) on a narrower pedestal, a gilt band round its top edge
 * and a faint glowing groove inset from it. Long axis along x, as the board lies on screen.
 */
function battleTable(top: THREE.Material, base: THREE.Material, glow: number): THREE.Group {
  const g = new THREE.Group();
  // a little larger than the HTML board laid over it, so its stone and gilt edge frame the board as its base
  const L = TABLE_L, D = TABLE_D;
  g.add(slab(stadiumShape(L * 0.72, D * 0.55), 0.6, -0.2, base, 0.08));
  g.add(slab(stadiumShape(L, D), 0.34, 0.4, top, 0.07));
  const band = stadiumShape(L + 0.24, D + 0.24);
  band.holes.push(stadiumShape(L - 0.1, D - 0.1));
  g.add(slab(band, 0.1, 0.62, new THREE.MeshStandardMaterial({ color: 0xffbf5e, roughness: 0.3, metalness: 1, envMapIntensity: 1.2 }), 0.02));
  const groove = stadiumShape(L - 1.0, D - 1.0);
  groove.holes.push(stadiumShape(L - 1.12, D - 1.12));
  const line = slab(groove, 0.02, 0.8, new THREE.MeshStandardMaterial({ color: 0x050608, emissive: glow, emissiveIntensity: 1.4 }), 0);
  line.castShadow = false;
  g.add(line);
  return g;
}

/** A raised, stepped octagonal stone rim round a dais of radius r: two flat rings, the inner one higher. */
function daisRim(r: number, mat: THREE.Material): THREE.Group {
  const octagon = (rad: number): THREE.Vector2[] => Array.from({ length: 8 }, (_, i) => new THREE.Vector2(Math.cos((i + 0.5) * Math.PI / 4) * rad, Math.sin((i + 0.5) * Math.PI / 4) * rad));
  const ringOf = (inner: number, outer: number, depth: number, top: number): THREE.Mesh => {
    const shape = new THREE.Shape(octagon(outer));
    shape.holes.push(new THREE.Path(octagon(inner)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = top - depth;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const g = new THREE.Group();
  g.add(ringOf(r / Math.cos(Math.PI / 8), r * 1.14, 0.32, 0.14), ringOf(r * 1.14, r * 1.28, 0.26, -0.04));
  return g;
}

/**
 * Weathering for the untextured Blender materials (bone, obsidian, gold, painted stone): world-space value noise varies
 * the colour and roughness, and grime gathers toward the ground. It needs no textures or UVs and costs a few ALU ops a
 * pixel, standing in for the ambient occlusion and texture detail of Rapture Chess's heavier stage.
 *   scale: noise frequency per metre · amount: colour variation (0-1) · grime: darkening at floor level (0-1) ·
 *   bump: how deep the noise carves the surface (0 is smooth)
 */
function weather<T extends THREE.MeshStandardMaterial>(m: T, scale: number, amount: number, grime: number, bump = 0.7): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.wScale = { value: scale };
    sh.uniforms.wAmount = { value: amount };
    sh.uniforms.wGrime = { value: grime };
    sh.uniforms.wBump = { value: bump };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float wScale, wAmount, wGrime, wBump; varying vec3 vWP;
float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wHash(i), wHash(i + vec3(1, 0, 0)), f.x), mix(wHash(i + vec3(0, 1, 0)), wHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wHash(i + vec3(0, 0, 1)), wHash(i + vec3(1, 0, 1)), f.x), mix(wHash(i + vec3(0, 1, 1)), wHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float wFbm(vec3 p){ return 0.5 * wNoise(p) + 0.3 * wNoise(p * 2.3 + 7.1) + 0.2 * wNoise(p * 5.7 + 3.3); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float wN = wFbm(vWP * wScale);
diffuseColor.rgb *= mix(1.0 - wAmount, 1.0 + wAmount * 0.35, wN);
diffuseColor.rgb *= mix(1.0 - wGrime, 1.0, smoothstep(-0.2, 1.6, vWP.y + (wN - 0.5) * 0.8));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (wN - 0.5) * 0.35, 0.04, 1.0);')
      // relief: bump the shading normal by low-frequency noise (screen-space derivatives, as three's bump map does), so
      // a flat-shaded prism reads as chipped, carved stone. Only two broad octaves, and the bump fades out where the
      // noise would go finer than a pixel (far away or edge-on): fine relief there aliases into flickering static.
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 wP = vWP * wScale * 1.2;
float wH = 0.6 * wNoise(wP) + 0.4 * wNoise(wP * 2.3 + 7.1);
float wFade = 1.0 - smoothstep(0.06, 0.3, length(fwidth(wP)) * 2.3);
vec3 wdx = dFdx(-vViewPosition), wdy = dFdy(-vViewPosition);
vec3 wr1 = cross(wdy, normal), wr2 = cross(normal, wdx);
float wdet = dot(wdx, wr1);
normal = normalize(abs(wdet) * normal - wBump * wFade * sign(wdet) * (dFdx(wH) * wr1 + dFdy(wH) * wr2));`);
  };
  m.customProgramCacheKey = () => `weather:${scale}:${amount}:${grime}:${bump}`;
  return m;
}

/**
 * Flowing lava: two layers of scrolling noise, hot cracks over a dark crust, emissive enough to bloom. A level pool
 * drifts sideways; a vertical fall (the spires' lava falls) maps its noise up the surface and pours downward, instead
 * of smearing the pool's top-down pattern into a solid glowing bar.
 */
function lava(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, hot: { value: new THREE.Color(0xff7a1a) }, crust: { value: new THREE.Color(0x1a0604) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.02 } },
    vertexShader: `varying vec3 vW; varying vec2 vUv; varying float vFall;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec3 n = normalize(mat3(modelMatrix) * normal); vFall = 1.0 - step(0.5, abs(n.y));
        vUv = vFall > 0.5 ? vec2((w.x + w.z) * 0.6, w.y * 0.22) : w.xz * 0.35;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; uniform vec3 hot, crust, fogColor; uniform float fogDensity; varying vec3 vW; varying vec2 vUv; varying float vFall;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.1 + 3.7; a *= 0.5; } return v; }
      void main(){
        vec2 uv = vUv + (vFall > 0.5 ? vec2(0.0, time * 0.18) : vec2(time * 0.02, time * 0.012));
        float n = fbm(uv * 2.0 + fbm(uv * 1.5 - time * 0.03) * 1.5);
        float glow = pow(smoothstep(0.42, 0.62, n), 1.6);
        // a fall burns cooler than the pool: seen edge-on at full heat, bloom washes it into a solid white bar
        vec3 c = mix(crust, hot * mix(3.5, 1.5, vFall), glow) + hot * 0.25 * smoothstep(0.3, 0.45, n);
        float d = length(cameraPosition - vW); float f = 1.0 - exp(-fogDensity * fogDensity * d * d);
        gl_FragColor = vec4(mix(c, fogColor, f), 1.0); }`,
  });
}

/** A ring of mountain ridges on the horizon: an open band whose top edge is layered noise, unlit, one colour. */
function ridges(radius: number, low: number, high: number, color: number, seed: number): THREE.Mesh {
  const n = 160, pos: number[] = [], idx: number[] = [];
  const noise = (a: number): number => 0.5 + 0.28 * Math.sin(a * 3 + seed) + 0.14 * Math.sin(a * 7.3 + seed * 2.1) + 0.08 * Math.sin(a * 17.9 + seed * 3.7);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    pos.push(x, -3, z, x, low + (high - low) * Math.max(0, Math.min(1, noise(a))), z);
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
  m.renderOrder = -1;
  return m;
}

/** A soft radial glow (white to clear) for flame halos, built in memory (the worker has no DOM canvas). */
let glowTex: THREE.DataTexture | null = null;
function glowTexture(): THREE.DataTexture {
  if (glowTex) return glowTex;
  const s = 64, data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - s / 2 + 0.5, y - s / 2 + 0.5) / (s / 2), a = Math.max(0, 1 - d) ** 2.2;
    data.set([255, 255, 255, Math.round(a * 255)], (y * s + x) * 4);
  }
  glowTex = new THREE.DataTexture(data, s, s);
  glowTex.needsUpdate = true;
  return glowTex;
}
