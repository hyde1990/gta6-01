// Sunset Bay — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between title, play, paused and game-over screens.
//
// ?seed=N fixes the city. ?shot=start|play|chase|mission (with &seed=N)
// stages that scene instead of running the loop, simulates it forward a
// fixed amount, paints it once and freezes, so a screenshot is deterministic.
import { CONFIG, MISSIONS } from './config.js';
import { buildWorld, gridLines, cityBounds, resolveBuildings } from './world.js';
import { makeCarMesh, TrafficCar, PoliceCar, spawnTraffic } from './cars.js';
import { makePlayerMesh, Pedestrian, spawnPedestrians } from './people.js';
import { MissionManager } from './missions.js';
import { SoundBank } from './audio.js';
import { HUD } from './hud.js';
import { makeRng } from './rng.js';

const THREE = globalThis.THREE;
const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'sunsetbay.save.v1';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CONFIG.seed;

function $(id) { return document.getElementById(id); }

class Game {
  constructor() {
    this.rng = makeRng(seed);
    this.state = 'title'; // title | playing | paused | over
    this.frozen = false;
    this.cash = 40;
    this.health = 100;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.crimeCooldown = 0;
    this.time = 0;
    this.camYaw = Math.PI * 0.15;
    this.camPitch = 0.42;
    this.bustTimer = 0;
    this.shotCooldown = 0;
    this.police = [];
    this.policeSpawnTimer = 0;
    this.traffic = [];
    this.peds = [];
    this.parked = [];
    this.inCar = false;
    this.car = null; // the car object the player drives, when inCar
    this.aiming = false;
    this.muted = false;
    this.saveData = this.loadSave();

    this.sound = new SoundBank();
    this.hud = new HUD();

    // Renderer and scene.
    this.renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(-120, 80, 160);

    this.world = buildWorld(this.scene, seed);
    this.bounds = cityBounds();

    // The player on foot.
    this.player = {
      mesh: makePlayerMesh(),
      x: 0, z: 48, heading: Math.PI, speed: 0,
    };
    this.scene.add(this.player.mesh);

    // Traffic, pedestrians and parked cars.
    this.traffic = spawnTraffic(this.scene, 26, seed);
    this.peds = spawnPedestrians(this.scene, 34, seed);
    this.spawnParkedCars();

    // Missions.
    this.missions = new MissionManager(this.scene, {
      onToast: (t) => { this.hud.toast(t, 3400); this.sound.blip(660, 0.15); },
      onReward: (amount) => { this.cash += amount; this.sound.jingle(); this.saveGame(); },
      setWanted: (n) => this.setWanted(n),
      onObjective: (title, text) => this.hud.setObjective(title, text),
      onMissionDone: () => this.saveGame(),
      onStoryDone: () => {
        this.hud.setObjective('STORY COMPLETE', 'You own Sunset Bay now. Free roam — keep the city yours.');
        this.hud.toast('STORY COMPLETE — Leo Cruz owns Sunset Bay!', 5000);
        this.saveGame();
      },
    });

    this.input = { f: false, b: false, l: false, r: false, run: false };
    this.bindInput();
    this.bindButtons();
    window.addEventListener('resize', () => this.onResize());
    if (this.saveData) $('btn-continue').classList.remove('hidden');
  }

  spawnParkedCars() {
    const lines = gridLines();
    const spots = [
      [-150, -48, 0xc9a227, true], [96, -60, 0xd83a34, false], [48, 108, 0x2e6fd8, false],
      [-48, -108, 0x3aa655, false], [144, 60, 0xe8e8e8, false], [-108, 144, 0xff7f2a, false],
      [60, -144, 0x8a5fbf, false], [12, 132, 0x2ec4b6, false], [-132, 12, 0x222831, false],
      [108, 132, 0xf2c230, false],
    ];
    for (const [x, z, color, gold] of spots) {
      const mesh = makeCarMesh(color, gold ? { taxi: false } : {});
      if (gold) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.1, 4.44),
          new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
        trim.position.y = 0.9; mesh.add(trim);
      }
      mesh.position.set(x, 0, z);
      mesh.rotation.y = this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.parked.push({ mesh, x, z, heading: mesh.rotation.y, speed: 0, gold, taken: false, kind: 'parked' });
    }
    void lines;
  }

  // ---- save / load -------------------------------------------------------
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        missionIndex: this.missions.missionIndex,
        done: this.missions.done,
        x: this.player.x, z: this.player.z,
      }));
    } catch (e) { /* storage unavailable; the game still plays */ }
  }

  // ---- input --------------------------------------------------------------
  bindInput() {
    const keyMap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
    window.addEventListener('keydown', (e) => {
      if (e.code in keyMap) { this.input[keyMap[e.code]] = true; e.preventDefault(); }
      if (e.code === 'KeyE') this.onActionKey();
      if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
      if (e.code === 'KeyM') { this.muted = !this.muted; this.sound.setMuted(this.muted); this.hud.toast(this.muted ? 'Sound off' : 'Sound on'); }
      if (e.code === 'KeyR') this.retryMission();
      if (e.code === 'KeyQ') this.camYaw += 0.12;
      if (e.code === 'KeyE' && e.shiftKey) this.camYaw -= 0.12;
      if (e.code === 'F1') { this.saveGame(); this.hud.toast('Game saved'); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code in keyMap) this.input[keyMap[e.code]] = false;
    });
    let dragging = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
    const canvas = $('game');
    canvas.addEventListener('mousedown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY; downX = e.clientX; downY = e.clientY;
      this.sound.ensure();
      if (this.state === 'playing' && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch (err) { /* pointer lock unavailable */ }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) this.onShoot();
      dragging = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.camYaw -= e.movementX * 0.004;
      this.camPitch = Math.max(0.12, Math.min(1.1, this.camPitch + e.movementY * 0.003));
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindButtons() {
    $('btn-start').addEventListener('click', () => { this.sound.ensure(); this.startGame(false); });
    $('btn-continue').addEventListener('click', () => { this.sound.ensure(); this.startGame(true); });
    $('btn-resume').addEventListener('click', () => this.togglePause());
    $('btn-save').addEventListener('click', () => { this.saveGame(); this.hud.toast('Game saved'); });
    $('btn-restart').addEventListener('click', () => { this.retryMission(); this.togglePause(); });
    $('btn-retry').addEventListener('click', () => this.respawnAfterBust());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- flow ----------------------------------------------------------------
  startGame(continueSave) {
    $('screen-title').classList.add('hidden');
    $('screen-over').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    if (continueSave && this.saveData) {
      this.cash = this.saveData.cash || 40;
      this.player.x = this.saveData.x || 0;
      this.player.z = this.saveData.z || 48;
      if (this.saveData.done) {
        this.missions.done = true;
        this.hud.setObjective('STORY COMPLETE', 'You own Sunset Bay now. Free roam.');
      } else {
        this.missions.startMission(this.saveData.missionIndex || 0);
      }
    } else {
      this.missions.startMission(0);
    }
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      $('screen-pause').classList.remove('hidden');
      this.sound.setEngine(false, 0);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      $('screen-pause').classList.add('hidden');
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  retryMission() {
    if (this.state !== 'playing') return;
    this.missions.retry();
    this.health = 100;
    this.setWanted(0);
    if (this.inCar) this.exitCar();
    this.player.x = 0; this.player.z = 48;
    this.hud.toast('Mission restarted');
  }

  gameOver(kind) {
    this.state = 'over';
    this.sound.setEngine(false, 0);
    this.sound.setSiren(false, 0);
    this.sound.fail();
    $('over-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    $('over-text').textContent = kind === 'busted'
      ? 'The Solmar Bay Police Department thanks you for your cooperation.'
      : 'Leo Cruz wakes up in St. Marina Hospital, $200 lighter.';
    $('screen-over').classList.remove('hidden');
    this.hud.hide();
  }

  respawnAfterBust() {
    this.cash = Math.max(0, this.cash - 200);
    this.health = 100;
    this.setWanted(0);
    if (this.inCar) this.exitCar();
    this.player.x = 12; this.player.z = 12;
    $('screen-over').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    this.missions.retry();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---- wanted ---------------------------------------------------------------
  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.wantedTimer = 0;
  }

  addWanted(n, reason) {
    if (this.crimeCooldown > 0) return;
    this.crimeCooldown = 1.2;
    this.setWanted(this.wanted + n);
    if (reason) this.hud.toast(reason);
  }

  updateWanted(dt) {
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    const wantPolice = Math.min(this.wanted, CONFIG.maxPolice);
    this.policeSpawnTimer -= dt;
    if (this.police.length < wantPolice && this.policeSpawnTimer <= 0) {
      this.policeSpawnTimer = 1.6;
      const angle = this.rng.range(0, Math.PI * 2);
      const px = this.player.x + Math.sin(angle) * 70;
      const pz = this.player.z + Math.cos(angle) * 70;
      this.police.push(new PoliceCar(this.scene,
        Math.max(-170, Math.min(170, px)), Math.max(-170, Math.min(170, pz))));
      this.sound.blip(520, 0.2, 'square', 0.08);
    }
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      const nearPolice = this.police.some((p) => Math.hypot(p.x - this.player.x, p.z - this.player.z) < 42);
      if (this.wantedTimer > CONFIG.wantedDecaySeconds && !nearPolice) {
        this.setWanted(this.wanted - 1);
        if (this.wanted === 0) this.hud.toast('You lost the cops.');
      }
    } else {
      // No heat: police already on the road give up and drive off.
      for (const p of this.police) {
        if (Math.hypot(p.x - this.player.x, p.z - this.player.z) > 130) p.remove(this.scene);
      }
      this.police = this.police.filter((p) => p.alive);
    }
    this.sound.setSiren(this.wanted > 0, dt);
  }

  // ---- actions ----------------------------------------------------------------
  nearestCar(maxDist) {
    let best = null, bd = maxDist;
    const px = this.player.x, pz = this.player.z;
    const consider = (c) => {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bd) { bd = d; best = c; }
    };
    for (const c of this.parked) if (!c.taken) consider(c);
    for (const c of this.traffic) if (c.alive && c.speed < 3) consider(c);
    return best;
  }

  onActionKey() {
    if (this.state !== 'playing') return;
    if (this.inCar) { this.exitCar(); return; }
    // Mission pickup / steal at the marker.
    const step = this.missions.step();
    if (this.missions.active && step && (step.action === 'pickup' || step.action === 'steal')) {
      const d = Math.hypot(this.player.x - step.x, this.player.z - step.z);
      if (d < 6) {
        if (step.action === 'steal') {
          const gold = this.parked.find((c) => c.gold && !c.taken);
          if (gold) { this.enterCar(gold, true); }
        }
        this.missions.arrive();
        this.sound.blip(990, 0.15);
        return;
      }
    }
    const car = this.nearestCar(4.5);
    if (car) {
      const stealing = car.kind === 'parked' || car instanceof TrafficCar;
      this.enterCar(car, stealing);
      if (stealing) this.addWanted(1, 'You stole a car! The police are on their way.');
    }
  }

  enterCar(car, stealing) {
    if (car instanceof TrafficCar) {
      // Take the car out of traffic, but keep its mesh in the scene: the
      // player is about to drive it.
      this.traffic = this.traffic.filter((c) => c !== car);
    }
    if (car.kind === 'parked') car.taken = true;
    this.car = car;
    this.inCar = true;
    this.player.mesh.visible = false;
    this.sound.blip(440, 0.1);
    void stealing;
  }

  exitCar() {
    if (!this.car) return;
    const c = this.car;
    this.player.x = c.x + Math.sin(c.heading + Math.PI / 2) * 3;
    this.player.z = c.z + Math.cos(c.heading + Math.PI / 2) * 3;
    this.player.heading = c.heading;
    this.player.mesh.visible = true;
    if (c.kind === 'parked') {
      c.x = c.x; c.z = c.z; c.heading = c.heading;
    }
    this.car = null;
    this.inCar = false;
  }

  onShoot() {
    if (this.state !== 'playing' || this.inCar || this.shotCooldown > 0) return;
    this.shotCooldown = 0.28;
    this.sound.shot();
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    ray.far = 90;
    const targets = [];
    for (const p of this.peds) if (p.alive) targets.push(p.mesh);
    for (const p of this.police) if (p.alive) targets.push(p.mesh);
    const hits = ray.intersectObjects(targets, true);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
    const ped = this.peds.find((p) => p.mesh === obj);
    if (ped) {
      ped.remove(this.scene);
      this.addWanted(1, 'You shot a pedestrian!');
      for (const q of this.peds) if (q.alive && Math.hypot(q.x - ped.x, q.z - ped.z) < 26) q.scare(ped.x, ped.z);
      return;
    }
    const cop = this.police.find((p) => p.mesh === obj);
    if (cop) {
      cop.remove(this.scene);
      this.police = this.police.filter((p) => p.alive);
      this.addWanted(1, 'You took out a police cruiser!');
    }
  }

  // ---- simulation --------------------------------------------------------------
  loop(t) {
    if (this.state !== 'playing' || this.frozen) return;
    requestAnimationFrame((nt) => this.loop(nt));
    let dt = Math.min((t - this.last) / 1000, MAX_FRAME);
    this.last = t;
    while (dt > 0) {
      const step = Math.min(dt, STEP);
      this.update(step);
      dt -= step;
    }
    this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    // Clouds drift; ocean breathes.
    for (const c of this.world.clouds) {
      c.position.x += dt * 1.4;
      if (c.position.x > 300) c.position.x = -300;
    }
    this.world.ocean.position.y = 0.15 + Math.sin(this.time * 0.7) * 0.08;

    if (this.inCar && this.car) this.updateDriving(dt);
    else this.updateOnFoot(dt);

    // Traffic, pedestrians, police.
    for (const c of this.traffic) c.update(dt, this.bounds);
    for (const p of this.peds) p.update(dt);
    this.updatePolice(dt);
    this.updateCarCollisions(dt);

    // Missions and wanted.
    this.missions.update(dt, this.player.x, this.player.z);
    this.updateWanted(dt);

    // Health regen out of trouble.
    if (this.wanted === 0 && this.health < 100) this.health = Math.min(100, this.health + dt * 2);
    if (this.health <= 0) { this.gameOver('wasted'); return; }

    // Camera + HUD.
    this.updateCamera(dt);
    const obj = this.missions.objectiveLine();
    this.hud.update({
      cash: this.cash, health: this.health, wanted: this.wanted,
      inCar: this.inCar, speed: this.inCar ? this.car.speed : 0,
      aiming: !this.inCar && this.state === 'playing',
      objective: obj,
    });
    this.hud.drawMinimap(
      { x: this.player.x, z: this.player.z, heading: this.inCar ? this.car.heading : this.player.heading },
      this.traffic, this.police,
      this.missions.active && this.missions.step() ? { x: this.missions.step().x, z: this.missions.step().z } : null,
      this.bounds,
    );
    this.sound.setEngine(this.inCar, this.inCar ? Math.abs(this.car.speed) / CONFIG.carMaxSpeed : 0);
  }

  updateOnFoot(dt) {
    const speed = this.input.run ? CONFIG.runSpeed : CONFIG.walkSpeed;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = 0, mz = 0;
    if (this.input.f) { mx += fx; mz += fz; }
    if (this.input.b) { mx -= fx; mz -= fz; }
    if (this.input.r) { mx += rx; mz += rz; }
    if (this.input.l) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      this.player.x += mx * speed * dt;
      this.player.z += mz * speed * dt;
      const targetHeading = Math.atan2(mx, mz);
      let dh = targetHeading - this.player.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.player.heading += dh * Math.min(1, dt * 10);
      this.player.speed = speed;
    } else {
      this.player.speed = 0;
    }
    const fixed = resolveBuildings(this.world.colliders, this.player, 0.9);
    this.player.x = Math.max(-178, Math.min(178, fixed.x));
    this.player.z = Math.max(-178, Math.min(178, fixed.z));
    // Traffic can hit the player on foot.
    for (const c of this.traffic) {
      const d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
      if (d < 2 && c.speed > 6) {
        this.health -= 18;
        this.sound.crash();
        this.player.x += (this.player.x - c.x) * 0.6;
        this.player.z += (this.player.z - c.z) * 0.6;
        this.hud.toast('You were hit by a car!');
      } else if (d < 1.8) {
        this.player.x += (this.player.x - c.x) * 0.3;
        this.player.z += (this.player.z - c.z) * 0.3;
      }
    }
    const bob = this.player.speed > 0 ? Math.sin(this.time * 12) * 0.06 : 0;
    this.player.mesh.position.set(this.player.x, bob, this.player.z);
    this.player.mesh.rotation.y = this.player.heading;
    const u = this.player.mesh.userData;
    if (u.legL) {
      const swing = this.player.speed > 0 ? Math.sin(this.time * 12) * 0.6 : 0;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
    }
  }

  updateDriving(dt) {
    const car = this.car;
    const maxF = CONFIG.carMaxSpeed, maxR = CONFIG.carReverseMax;
    if (this.input.f) car.speed += CONFIG.carAccel * dt;
    else if (this.input.b) {
      if (car.speed > 0.5) car.speed -= CONFIG.carBrake * dt;
      else car.speed -= CONFIG.carAccel * 0.6 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
    }
    car.speed = Math.max(-maxR, Math.min(maxF, car.speed));
    const steerInput = (this.input.l ? 1 : 0) - (this.input.r ? 1 : 0);
    const steerAmount = steerInput * CONFIG.carTurn * Math.min(1, Math.abs(car.speed) / 9) * Math.sign(car.speed || 1);
    car.heading += steerAmount * dt;
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    const fixed = resolveBuildings(this.world.colliders, car, 1.7);
    car.x = Math.max(-178, Math.min(178, fixed.x));
    car.z = Math.max(-178, Math.min(178, fixed.z));
    if ((fixed.x !== before.x || fixed.z !== before.z) && Math.abs(car.speed) > 9) {
      this.sound.crash();
      car.speed *= 0.45;
    }
    // Running over pedestrians.
    for (const p of this.peds) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - car.x, p.z - car.z) < 2.4 && Math.abs(car.speed) > 5) {
        p.remove(this.scene);
        this.addWanted(1, 'You ran over a pedestrian!');
        this.sound.crash();
      } else if (Math.hypot(p.x - car.x, p.z - car.z) < 9 && Math.abs(car.speed) > 8) {
        p.scare(car.x, car.z);
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels) {
      w.rotation.x += car.speed * dt * 2.4;
      if (car.mesh.userData.wheels.indexOf(w) < 2) w.rotation.y = steerInput * 0.32;
    }
    this.player.x = car.x; this.player.z = car.z;
    this.player.heading = car.heading;
  }

  updatePolice(dt) {
    for (const p of this.police) {
      const dist = p.update(dt, this.player, this.world.colliders);
      // Ram the player.
      if (dist < 4.2 && p.bumpCooldown <= 0) {
        p.bumpCooldown = 1;
        if (this.inCar && this.car) {
          this.car.speed *= 0.55;
          this.sound.crash();
          this.hud.toast('Police rammed you!');
        } else {
          this.health -= 12;
          this.sound.crash();
        }
      }
      // Busted: on foot, slow police right on top of you.
      if (!this.inCar && dist < 4 && p.speed < 4) {
        this.bustTimer += dt;
        if (this.bustTimer > 1.4) { this.gameOver('busted'); return; }
      }
      // Police open fire at higher wanted levels.
      if (this.wanted >= 2 && dist < 34 && !this.inCar) {
        this.health -= 5 * dt;
        if (Math.random() < dt * 1.2) this.sound.blip(180, 0.1, 'square', 0.05);
      }
    }
    if (!this.police.some((p) => Math.hypot(p.x - this.player.x, p.z - this.player.z) < 5)) {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
  }

  updateCarCollisions(dt) {
    const all = [];
    for (const c of this.traffic) if (c.alive) all.push({ x: c.x, z: c.z, r: 2.1, car: c, traffic: true });
    if (this.inCar && this.car) all.push({ x: this.car.x, z: this.car.z, r: 2.1, car: this.car, traffic: false });
    for (const p of this.police) if (p.alive) all.push({ x: p.x, z: p.z, r: 2.1, car: p, traffic: false });
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = a.r + b.r;
        if (d > 0.01 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push;
          b.x += nx * push; b.z += nz * push;
          if (!a.traffic && a.car.speed !== undefined && Math.abs(a.car.speed) > 8) this.sound.crash();
        }
      }
    }
    for (const a of all) {
      if (a.traffic) { a.car.x = a.x; a.car.z = a.z; }
      else if (a.car instanceof PoliceCar) { a.car.x = a.x; a.car.z = a.z; }
      else if (this.inCar && a.car === this.car) { a.car.x = a.x; a.car.z = a.z; }
    }
    void dt;
  }

  updateCamera(dt) {
    const target = this.inCar && this.car
      ? { x: this.car.x, z: this.car.z, heading: this.car.heading }
      : { x: this.player.x, z: this.player.z, heading: this.player.heading };
    const dist = this.inCar ? 14.5 : 7.5;
    const height = this.inCar ? 6.2 : 3.2;
    const yaw = this.camYaw;
    const cx = target.x - Math.sin(yaw) * dist;
    const cz = target.z - Math.cos(yaw) * dist;
    const cy = height + Math.sin(this.camPitch) * 2.2;
    // Keep the camera out of buildings: raycast from the look target toward
    // the desired camera spot and pull in just short of the first wall.
    const lookAt = new THREE.Vector3(
      target.x + Math.sin(target.heading) * 2, 1.6,
      target.z + Math.cos(target.heading) * 2);
    const desired = new THREE.Vector3(cx, cy, cz);
    const dir = desired.clone().sub(lookAt);
    const fullDist = dir.length();
    let useDist = fullDist;
    if (fullDist > 0.01) {
      const ray = new THREE.Raycaster(lookAt, dir.clone().normalize(), 0.5, fullDist);
      const hits = ray.intersectObjects(this.world.buildings, false);
      if (hits.length) useDist = Math.max(3.5, hits[0].distance - 0.8);
    }
    const pos = lookAt.clone().add(dir.normalize().multiplyScalar(useDist));
    const k = 1 - Math.exp(-dt * 7);
    this.camera.position.x += (pos.x - this.camera.position.x) * k;
    this.camera.position.y += (pos.y - this.camera.position.y) * k;
    this.camera.position.z += (pos.z - this.camera.position.z) * k;
    this.camera.lookAt(lookAt);
  }

  // ---- deterministic screenshots -------------------------------------------
  stageShot(name) {
    const rng = makeRng(99);
    this.hud.show();
    $('screen-title').classList.add('hidden');
    if (name === 'start') {
      // Title card over a high city vista.
      const title = $('screen-title');
      title.classList.remove('hidden');
      title.style.background = 'linear-gradient(180deg, rgba(5,8,18,.25) 0%, rgba(5,8,18,.55) 100%)';
      $('btn-start').classList.add('hidden');
      $('btn-continue').classList.add('hidden');
      this.camera.position.set(-150, 95, 190);
      this.camera.lookAt(20, 8, -10);
      this.hud.hide();
      this.frozen = true;
      this.renderer.render(this.scene, this.camera);
      window.__shotReady = true;
      return;
    }
    // Every other shot is live play: hide the title, drive with the HUD on.
    // All staging spots sit ON roads (grid lines), with a long clear run
    // ahead, so the autopilot never ends up inside a building.
    this.state = 'playing';
    this.scene.updateMatrixWorld(true);
    if (name === 'play') {
      const car = this.parked[1];
      car.taken = true;
      this.car = car; this.inCar = true;
      this.player.mesh.visible = false;
      car.x = -24; car.z = -120; car.heading = 0; car.speed = 22;
      this.player.x = car.x; this.player.z = car.z;
      this.camYaw = 0.1;
      this.missions.startMission(0);
    } else if (name === 'chase') {
      const car = this.parked[1];
      car.taken = true;
      this.car = car; this.inCar = true;
      this.player.mesh.visible = false;
      car.x = 24; car.z = 120; car.heading = Math.PI; car.speed = 30;
      this.player.x = car.x; this.player.z = car.z;
      this.camYaw = Math.PI;
      this.setWanted(3);
      // Police placed where the camera can see them: two ahead in the
      // chase lane, one alongside — they close in during the staged drive.
      const spots = [[30, 84], [18, 72], [38, 96]];
      for (const [px, pz] of spots) {
        this.police.push(new PoliceCar(this.scene, px, pz));
      }
      this.missions.startMission(2);
    } else if (name === 'mission') {
      const car = this.parked[1];
      car.taken = true;
      this.car = car; this.inCar = true;
      this.player.mesh.visible = false;
      // Westbound on Marlin Street toward the docks marker at (-150, 130).
      car.x = -110; car.z = 120; car.heading = -Math.PI / 2; car.speed = 24;
      this.player.x = car.x; this.player.z = car.z;
      this.camYaw = -Math.PI / 2;
      this.missions.startMission(0);
      this.cash = 540;
    }
    // Drive forward on autopilot for a fixed stretch, then freeze the frame.
    // The chase and mission shots use a shorter run so the police and the
    // waypoint marker are still in front of the camera when it freezes.
    const steps = name === 'chase' ? 60 : name === 'mission' ? 45 : 150;
    this.input.f = true;
    for (let i = 0; i < steps; i += 1) this.update(STEP);
    this.input.f = false;
    this.renderer.render(this.scene, this.camera);
    this.frozen = true;
    window.__shotReady = true;
  }
}

// Boot.
const game = new Game();
window.__game = game;
if (shotName) {
  game.stageShot(shotName);
}
