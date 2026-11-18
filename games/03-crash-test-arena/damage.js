import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CHASSIS_MASS, DETACH_SPECS } from './vehicle.js';

// ---------------------------------------------------------------------------
// Lightweight particle system (sparks, dust, debris, glass shards)
// ---------------------------------------------------------------------------
const _grav = 9.81;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.cap = { spark: 220, dust: 70, debris: 90, glass: 100 };
    this.counts = { spark: 0, dust: 0, debris: 0, glass: 0 };

    this.debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    this.glassGeo = new THREE.BoxGeometry(0.14, 0.14, 0.05);
    this.glassMat = new THREE.MeshStandardMaterial({
      color: 0xcfe6ff,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
    });
  }

  _can(type) { return this.counts[type] < this.cap[type]; }

  _spawn(item) {
    this.scene.add(item.mesh);
    this.items.push(item);
    this.counts[item.type]++;
  }

  _removeAt(i) {
    const it = this.items[i];
    this.counts[it.type] = Math.max(0, this.counts[it.type] - 1);
    this.scene.remove(it.mesh);
    this.items.splice(i, 1);
  }

  emitSparks(pos, count) {
    while (count-- > 0 && this._can('spark')) {
      const mat = new THREE.SpriteMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const size = 0.12 + Math.random() * 0.1;
      s.scale.set(size, size, 1);
      s.position.set(
        pos.x + (Math.random() - 0.5) * 0.5,
        pos.y + Math.random() * 0.3,
        pos.z + (Math.random() - 0.5) * 0.5
      );
      this._spawn({
        type: 'spark',
        mesh: s,
        vel: new THREE.Vector3((Math.random() - 0.5) * 9, 2 + Math.random() * 5, (Math.random() - 0.5) * 9),
        life: 0.14 + Math.random() * 0.3,
        maxLife: 0.44,
        gravity: 6,
        drag: 2.2,
      });
    }
  }

  emitDust(pos, count) {
    while (count-- > 0 && this._can('dust')) {
      const mat = new THREE.SpriteMaterial({
        color: 0xb9c0c8,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      const size = 0.5 + Math.random() * 0.6;
      s.scale.set(size, size, 1);
      s.position.set(
        pos.x + (Math.random() - 0.5) * 0.6,
        pos.y + Math.random() * 0.2,
        pos.z + (Math.random() - 0.5) * 0.6
      );
      this._spawn({
        type: 'dust',
        mesh: s,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.4 + Math.random() * 1.4, (Math.random() - 0.5) * 2.4),
        life: 0.7 + Math.random() * 1.0,
        maxLife: 1.7,
        gravity: 0.4,
        drag: 1.6,
        grow: 1.6,
      });
    }
  }

  emitDebris(pos, count, color = 0xd63031) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    while (count-- > 0 && this._can('debris')) {
      const s = 0.7 + Math.random() * 0.9;
      const m = new THREE.Mesh(this.debrisGeo, mat.clone());
      m.scale.set(s, s, s);
      m.position.set(
        pos.x + (Math.random() - 0.5) * 0.6,
        pos.y + (Math.random() - 0.5) * 0.4,
        pos.z + (Math.random() - 0.5) * 0.6
      );
      this._spawn({
        type: 'debris',
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 8, 1.5 + Math.random() * 4.5, (Math.random() - 0.5) * 8),
        life: 2 + Math.random() * 3,
        maxLife: 5,
        gravity: _grav,
        bounce: 0.35,
        rotVel: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      });
    }
  }

  emitGlass(pos, count) {
    while (count-- > 0 && this._can('glass')) {
      const m = new THREE.Mesh(this.glassGeo, this.glassMat.clone());
      m.position.set(
        pos.x + (Math.random() - 0.5) * 0.5,
        pos.y + Math.random() * 0.4,
        pos.z + (Math.random() - 0.5) * 0.5
      );
      this._spawn({
        type: 'glass',
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 6, 1 + Math.random() * 3.5, (Math.random() - 0.5) * 6),
        life: 1.5 + Math.random() * 1.5,
        maxLife: 3,
        gravity: _grav,
        bounce: 0.3,
        rotVel: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
      });
    }
  }

  reset() {
    while (this.items.length) this._removeAt(this.items.length - 1);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) { this._removeAt(i); continue; }

      const t = 1 - it.life / it.maxLife;
      it.vel.y -= it.gravity * dt;
      it.vel.multiplyScalar(Math.max(0, 1 - (it.drag ?? 0) * dt));

      if (it.mesh.isSprite) {
        it.mesh.position.addScaledVector(it.vel, dt);
        const size = it.mesh.scale.x;
        const grow = it.grow ?? 0;
        it.mesh.scale.set(size * (1 + grow * dt), size * (1 + grow * dt), 1);
        it.mesh.material.opacity = Math.max(0, (1 - t * 0.9));
      } else {
        it.mesh.position.addScaledVector(it.vel, dt);
        if (it.mesh.position.y < 0.05) {
          it.mesh.position.y = 0.05;
          if (Math.abs(it.vel.y) > 0.5) it.vel.y = Math.abs(it.vel.y) * (it.bounce ?? 0.3);
          else it.vel.y = 0;
          it.vel.x *= 0.8;
          it.vel.z *= 0.8;
        }
        it.mesh.rotation.x += it.rotVel.x * dt;
        it.mesh.rotation.y += it.rotVel.y * dt;
        it.mesh.rotation.z += it.rotVel.z * dt;
        if (it.type === 'glass') it.mesh.material.opacity = Math.max(0, 0.85 - t * 1.1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Damage manager: crash analysis, condition, severity, visual damage
// ---------------------------------------------------------------------------
const PAINT_DEBRIS = 0xc84a44;

export class DamageManager {
  constructor(car, app) {
    this.car = car;
    this.app = app; // { particles, shake(mag), slowPulse(sec), onCrash(info), onDamageUpdate() }
    this.zones = { front: 0, rear: 0, left: 0, right: 0 };
    this.condition = 1;
    this.latest = { speed: 0, energy: 0, severity: 'minor', label: '—', zone: 'front' };
    this.lastLoss = 0;
    this._cooldown = 0;
    this._VT = new CANNON.Vec3();

    car.chassis.addEventListener('collide', (e) => this._onCollide(e));
  }

  tick(dt) {
    this._cooldown = Math.max(0, this._cooldown - dt);
  }

  _onCollide(e) {
    if (this._cooldown > 0) return;
    const c = e.contact;
    const relSpeed = Math.abs(c.getImpactVelocityAlongNormal());
    if (relSpeed < 2.0) return;

    const isA = c.bi === this.car.chassis;
    const nw = isA ? c.ni.clone() : c.ni.clone().negate();
    this.car.chassis.vectorToLocalFrame(nw, this._VT);
    const nl = this._VT;

    let zone;
    if (Math.abs(nl.x) >= Math.abs(nl.z)) zone = nl.x >= 0 ? 'right' : 'left';
    else zone = nl.z >= 0 ? 'front' : 'rear';

    const otherMass = e.body ? e.body.mass : 0;
    const mu = otherMass <= 0 ? CHASSIS_MASS : (CHASSIS_MASS * otherMass) / (CHASSIS_MASS + otherMass);
    const energyKJ = 0.5 * mu * relSpeed * relSpeed / 1000;
    const impactSpeedKmh = relSpeed * 3.6;

    if (impactSpeedKmh < 9) return;

    const severity = energyKJ < 45 ? 'minor' : energyKJ < 110 ? 'moderate' : energyKJ < 230 ? 'severe' : 'critical';
    this.latest = { speed: impactSpeedKmh, energy: energyKJ, severity, label: severity.toUpperCase(), zone };

    const dmg = Math.min(1, energyKJ / 170);
    this.zones[zone] = Math.min(1, this.zones[zone] + dmg * 0.6);
    const loss = Math.min(0.6, energyKJ / 900);
    this.condition = Math.max(0.05, this.condition - loss);
    this.lastLoss = loss * 100;
    this._cooldown = 0.35;

    this._applyDamageEffects(zone, energyKJ, impactSpeedKmh, severity, nw);
  }

  _applyDamageEffects(zone, energyKJ, impactSpeedKmh, severity, nwWorld) {
    const car = this.car;
    const app = this.app;
    const pt = new THREE.Vector3(
      car.chassis.position.x + nwWorld.x * 1.6,
      car.chassis.position.y + nwWorld.y * 1.2 + 0.4,
      car.chassis.position.z + nwWorld.z * 1.6
    );

    const sparkN = severity === 'critical' ? 26 : severity === 'severe' ? 16 : 8;
    app.particles.emitSparks(pt, sparkN);
    if (severity !== 'minor') app.particles.emitDebris(pt, severity === 'critical' ? 10 : 5, PAINT_DEBRIS);
    app.particles.emitDust(pt, severity === 'minor' ? 4 : 8);
    app.shake(severity === 'critical' ? 1 : severity === 'severe' ? 0.65 : 0.35);

    car.renderDamage(this.zones);
    car.damageFactor.engine = Math.max(0.45, 1 - 0.5 * this.zones.front - 0.25 * Math.max(this.zones.left, this.zones.right));
    car.damageFactor.steer = Math.max(0.55, 1 - 0.45 * Math.max(this.zones.left, this.zones.right));
    car.damageFactor.pull = (this.zones.left - this.zones.right) * 0.06;

    if (zone === 'front') {
      if (energyKJ > 38) car.crackGlass('windshield');
      if (energyKJ > 175) { car.breakGlass('windshield'); app.particles.emitGlass(pt, 10); }
    } else if (zone === 'left') {
      if (energyKJ > 34) car.crackGlass('windowL');
      if (energyKJ > 160) { car.breakGlass('windowL'); app.particles.emitGlass(pt, 8); }
    } else if (zone === 'right') {
      if (energyKJ > 34) car.crackGlass('windowR');
      if (energyKJ > 160) { car.breakGlass('windowR'); app.particles.emitGlass(pt, 8); }
    } else if (zone === 'rear') {
      if (energyKJ > 45) car.crackGlass('rearGlass');
      if (energyKJ > 190) { car.breakGlass('rearGlass'); app.particles.emitGlass(pt, 8); }
    }

    this._maybeDetach(zone, energyKJ);

    if (severity === 'critical') app.slowPulse(0.5);
    if (severity === 'moderate' || severity === 'severe' || severity === 'critical') {
      app.onCrash({
        severity,
        label: severity.toUpperCase(),
        speed: Math.round(impactSpeedKmh),
        energy: Math.round(energyKJ),
        damage: Math.round(this.lastLoss),
      });
    }
    app.onDamageUpdate();
  }

  _maybeDetach(zone, energyKJ) {
    const orders = {
      front: ['bumperFront', 'hood', 'headlightL', 'headlightR'],
      rear: ['bumperRear', 'trunk'],
      left: ['doorL'],
      right: ['doorR'],
    };
    const thresholds = {
      headlightL: 70, headlightR: 70,
      hood: 150, trunk: 158,
      bumperFront: 150, bumperRear: 150,
      doorL: 150, doorR: 150,
    };
    const list = orders[zone] || [];
    for (const key of list) {
      if (this.car.detachedKeys.has(key)) continue;
      if (energyKJ >= (thresholds[key] ?? 150)) {
        this.car.detachPart(key);
        const spec = DETACH_SPECS[key];
        if (spec) this.condition = Math.max(0.05, this.condition - spec.weight);
      }
    }
  }

  repairAll() {
    this.zones = { front: 0, rear: 0, left: 0, right: 0 };
    this.condition = 1;
    this.latest = { speed: 0, energy: 0, severity: 'minor', label: '—', zone: 'front' };
    this.lastLoss = 0;
    this.car.repair();
    this.car.damageFactor = { engine: 1, steer: 1, pull: 0 };
  }

  conditionPct() {
    return Math.round(this.condition * 100);
  }

  zonePct() {
    return {
      front: Math.round(this.zones.front * 100),
      rear: Math.round(this.zones.rear * 100),
      left: Math.round(this.zones.left * 100),
      right: Math.round(this.zones.right * 100),
    };
  }
}
