/**
 * The 3D stage behind the game client, ported from Rapture Chess (src/scene/stage.ts): the renderer, the sky dome with
 * its aurora and stars, fog, the key, rim, hemisphere and accent lights, a studio environment for reflections, bloom
 * on what is really hot, and AgX tone mapping. Lighter than the chess stage on purpose: no ambient occlusion or mirror
 * floor, because the cards are the bright thing on screen here, not the set. Shadows are static: the key light and the
 * set never move, so the shadow map renders once per realm and is reused (not on phones). Drifting motes (dust in
 * Valhalla, embers in the Underworld) are animated wholly on the GPU.
 *
 * It runs in a Web Worker on an OffscreenCanvas (worker.ts), so it never touches the DOM: the page sends the size,
 * pixel ratio, pointer type and visibility in.
 *
 * Cost control:
 *   - a frame governor steps the resolution down (1.5x, 1x, 0.75x of CSS pixels) when the average drops under 45 fps
 *     and reports failure if even the lowest step can't hold 24 fps, so the client falls back to the CSS arena;
 *   - behind the battle (mood "battle") it draws every other frame: the level is dimmed there and barely moves;
 *   - a hidden page draws nothing.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type Mood = 'menu' | 'battle';
export interface SkyColors { top: number; bottom: number; glow: number; fog: number; fogDensity: number }
export interface StageStats { fps: number; pixelRatio: number; drawCalls: number; triangles: number; frameMs: number }

const RATIOS = [1.5, 1, 0.75];

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
  readonly keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
  readonly rimLight = new THREE.SpotLight(0x8fb4ff, 40, 40, Math.PI / 5, 0.6, 1.4);
  readonly hemi = new THREE.HemisphereLight(0x2a2f45, 0x080608, 0.5);
  readonly floorPlate: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly shadows: boolean;
  /** A phone or tablet: the stage keeps its extras (shadows, statues) off. */
  readonly coarse: boolean;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly timer = new THREE.Timer();
  private readonly updaters: Array<(dt: number, t: number) => void> = [];
  /** The title camera looks across the arena (statues, pillars, the far rim), not down into the dais. */
  private readonly menuTarget = new THREE.Vector3(0, 2.2, 0);
  /** In battle the camera aims 2.1 m in front of the table, so the table sits under the HTML board (above mid-screen). */
  private readonly battleTarget = new THREE.Vector3(0, 0.35, 2.1);
  private readonly battleSpot = new THREE.Vector3();
  private ratioStep: number;
  private mood: Mood = 'menu';
  private angle = 0.6;
  private shakeLeft = 0;
  private frame = 0;
  private frames = 0;
  private sample = 0;
  private lowStreak = 0;
  private workMs = 0;
  private stats: StageStats = { fps: 0, pixelRatio: 1, drawCalls: 0, triangles: 0, frameMs: 0 };
  private width = 1;
  private height = 1;
  private dpr = 1;
  /** The page is hidden: draw nothing. */
  hidden = false;
  /** Called when even the lowest resolution can't hold the frame rate: the client drops back to the CSS arena. */
  onTooSlow: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: { still: boolean; coarse: boolean; width: number; height: number; dpr: number }) {
    this.still = opts.still;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // count draw calls over the whole frame (every pass), not just the last one
    this.renderer.info.autoReset = false;
    // phones start one step down: a weak GPU shouldn't have to prove itself slow first
    this.ratioStep = opts.coarse ? 1 : 0;
    // one static shadow map: rendered when a realm loads (refreshShadows), never per frame
    this.coarse = opts.coarse;
    this.shadows = !opts.coarse;
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(2048, 2048);
      const c = this.keyLight.shadow.camera;
      c.left = -18; c.right = 18; c.top = 18; c.bottom = -18; c.near = 1; c.far = 60;
      this.keyLight.shadow.bias = -0.0004;
      this.keyLight.shadow.normalBias = 0.03;
    }

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.scene.fog = new THREE.FogExp2(0x05050a, 0.028);
    this.scene.background = new THREE.Color(0x05050a);

    this.keyLight.position.set(5, 11, 6);
    this.rimLight.position.set(-6, 8, -9);
    const a0 = new THREE.PointLight(0x38a8ff, 18, 14, 1.8), a1 = new THREE.PointLight(0xff6a2a, 18, 14, 1.8);
    a0.position.set(-5.5, 1.6, 5.5); a1.position.set(5.5, 1.6, -5.5);
    this.scene.add(this.keyLight, this.keyLight.target, this.rimLight, this.rimLight.target, this.hemi, a0, a1);

    // the dais the cards are fought over: a dark polished plate the realm sizes
    this.floorPlate = new THREE.Mesh(new THREE.CircleGeometry(9.05, 64), new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.18 }));
    this.floorPlate.rotation.x = -Math.PI / 2;
    this.floorPlate.position.y = -0.165;
    this.floorPlate.receiveShadow = true;
    this.scene.add(this.floorPlate);

    this.sky = this.skyDome();
    this.stars = this.starfield();
    this.motes = this.moteField(opts.coarse ? 260 : 640);
    this.scene.add(this.sky, this.stars, this.motes);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // bloom only on what is really hot (fire, runes, lava): the threshold keeps stone and gold crisp
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.camera.position.set(0, 8.2, 12.6);
    this.setSize(opts.width, opts.height, opts.dpr);
  }
  private readonly still: boolean;

  /** The renderer's GPU, for spotting software rendering (SwiftShader, llvmpipe): those can't run the arena well. */
  gpuName(): string {
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  }

  /** The canvas's CSS size and the device pixel ratio, from the page. */
  setSize(width: number, height: number, dpr: number): void {
    this.width = Math.max(1, width); this.height = Math.max(1, height); this.dpr = dpr || 1;
    this.resize();
  }

  // ------------------------------------------------------------------ sky
  private skyDome(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
    return new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x05050b) }, bottom: { value: new THREE.Color(0x120d16) }, glow: { value: new THREE.Color(0x3a2a40) }, aurora: { value: 0 }, time: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top, bottom, glow; uniform float aurora, time; varying vec3 vP;
        void main(){ vec3 d = normalize(vP); float h = d.y; vec3 c = mix(bottom, top, smoothstep(-0.2, 0.6, h));
        c += glow * pow(max(0.0, 1.0 - abs(h + 0.05) * 4.0), 2.0) * 0.6;
        float a = atan(d.z, d.x);
        float band = sin(a * 3.0 + time * 0.15 + sin(a * 7.0 - time * 0.1) * 0.8) * 0.5 + 0.5;
        float veil = smoothstep(0.25, 0.55, h) * (1.0 - smoothstep(0.75, 0.95, h)) * band;
        c += aurora * veil * mix(vec3(0.1, 0.9, 0.5), vec3(0.5, 0.2, 0.9), sin(a * 2.0 + time * 0.2) * 0.5 + 0.5) * 0.35;
        gl_FragColor = vec4(c, 1.0); }`,
    }));
  }

  private starfield(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const n = 900, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let s = 7;
    const rnd = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.9 + 0.05), r = 70;
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
      const w = 0.4 + rnd() * 0.6;
      col.set([w, w * (0.85 + rnd() * 0.15), w * (0.8 + rnd() * 0.3)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0.8, fog: false }));
  }

  /** Motes drifting up through the arena: positions loop in the vertex shader, so a frame costs one draw call. */
  private moteField(n: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    let s = 11;
    const rnd = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = 2.5 + Math.sqrt(rnd()) * 11;
      pos.set([Math.cos(a) * r, rnd() * 9, Math.sin(a) * r], i * 3);
      seed[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    return new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { time: { value: 0 }, rise: { value: 0.2 }, size: { value: 1 }, color: { value: new THREE.Color(0xffffff) }, opacity: { value: 0.6 } },
      vertexShader: `uniform float time, rise, size; attribute float aSeed; varying float vA;
        void main(){ vec3 p = position; float h = 9.0;
          p.y = mod(p.y + time * rise * (0.6 + aSeed * 0.8), h);
          p.x += sin(time * 0.4 + aSeed * 20.0) * 0.45; p.z += cos(time * 0.33 + aSeed * 17.0) * 0.45;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = min(size * (0.5 + aSeed) * (180.0 / -mv.z), 9.0 * size);   // near motes stay specks, not blobs
          vA = smoothstep(0.0, 1.2, p.y) * (1.0 - smoothstep(h - 3.0, h - 0.3, p.y)) * (0.55 + 0.45 * sin(time * 2.3 + aSeed * 31.0)); }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(color * (1.0 + a * 1.5), a * vA * opacity); }`,
    }));
  }

  /** The realm's motes: their colour, how fast they rise, their size and strength (0 hides them). */
  setMotes(color: number, rise: number, size: number, opacity: number): void {
    const u = this.motes.material.uniforms;
    (u.color.value as THREE.Color).set(color); u.rise.value = rise; u.size.value = size; u.opacity.value = opacity;
    this.motes.visible = opacity > 0;
  }

  /** Re-render the static shadow map on the next frame (after a realm or its lighting changes). */
  refreshShadows(): void { if (this.shadows) this.renderer.shadowMap.needsUpdate = true; }

  setSky(c: SkyColors, aurora: number, stars: number): void {
    const u = this.sky.material.uniforms;
    (u.top.value as THREE.Color).set(c.top); (u.bottom.value as THREE.Color).set(c.bottom); (u.glow.value as THREE.Color).set(c.glow);
    u.aurora.value = aurora;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(c.fog); fog.density = c.fogDensity;
    (this.scene.background as THREE.Color).set(c.fog);
    this.stars.material.opacity = stars;
    this.stars.visible = stars > 0;
  }

  setFloorRadius(r: number): void {
    this.floorPlate.visible = r > 0;
    if (r > 0) { this.floorPlate.geometry.dispose(); this.floorPlate.geometry = new THREE.CircleGeometry(r, 64); }
  }

  // ------------------------------------------------------------------ camera and frames
  setMood(m: Mood): void { this.mood = m; this.resize(); }
  quake(): void { this.shakeLeft = 0.3; }
  onUpdate(fn: (dt: number, t: number) => void): void { this.updaters.push(fn); }
  getStats(): StageStats { return { ...this.stats }; }

  private resize(): void {
    const w = this.width, h = this.height;
    const ratio = Math.min(this.dpr, RATIOS[this.ratioStep]);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    // portrait phones: open the field of view so the arena still fills the frame
    this.camera.fov = this.camera.aspect < 1 ? Math.min(72, 42 / this.camera.aspect) : 42;
    // the title screen on a wide screen: slide the picture right, clear of the menu column (as Rapture Chess does)
    const shift = this.mood === 'menu' && this.camera.aspect > 1.25 ? Math.round(w * 0.12) : 0;
    if (shift) this.camera.setViewOffset(w, h, -shift, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.stats.pixelRatio = ratio;
  }

  /** Menu: a slow, low circle round the dais, looking across the arena. Battle: high over the dais, barely drifting. */
  private place(dt: number, t: number): void {
    if (this.mood === 'menu') {
      if (!this.still) this.angle += dt * 0.06;
      const r = 12.6, y = (this.camera.aspect > 1.25 ? 5.4 : 5.0) + Math.sin(this.angle * 0.7) * 0.5;
      this.camera.position.set(Math.sin(this.angle) * r, y, Math.cos(this.angle) * r);
    } else {
      // steep, so the dais under the HTML table is seen nearly as the table is (it tilts 26deg on screen)
      this.battleSpot.set(this.still ? 0 : Math.sin(t * 0.12) * 0.6, 16.5, 9.6);
      this.camera.position.lerp(this.battleSpot, Math.min(1, dt * 2));
    }
    this.camera.lookAt(this.mood === 'menu' ? this.menuTarget : this.battleTarget);
    if (this.shakeLeft > 0) {
      this.shakeLeft -= dt;
      const k = 0.08 * Math.max(0, this.shakeLeft) * 4;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
    }
  }

  /** Step the resolution down when the frame rate can't hold; report when nothing is left to give. */
  /** `drawn`: this tick rendered a frame (behind the battle every other tick is skipped on purpose). */
  private govern(dt: number, drawn: boolean): void {
    if (drawn) this.frames++;
    this.sample += dt;
    if (this.sample < 2) return;
    this.stats.fps = Math.round(this.frames / this.sample);
    this.stats.frameMs = Math.round((this.workMs / Math.max(1, this.frames)) * 100) / 100;
    this.frames = 0; this.sample = 0; this.workMs = 0;
    if (this.hidden) return;
    const target = this.mood === 'battle' ? 28 : 45;   // battle draws every other frame by design
    if (this.stats.fps >= target) { this.lowStreak = 0; return; }
    if (++this.lowStreak < 2) return;
    this.lowStreak = 0;
    if (this.ratioStep < RATIOS.length - 1) { this.ratioStep++; this.resize(); }
    else if (this.stats.fps < 24) this.onTooSlow?.();
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = Math.min(0.05, this.timer.getDelta()), t = this.timer.getElapsed();
      if (this.hidden) return;
      // behind the battle the level is dimmed and nearly still: half the frames are plenty
      const skip = this.mood === 'battle' && (this.frame++ & 1) === 1;
      this.govern(dt, !skip);
      if (skip) return;
      const t0 = performance.now();
      this.renderer.info.reset();
      this.sky.material.uniforms.time.value = t;
      this.motes.material.uniforms.time.value = t;
      for (const fn of this.updaters) fn(dt, t);
      this.place(dt, t);
      this.composer.render(dt);
      this.workMs += performance.now() - t0;
      const info = this.renderer.info.render;
      this.stats.drawCalls = info.calls;
      this.stats.triangles = info.triangles;
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.composer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) { for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose(); mat.dispose(); }
    });
    this.renderer.dispose();
  }
}
