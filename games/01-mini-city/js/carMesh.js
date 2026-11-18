// carMesh.js ---------------------------------------------------------------
// Builds a low-poly car: body, cabin, wheels, headlights, brake lights and
// (optionally) police strobe lights. Shares geometries, returns named parts
// so gameplay code can spin wheels, steer the front pair and flash lights.
import * as THREE from './three.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL8 = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 8);
const CYLW = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
const SPH = new THREE.SphereGeometry(1, 8, 6);

const glass = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
const dark = new THREE.MeshLambertMaterial({ color: 0x14171c });
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
const tailMat = new THREE.MeshBasicMaterial({ color: 0x771111 });

export function createCarMesh(opts = {}) {
  const police = !!opts.police;
  const bodyMat = new THREE.MeshLambertMaterial({
    color: opts.color || (police ? 0x1d2740 : 0xd03a32),
  });
  const accentMat = new THREE.MeshLambertMaterial({
    color: opts.accent || (police ? 0xe8ecf2 : 0x22262c),
  });

  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, sx, sy, sz, ry) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    if (ry) m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // chassis + cabin
  add(BOX, bodyMat, 0, 0.55, 0, 1.9, 0.5, 4.3);
  add(BOX, accentMat, 0, 0.78, 0.28, 1.86, 0.34, 1.9);
  add(BOX, bodyMat, 0, 0.5, -0.1, 1.58, 0.26, 1.15); // hood
  add(BOX, glass, 0, 1.02, 0.05, 1.5, 0.52, 1.95);
  add(BOX, bodyMat, 0, 0.98, -0.55, 1.6, 0.34, 0.9); // trunk
  // bumpers
  add(BOX, dark, 0, 0.42, -2.18, 1.86, 0.22, 0.24);
  add(BOX, dark, 0, 0.42, 2.18, 1.86, 0.22, 0.24);
  // side skirts
  add(BOX, dark, -0.98, 0.42, 0, 0.12, 0.16, 4.3);
  add(BOX, dark, 0.98, 0.42, 0, 0.12, 0.16, 4.3);

  // wheels: each wheel is a group at its anchor; tire+rim are children at local
  // origin (cylinder axis aligned to X). rotation.x spins the wheel, rotation.y
  // steers the front pair.
  const wheels = [];
  const steering = [];
  const wheelPos = [[-0.82, -1.42], [0.82, -1.42], [-0.82, 1.42], [0.82, 1.42]];
  for (let i = 0; i < wheelPos.length; i++) {
    const [wx, wz] = wheelPos[i];
    const wheel = new THREE.Group();
    wheel.position.set(wx, 0.34, wz);
    const tire = new THREE.Mesh(CYL8, dark);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheel.add(tire);
    const rim = new THREE.Mesh(CYLW, accentMat);
    rim.rotation.z = Math.PI / 2;
    wheel.add(rim);
    g.add(wheel);
    wheels.push(wheel);
    if (i < 2) steering.push(wheel);
  }

  // headlights + taillights
  const headlights = [
    add(SPH, headMat, -0.72, 0.58, -2.14, 0.22, 0.22, 0.22),
    add(SPH, headMat, 0.72, 0.58, -2.14, 0.22, 0.22, 0.22),
  ];
  const taillights = [
    add(SPH, tailMat, -0.72, 0.6, 2.14, 0.2, 0.2, 0.2),
    add(SPH, tailMat, 0.72, 0.6, 2.14, 0.2, 0.2, 0.2),
  ];

  // police roof strobes
  let strobe1 = null, strobe2 = null;
  if (police) {
    add(BOX, accentMat, 0, 1.32, 0, 0.28, 0.16, 1.0); // light bar
    strobe1 = add(BOX, new THREE.MeshBasicMaterial({ color: 0xff2233 }), -0.3, 1.44, 0, 0.5, 0.14, 0.28);
    strobe2 = add(BOX, new THREE.MeshBasicMaterial({ color: 0x2266ff }), 0.3, 1.44, 0, 0.5, 0.14, 0.28);
    strobe1.castShadow = false; strobe2.castShadow = false;
  }

  return {
    group: g,
    wheels,
    steering,
    headMat: headlights.map(m => m.material),
    brakeMat: taillights.map(m => m.material),
    strobe1: strobe1 ? strobe1.material : null,
    strobe2: strobe2 ? strobe2.material : null,
  };
}
