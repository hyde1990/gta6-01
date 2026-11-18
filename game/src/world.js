// Sunset Bay — the city itself: streets, buildings, beach, ocean and sky.
// All geometry is generated at boot from the seeded RNG, so the same seed
// always builds the same Solmar Bay. No external assets: every texture is
// painted on a canvas at runtime.
import { CONFIG } from './config.js';
import { makeRng } from './rng.js';

const THREE = globalThis.THREE;

// Road centre lines, in metres. pitch = block + road.
export function gridLines() {
  const pitch = CONFIG.block + CONFIG.road;
  const lines = [];
  const half = (CONFIG.blocks * pitch) / 2;
  for (let i = 0; i <= CONFIG.blocks; i += 1) lines.push(-half + i * pitch + CONFIG.road / 2);
  return lines;
}

export function cityBounds() {
  const pitch = CONFIG.block + CONFIG.road;
  return (CONFIG.blocks * pitch) / 2 + CONFIG.road / 2;
}

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function groundTexture(rng) {
  const size = 1024;
  const half = cityBounds();
  const scale = size / (half * 2 + 80);
  return canvasTexture(size, (g) => {
    g.fillStyle = '#5d6b52'; g.fillRect(0, 0, size, size); // outer ground
    // Beach + ocean on the west edge.
    g.fillStyle = '#e8d29a'; g.fillRect(0, 0, 70, size);
    g.fillStyle = '#2f7fc9'; g.fillRect(0, 0, 46, size);
    g.fillStyle = '#7ec8f2'; g.fillRect(40, 0, 8, size);
    const toPx = (v) => (v + half + 40) * scale;
    // City base.
    g.fillStyle = '#3d4450'; g.fillRect(toPx(-half), toPx(-half), half * 2 * scale, half * 2 * scale);
    const lines = gridLines();
    // Sidewalks.
    g.fillStyle = '#9aa1ad';
    for (const x of lines) {
      g.fillRect(toPx(x - CONFIG.road / 2 - 2), toPx(-half), (CONFIG.road + 4) * scale, half * 2 * scale);
      g.fillRect(toPx(-half), toPx(x - CONFIG.road / 2 - 2), half * 2 * scale, (CONFIG.road + 4) * scale);
    }
    // Asphalt.
    g.fillStyle = '#2b2f38';
    for (const x of lines) {
      g.fillRect(toPx(x - CONFIG.road / 2), toPx(-half), CONFIG.road * scale, half * 2 * scale);
      g.fillRect(toPx(-half), toPx(x - CONFIG.road / 2), half * 2 * scale, CONFIG.road * scale);
    }
    // Lane dashes.
    g.strokeStyle = '#f7d54d'; g.lineWidth = 2; g.setLineDash([14, 16]);
    for (const x of lines) {
      g.beginPath(); g.moveTo(toPx(x), toPx(-half)); g.lineTo(toPx(x), toPx(half)); g.stroke();
      g.beginPath(); g.moveTo(toPx(-half), toPx(x)); g.lineTo(toPx(half), toPx(x)); g.stroke();
    }
    g.setLineDash([]);
    // Crosswalks at every intersection.
    g.fillStyle = '#e8ecf2';
    for (const x of lines) for (const z of lines) {
      for (let i = -3; i <= 3; i += 1) {
        g.fillRect(toPx(x + i * 1.6 - 0.7), toPx(z - CONFIG.road / 2 + 1), 1.4 * scale, 2.4 * scale);
        g.fillRect(toPx(x + i * 1.6 - 0.7), toPx(z + CONFIG.road / 2 - 3.4), 1.4 * scale, 2.4 * scale);
      }
    }
    // A few parks.
    g.fillStyle = '#4d8a4a';
    g.fillRect(toPx(-120), toPx(24), 30 * scale, 30 * scale);
    g.fillRect(toPx(72), toPx(-120), 30 * scale, 30 * scale);
    void rng;
  });
}

function windowTexture(base, lit) {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let y = 8; y < s - 8; y += 16) {
      for (let x = 8; x < s - 8; x += 16) {
        g.fillStyle = Math.random() < 0.45 ? lit : '#1c2433';
        g.fillRect(x, y, 9, 11);
      }
    }
  });
}

function billboardTexture(text, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#141824'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#ffd23d'; g.lineWidth = 5; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = '#ffd23d'; g.font = 'bold 34px Verdana'; g.textAlign = 'center';
  g.fillText(text, 128, 58);
  g.fillStyle = '#fff'; g.font = 'bold 20px Verdana';
  g.fillText(sub, 128, 96);
  return new THREE.CanvasTexture(canvas);
}

export function buildWorld(scene, seed) {
  const rng = makeRng(seed);
  const half = cityBounds();
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const group = new THREE.Group();
  scene.add(group);

  // Sky, sun and light.
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc6e8, 260, 620);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5d6b52, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7b0, 1.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 520;
  scene.add(sun);
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }),
  );
  sunBall.position.set(300, 190, -260);
  scene.add(sunBall);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, half * 2 + 80),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.x = -40;
  ground.receiveShadow = true;
  group.add(ground);

  // Ocean plane (west) and sand are in the ground texture; add gentle waves
  // as a translucent plane that bobs.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(60, half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x2f7fc9, transparent: true, opacity: 0.55 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-half - 62, 0.15, 0);
  group.add(ocean);

  // Buildings: one to three boxes per block, taller toward downtown.
  const buildings = [];
  const wallTex = [
    windowTexture('#8a6f5c', '#ffd98a'),
    windowTexture('#5c6e8a', '#bfe3ff'),
    windowTexture('#7a5c7a', '#ffc4d6'),
    windowTexture('#6e7d5a', '#fff3b0'),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const lines = gridLines();
  for (let bx = 0; bx < CONFIG.blocks; bx += 1) {
    for (let bz = 0; bz < CONFIG.blocks; bz += 1) {
      const cx = lines[bx] + CONFIG.road / 2 + CONFIG.block / 2;
      const cz = lines[bz] + CONFIG.road / 2 + CONFIG.block / 2;
      // Two parks stay open.
      if ((bx === 1 && bz === 4) || (bx === 5 && bz === 1)) continue;
      const distCentre = Math.hypot(cx, cz) / half;
      const count = rng.chance(0.55) ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const w = rng.range(10, 16);
        const d = rng.range(10, 16);
        const h = Math.max(7, rng.range(9, 34) * (1.25 - distCentre * 0.7));
        const ox = count === 1 ? 0 : (k === 0 ? -8 : 8);
        const oz = count === 1 ? 0 : (k === 0 ? -8 : 8);
        const mat = new THREE.MeshLambertMaterial({ map: wallTex[rng.int(0, 3)] });
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        box.position.set(cx + ox, h / 2, cz + oz);
        box.castShadow = true; box.receiveShadow = true;
        group.add(box);
        buildings.push(box);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
        roof.position.set(cx + ox, h + 0.25, cz + oz);
        group.add(roof);
        colliders.push({
          minX: cx + ox - w / 2, maxX: cx + ox + w / 2,
          minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2,
        });
        // Rooftop AC box on tall towers.
        if (h > 20 && rng.chance(0.6)) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), roofMat);
          ac.position.set(cx + ox, h + 1.2, cz + oz);
          group.add(ac);
        }
      }
    }
  }

  // Palms along the beach and a few avenues.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44 });
  function palm(x, z) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5; trunk.castShadow = true;
    p.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.4, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      p.add(leaf);
    }
    p.position.set(x, 0, z);
    group.add(p);
  }
  for (let z = -160; z <= 160; z += 26) palm(-half - 46 + rng.range(-2, 2), z);
  for (let i = 0; i < 14; i += 1) palm(rng.range(-160, 160), rng.pick(lines) + rng.pick([-9, 9]));

  // Billboards with the city's own names.
  const boards = [
    { text: 'SOLMAR BAY', sub: 'sun · sand · trouble', x: 24, z: -120, ry: 0 },
    { text: 'MAMA ROSA', sub: 'loans · no questions', x: -72, z: 72, ry: Math.PI / 2 },
    { text: 'CORAL HOTEL', sub: 'rooms by the hour', x: 120, z: 24, ry: Math.PI },
  ];
  for (const b of boards) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 8),
      new THREE.MeshBasicMaterial({ map: billboardTexture(b.text, b.sub) }),
    );
    mesh.position.set(b.x, 9, b.z);
    mesh.rotation.y = b.ry;
    group.add(mesh);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 6), roofMat);
    pole.position.set(b.x, 3, b.z);
    group.add(pole);
  }

  // Streetlights at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c313c });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of lines) {
    for (const z of lines) {
      if (rng.chance(0.5)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6, 6), poleMat);
      pole.position.set(x + 8.5, 3, z + 8.5);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat);
      lamp.position.set(x + 8.5, 6.2, z + 8.5);
      group.add(lamp);
    }
  }

  // Drifting clouds.
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i += 1) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(4, 8), 8, 8), cloudMat);
      s.position.set(j * 6 - 6, rng.range(-1, 1), rng.range(-2, 2));
      s.scale.y = 0.35;
      c.add(s);
    }
    c.position.set(rng.range(-260, 260), rng.range(90, 130), rng.range(-260, 260));
    scene.add(c);
    clouds.push(c);
  }

  return { group, colliders, clouds, ocean, half, buildings };
}

// Push a circle (x,z,r) out of building colliders. Returns true on contact.
export function collideBuildings(colliders, x, z, r) {
  let hit = false;
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
      const dxl = x + r - c.minX, dxr = c.maxX - (x - r);
      const dzl = z + r - c.minZ, dzr = c.maxZ - (z - r);
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = c.minX - r; else if (m === dxr) x = c.maxX + r;
      else if (m === dzl) z = c.minZ - r; else z = c.maxZ + r;
      hit = true;
    }
  }
  return { x, z, hit };
}

// Resolve a circle against colliders in place; returns the corrected position.
export function resolveBuildings(colliders, pos, r) {
  let x = pos.x, z = pos.z;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; z = nz + (dz / d) * r;
      } else {
        x = c.minX - r;
      }
    }
  }
  return { x, z };
}
