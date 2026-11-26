// Real-time, physically based Moon renderer (three.js).
// World frame = J2000 equator (EQJ). The mesh lives in the IAU body-fixed frame and is rotated
// into EQJ with the IAU 2015 rotation model, so phase, bright-limb angle, libration and the tilt
// of the terminator as seen from the observer's horizon all fall out of the geometry.
import * as THREE from 'three';
import { moonAltAz, moonGeometry, phaseAt, shadowParams, umbralDepth, type MoonGeometry, type Place } from '../lib/astro';
import { airmass } from '../lib/refraction';
import { FEATURES } from './features';
import { BG_FRAG, BG_VERT, HALO_FRAG, HALO_VERT, MOON_FRAG, MOON_VERT, STAR_FRAG, STAR_VERT } from './shaders';

export interface MoonParams {
  date: Date;
  place: Place | null;
  orientation: 'horizon' | 'north';
  atmosphere: boolean;
  earthshine: boolean;
  labels: boolean;
  labelLang?: 'en' | 'pl';
  fullLight?: boolean;
}

export interface MoonLayout {
  fill: number;
  offsetY: number;
}

type Listener = (e: { ready: boolean; rotated: boolean; zoom: number }) => void;

const BASE = import.meta.env.BASE_URL || './';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class MoonEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private starScene = new THREE.Scene();
  private starCam = new THREE.PerspectiveCamera(48, 1, 0.01, 10);
  private bgScene = new THREE.Scene();
  private moon: THREE.Mesh;
  private moonMat: THREE.ShaderMaterial;
  private halo: THREE.Mesh;
  private haloMat: THREE.ShaderMaterial;
  private bgMat: THREE.ShaderMaterial;
  private starMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private geom: MoonGeometry | null = null;
  private params: MoonParams | null = null;
  private layout: MoonLayout = { fill: 0.78, offsetY: 0 };
  private userQ = new THREE.Quaternion();
  private targetQ: THREE.Quaternion | null = null;
  private zoom = 1;
  private targetZoom = 1;
  private vel = { x: 0, y: 0 };
  private raf = 0;
  private dirty = true;
  private container: HTMLElement | null = null;
  private labelLayer: HTMLDivElement | null = null;
  private labelEls: HTMLDivElement[] = [];
  private labelLangShown: string = 'en';
  private interactive = true;
  onTap: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  private listeners = new Set<Listener>();
  private viewDir = new THREE.Vector3();
  private upDir = new THREE.Vector3();
  private moonScale = 1;
  private sunBody = new THREE.Vector3();
  ready = false;
  private quality: 'high' | 'balanced';

  constructor(quality: 'high' | 'balanced') {
    this.quality = quality;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'moon-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 3 : 2));

    // background
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uTop: { value: new THREE.Color(0x070b16) },
        uBottom: { value: new THREE.Color(0x030409) },
        uGlow: { value: new THREE.Color(0x0d1524) },
        uGlowPos: { value: new THREE.Vector2(0.5, 0.55) },
      },
    });
    const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bgQuad.frustumCulled = false;
    this.bgScene.add(bgQuad);

    // stars (deterministic, magnitude-like distribution)
    const rnd = seeded(20261124);
    const N = 2600;
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(th), r * Math.sin(th), u], i * 3);
      const m = 6.6 - 5.6 * Math.pow(rnd(), 3.2); // mostly faint
      const b = Math.pow((6.8 - m) / 5.8, 1.9);
      size[i] = 1.2 + b * 3.4;
      const bv = rnd();
      const tint = bv < 0.18 ? [0.75, 0.84, 1.0] : bv > 0.86 ? [1.0, 0.86, 0.7] : [0.95, 0.95, 1.0];
      const k = 0.08 + b * 0.75;
      col.set([tint[0] * k, tint[1] * k, tint[2] * k], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: { uPixelRatio: { value: this.renderer.getPixelRatio() } },
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.starScene.add(this.stars);

    // halo
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uSize: { value: 3.4 },
        uSunScreen: { value: new THREE.Vector2(1, 0) },
        uIllum: { value: 1 },
        uStrength: { value: 0.5 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uMoonR: { value: 1 },
      },
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.haloMat);
    this.halo.renderOrder = 0;
    this.scene.add(this.halo);

    // moon
    this.moonMat = new THREE.ShaderMaterial({
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
      uniforms: {
        uColor: { value: null },
        uNormal: { value: null },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uView: { value: new THREE.Vector3(1, 0, 0) },
        uRelief: { value: 1.25 },
        uEarthshine: { value: 0.03 },
        uExposure: { value: 1 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uFullLight: { value: 0 },
        uPhaseL: { value: 1 },
        uBodyToEqj: { value: new THREE.Matrix3() },
        uMoonGeo: { value: new THREE.Vector3() },
        uShadowAxis: { value: new THREE.Vector3(1, 0, 0) },
        uSunDist: { value: 1.496e8 },
        uEarthR: { value: 6460 },
        uSunR: { value: 695700 },
        uEclipseOn: { value: 0 },
        uDither: { value: 1.2 / 255 },
      },
    });
    const detail = quality === 'high' ? 48 : 32;
    this.moon = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), this.moonMat);
    this.moon.matrixAutoUpdate = false;
    this.moon.renderOrder = 1;
    this.scene.add(this.moon);

    this.loadTextures();
    this.bindInput();
  }

  private async loadTextures() {
    const loader = new THREE.TextureLoader();
    const colorUrl = `${BASE}textures/moon-color-${this.quality === 'high' ? '4k' : '2k'}.jpg`;
    try {
      const [color, normal] = await Promise.all([loader.loadAsync(colorUrl), loader.loadAsync(`${BASE}textures/moon-normal-2k.jpg`)]);
      const aniso = this.renderer.capabilities.getMaxAnisotropy();
      color.colorSpace = THREE.SRGBColorSpace;
      color.wrapS = THREE.RepeatWrapping;
      color.anisotropy = aniso;
      color.generateMipmaps = true;
      color.minFilter = THREE.LinearMipmapLinearFilter;
      normal.colorSpace = THREE.NoColorSpace;
      normal.wrapS = THREE.RepeatWrapping;
      normal.anisotropy = aniso;
      this.moonMat.uniforms.uColor.value = color;
      this.moonMat.uniforms.uNormal.value = normal;
      this.ready = true;
      this.emit();
      this.requestRender();
    } catch (e) {
      console.error('Moon textures failed', e);
    }
  }

  on(l: Listener) {
    this.listeners.add(l);
    l({ ready: this.ready, rotated: !this.isIdentityView(), zoom: this.zoom });
    return () => this.listeners.delete(l);
  }

  private emit() {
    const e = { ready: this.ready, rotated: !this.isIdentityView(), zoom: this.zoom };
    this.listeners.forEach((l) => l(e));
  }

  private isIdentityView() {
    return Math.abs(this.userQ.w) > 0.99999 && Math.abs(this.zoom - 1) < 0.01;
  }

  attach(el: HTMLElement) {
    if (this.container === el) return;
    this.detach();
    this.container = el;
    el.appendChild(this.canvas);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'moon-labels';
    el.appendChild(this.labelLayer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
  }

  detach() {
    if (!this.container) return;
    this.ro?.disconnect();
    this.canvas.remove();
    this.labelLayer?.remove();
    this.labelLayer = null;
    this.labelEls = [];
    this.container = null;
  }

  setLayout(l: Partial<MoonLayout>) {
    this.layout = { ...this.layout, ...l };
    this.updateFrustum();
    this.requestRender();
  }

  private resize() {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.bgMat.uniforms.uRes.value.set(w, h);
    this.starCam.aspect = w / h;
    this.starCam.updateProjectionMatrix();
    this.updateFrustum();
    this.renderNow();
  }

  private updateFrustum() {
    if (!this.container) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const a = w / h;
    const half = 1 / this.layout.fill;
    let hw: number, hh: number;
    if (a >= 1) {
      hh = half;
      hw = half * a;
    } else {
      hw = half;
      hh = half / a;
    }
    const oy = this.layout.offsetY * 2 * hh;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh - oy;
    this.camera.bottom = -hh - oy;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
    this.bgMat.uniforms.uGlowPos.value.set(0.5, 0.5 + this.layout.offsetY);
  }

  setParams(p: MoonParams) {
    this.params = p;
    this.geom = moonGeometry(p.date, p.place);
    this.applyUniforms(this.geom, p, false);
    this.syncLabels();
    this.requestRender();
  }

  private applyUniforms(g: MoonGeometry, p: MoonParams, snapshot: boolean) {
    const u = this.moonMat.uniforms;
    const m = g.bodyToEqj;
    const M = new THREE.Matrix4().set(m[0], m[3], m[6], 0, m[1], m[4], m[7], 0, m[2], m[5], m[8], 0, 0, 0, 0, 1);
    this.moonScale = 384400 / g.distKm;
    const S = new THREE.Matrix4().makeScale(this.moonScale, this.moonScale, this.moonScale);
    this.moon.matrix.copy(M).multiply(S);
    this.moon.matrixWorldNeedsUpdate = true;
    (u.uBodyToEqj.value as THREE.Matrix3).setFromMatrix4(M);
    const toBody = (v: number[]) => new THREE.Vector3(
      v[0] * m[0] + v[1] * m[1] + v[2] * m[2],
      v[0] * m[3] + v[1] * m[4] + v[2] * m[5],
      v[0] * m[6] + v[1] * m[7] + v[2] * m[8],
    );
    this.sunBody.copy(toBody(g.sunFromMoon));
    u.uSun.value.copy(this.sunBody);
    u.uView.value.copy(toBody(g.viewDir.map((x) => -x)));
    const ph = phaseAt(p.date);
    const cosA = -(g.sunFromMoon[0] * g.viewDir[0] + g.sunFromMoon[1] * g.viewDir[1] + g.sunFromMoon[2] * g.viewDir[2]);
    const alpha = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
    u.uPhaseL.value = Math.pow(Math.max(0, Math.min(1, 1 - alpha / 160)), 0.85);
    u.uEarthshine.value = p.earthshine ? 0.06 * Math.pow(1 - ph.illum, 1.6) + 0.004 : 0.0;
    u.uFullLight.value = p.fullLight && !snapshot ? 1 : 0;
    // eclipse
    const sp = shadowParams(g);
    const mg = g.moonGeoKm;
    const ang = Math.acos(Math.max(-1, Math.min(1, -(sp.axis[0] * -mg[0] + sp.axis[1] * -mg[1] + sp.axis[2] * -mg[2]) / Math.hypot(...mg))));
    const eclipseOn = (ang * 180) / Math.PI < 2.2;
    u.uEclipseOn.value = eclipseOn ? 1 : 0;
    u.uMoonGeo.value.set(mg[0], mg[1], mg[2]);
    u.uShadowAxis.value.set(sp.axis[0], sp.axis[1], sp.axis[2]);
    u.uSunDist.value = sp.sunDistKm;
    u.uEarthR.value = sp.earthR;
    u.uSunR.value = sp.sunR;
    const depth = eclipseOn ? umbralDepth(g) : 0;
    let exposure = 1.0 + 22 * Math.pow(depth, 1.6);
    // atmospheric extinction / reddening
    const tint = new THREE.Vector3(1, 1, 1);
    if (p.place && p.atmosphere && !snapshot) {
      const alt = moonAltAz(p.date, p.place).alt;
      if (alt > -0.5) {
        const X = Math.min(airmass(alt), 38);
        const T = [0.12, 0.2, 0.32].map((k) => Math.pow(10, -0.4 * k * X));
        const mx = Math.max(...T);
        const f = 1 - Math.exp(-(X - 1) / 3.2);
        tint.set(1 - f * (1 - T[0] / mx), 1 - f * (1 - T[1] / mx), 1 - f * (1 - T[2] / mx));
        exposure *= 1 - 0.3 * f;
      } else {
        tint.set(0.8, 0.82, 0.88);
      }
    }
    u.uTint.value.copy(tint);
    u.uExposure.value = exposure;
    this.haloMat.uniforms.uTint.value.copy(tint);
    this.haloMat.uniforms.uIllum.value = ph.illum;
    this.haloMat.uniforms.uStrength.value = depth > 0.5 ? 0.03 : 0.09 * (1 - depth);
    this.haloMat.uniforms.uMoonR.value = this.moonScale;
    // view
    this.viewDir.set(g.viewDir[0], g.viewDir[1], g.viewDir[2]);
    const upRef =
      p.orientation === 'horizon' && p.place
        ? new THREE.Vector3(g.zenith[0], g.zenith[1], g.zenith[2])
        : new THREE.Vector3(0, 0, 1);
    this.upDir.copy(upRef).addScaledVector(this.viewDir, -upRef.dot(this.viewDir));
    if (this.upDir.lengthSq() < 1e-8) this.upDir.set(0, 0, 1).addScaledVector(this.viewDir, -this.viewDir.z);
    this.upDir.normalize();
  }

  private placeCamera(cam: THREE.OrthographicCamera, withUser: boolean) {
    const q = withUser ? this.userQ : new THREE.Quaternion();
    const pos = this.viewDir.clone().multiplyScalar(-10).applyQuaternion(q);
    const up = this.upDir.clone().applyQuaternion(q);
    cam.position.copy(pos);
    cam.up.copy(up);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
  }

  requestRender() {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame() {
    this.raf = 0;
    let animating = false;
    if (this.targetQ) {
      this.userQ.slerp(this.targetQ, 0.16);
      if (this.userQ.angleTo(this.targetQ) < 0.002) {
        this.userQ.copy(this.targetQ);
        this.targetQ = null;
        this.emit();
      }
      animating = true;
    }
    if (!this.dragging && (Math.abs(this.vel.x) > 0.00005 || Math.abs(this.vel.y) > 0.00005)) {
      this.rotateBy(this.vel.x, this.vel.y);
      this.vel.x *= 0.93;
      this.vel.y *= 0.93;
      animating = true;
    }
    if (Math.abs(this.zoom - this.targetZoom) > 0.001) {
      this.zoom += (this.targetZoom - this.zoom) * 0.2;
      this.updateFrustum();
      animating = true;
      if (Math.abs(this.zoom - this.targetZoom) <= 0.001) this.emit();
    }
    if (this.dirty || animating) this.renderNow();
    if (animating) this.raf = requestAnimationFrame(() => this.frame());
  }

  renderNow() {
    this.dirty = false;
    if (!this.container || !this.geom) {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      return;
    }
    this.placeCamera(this.camera, true);
    this.starCam.position.set(0, 0, 0);
    this.starCam.quaternion.copy(this.camera.quaternion);
    this.starCam.updateMatrixWorld();
    // halo faces the camera, sits behind the moon
    this.halo.quaternion.copy(this.camera.quaternion);
    this.halo.position.copy(this.viewDir).multiplyScalar(3);
    this.halo.updateMatrixWorld();
    const sunWorld = this.sunBody.clone().applyMatrix3(this.moonMat.uniforms.uBodyToEqj.value);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.haloMat.uniforms.uSunScreen.value.set(sunWorld.dot(right), sunWorld.dot(up));
    this.halo.visible = this.ready;
    this.moon.visible = this.ready;
    const r = this.renderer;
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.scene, this.camera);
    this.updateLabels();
  }

  // ------------------------------------------------------------------ labels
  private syncLabels() {
    if (!this.labelLayer) return;
    const want = !!this.params?.labels;
    const lang = this.params?.labelLang ?? 'en';
    if (want && this.labelEls.length && this.labelLangShown !== lang) {
      this.labelEls.forEach((e) => e.remove());
      this.labelEls = [];
    }
    this.labelLangShown = lang;
    if (want && this.labelEls.length === 0) {
      for (const f of FEATURES) {
        const d = document.createElement('div');
        d.className = `moon-label moon-label--${f.kind}`;
        const txt = lang === 'pl' ? (f.pl ?? f.name) : f.name;
        d.innerHTML = `<span class="moon-label__dot"></span><span class="moon-label__t">${txt}</span>`;
        this.labelLayer.appendChild(d);
        this.labelEls.push(d);
      }
    } else if (!want && this.labelEls.length) {
      this.labelEls.forEach((e) => e.remove());
      this.labelEls = [];
    }
  }

  private updateLabels() {
    if (!this.labelEls.length || !this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const camDir = this.camera.position.clone().normalize();
    const v = new THREE.Vector3();
    FEATURES.forEach((f, i) => {
      const el = this.labelEls[i];
      const la = (f.lat * Math.PI) / 180, lo = (f.lon * Math.PI) / 180;
      const b = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
      const lit = b.dot(this.sunBody) > 0;
      v.copy(b).applyMatrix4(this.moon.matrix);
      const facing = v.clone().normalize().dot(camDir);
      const minFacing = f.kind === 'mare' ? (f.size >= 3 ? 0.2 : 0.4) : 0.35;
      const hiddenAtZoom = (f.kind === 'mare' && f.size < 2 && this.zoom < 1.5) || (f.kind === 'crater' && f.size < 2 && this.zoom < 1.4) || (f.kind === 'site' && this.zoom < 1.9);
      if (facing < minFacing || hiddenAtZoom) {
        el.style.opacity = '0';
        return;
      }
      v.project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.opacity = String(Math.min(1, (facing - minFacing) * 5) * (lit ? 1 : 0.55));
    });
  }

  // ------------------------------------------------------------------ input
  private dragging = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private lastTap = 0;
  private pinchDist = 0;

  private rotateBy(ax: number, ay: number) {
    const camQ = this.camera.quaternion;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ);
    const q1 = new THREE.Quaternion().setFromAxisAngle(up, -ax);
    const q2 = new THREE.Quaternion().setFromAxisAngle(right, -ay);
    this.userQ.premultiply(q1).premultiply(q2).normalize();
    this.placeCamera(this.camera, true);
  }

  setInteractive(on: boolean) {
    this.interactive = on;
    this.canvas.style.touchAction = on ? 'none' : 'pan-y';
    this.canvas.style.cursor = on ? 'grab' : 'zoom-in';
    if (!on) this.resetView();
  }

  private bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    let tapStart: { x: number; y: number; t: number } | null = null;
    c.addEventListener('pointerdown', (e) => {
      if (!this.interactive) {
        tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
        return;
      }
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      this.targetQ = null;
      this.vel = { x: 0, y: 0 };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      const now = performance.now();
      if (now - this.lastTap < 300 && this.pointers.size === 1) this.resetView();
      this.lastTap = now;
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.interactive) return;
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.setZoom(this.targetZoom * (d / this.pinchDist), true);
        this.pinchDist = d;
        return;
      }
      const s = Math.min(c.clientWidth, c.clientHeight) || 300;
      const k = (2.4 / s) * this.layout.fill / this.zoom;
      this.rotateBy(dx * k, dy * k);
      this.vel = { x: dx * k, y: dy * k };
      this.emit();
      this.requestRender();
    });
    const end = (e: PointerEvent) => {
      if (!this.interactive) {
        if (e.type === 'pointerup' && tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8 && performance.now() - tapStart.t < 500) this.onTap?.();
        tapStart = null;
        return;
      }
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        this.dragging = false;
        this.requestRender();
      }
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        if (!this.interactive) return;
        e.preventDefault();
        this.setZoom(this.targetZoom * Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  setZoom(z: number, immediate = false) {
    this.targetZoom = Math.max(1, Math.min(4.5, z));
    if (immediate) {
      this.zoom = this.targetZoom;
      this.updateFrustum();
    }
    this.emit();
    this.requestRender();
  }

  resetView() {
    this.targetQ = new THREE.Quaternion();
    this.targetZoom = 1;
    this.vel = { x: 0, y: 0 };
    this.requestRender();
  }

  // ------------------------------------------------------------------ snapshots (thumbnails / previews)
  private snapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private rt: THREE.WebGLRenderTarget | null = null;

  /** Renders the Moon alone into a transparent canvas of `size` px. */
  snapshot(p: MoonParams, size: number): HTMLCanvasElement | null {
    if (!this.ready) return null;
    const S = size * 2;
    if (!this.rt || this.rt.width !== S) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(S, S, { depthBuffer: true });
    }
    const g = moonGeometry(p.date, p.place);
    this.applyUniforms(g, p, true);
    this.moon.matrix.multiply(new THREE.Matrix4().makeScale(1 / this.moonScale, 1 / this.moonScale, 1 / this.moonScale));
    const c = this.snapCam;
    c.left = -1.01; c.right = 1.01; c.top = 1.01; c.bottom = -1.01;
    c.zoom = 1;
    c.updateProjectionMatrix();
    this.placeCamera(c, false);
    this.halo.visible = false;
    this.moon.visible = true;
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, c);
    const buf = new Uint8Array(S * S * 4);
    r.readRenderTargetPixels(this.rt, 0, 0, S, S, buf);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    const big = document.createElement('canvas');
    big.width = S;
    big.height = S;
    const bctx = big.getContext('2d')!;
    const img = bctx.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    bctx.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, size, size);
    // restore main view
    if (this.geom && this.params) this.applyUniforms(this.geom, this.params, false);
    this.halo.visible = true;
    this.requestRender();
    return out;
  }
}

let engine: MoonEngine | null = null;
export function getMoonEngine(quality: 'high' | 'balanced' = 'high'): MoonEngine {
  if (!engine) engine = new MoonEngine(quality);
  return engine;
}
