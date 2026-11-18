import { HOTBAR, BLOCK_DEFS } from "./world.js";

const $ = (id) => document.getElementById(id);

let slot = 0;
let onSelect = null;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("0x", ""), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
}

function drawIcon(canvas, colorHex, seed) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = hexToRgba(colorHex, 1);
  ctx.fillRect(0, 0, 64, 64);

  const rand = mulberry32(seed);
  const cells = 8;
  const size = 64 / cells;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const b = 0.82 + rand() * 0.4;
      ctx.fillStyle =
        "rgba(" +
        Math.min(255, (((parseInt(colorHex.replace("0x", ""), 16) >> 16) & 255) * b) | 0) +
        "," +
        Math.min(255, ((((parseInt(colorHex.replace("0x", ""), 16) >> 8) & 255) * b) | 0)) +
        "," +
        Math.min(255, (((parseInt(colorHex.replace("0x", ""), 16) & 255) * b) | 0)) +
        ",1)";
      ctx.fillRect(cx * size, cy * size, size + 0.5, size + 0.5);
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 61, 61);
}

function buildHotbar() {
  const bar = $("hotbar");
  bar.innerHTML = "";
  HOTBAR.forEach((id, i) => {
    const def = BLOCK_DEFS[id];
    const el = document.createElement("div");
    el.className = "slot" + (i === slot ? " active" : "");
    el.innerHTML = '<span class="num">' + (i + 1) + "</span><canvas width='64' height='64'></canvas><span class='sname'>" + def.name + "</span>";
    drawIcon(el.querySelector("canvas"), def.color, id * 7919 + i * 13);
    el.addEventListener("click", () => selectSlot(i));
    bar.appendChild(el);
  });
}

export function selectSlot(i) {
  i = ((i % HOTBAR.length) + HOTBAR.length) % HOTBAR.length;
  slot = i;
  const slots = document.querySelectorAll("#hotbar .slot");
  slots.forEach((el, idx) => el.classList.toggle("active", idx === i));
  $("block-name").textContent = BLOCK_DEFS[HOTBAR[i]].name;
  if (onSelect) onSelect(i);
}

export function cycleSlot(dir) {
  selectSlot(slot + dir);
}

export function getSelected() {
  return HOTBAR[slot];
}

let toastTimer = null;

export function showToast(msg, ms = 2200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

export function updateFPS(fps) {
  $("fps").textContent = "FPS: " + fps;
}

export function updateDebug(text) {
  $("debug").textContent = text;
}

export function updateCoords(x, y, z) {
  const el = $("coords");
  el.textContent = "X: " + Math.round(x) + "  Y: " + Math.round(y) + "  Z: " + Math.round(z);
}

export function setSeedText(seed) {
  $("seed-label").textContent = "Seed: " + seed;
}

export function setMenuMsg(text) {
  $("menu-msg").textContent = text || "";
}

export function showMenu() {
  $("menu").classList.remove("hidden");
  $("hud").classList.add("hidden");
  $("paused").classList.add("hidden");
}

export function hideMenu() {
  $("menu").classList.add("hidden");
  $("hud").classList.remove("hidden");
}

export function showPaused() {
  $("paused").classList.remove("hidden");
}

export function hidePaused() {
  $("paused").classList.add("hidden");
}

export function getSeedInput() {
  return $("seed-input").value.trim();
}

export function bindSlotSelect(fn) {
  onSelect = fn;
}

export function moveCrosshair(x, y) {
  const ch = $("crosshair");
  ch.style.left = x + "px";
  ch.style.top = y + "px";
  ch.style.transform = "translate(-50%, -50%)";
}

export function centerCrosshair() {
  const ch = $("crosshair");
  ch.style.left = "50%";
  ch.style.top = "50%";
  ch.style.transform = "translate(-50%, -50%)";
}

export function refreshHotbarSelection() {
  selectSlot(slot);
}

export function initUI() {
  buildHotbar();
  selectSlot(0);
}