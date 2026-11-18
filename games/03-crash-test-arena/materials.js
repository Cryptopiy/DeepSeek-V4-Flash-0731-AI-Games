import * as THREE from 'three';

export function makePaint(color = 0xd63031, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.45,
    roughness: 0.45,
    ...opts,
  });
}

export function makeGlass() {
  return new THREE.MeshStandardMaterial({
    color: 0xaad2ff,
    metalness: 0.1,
    roughness: 0.08,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function makeEmissive(color, intensity = 0.9) {
  return new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: color,
    emissiveIntensity: intensity,
  });
}

export const matDarkPlastic = new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.7, metalness: 0.2 });
export const matTire = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.92, metalness: 0.05 });
export const matHub = new THREE.MeshStandardMaterial({ color: 0xaeb6c2, roughness: 0.4, metalness: 0.75 });
export const matChrome = new THREE.MeshStandardMaterial({ color: 0xd9dee5, roughness: 0.25, metalness: 0.9 });
export const matConcrete = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.92 });
export const matBarrier = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.9 });
export const matBarrel = new THREE.MeshStandardMaterial({ color: 0xd94f30, roughness: 0.6 });
export const matCone = new THREE.MeshStandardMaterial({ color: 0xf0641f, roughness: 0.6 });
