// Sunset Bay — the HUD: cash, health, wanted stars, objective, speed and the
// circular minimap. All DOM; the minimap is one 2D canvas redrawn each frame.
import { gridLines, cityBounds } from './world.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      cash: document.getElementById('cash'),
      healthfill: document.getElementById('healthfill'),
      healthnum: document.getElementById('healthnum'),
      stars: document.getElementById('stars'),
      objTitle: document.getElementById('obj-title'),
      objText: document.getElementById('obj-text'),
      speed: document.getElementById('speed'),
      speednum: document.getElementById('speednum'),
      speedlabel: document.getElementById('speedlabel'),
      toast: document.getElementById('toast'),
      crosshair: document.getElementById('crosshair'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.lastWanted = -1;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  toast(text, ms = 2600) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, ms);
  }

  setObjective(title, text) {
    this.el.objTitle.textContent = title;
    this.el.objText.textContent = text;
  }

  update(s) {
    this.el.cash.textContent = `$${Math.floor(s.cash).toLocaleString('en-US')}`;
    this.el.healthfill.style.width = `${Math.max(0, s.health)}%`;
    this.el.healthnum.textContent = Math.ceil(Math.max(0, s.health));
    if (s.wanted !== this.lastWanted) {
      this.lastWanted = s.wanted;
      this.el.stars.textContent = '★'.repeat(s.wanted) + '☆'.repeat(Math.max(0, 5 - s.wanted));
      this.el.stars.style.visibility = s.wanted > 0 ? 'visible' : 'hidden';
    }
    if (s.inCar) {
      this.el.speed.classList.remove('hidden');
      this.el.speednum.textContent = Math.round(Math.abs(s.speed) * 2.2);
      this.el.speedlabel.textContent = s.speed < -0.5 ? 'MPH · REVERSING · E to exit' : 'MPH · E to exit';
    } else {
      this.el.speed.classList.add('hidden');
    }
    this.el.crosshair.style.display = s.aiming ? 'block' : 'none';
    if (s.objective) {
      this.el.objTitle.textContent = s.objective.title;
      this.el.objText.textContent = s.objective.timer > 0
        ? `${s.objective.text} — ${s.objective.timer}s left`
        : s.objective.text;
    }
  }

  drawMinimap(player, traffic, police, waypoint, bounds) {
    const ctx = this.mapCtx;
    const S = 180;
    const half = bounds + 30;
    const toMap = (v) => ((v + half) / (half * 2)) * S;
    ctx.clearRect(0, 0, S, S);
    // Sea + land.
    ctx.fillStyle = '#16324a'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#22303f'; ctx.fillRect(toMap(-cityBounds()), 0, S - toMap(-cityBounds()), S);
    // Roads.
    ctx.strokeStyle = '#5a6675'; ctx.lineWidth = 5;
    for (const l of gridLines()) {
      ctx.beginPath(); ctx.moveTo(toMap(l), 0); ctx.lineTo(toMap(l), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toMap(l)); ctx.lineTo(S, toMap(l)); ctx.stroke();
    }
    ctx.strokeStyle = '#8a94a3'; ctx.lineWidth = 1;
    for (const l of gridLines()) {
      ctx.beginPath(); ctx.moveTo(toMap(l), 0); ctx.lineTo(toMap(l), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toMap(l)); ctx.lineTo(S, toMap(l)); ctx.stroke();
    }
    const dot = (x, z, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(toMap(x), toMap(z), r, 0, Math.PI * 2); ctx.fill();
    };
    if (waypoint) {
      const pulse = 5 + Math.sin(performance.now() / 240) * 2;
      dot(waypoint.x, waypoint.z, pulse, '#ffd23d');
      ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(toMap(waypoint.x), toMap(waypoint.z), pulse + 4, 0, Math.PI * 2); ctx.stroke();
    }
    for (const c of traffic) if (c.alive) dot(c.x, c.z, 2, '#ffe14d');
    for (const p of police) if (p.alive) dot(p.x, p.z, 3.5, '#ff4d4d');
    // Player arrow.
    const px = toMap(player.x), pz = toMap(player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    void cityBounds;
  }
}
