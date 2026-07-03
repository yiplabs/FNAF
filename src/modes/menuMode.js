import * as THREE from 'three';
import { el, button, panel, field, slider, select, uiRoot, toast } from '../ui/dom.js';
import { MAX_SLOTS } from '../core/saves.js';

// Title screen: animated 3D stage backdrop + save slots + settings.

let scene, camera, root, flickerLight;
let ctxRef;
let t = 0;

function buildBackdrop() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050507, 6, 26);
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 1.6, 7.5);

  root = new THREE.Group();
  scene.add(root);

  // checkerboard floor via procedural canvas texture
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 256;
  const c2 = cnv.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      c2.fillStyle = (x + y) % 2 ? '#16161c' : '#0b0b0f';
      c2.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  const floorTex = new THREE.CanvasTexture(cnv);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(6, 6);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  // stage platform
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.5, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x241b12, roughness: 0.8 }),
  );
  stage.position.set(0, 0.25, -3);
  root.add(stage);

  // curtains
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0x3d1024, roughness: 1 });
  for (const side of [-1, 1]) {
    const curtain = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5.4, 0.5), curtainMat);
    curtain.position.set(side * 5.1, 2.7, -4.4);
    root.add(curtain);
  }
  const valance = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1, 0.5), curtainMat);
  valance.position.set(0, 5, -4.4);
  root.add(valance);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 12),
    new THREE.MeshStandardMaterial({ color: 0x0d0d13, roughness: 1 }),
  );
  backWall.position.set(0, 6, -4.8);
  root.add(backWall);

  // three shadowy animatronic silhouettes on stage
  const silhouetteMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.95 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xf5f5ff, emissiveIntensity: 1.6 });
  const positions = [[-2.6, 'bear'], [0, 'bunny'], [2.6, 'chicken']];
  for (const [x, kind] of positions) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.8, 4, 10), silhouetteMat);
    torso.position.y = 1.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), silhouetteMat);
    head.position.y = 2.65;
    g.add(torso, head);
    for (const side of [-1, 1]) {
      if (kind === 'bunny') {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.7, 3, 6), silhouetteMat);
        ear.position.set(side * 0.2, 3.45, 0);
        g.add(ear);
      } else if (kind === 'bear') {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), silhouetteMat);
        ear.position.set(side * 0.35, 3.05, 0);
        g.add(ear);
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
      eye.position.set(side * 0.17, 2.7, 0.4);
      g.add(eye);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.75, 3, 6), silhouetteMat);
      arm.position.set(side * 0.75, 1.6, 0);
      arm.rotation.z = side * 0.25;
      g.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 3, 6), silhouetteMat);
      leg.position.set(side * 0.28, 0.55, 0);
      g.add(leg);
    }
    if (kind === 'chicken') {
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), silhouetteMat);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 2.6, 0.5);
      g.add(beak);
    }
    g.position.set(x, 0.5, -3);
    g.userData.baseX = x;
    root.add(g);
  }

  scene.add(new THREE.AmbientLight(0x404050, 0.5));
  flickerLight = new THREE.PointLight(0xc9a227, 12, 20, 1.6);
  flickerLight.position.set(0, 4.4, 0.5);
  scene.add(flickerLight);
  const rim = new THREE.PointLight(0x7b2fbe, 4, 16, 2);
  rim.position.set(-6, 2, -1);
  scene.add(rim);
}

function slotList(onPick, { showDelete = false } = {}) {
  const list = el('div', { class: 'col' });
  const rows = ctxRef.saves.listSlots();
  for (const s of rows) {
    const label = s.empty
      ? el('span', { class: 'slot-name', text: `SLOT ${s.slot + 1} — EMPTY`, style: { color: '#55555f' } })
      : el('span', { class: 'slot-name', text: `SLOT ${s.slot + 1} — ${s.name}` });
    const meta = s.empty ? null : el('span', { class: 'slot-meta', text: `Night ${s.night}` });
    const row = el('div', { class: 'slot-row' }, label, meta);
    if (!s.empty) {
      row.append(button('Load', () => onPick(s.slot), 'small primary'));
      if (showDelete) {
        row.append(button('X', () => {
          ctxRef.saves.deleteSlot(s.slot);
          row.replaceWith(...[]);
          toast(`Slot ${s.slot + 1} deleted`);
          renderMain();
        }, 'small danger'));
      }
    }
    list.append(row);
  }
  return list;
}

let screenEl = null;

function renderMain() {
  screenEl?.remove();
  const hasSaves = ctxRef.saves.listSlots().some(s => !s.empty);

  screenEl = el('div', { class: 'screen fade-in' },
    el('h1', { class: 'title-glow', text: 'FAZ-SIM', style: { fontSize: '64px', letterSpacing: '18px' } }),
    el('div', { class: 'hint', text: 'A FAN-MADE ANIMATRONIC UNIVERSE SIMULATOR' }),
    el('div', { class: 'menu-stack' },
      button('New Universe', () => { ctxRef.audio.sfx.uiClick(); ctxRef.app.switchMode('hub', { newUniverse: true }); }, 'primary'),
      button('Continue', () => { ctxRef.audio.sfx.uiClick(); renderSlots(); }, hasSaves ? '' : ''),
      button('Settings', () => { ctxRef.audio.sfx.uiClick(); renderSettings(); }),
    ),
    el('div', { class: 'disclaimer', text: 'Unofficial fan project. Five Nights at Freddy’s was created by Scott Cawthon — this non-commercial fan game uses only original, procedurally generated assets and is not affiliated with or endorsed by Scott Cawthon or Steel Wool Studios.' }),
  );
  uiRoot().append(screenEl);
}

function renderSlots() {
  screenEl?.remove();
  screenEl = el('div', { class: 'screen fade-in' },
    el('h2', { class: 'title-glow', text: 'SELECT UNIVERSE' }),
    panel(slotList((slot) => {
      ctxRef.audio.sfx.uiClick();
      ctxRef.app.switchMode('hub', { slot });
    }, { showDelete: true })),
    button('Back', renderMain),
  );
  uiRoot().append(screenEl);
}

function renderSettings() {
  screenEl?.remove();
  const s = ctxRef.saves.get();
  screenEl = el('div', { class: 'screen fade-in' },
    el('h2', { class: 'title-glow', text: 'SETTINGS' }),
    panel(el('div', { class: 'col', style: { width: '320px' } },
      field('Master volume', slider({ value: s.volume, oninput: v => ctxRef.saves.updateSettings({ volume: v }) })),
      field('SFX volume', slider({ value: s.sfxVolume, oninput: v => ctxRef.saves.updateSettings({ sfxVolume: v }) })),
      field('Ambient volume', slider({ value: s.ambientVolume, oninput: v => ctxRef.saves.updateSettings({ ambientVolume: v }) })),
      field('Mouse sensitivity', slider({ min: 0.2, max: 3, value: s.sensitivity, oninput: v => ctxRef.saves.updateSettings({ sensitivity: v }) })),
      field('Quality', select(['low', 'medium', 'high'], s.quality, v => {
        ctxRef.saves.updateSettings({ quality: v });
        ctxRef.engine.setQuality(v);
      })),
    )),
    button('Back', renderMain),
  );
  uiRoot().append(screenEl);
}

export const menuMode = {
  enter(ctx) {
    ctxRef = ctx;
    if (!scene) buildBackdrop();
    ctx.audio.ambient.menuTheme();
    renderMain();
  },

  exit() {
    ctxRef?.audio.ambient.stopMenuTheme();
    screenEl = null;
  },

  update(dt) {
    t += dt;
  },

  frame() {
    if (!scene) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    camera.position.x = Math.sin(t * 0.1) * 2.2;
    camera.position.y = 1.7 + Math.sin(t * 0.23) * 0.15;
    camera.lookAt(0, 1.8, -3);
    // light flicker: mostly steady with occasional dips
    const n = Math.sin(t * 17.3) * Math.sin(t * 5.1) * Math.sin(t * 2.7);
    flickerLight.intensity = n > 0.88 ? 2.5 : 12;
    ctxRef.engine.renderer.render(scene, camera);
  },
};
