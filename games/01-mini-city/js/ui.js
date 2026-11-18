// ui.js --------------------------------------------------------------------
// HUD, overlays, wanted stars, speedometer, objective, context hints,
// floating text pool and the minimap radar. Pure DOM/canvas, no game logic.
import * as THREE from './three.js';

const tmp = new THREE.Vector3();

export function projectPoint(camera, x, y, z, w, h) {
  tmp.set(x, y, z).project(camera);
  if (tmp.z > 1) return null;
  return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h };
}

export class UI {
  constructor() {
    this.hud = document.getElementById('hud');
    this.mode = document.getElementById('modeTag');
    this.speedo = document.getElementById('speedometer');
    this.speedVal = document.getElementById('speedValue');
    this.speedFill = document.getElementById('speedFill');
    this.stars = Array.from(document.querySelectorAll('#wanted .star'));
    this.obj = document.getElementById('objective');
    this.hint = document.getElementById('contextHint');
    this.startOverlay = document.getElementById('startOverlay');
    this.pauseOverlay = document.getElementById('pauseOverlay');
    this.startBtn = document.getElementById('startBtn');
    this.resumeBtn = document.getElementById('resumeBtn');
    this.floatsEl = document.getElementById('floats');

    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.radarScale = this.map.width / 200;

    this.floats = [];
  }

  setMode(m) {
    if (m === 'drive') {
      this.mode.textContent = 'DRIVING';
      this.mode.classList.add('driving');
      this.speedo.classList.remove('hidden');
    } else {
      this.mode.textContent = 'ON FOOT';
      this.mode.classList.remove('driving');
      this.speedo.classList.add('hidden');
    }
  }

  setSpeed(kmh) {
    const v = Math.max(0, Math.round(kmh));
    this.speedVal.textContent = v;
    this.speedFill.style.width = Math.min(100, (v / 140) * 100) + '%';
  }

  setStars(n) {
    for (let i = 0; i < 3; i++) this.stars[i].classList.toggle('on', i < n);
  }

  setObjective(t) { this.obj.textContent = t; }
  setHint(t) { this.hint.textContent = t; }

  showHud() { this.hud.classList.remove('hidden'); }
  hideHud() { this.hud.classList.add('hidden'); }
  showStart() { this.startOverlay.classList.remove('hidden'); }
  hideStart() { this.startOverlay.classList.add('hidden'); }
  showPause() { this.pauseOverlay.classList.remove('hidden'); }
  hidePause() { this.pauseOverlay.classList.add('hidden'); }

  addFloat(x, y, z, text, color) {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.color = color || '#ffd23f';
    this.floatsEl.appendChild(el);
    this.floats.push({ el, x, y, z, t: 0, max: 1.4 });
  }

  updateFloats(dt, camera, w, h) {
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      f.y += dt * 2.2;
      f.el.style.opacity = String(1 - Math.max(0, f.t / f.max));
      const p = projectPoint(camera, f.x, f.y, f.z, w, h);
      if (p && tmp.z <= 1) {
        f.el.style.display = 'block';
        f.el.style.left = p.x + 'px';
        f.el.style.top = p.y + 'px';
      } else {
        f.el.style.display = 'none';
      }
      if (f.t >= f.max) { f.el.remove(); this.floats.splice(i, 1); }
    }
  }

  drawRadar(data) {
    const c = this.mapCtx, S = this.map.width;
    c.clearRect(0, 0, S, S);
    for (const r of data.roads) {
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.lineWidth = 2;
      c.beginPath();
      const a = S / 2 + r * this.radarScale;
      c.moveTo(0, a); c.lineTo(S, a);
      c.moveTo(a, 0); c.lineTo(a, S);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(S / 2, S / 2, data.boundary * this.radarScale, 0, Math.PI * 2);
    c.stroke();
    for (const p of data.parked) this.dot(p.x, p.z, 3.2, 'rgba(255,255,255,0.75)');
    for (const p of data.police) this.dot(p.x, p.z, 4, '#4d7bff');
    this.dot(data.player.x, data.player.z, 5, data.driving ? '#ffd23f' : '#7ae89f');
    if (data.driving && data.player.h !== undefined) {
      c.strokeStyle = 'rgba(255,210,63,0.7)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(S / 2, S / 2);
      c.lineTo(S / 2 + Math.sin(data.player.h) * 40, S / 2 + Math.cos(data.player.h) * 40);
      c.stroke();
    }
  }

  dot(x, z, r, col) {
    const c = this.mapCtx, S = this.map.width;
    c.fillStyle = col;
    c.beginPath();
    c.arc(S / 2 + x * this.radarScale, S / 2 + z * this.radarScale, r, 0, Math.PI * 2);
    c.fill();
  }
}
