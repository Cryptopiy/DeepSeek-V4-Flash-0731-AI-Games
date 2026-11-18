import * as THREE from './three.js';

// Two pooled GPU particle systems: destruction bursts (normal) and vortex leaves/dust (additive).
// Per-particle alpha/size via a small shader so particles fade and shrink naturally.

let windFn = null;
export function setWindFn(fn) { windFn = fn; }

const VERT = `
attribute float psize;
attribute float palpha;
attribute vec3 color;
varying float vA;
varying vec3 vC;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / max(-mv.z, 0.1);
  gl_Position = projectionMatrix * mv;
  vC = color;
  vA = palpha;
}
`;

const FRAG = `
varying float vA;
varying vec3 vC;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.25, d) * vA;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vC, a);
}
`;

class ParticlePool {
  constructor(cap, additive) {
    this.cap = cap;
    this.count = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.sz = new Float32Array(cap);
    this.al = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxl = new Float32Array(cap);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.sz, 1));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.al, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.geo = geo;
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
  }
  set scaleFactor(v) { this.mesh.material.uniforms.uScale.value = v; }
  add(pos, vel, color, size, alpha, life) {
    if (this.count >= this.cap) return;
    const i = this.count, i3 = i * 3;
    this.pos[i3] = pos.x; this.pos[i3 + 1] = pos.y; this.pos[i3 + 2] = pos.z;
    this.vel[i3] = vel.x; this.vel[i3 + 1] = vel.y; this.vel[i3 + 2] = vel.z;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    this.sz[i] = size; this.al[i] = alpha; this.life[i] = life; this.maxl[i] = life;
    this.count++;
  }
  refresh() {
    this.geo.setDrawRange(0, this.count);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
    this.geo.attributes.palpha.needsUpdate = true;
  }
  update(dt, windy) {
    const p = this;
    let w = 0;
    for (let i = 0; i < p.count; i++) {
      const i3 = i * 3;
      p.life[i] -= dt;
      if (p.life[i] <= 0) continue;
      if (windy && windFn) {
        const inV = _v.set(p.pos[i3], p.pos[i3 + 1], p.pos[i3 + 2]);
        windFn(inV, _out);
        p.vel[i3] += _out.x * dt * 0.55;
        p.vel[i3 + 1] += _out.y * dt * 0.55;
        p.vel[i3 + 2] += _out.z * dt * 0.55;
        const dr = Math.exp(-0.14 * dt);
        p.vel[i3] *= dr; p.vel[i3 + 1] *= dr; p.vel[i3 + 2] *= dr;
      } else {
        p.vel[i3 + 1] -= 4.5 * dt;
      }
      p.pos[i3] += p.vel[i3] * dt;
      p.pos[i3 + 1] += p.vel[i3 + 1] * dt;
      p.pos[i3 + 2] += p.vel[i3 + 2] * dt;
      const frac = Math.max(p.life[i] / p.maxl[i], 0.05);
      p.sz[i] = p.sz[i] * 0.999;
      if (w !== i) {
        const w3 = w * 3;
        p.pos[w3] = p.pos[i3]; p.pos[w3 + 1] = p.pos[i3 + 1]; p.pos[w3 + 2] = p.pos[i3 + 2];
        p.vel[w3] = p.vel[i3]; p.vel[w3 + 1] = p.vel[i3 + 1]; p.vel[w3 + 2] = p.vel[i3 + 2];
        p.col[w3] = p.col[i3]; p.col[w3 + 1] = p.col[i3 + 1]; p.col[w3 + 2] = p.col[i3 + 2];
        p.sz[w] = p.sz[i] * (0.55 + 0.45 * frac);
        p.al[w] = p.al[i] * frac;
        p.life[w] = p.life[i]; p.maxl[w] = p.maxl[i];
      } else {
        p.sz[w] = p.sz[i] * (0.55 + 0.45 * frac);
        p.al[w] = p.al[i] * frac;
      }
      w++;
    }
    if (w !== p.count) p.count = w;
    p.refresh();
  }
  clear() { this.count = 0; this.refresh(); }
}

const _v = new THREE.Vector3();
const _out = new THREE.Vector3();

const dustPool = new ParticlePool(1300, false);
const leafPool = new ParticlePool(2100, true);

const _c = {
  wood: new THREE.Color(0xb98a5e),
  roof: new THREE.Color(0x7f6a6a),
  wall: new THREE.Color(0xc9c2b8),
  leaf: new THREE.Color(0x6ba84f),
  sign: new THREE.Color(0xd8d8dc),
};

export function init(scene, renderer) {
  const sf = renderer.domElement.height * Math.min(window.devicePixelRatio || 1, 2) / 2;
  dustPool.scaleFactor = sf;
  leafPool.scaleFactor = sf;
  scene.add(dustPool.mesh);
  scene.add(leafPool.mesh);
}

export function burst(pos, kind, speedBoost) {
  const c = _c[kind] || _c.wood;
  const n = kind === 'wall' ? 10 : kind === 'roof' ? 12 : 7;
  const speed = (kind === 'wall' ? 12 : 9) + (speedBoost || 0);
  for (let k = 0; k < n; k++) {
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      Math.random() * 0.9 + 0.25,
      (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.75));
    dustPool.add(pos, dir, c, 0.3 + Math.random() * 0.8, 0.75, 0.5 + Math.random() * 0.9);
  }
}

let leafT = 0;
export function spawnLeaf(pos, vel) {
  leafPool.add(pos, vel, _c.leaf, 0.35 + Math.random() * 0.4, 0.55, 4 + Math.random() * 5);
}

export function update(dt) {
  dustPool.update(dt, false);
  leafPool.update(dt, true);
  leafT += dt;
}

export function clear() {
  dustPool.clear();
  leafPool.clear();
}