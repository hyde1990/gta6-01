// Sunset Bay — the story: four jobs for Mama Rosa, run in order.
// The manager owns the waypoint marker and the step timers; the game owns
// the consequences (cash, wanted level, toasts) through the hooks.
import { MISSIONS } from './config.js';

const THREE = globalThis.THREE;

export class MissionManager {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.active = false;
    this.done = false;
    this.timer = 0;
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.25, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.75 }),
    );
    ring.position.y = 0.15;
    this.marker.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 30;
    this.marker.add(beam);
    this.marker.visible = false;
    scene.add(this.marker);
    this.pulse = 0;
  }

  mission() { return MISSIONS[this.missionIndex]; }
  step() { const m = this.mission(); return m ? m.steps[this.stepIndex] : null; }

  startMission(index) {
    this.missionIndex = index;
    this.stepIndex = 0;
    this.active = true;
    const m = this.mission();
    this.hooks.onToast(m.title);
    this.hooks.onObjective(m.title, m.steps[0].text);
    this.placeMarker();
    if (this.step().wanted) this.hooks.setWanted(this.step().wanted);
    if (this.step().timer) this.timer = this.step().timer;
  }

  placeMarker() {
    const s = this.step();
    if (!s) { this.marker.visible = false; return; }
    this.marker.position.set(s.x, 0, s.z);
    this.marker.visible = true;
  }

  // The player reached the marker (or pressed E on it). Returns 'advanced' |
  // 'mission-done' | 'none'.
  arrive() {
    const s = this.step();
    if (!s) return 'none';
    const m = this.mission();
    this.stepIndex += 1;
    if (this.stepIndex >= m.steps.length) {
      this.active = false;
      this.marker.visible = false;
      this.hooks.onReward(m.reward);
      this.hooks.onToast(`JOB DONE — +$${m.reward}`);
      this.hooks.onObjective('FREE ROAM', 'Explore Sunset Bay. Press E near a car to steal it.');
      if (this.missionIndex + 1 >= MISSIONS.length) {
        this.done = true;
        this.hooks.onStoryDone();
      } else {
        this.hooks.onMissionDone(this.missionIndex);
      }
      return 'mission-done';
    }
    const next = this.step();
    this.hooks.onObjective(m.title, next.text);
    this.placeMarker();
    if (next.wanted !== undefined) this.hooks.setWanted(next.wanted);
    if (next.timer) this.timer = next.timer;
    return 'advanced';
  }

  fail(reason) {
    this.active = false;
    this.marker.visible = false;
    this.hooks.onToast(`JOB FAILED — ${reason}`);
    this.hooks.onObjective('FREE ROAM', 'The job failed. Talk to Mama Rosa — press R to retry it.');
  }

  retry() {
    this.startMission(this.missionIndex);
  }

  update(dt, px, pz) {
    this.pulse += dt;
    if (this.marker.visible) {
      const s = 1 + Math.sin(this.pulse * 4) * 0.12;
      this.marker.scale.set(s, 1, s);
    }
    if (!this.active) return;
    const s = this.step();
    if (!s) return;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail('Out of time.'); return; }
    }
    const d = Math.hypot(px - s.x, pz - s.z);
    if (d < 5 && (s.action === 'deliver')) this.arrive();
  }

  objectiveLine() {
    if (!this.active) return null;
    const s = this.step();
    return { title: this.mission().title, text: s.text, timer: this.timer > 0 ? Math.ceil(this.timer) : 0 };
  }
}
