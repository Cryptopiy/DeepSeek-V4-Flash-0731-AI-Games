export class UI {
  constructor(onAction) {
    this.onAction = onAction || {};
    this.el = {};
    const ids = [
      'scenario-label', 'slowmo-badge', 'camera-badge',
      'stat-speed-value', 'stat-gear',
      'bar-condition',
      'bar-front', 'bar-rear', 'bar-left', 'bar-right',
      'val-front', 'val-rear', 'val-left', 'val-right',
      'impact-speed', 'impact-energy', 'impact-severity',
      'crash-overlay', 'crash-severity', 'crash-speed', 'crash-energy', 'crash-damage',
      'controls-header', 'controls-body', 'controls-toggle', 'load-error', 'load-error-msg',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);

    this._bindButtons();
    this._crashTimer = null;
    this.cameraNames = ['CHASE', 'HOOD', 'ORBIT'];
  }

  _bindButtons() {
    document.querySelectorAll('[data-scenario]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.onAction.scenario && this.onAction.scenario(btn.dataset.scenario);
      });
    });

    const bind = (id, action) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => this.onAction[action] && this.onAction[action]());
    };
    bind('btn-reset', 'reset');
    bind('btn-scenario-reload', 'reload');
    bind('btn-slowmo', 'slowmo');
    bind('btn-camera', 'camera');

    this.el['controls-header'] && this.el['controls-header'].addEventListener('click', () => this.toggleControls());

    document.querySelectorAll('#scenario-buttons .btn[data-scenario]').forEach((b) => b.classList.remove('active'));
  }

  toggleControls() {
    const body = this.el['controls-body'];
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    this.el['controls-toggle'].textContent = open ? '▸' : '▾';
  }

  setScenario(label, activeKey) {
    this.el['scenario-label'].textContent = 'Scenario: ' + label;
    document.querySelectorAll('#scenario-buttons .btn[data-scenario]').forEach((b) => {
      b.classList.toggle('active', b.dataset.scenario === activeKey);
    });
  }

  setCameraMode(idx) {
    this.el['camera-badge'].textContent = this.cameraNames[idx] || ('CAM ' + idx);
  }

  setSlowmo(on) {
    this.el['slowmo-badge'].classList.toggle('hidden', !on);
  }

  setSpeed(kmh, gear) {
    this.el['stat-speed-value'].textContent = Math.round(Math.abs(kmh));
    const g = this.el['stat-gear'];
    g.textContent = gear;
    g.style.background = gear === 'D' ? 'rgba(63,185,80,0.22)' : gear === 'R' ? 'rgba(224,123,31,0.22)' : 'rgba(88,166,255,0.2)';
    g.style.color = gear === 'D' ? '#3fb950' : gear === 'R' ? '#e07b1f' : '#58a6ff';
  }

  setCondition(pct) {
    const bar = this.el['bar-condition'];
    bar.style.width = pct + '%';
    if (pct > 55) bar.style.background = 'linear-gradient(90deg,#3fb950,#d29922)';
    else if (pct > 25) bar.style.background = 'linear-gradient(90deg,#d29922,#e07b1f)';
    else bar.style.background = 'linear-gradient(90deg,#e07b1f,#ec3a2f)';
  }

  setDamage(p) {
    const rows = [
      ['front', this.el['bar-front'], this.el['val-front']],
      ['rear', this.el['bar-rear'], this.el['val-rear']],
      ['left', this.el['bar-left'], this.el['val-left']],
      ['right', this.el['bar-right'], this.el['val-right']],
    ];
    for (const [key, bar, val] of rows) {
      const v = p[key] || 0;
      bar.style.width = v + '%';
      bar.style.background = damageColor(v);
      val.textContent = v + '%';
    }
  }

  setImpact(info) {
    if (!info) return;
    this.el['impact-speed'].textContent = Math.round(info.speed) + ' km/h';
    this.el['impact-energy'].textContent = Math.round(info.energy) + ' kJ';
    const s = this.el['impact-severity'];
    s.textContent = info.label;
    s.className = 'sev sev-' + (info.severity || 'none');
  }

  showCrash(info) {
    const ov = this.el['crash-overlay'];
    if (!ov) return;
    this.el['crash-severity'].textContent = info.label;
    this.el['crash-severity'].style.color = severityColor(info.severity);
    this.el['crash-speed'].textContent = info.speed + ' km/h';
    this.el['crash-energy'].textContent = info.energy + ' kJ';
    this.el['crash-damage'].textContent = info.damage + ' %';
    ov.className = 'crash-overlay show';
    ov.classList.add('sev-' + (info.severity || 'minor'));
    clearTimeout(this._crashTimer);
    this._crashTimer = setTimeout(() => this.hideCrash(), 4500);
  }

  hideCrash() {
    this.el['crash-overlay'].classList.remove('show');
  }

  showError(msg) {
    this.el['load-error-msg'].textContent = msg || this.el['load-error-msg'].textContent;
    this.el['load-error'].classList.remove('hidden');
  }
}

function severityColor(sev) {
  return {
    minor: '#3fb950',
    moderate: '#d29922',
    severe: '#e07b1f',
    critical: '#ec3a2f',
  }[sev] || '#8b949e';
}

function damageColor(v) {
  if (v < 20) return 'linear-gradient(90deg,#2f81f7,#58a6ff)';
  if (v < 40) return 'linear-gradient(90deg,#d29922,#d29922)';
  if (v < 65) return '#e07b1f';
  return '#ec3a2f';
}
