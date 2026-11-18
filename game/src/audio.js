// Sunset Bay — all sound is synthesized live with WebAudio. No audio files,
// no network: engine hum, sirens, gunshots, pickups and jingles are built
// from oscillators and filtered noise.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: a low sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    // Siren: two alternating tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain ? null : null;
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.sirenGain) this.sirenGain.gain.value = 0;
  }

  setEngine(on, speed01) {
    if (!this.ctx || this.muted) return;
    const target = on ? 0.05 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, this.ctx.currentTime, 0.1);
  }

  setSiren(on, dt) {
    if (!this.ctx) return;
    if (!on || this.muted) {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 920 : 660;
    }
    this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.05);
  }

  blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }

  shot() {
    if (!this.ctx || this.muted) return;
    const dur = 0.16;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.value = 0.22;
    src.connect(filter); filter.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  crash() {
    if (!this.ctx || this.muted) return;
    this.blip(90, 0.25, 'square', 0.16);
    this.blip(60, 0.3, 'sawtooth', 0.12);
  }

  jingle() {
    if (!this.ctx || this.muted) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.22, 'triangle', 0.14), i * 110);
    });
  }

  fail() {
    if (!this.ctx || this.muted) return;
    [330, 262, 196].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.1), i * 160);
    });
  }
}
