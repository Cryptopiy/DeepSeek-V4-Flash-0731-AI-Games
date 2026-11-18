// player.js ----------------------------------------------------------------
// On-foot third-person character: WASD movement (world direction supplied by
// main.js from the camera yaw), sprint, building collision and boundary clamp.
import * as THREE from './three.js';
import { collideCircle, clampBoundary } from './world.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 0, 0);
    this.radius = 0.38;
    this.walkSpeed = 5.0;
    this.sprintSpeed = 8.6;
    this.heading = 0;
    this.visible = true;
    this.mesh = this.buildMesh();
    scene.add(this.mesh);
  }

  buildMesh() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2f6fa8 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x4a4a55 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48a });
    const shoe = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });

    const torso = new THREE.Mesh(BOX, jacket);
    torso.scale.set(0.5, 0.6, 0.3);
    torso.position.y = 0.9;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), skin);
    head.position.y = 1.5;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), pants);
    hair.position.y = 1.58;
    g.add(hair);
    const armL = new THREE.Mesh(BOX, jacket);
    armL.scale.set(0.16, 0.55, 0.16);
    armL.position.set(-0.34, 0.85, 0);
    g.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.34;
    g.add(armR);
    const legL = new THREE.Mesh(BOX, pants);
    legL.scale.set(0.18, 0.6, 0.18);
    legL.position.set(-0.14, 0.3, 0);
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.14;
    g.add(legR);
    this.legL = legL; this.legR = legR; this.armL = armL; this.armR = armR;
    return g;
  }

  spawn(x, z) {
    this.pos.set(x, 0, z);
    this.syncMesh();
  }

  // move: input=(dirX, dirZ) normalized world direction, sprint bool
  update(dt, dx, dz, sprint, colliders) {
    const sp = (sprint ? this.sprintSpeed : this.walkSpeed);
    if (dx !== 0 || dz !== 0) {
      const d = Math.hypot(dx, dz);
      this.pos.x += (dx / d) * sp * dt;
      this.pos.z += (dz / d) * sp * dt;
      this.heading = Math.atan2(-dx, -dz);
      // leg swing
      this.stepT = (this.stepT || 0) + dt * 9 * (sp * 0.6);
      const s = Math.sin(this.stepT) * 0.35;
      this.legL.rotation.x = s;
      this.legR.rotation.x = -s;
      this.armL.rotation.x = -s * 0.6;
      this.armR.rotation.x = s * 0.6;
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
    }
    const [x, z] = collideCircle(this.pos.x, this.pos.z, this.radius, colliders);
    const [cx, cz] = clampBoundary(x, z, this.radius);
    this.pos.x = cx; this.pos.z = cz;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = 0;
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = this.visible;
  }

  setVisible(v) {
    this.visible = v;
    this.mesh.visible = v;
  }
}
