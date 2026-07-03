import * as THREE from 'three';
import { el, button } from '../ui/dom.js';
import { ROOM_COLORS } from '../data/schemas.js';

// Security camera tablet: one real camera teleported between fixtures,
// CRT overlay, static, and a 2D minimap. Authentic rule: while the tablet
// is up you cannot touch the doors.

export function createTablet({ layout, graph, audio, cameraFixtures, onViewChange }) {
  const cams = layout.cameras;
  let currentIdx = 0;
  let isOpen = false;
  let staticTimer = 0;

  const camera = new THREE.PerspectiveCamera(74, 1, 0.08, 60);

  const labelEl = el('div', { class: 'cam-label' }, el('span', { class: 'rec-dot' }), '');
  const staticEl = el('div', { class: 'static-noise' });
  const heavyStaticEl = el('div', { class: 'static-noise heavy', style: { display: 'none' } });

  const mapCanvas = el('canvas', { width: 180, height: 130 });
  const mapWrap = el('div', { class: 'cam-map' }, mapCanvas);

  const camBtns = el('div', { class: 'cam-btn-row' },
    ...cams.map((cam, i) => button(cam.label.split(' ')[0], () => select(i), 'small')),
  );

  const root = el('div', { class: 'cam-hud crt', style: { display: 'none' } },
    staticEl, heavyStaticEl, labelEl, mapWrap, camBtns,
  );

  function positionCamera() {
    const cam = cams[currentIdx];
    if (!cam) return;
    const s = layout.grid.cell;
    camera.position.set((cam.cell[0] + 0.5) * s, 2.55, (cam.cell[1] + 0.5) * s);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(cam.yaw + Math.PI);
    camera.rotateX(-0.3);
  }

  function drawMap() {
    const c = mapCanvas.getContext('2d');
    const { w, h } = layout.grid;
    const sx = mapCanvas.width / w, sy = mapCanvas.height / h;
    c.fillStyle = '#05050a';
    c.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = graph.roomOf[y * w + x];
        if (r === -1) continue;
        const type = graph.rooms[r].type;
        c.fillStyle = ROOM_COLORS[type] || '#444';
        c.globalAlpha = 0.55;
        c.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
      }
    }
    c.globalAlpha = 1;
    cams.forEach((cam, i) => {
      c.fillStyle = i === currentIdx ? '#ffe14a' : '#5a5a66';
      c.beginPath();
      c.arc((cam.cell[0] + 0.5) * sx, (cam.cell[1] + 0.5) * sy, i === currentIdx ? 4 : 2.5, 0, Math.PI * 2);
      c.fill();
    });
  }

  function select(i) {
    currentIdx = i;
    // hide the fixture we're looking out of, show every other one
    if (cameraFixtures) {
      cams.forEach((cam, j) => {
        const f = cameraFixtures.get(cam.id);
        if (f) f.visible = j !== i || !isOpen;
      });
    }
    positionCamera();
    drawMap();
    labelEl.childNodes[1].textContent = ` ${cams[i]?.label ?? 'CAM ?'}`;
    burstStatic(0.12 + Math.random() * 0.18);
    audio.sfx.camBlip();
    onViewChange?.(tablet.viewedRoom());
  }

  function burstStatic(duration) {
    staticTimer = duration;
    heavyStaticEl.style.display = '';
  }

  const tablet = {
    root,
    camera,
    get isOpen() { return isOpen; },

    open() {
      if (!cams.length) return;
      isOpen = true;
      root.style.display = '';
      select(currentIdx);
    },

    close() {
      isOpen = false;
      root.style.display = 'none';
      if (cameraFixtures) for (const f of cameraFixtures.values()) f.visible = true;
      onViewChange?.(null);
    },

    selectById(id) {
      const i = cams.findIndex(c => c.id === id);
      if (i !== -1) select(i);
    },

    viewedRoom() {
      if (!isOpen) return null;
      const cam = cams[currentIdx];
      return cam ? (graph.cameraRooms.get(cam.id) ?? null) : null;
    },

    // jam: 0..1 — cameraJammer nearby fills the feed with noise
    update(dt, jam) {
      if (staticTimer > 0) {
        staticTimer -= dt;
        if (staticTimer <= 0 && jam < 0.8) heavyStaticEl.style.display = 'none';
      }
      if (jam >= 0.8) {
        heavyStaticEl.style.display = '';
      } else if (staticTimer <= 0) {
        heavyStaticEl.style.display = 'none';
        staticEl.style.opacity = String(0.1 + jam * 0.5);
      }
    },
  };

  positionCamera();
  return tablet;
}
