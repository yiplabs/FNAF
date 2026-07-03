import * as THREE from 'three';

// Procedural prop meshes. Each builder returns a Group centered on its cell,
// sized for the default 2.5m cell.

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });

function table() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16), mat(0xd8d8e0));
  top.position.y = 0.75;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.75, 8), mat(0x555560));
  leg.position.y = 0.37;
  g.add(top, leg);
  // party hats
  const hatMat = [mat(0xc0392b), mat(0x2980b9), mat(0xc9a227)];
  for (let i = 0; i < 3; i++) {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 8), hatMat[i % 3]);
    const a = (i / 3) * Math.PI * 2 + 0.6;
    hat.position.set(Math.cos(a) * 0.45, 0.91, Math.sin(a) * 0.45);
    g.add(hat);
  }
  return g;
}

function stagePlatform() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 2.4), mat(0x3a2a1a));
  deck.position.y = 0.175;
  g.add(deck);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 2.5), mat(0xc9a227, { metalness: 0.4 }));
  trim.position.y = 0.38;
  g.add(trim);
  // star backdrop pole lights
  for (const dx of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), mat(0x777788, { metalness: 0.6 }));
    pole.position.set(dx * 1.1, 1.45, -1.05);
    g.add(pole);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe9a0, emissiveIntensity: 1.2 }),
    );
    bulb.position.set(dx * 1.1, 2.6, -1.05);
    g.add(bulb);
  }
  return g;
}

function arcade() {
  const g = new THREE.Group();
  const bodyColors = [0x6a3a7a, 0x2d5c8c, 0x8c2d2d];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.7, 0.7),
    mat(bodyColors[Math.floor(Math.random() * 0)] ?? 0x6a3a7a),
  );
  body.position.y = 0.85;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x2be86a, emissiveIntensity: 0.9 }),
  );
  screen.position.set(0, 1.15, 0.36);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.3), mat(0x222230));
  panel.position.set(0, 0.85, 0.36);
  panel.rotation.x = -0.5;
  g.add(body, screen, panel);
  return g;
}

let posterTexCache = null;
function posterTexture() {
  if (posterTexCache) return posterTexCache;
  const cnv = document.createElement('canvas');
  cnv.width = 96; cnv.height = 128;
  const c = cnv.getContext('2d');
  c.fillStyle = '#e8e0c8'; c.fillRect(0, 0, 96, 128);
  c.fillStyle = '#3a2a1a';
  c.beginPath(); c.arc(48, 52, 26, 0, Math.PI * 2); c.fill();      // head
  c.beginPath(); c.arc(30, 30, 9, 0, Math.PI * 2); c.fill();       // ears
  c.beginPath(); c.arc(66, 30, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d2a679';
  c.beginPath(); c.arc(48, 62, 12, 0, Math.PI * 2); c.fill();      // muzzle
  c.fillStyle = '#111';
  c.beginPath(); c.arc(39, 46, 4, 0, Math.PI * 2); c.fill();       // eyes
  c.beginPath(); c.arc(57, 46, 4, 0, Math.PI * 2); c.fill();
  c.font = 'bold 14px Courier New';
  c.textAlign = 'center';
  c.fillText('LET\'S PARTY!', 48, 108);
  posterTexCache = new THREE.CanvasTexture(cnv);
  return posterTexCache;
}

function poster() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1.05),
    new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: 1 }),
  );
  // hung on the north wall of the cell; rot handles other walls
  m.position.set(0, 1.7, -1.18);
  g.add(m);
  return g;
}

function shelf() {
  const g = new THREE.Group();
  const unit = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 0.5), mat(0x4a3a2a));
  unit.position.set(0, 0.95, -0.95);
  g.add(unit);
  // junk boxes
  for (let i = 0; i < 4; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 + (i % 2) * 0.15, 0.3, 0.35),
      mat(i % 2 ? 0x6a5a45 : 0x3d3d4a),
    );
    box.position.set(-0.7 + i * 0.45, 1.05 + (i % 2) * 0.5, -0.85);
    g.add(box);
  }
  // spare head on the top shelf (backstage vibes)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0x8a7a5a));
  head.position.set(0.55, 1.62, -0.85);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0xffffff, emissiveIntensity: 0.8 }),
  );
  eye.position.set(0.48, 1.66, -0.66);
  g.add(head, eye);
  return g;
}

function fan() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.1, 10), mat(0x30303a, { metalness: 0.5 }));
  base.position.y = 0.05;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), mat(0x30303a, { metalness: 0.5 }));
  pole.position.y = 0.45;
  const cage = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.02, 6, 16),
    mat(0x888895, { metalness: 0.6 }),
  );
  cage.position.set(0, 0.95, 0);
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.01), mat(0xaaaabb, { metalness: 0.4 }));
    blade.position.y = 0.13;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    holder.add(blade);
    blades.add(holder);
  }
  blades.position.set(0, 0.95, 0);
  blades.name = 'fanBlades';
  g.add(base, pole, cage, blades);
  return g;
}

const BUILDERS = { table, stagePlatform, arcade, poster, shelf, fan };

export function buildProp(prop, cellSize) {
  const builder = BUILDERS[prop.type];
  if (!builder) return null;
  const g = builder();
  g.rotation.y = -(prop.rot || 0) * Math.PI / 2;
  g.position.set((prop.cell[0] + 0.5) * cellSize, 0, (prop.cell[1] + 0.5) * cellSize);
  return g;
}

export const PROP_TYPES = Object.keys(BUILDERS);
