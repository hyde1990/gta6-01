// Sunset Bay — people: the player on foot, pedestrians, and the taxi fare.
// Pedestrians stroll the sidewalks; a gunshot or a speeding car sends them
// running. Everyone is built from boxes and spheres — no external models.
import { PED_SHIRTS } from './config.js';
import { gridLines } from './world.js';
import { makeRng } from './rng.js';

const THREE = globalThis.THREE;

function limb(mat, w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

export function makePersonMesh(shirt, pants, skin = 0xe8b98a) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x2b2018 });
  const torso = limb(shirtMat, 0.62, 0.72, 0.34);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), skinMat);
  head.position.y = 1.68; head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 10), hairMat);
  hair.position.y = 1.76; hair.scale.set(1, 0.75, 1);
  g.add(hair);
  const legL = limb(pantsMat, 0.22, 0.72, 0.24); legL.position.set(-0.16, 0.36, 0);
  const legR = limb(pantsMat, 0.22, 0.72, 0.24); legR.position.set(0.16, 0.36, 0);
  g.add(legL); g.add(legR);
  const armL = limb(shirtMat, 0.18, 0.6, 0.2); armL.position.set(-0.42, 1.12, 0);
  const armR = limb(shirtMat, 0.18, 0.6, 0.2); armR.position.set(0.42, 1.12, 0);
  g.add(armL); g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

// Leo Cruz, the player: black jacket, jeans, cap.
export function makePlayerMesh() {
  const g = makePersonMesh(0x1f2430, 0x2e4a6b, 0xd9a06b);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
    new THREE.MeshLambertMaterial({ color: 0xc22e6e }),
  );
  cap.position.y = 1.9;
  g.add(cap);
  const brim = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.04, 0.25),
    new THREE.MeshLambertMaterial({ color: 0xc22e6e }),
  );
  brim.position.set(0, 1.86, 0.3);
  g.add(brim);
  return g;
}

export class Pedestrian {
  constructor(scene, rng, x, z) {
    this.rng = rng;
    this.mesh = makePersonMesh(rng.pick(PED_SHIRTS), rng.pick([0x2e4a6b, 0x3a3a3a, 0x5a4632, 0x274435]));
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = rng.range(1.2, 2.2);
    this.state = 'walk';
    this.fleeX = 0; this.fleeZ = 0; this.fleeTime = 0;
    this.walkPhase = rng.range(0, 6);
    this.alive = true;
    this.wait = rng.range(0, 2);
  }

  nearestLine(v) {
    const lines = gridLines();
    let best = lines[0], bd = 1e9;
    for (const l of lines) { const d = Math.abs(v - l); if (d < bd) { bd = d; best = l; } }
    return best;
  }

  scare(x, z) {
    this.state = 'flee';
    this.fleeX = x; this.fleeZ = z;
    this.fleeTime = 3.5;
    this.speed = 5.2;
  }

  update(dt) {
    if (!this.alive) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    if (this.state === 'flee') {
      this.fleeTime -= dt;
      const dx = this.x - this.fleeX, dz = this.z - this.fleeZ;
      const d = Math.hypot(dx, dz) || 1;
      this.heading = Math.atan2(dx / d, dz / d);
      if (this.fleeTime <= 0) { this.state = 'walk'; this.speed = 1.6; }
    } else {
      // Stroll along the nearest sidewalk; turn at intersections.
      const cx = this.nearestLine(this.x), cz = this.nearestLine(this.z);
      if (Math.abs(this.x - cx) < 1 && Math.abs(this.z - cz) < 1 && this.rng.chance(dt * 0.5)) {
        this.heading = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      }
      // Drift toward the sidewalk edge of the nearest road.
      const onXRoad = Math.abs(this.z - cz) < Math.abs(this.x - cx);
      if (onXRoad) this.x += (cx + 8.6 - this.x) * Math.min(1, dt * 1.5);
      else this.z += (cz + 8.6 - this.z) * Math.min(1, dt * 1.5);
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.x = Math.max(-175, Math.min(175, this.x));
    this.z = Math.max(-175, Math.min(175, this.z));
    this.walkPhase += dt * this.speed * 2.4;
    const swing = Math.sin(this.walkPhase) * 0.55;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  remove(scene) {
    this.alive = false;
    scene.remove(this.mesh);
  }
}

export function spawnPedestrians(scene, count, seed) {
  const rng = makeRng(seed + 31);
  const lines = gridLines();
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const line = rng.pick(lines);
    const along = rng.range(-165, 165);
    const onX = rng.chance(0.5);
    peds.push(new Pedestrian(scene, rng,
      onX ? along : line + 8.6,
      onX ? line + 8.6 : along));
  }
  return peds;
}
