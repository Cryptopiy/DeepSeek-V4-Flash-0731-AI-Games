const $ = (id) => document.getElementById(id);

export class UI {
  constructor(cbs) {
    this.cbs = cbs;
    this.el = {
      strength: $('hudStrength'),
      wind: $('hudWind'),
      broken: $('hudBroken'),
      houses: $('hudHouses'),
      debris: $('hudDebris'),
      cam: $('hudCam'),
      state: $('hudState'),
      bars: $('strengthBars').children,
      msg: $('msg'),
      start: $('startOverlay'),
      pause: $('pauseOverlay'),
      startBtn: $('startBtn'),
      resumeBtn: $('resumeBtn'),
    };
    this._msgTimer = 0;
    this.el.startBtn.addEventListener('click', () => cbs.onStart());
    this.el.resumeBtn.addEventListener('click', () => cbs.onResume());
    $('pauseOverlay').addEventListener('click', (e) => {
      if (e.target === $('pauseOverlay')) cbs.onResume();
    });
  }

  setStrength(lv, label) {
    this.el.strength.textContent = label;
    for (let i = 0; i < 5; i++) this.el.bars[i].classList.toggle('on', i < lv);
  }
  setWind(kmh) {
    this.el.wind.textContent = kmh + ' km/h (approx.)';
  }
  setBroken(n) {
    this.el.broken.textContent = n;
  }
  setHouses(n) {
    this.el.houses.textContent = n;
  }
  setDebris(n) {
    this.el.debris.textContent = n;
  }
  setCam(name) {
    this.el.cam.textContent = name;
  }
  setState(s) {
    this.el.state.textContent = s;
  }
  flash(msg, ms = 2600) {
    this.el.msg.textContent = msg;
    this.el.msg.classList.add('show');
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => this.el.msg.classList.remove('show'), ms);
  }
  overlayStart() {
    this.el.start.classList.remove('hidden');
    this.el.pause.classList.add('hidden');
  }
  overlayPause(on) {
    this.el.pause.classList.toggle('hidden', !on);
    if (!on) this.el.start.classList.add('hidden');
  }
  hideAll() {
    this.el.start.classList.add('hidden');
    this.el.pause.classList.add('hidden');
  }
}