// Sunset Bay — cars: mesh factory, traffic AI and police pursuit.
// A car is a small group of boxes and cylinders; wheels spin with speed.
import { CONFIG, CAR_COLORS } from './config.js';
import { gridLines } from './world.js';
import { makeRng } from './rng.js';

const THREE = globalThis.THREE;

export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55; body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.25); cabin.castShadow = true;
  group.add(cabin);
  const bump = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 0.5), dark);
  bump.position.set(0, 0.32, 2.15);
  group.add(bump);
  const bump2 = bump.clone(); bump2.position.z = -2.15; group.add(bump2);
  // Headlights and taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), lightMat);
    h.position.set(sx, 0.62, 2.22); group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2e2e });
  for (const sx of [-0.7, 0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), tailMat);
    t.position.set(sx, 0.62, -2.22); group.add(t);
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w); wheels.push(w);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.52, -0.25); group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.35, 1.52, -0.25); group.add(bar2);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    badge.position.set(0, 0.56, 2.21); group.add(badge);
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(0, 1.55, -0.25); group.add(sign);
  }
  group.userData.wheels = wheels;
  return group;
}

// One traffic car cruising the grid. It follows one road at a time and picks a
// new road at intersections, always keeping to the right-hand lane.
export class TrafficCar {
  constructor(scene, rng, x, z) {
    this.rng = rng;
    this.color = rng.pick(CAR_COLORS);
    this.mesh = makeCarMesh(this.color);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.axis = rng.chance(0.5) ? 'x' : 'z';
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.speed = rng.range(7, 12);
    this.heading = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
    this.wait = 0;
    this.alive = true;
  }

  nearestLine(v) {
    const lines = gridLines();
    let best = lines[0], bd = 1e9;
    for (const l of lines) { const d = Math.abs(v - l); if (d < bd) { bd = d; best = l; } }
    return best;
  }

  update(dt, bounds) {
    if (!this.alive) return;
    if (this.wait > 0) { this.wait -= dt; return; }
    const lane = CONFIG.lane;
    if (this.axis === 'x') {
      this.x += this.dir * this.speed * dt;
      this.z += (this.nearestLine(this.z) + (this.dir > 0 ? -lane : lane) - this.z) * Math.min(1, dt * 2);
      if (Math.abs(this.x) > bounds + 20) { this.x = -Math.sign(this.x) * (bounds + 20); }
    } else {
      this.z += this.dir * this.speed * dt;
      this.x += (this.nearestLine(this.x) + (this.dir > 0 ? lane : -lane) - this.x) * Math.min(1, dt * 2);
      if (Math.abs(this.z) > bounds + 20) { this.z = -Math.sign(this.z) * (bounds + 20); }
    }
    // At an intersection, sometimes turn onto the crossing road.
    const cx = this.nearestLine(this.x), cz = this.nearestLine(this.z);
    if (Math.abs(this.x - cx) < 1.2 && Math.abs(this.z - cz) < 1.2 && this.rng.chance(dt * 0.55)) {
      if (this.axis === 'x') { this.axis = 'z'; this.dir = this.rng.chance(0.5) ? 1 : -1; }
      else { this.axis = 'x'; this.dir = this.rng.chance(0.5) ? 1 : -1; }
    }
    const targetHeading = this.axis === 'x'
      ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (this.dir > 0 ? 0 : Math.PI);
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * Math.min(1, dt * 5);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2.4;
  }

  remove(scene) {
    this.alive = false;
    scene.remove(this.mesh);
  }
}

// A police interceptor: faster than traffic, steers straight at the player and
// rams. Its light bar flashes by alternating the bar colour.
export class PoliceCar {
  constructor(scene, x, z) {
    this.mesh = makeCarMesh(0x1c2b45, { police: true });
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 34;
    this.flash = 0;
    this.alive = true;
    this.bumpCooldown = 0;
  }

  update(dt, target, colliders) {
    if (!this.alive) return;
    this.flash += dt;
    const dx = target.x - this.x, dz = target.z - this.z;
    const dist = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx, dz);
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, dh * 1.6));
    this.heading += steer * dt * 2.2;
    const desired = dist > 26 ? this.maxSpeed : this.maxSpeed * 0.55;
    this.speed += (desired - this.speed) * Math.min(1, dt * 0.9);
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    // Slide around buildings instead of driving through them.
    for (const c of colliders) {
      if (this.x > c.minX - 2 && this.x < c.maxX + 2 && this.z > c.minZ - 2 && this.z < c.maxZ + 2) {
        const pushX = Math.min(Math.abs(this.x - (c.minX - 2)), Math.abs(this.x - (c.maxX + 2)));
        const pushZ = Math.min(Math.abs(this.z - (c.minZ - 2)), Math.abs(this.z - (c.maxZ + 2)));
        if (pushX < pushZ) this.x = this.x < (c.minX + c.maxX) / 2 ? c.minX - 2 : c.maxX + 2;
        else this.z = this.z < (c.minZ + c.maxZ) / 2 ? c.minZ - 2 : c.maxZ + 2;
        this.heading += dt * 2;
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2.4;
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    return dist;
  }

  remove(scene) {
    this.alive = false;
    scene.remove(this.mesh);
  }
}

export function spawnTraffic(scene, count, seed) {
  const rng = makeRng(seed + 77);
  const lines = gridLines();
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const line = rng.pick(lines);
    const along = rng.range(-160, 160);
    const car = new TrafficCar(scene, rng, axis === 'x' ? along : line, axis === 'x' ? line : along);
    cars.push(car);
  }
  return cars;
}
