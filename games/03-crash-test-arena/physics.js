import * as CANNON from 'cannon-es';

export const FIXED_STEP = 1 / 60;
export const MAX_SUBSTEPS = 6;
export const MAX_ACCUMULATOR = 0.12;

const _p = new CANNON.Vec3();
const _q = new CANNON.Quaternion();

class Physics {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.81, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 14;
    this.world.solver.tolerance = 0.001;

    const cm = this.world.defaultContactMaterial;
    cm.friction = 0.35;
    cm.restitution = 0.2;

    this.accumulator = 0;
    this.bodies = [];
  }

  addBody(body) {
    this.world.addBody(body);
    this.bodies.push(body);
    return body;
  }

  removeBody(body) {
    this.world.removeBody(body);
    const i = this.bodies.indexOf(body);
    if (i !== -1) this.bodies.splice(i, 1);
  }

  makeBox(mass, half, pos, quat, opts = {}) {
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(half[0], half[1], half[2])),
      position: new CANNON.Vec3(pos[0], pos[1], pos[2]),
      material: opts.material || undefined,
      collisionResponse: opts.collisionResponse !== undefined ? opts.collisionResponse : true,
    });
    if (quat) body.quaternion.copy(quat);
    if (opts.linearDamping !== undefined) body.linearDamping = opts.linearDamping;
    if (opts.angularDamping !== undefined) body.angularDamping = opts.angularDamping;
    if (opts.allowSleep !== undefined) body.allowSleep = opts.allowSleep;
    this.addBody(body);
    return body;
  }

  makeCylinder(mass, radiusTop, radiusBottom, height, pos, opts = {}) {
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Cylinder(radiusTop, radiusBottom, height, 12),
      position: new CANNON.Vec3(pos[0], pos[1], pos[2]),
      collisionResponse: opts.collisionResponse !== undefined ? opts.collisionResponse : true,
    });
    if (opts.allowSleep !== undefined) body.allowSleep = opts.allowSleep;
    body.quaternion.setFromEuler(0, 0, 0);
    this.addBody(body);
    return body;
  }

  bodyToLocal(body, worldVec, out = new CANNON.Vec3()) {
    return body.vectorToLocalFrame(worldVec, out);
  }

  addGround() {
    const mat = new CANNON.Material('ground');
    this.world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.95, restitution: 0.1 }));
    this.groundMaterial = mat;
    // Solid slab floor (a Plane gets a degenerate AABB in cannon-es and is
    // invisible to ray queries, so we use a huge thin box instead).
    this.ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(120, 0.5, 90)),
      material: mat,
      position: new CANNON.Vec3(0, -0.5, 0),
    });
    this.world.addBody(this.ground);
    this.bodies.push(this.ground);
  }

  step(dt) {
    this.accumulator += Math.min(dt, MAX_ACCUMULATOR);
    let steps = 0;
    while (this.accumulator >= FIXED_STEP) {
      this.world.step(FIXED_STEP, FIXED_STEP, MAX_SUBSTEPS);
      this.accumulator -= FIXED_STEP;
      if (++steps >= 16) {
        this.accumulator = 0;
        break;
      }
    }
  }

}

export function sync(body, mesh) {
  mesh.position.set(body.position.x, body.position.y, body.position.z);
  mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  return mesh;
}

export const physics = new Physics();
export { CANNON };
