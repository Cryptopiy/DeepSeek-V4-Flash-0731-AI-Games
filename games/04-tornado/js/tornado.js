import * as THREE from './three.js';
import { spawnLeaf } from './particles.js';

const LEVEL_NAMES = ['EF-1', 'EF-2', 'EF-3', 'EF-4', 'EF-5'];
const LEVEL_WORDS = ['Weak', 'Moderate', 'Strong', 'Violent', 'Extreme'];

// Build funnel + spiral particles + dust ring + cloud deck + lightning.
// The wind model is applied directly to rigid bodies (see windAt).

export class Tornado {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(-176, 0, 138);
    this.smooth = this.pos.clone();
    this.velocity = new THREE.Vector3();
    this.strength = 1;
    this.time = 0;
    this.heading = 0;
    this._leafAcc = 0;
    this._tmps = new THREE.Vector3();

    this.group = new THREE.Group();
    scene.add(this.group);
    this.trail = [];
    this.trailAcc = 0;
    this._buildVisuals(scene);
    this._buildClouds(scene);
  }

  get stormAmount() {
    return Math.max(0, Math.min(1, (this.strength - 2) / 3));
  }

  get maxRadius() { return 34 + this.strength * 6; }

  _cone(rt, rb, h, opacity, color, seg = 12) {
    const geo = new THREE.ConeGeometry(rt, h, seg, 1, true);
    geo.translate(0, h / 2, 0); // pivot at ground
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
    return mesh;
  }

  _buildVisuals(scene) {
    const g = this.group;
    this.outer = this._cone(27, 4.2, 74, 0.15, 0xc7d0da, 14);
    this.outer2 = this._cone(22, 6, 66, 0.12, 0xb6c2cd, 10);
    this.outer2.rotation.y = 0.9;
    this.inner = this._cone(12.5, 2.6, 72, 0.2, 0xa3b0bc, 10);
    this.core = this._cone(3.4, 0.8, 72, 0.2, 0xe8eef4, 8);
    // dust skirt at the base
    this.skirt = this._cone(30, 12, 9, 0.2, 0xb29b76, 8);
    this.skirt.position.y = 0;

    // helical particle swirls
    this.helixA = this._makeHelix(720, 0, 74, 4.5, 27, 0);
    this.helixB = this._makeHelix(460, 0, 74, 3, 17, Math.PI * 1.6);
    this.group.add(this.helixA);
    this.group.add(this.helixB);

    // ground dust ring (CPU-swirled so its rotation is visible)
    this._buildGroundDust();

    // lightning
    this.light = new THREE.PointLight(0xcfd8ff, 0, 220, 2);
    this.light.position.set(0, 60, 0);
    this.group.add(this.light);
    this.boltGroup = new THREE.Group();
    this.group.add(this.boltGroup);
    this.boltTimer = 0;
    this.nextFlash = 1.5;
    this.flashGlow = 0;
  }

  _makeHelix(n, h0, h1, r0, r1, seed) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const h = h0 + (h1 - h0) * t;
      const ang = t * 24 + seed;
      const r = r0 + (r1 - r0) * t * (0.7 + 0.5 * Math.sin(t * 11 + seed * 3) * 0.5 + 0.5);
      pos[i * 3] = Math.cos(ang) * r;
      pos[i * 3 + 1] = h + Math.sin(ang * 1.3 + seed) * 0.8;
      pos[i * 3 + 2] = Math.sin(ang) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd2dbe3, size: 0.55, transparent: true, opacity: 0.55,
      depthWrite: false, sizeAttenuation: true,
    });
    return new THREE.Points(geo, mat);
  }

  _buildGroundDust() {
    const n = 480;
    this.dust = { n, theta: new Float32Array(n), r: new Float32Array(n), speed: new Float32Array(n), y: new Float32Array(n) };
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = this.dust;
      d.r[i] = 6 + Math.random() * 27;
      d.theta[i] = Math.random() * Math.PI * 2;
      d.speed[i] = (2.2 + Math.random() * 2.2) * (1 - d.r[i] / 33);
      d.y[i] = 0.25 + Math.random() * 0.9;
      pos[i * 3] = Math.cos(d.theta[i]) * d.r[i];
      pos[i * 3 + 1] = d.y[i];
      pos[i * 3 + 2] = Math.sin(d.theta[i]) * d.r[i];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xa48f69, size: 0.85, transparent: true, opacity: 0.8,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
    });
    this.dustMesh = new THREE.Points(geo, mat);
    this.dustAttr = geo.attributes.position;
    this.group.add(this.dustMesh);
  }

  _buildClouds(scene) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(235,240,246,1)');
    grad.addColorStop(0.55, 'rgba(210,220,232,0.55)');
    grad.addColorStop(0.85, 'rgba(170,185,205,0.16)');
    grad.addColorStop(1, 'rgba(170,185,205,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);

    const cloudMat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.75, depthWrite: false,
    });
    this.cloudDeck = new THREE.Group();
    const n = 12;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(cloudMat);
      const a = (i / n) * Math.PI * 2;
      const r = 22 + Math.random() * 18;
      const h = 58 + Math.random() * 18;
      s.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
      const sc = 14 + Math.random() * 12;
      s.scale.set(sc, sc * 0.6, 1);
      this.cloudDeck.add(s);
    }
    // big anvil
    const anvilMat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.34, depthWrite: false,
    });
    const anv = new THREE.Sprite(anvilMat);
    anv.position.set(0, 86, 0);
    anv.scale.set(120, 60, 1);
    this.cloudDeck.add(anv);
    this.group.add(this.cloudDeck);
  }

  reset() {
    this.pos.set(-176, 0, 138);
    this.smooth.copy(this.pos);
    this.velocity.set(0, 0, 0);
    this.strength = 1;
    this.time = 0;
    this._leafAcc = 0;
    this.boltGroup.clear();
    this.flashGlow = 0;
    this.light.intensity = 0;
    this.nextFlash = 1.5;
    for (const t of this.trail) this.scene.remove(t);
    this.trail.length = 0;
  }

  move(dt, dir, sprint) {
    const speed = (sprint ? 27 : 11) * dt;
    this.pos.x += dir.x * speed;
    this.pos.z += dir.z * speed;
    this.pos.x = Math.max(-172, Math.min(172, this.pos.x));
    this.pos.z = Math.max(-172, Math.min(172, this.pos.z));
    if (dir.x || dir.z) {
      this.velocity.x = dir.x; this.velocity.z = dir.z;
    }
  }

  // Vortex force model.  out = acceleration (units per second^2), returns exposure value.
  windAt(p, out) {
    const dx = p.x - this.smooth.x;
    const dz = p.z - this.smooth.z;
    const r = Math.sqrt(dx * dx + dz * dz);
    const Ry = this.maxRadius;
    if (r >= Ry) { out.set(0, 0, 0); return 0; }
    const R0 = 7.5 + this.strength * 1.7;
    const fall = 1 - r / Ry;
    const fall2 = fall * fall;
    const core = Math.max(0, 1 - r / Math.max(R0, 0.001));
    const K = this.strength;
    const y = Math.max(0, p.y);
    const ht = Math.min(y / 52, 1);

    const at = K * 300 * fall2 * (0.7 + 0.55 * core);       // tangential spin
    const ar = K * 150 * fall2 * (1 - 0.72 * ht);            // radial suction
    const al = K * 175 * fall2 * (0.4 + 0.75 * core) * (1 - 0.35 * ht); // lift

    const inv = 1 / Math.max(r, 0.001);
    const rx = dx * inv, rz = dz * inv;
    const tx = -rz, tz = rx;

    const t = this.time;
    const n1 = 0.3 * Math.sin(t * 2.4 + p.x * 0.11 + y * 0.19);
    const n2 = 0.3 * Math.cos(t * 2.0 + p.z * 0.12 + y * 0.15);
    const turb = (at + ar) * 0.16;

    out.x = tx * at - rx * ar + n1 * (turb + 16);
    out.y = al + n2 * 13;
    out.z = tz * at - rz * ar + n2 * (turb + 16);
    return Math.hypot(at, ar * 0.7, al * 0.6);
  }

  exposureAt(p) {
    const t = this._tmps;
    return this.windAt(p, t);
  }

  update(dt) {
    this.time += dt;
    const k = Math.min(1, dt * 6);
    this.smooth.x += (this.pos.x - this.smooth.x) * k;
    this.smooth.z += (this.pos.z - this.smooth.z) * k;
    this.group.position.set(this.smooth.x, 0, this.smooth.z);

    const S = this.strength;

    // funnel rotation + wobble
    this.outer.rotation.y += dt * (3.1 + 0.55 * S);
    this.outer2.rotation.y -= dt * (2.2 + 0.4 * S);
    this.inner.rotation.y -= dt * (4.4 + 0.8 * S);
    this.core.rotation.y += dt * 5.8;
    this.group.rotation.z = Math.sin(this.time * 0.23) * 0.05;
    this.group.rotation.x = Math.cos(this.time * 0.19) * 0.055;

    // helixes
    this.helixA.rotation.y += dt * (2.0 + 0.35 * S);
    this.helixB.rotation.y -= dt * (2.7 + 0.45 * S);

    // ground dust swirl
    const d = this.dust;
    const pos = this.dustAttr.array;
    for (let i = 0; i < d.n; i++) {
      d.theta[i] += d.speed[i] * dt * (0.6 + S * 0.14);
      const wob = Math.sin(this.time * 3 + i) * 0.12;
      pos[i * 3] = Math.cos(d.theta[i]) * (d.r[i] * (1 + wob));
      pos[i * 3 + 2] = Math.sin(d.theta[i]) * (d.r[i] * (1 + wob));
      pos[i * 3 + 1] = d.y[i] + wob * 1.4;
    }
    this.dustAttr.needsUpdate = true;

    // cloud deck slow spin
    this.cloudDeck.rotation.y += dt * 0.05;
    this.cloudDeck.rotation.z = Math.sin(this.time * 0.1) * 0.02;

    // funnel scale with strength
    const sc = 1 + (S - 1) * 0.1;
    this.outer.scale.set(sc, sc, sc);
    this.outer2.scale.set(sc, sc, sc);
    this.inner.scale.set(sc, sc, sc);
    this.core.scale.set(sc, sc, sc);

    // leaves / dust flung from the base
    this._leafAcc += dt * (2.2 + S * 2.4);
    while (this._leafAcc >= 1) {
      this._leafAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 5;
      const px = this.smooth.x + Math.cos(a) * r;
      const pz = this.smooth.z + Math.sin(a) * r;
      const v = new THREE.Vector3(
        Math.cos(a + 1.2) * (5 + Math.random() * 6),
        9 + Math.random() * 8,
        Math.sin(a + 1.2) * (5 + Math.random() * 6)
      );
      spawnLeaf({ x: px, y: 0.4 + Math.random() * 0.8, z: pz }, v);
    }

    this._groundTrail(dt, S);
    this._lightning(dt, S);
  }

  _groundTrail(dt, S) {
    this.trailAcc += dt;
    if (S < 2 || this.trailAcc < 0.4) return;
    this.trailAcc = 0;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5, 16 + S * 2, 22),
      Tornado.trailMat()
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.pos.x, 0.016, this.pos.z);
    this.scene.add(ring);
    this.trail.push(ring);
    if (this.trail.length > 46) {
      const old = this.trail.shift();
      this.scene.remove(old);
      old.geometry.dispose();
    }
  }

  static trailMat() {
    if (!Tornado._trailMat) {
      Tornado._trailMat = new THREE.MeshBasicMaterial({
        color: 0x30291f, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide,
      });
    }
    return Tornado._trailMat;
  }

  _lightning(dt, S) {
    this.boltTimer -= dt;
    this.flashGlow = Math.max(0, this.flashGlow - dt * 14);
    this.light.intensity = this.flashGlow * 260;
    if (S >= 3) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.nextFlash = Math.max(0.9, 5 - S * 0.5) * (0.4 + Math.random());
        this.flashGlow = 1;
        this.boltTimer = 0.12;
        this._spawnBolt();
      }
    }
    if (this.boltTimer <= 0 && this.boltGroup.children.length) {
      this.boltGroup.clear();
    }
  }

  _spawnBolt() {
    const seg = new THREE.BufferGeometry();
    const n = 7;
    const pts = [];
    const a = Math.random() * Math.PI * 2;
    const r0 = 34 + Math.random() * 46;
    let x = Math.cos(a) * r0;   // local to tornado
    let z = Math.sin(a) * r0;
    let y = 118;
    pts.push(x, y, z);
    for (let i = 1; i < n; i++) {
      y -= 118 / (n - 1) * (0.55 + Math.random() * 0.9);
      x += (Math.random() - 0.5) * 14;
      z += (Math.random() - 0.5) * 14;
      pts.push(x, y, z);
    }
    seg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.Line(seg, new THREE.LineBasicMaterial({ color: 0xcfeeff }));
    this.boltGroup.add(line);
  }

  disposeClouds() {
    this.scene.remove(this.cloudDeck);
    if (this.group.parent) this.scene.remove(this.group);
  }
}

export { LEVEL_NAMES, LEVEL_WORDS };