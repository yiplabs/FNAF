import * as THREE from 'three';
import { el, button, uiRoot, toast } from '../ui/dom.js';
import { ROOM_TYPES, ROOM_COLORS, decodeCells, encodeCells } from '../data/schemas.js';
import { validateLayout } from '../data/validators.js';
import { getPizzeria, invalidatePizzeria } from '../world/pizzeriaMesh.js';
import { PROP_TYPES } from '../world/props.js';
import { deriveGraph } from '../world/graph.js';

// Top-down orthographic grid editor. Painting cells IS building rooms —
// rooms are derived as connected components, so there is no room bookkeeping.

const BRUSHES = ROOM_TYPES.filter(t => t !== 'void');

let ctxRef, layout;
let scene, camera, worldGroup, markerGroup, hoverMesh;
let previewCam = null, previewOn = false;
let tool = 'dining';           // active tool: room type | 'erase' | 'door' | 'camera' | 'prop'
let propType = 'table';
let zoom = 24;
let center = new THREE.Vector3();
let painting = false, erasingDrag = false;
let rebuildTimer = 0;
let bannerEl, paletteEl, screenEl;
let hoverCell = null, hoverEdge = null;
let raycaster, groundPlane;
let defaultCellsBackup = null;

function cells() { return decodeCells(layout.cells, layout.grid.w * layout.grid.h); }
function setCells(arr) { layout.cells = encodeCells(arr); }

function setCell(x, y, typeIdx) {
  const { w, h } = layout.grid;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const arr = cells();
  if (arr[y * w + x] === typeIdx) return;
  arr[y * w + x] = typeIdx;
  setCells(arr);
  // drop doors/cameras/props that reference cells whose room membership broke
  pruneOrphans();
  scheduleRebuild();
}

function pruneOrphans() {
  const { w } = layout.grid;
  const arr = cells();
  const at = (c) => arr[c[1] * w + c[0]];
  const graph = deriveGraph(layout);
  layout.doors = layout.doors.filter(d => {
    const ra = graph.roomOf[d.a[1] * w + d.a[0]];
    const rb = graph.roomOf[d.b[1] * w + d.b[0]];
    return ra !== -1 && rb !== -1 && ra !== rb;
  });
  layout.cameras = layout.cameras.filter(c => at(c.cell) > 0);
  layout.props = layout.props.filter(p => at(p.cell) > 0);
}

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildWorld, 140);
  refreshBanner();
}

function rebuildWorld() {
  invalidatePizzeria(layout);
  worldGroup.clear();
  const { group } = getPizzeria(layout);
  worldGroup.add(group);
  rebuildMarkers();
}

function rebuildMarkers() {
  markerGroup.clear();
  const s = layout.grid.cell;
  const kindColor = { doorway: 0x39c46a, door: 0xd8442e, vent: 0x2ea8b8 };
  for (const d of layout.doors) {
    const horizontal = d.a[1] !== d.b[1];
    const cx = horizontal ? (d.a[0] + 0.5) * s : Math.max(d.a[0], d.b[0]) * s;
    const cz = horizontal ? Math.max(d.a[1], d.b[1]) * s : (d.a[1] + 0.5) * s;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? 1.7 : 0.5, 3.4, horizontal ? 0.5 : 1.7),
      new THREE.MeshBasicMaterial({ color: kindColor[d.kind] || 0xffffff }),
    );
    m.position.set(cx, 1.7, cz);
    markerGroup.add(m);
  }
  for (const c of layout.cameras) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe14a }),
    );
    m.position.set((c.cell[0] + 0.5) * s, 3.6, (c.cell[1] + 0.5) * s);
    m.rotation.y = c.yaw + Math.PI / 4;
    markerGroup.add(m);
  }
}

function refreshBanner() {
  const { ok, errors } = validateLayout(layout, ctxRef.universe.animatronics);
  bannerEl.className = `validation-banner ${ok ? 'ok' : 'bad'}`;
  bannerEl.replaceChildren(
    ok
      ? el('span', { text: '✔ PLAYABLE — this floor plan is a valid game map' })
      : el('ul', {}, errors.slice(0, 4).map(e => el('li', { text: `• ${e}` }))),
  );
}

// ---- picking ----

function ndc(e) {
  return new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  );
}

function pickGround(e) {
  raycaster.setFromCamera(ndc(e), camera);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, pt)) return null;
  const s = layout.grid.cell;
  const x = Math.floor(pt.x / s), y = Math.floor(pt.z / s);
  const { w, h } = layout.grid;
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  return { x, y, fx: pt.x / s - x, fy: pt.z / s - y };
}

// nearest cell boundary edge to the pick point (for the door tool)
function pickEdge(e) {
  const hit = pickGround(e);
  if (!hit) return null;
  const { x, y, fx, fy } = hit;
  const cands = [
    { d: fx, a: [x - 1, y], b: [x, y] },
    { d: 1 - fx, a: [x, y], b: [x + 1, y] },
    { d: fy, a: [x, y - 1], b: [x, y] },
    { d: 1 - fy, a: [x, y], b: [x, y + 1] },
  ].sort((p, q) => p.d - q.d);
  const { w, h } = layout.grid;
  const arr = cells();
  const graph = deriveGraph(layout);
  for (const c of cands) {
    const [ax, ay] = c.a, [bx, by] = c.b;
    if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= w || ay >= h || bx >= w || by >= h) continue;
    const ra = graph.roomOf[ay * w + ax], rb = graph.roomOf[by * w + bx];
    if (ra === -1 || rb === -1 || ra === rb) continue;
    return { a: c.a, b: c.b };
  }
  void arr;
  return null;
}

const edgeKey = (a, b) => {
  const [p, q] = [a, b].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};

function cycleDoor(edge) {
  const key = edgeKey(edge.a, edge.b);
  const idx = layout.doors.findIndex(d => edgeKey(d.a, d.b) === key);
  const order = ['doorway', 'door', 'vent'];
  if (idx === -1) {
    layout.doors.push({ a: edge.a, b: edge.b, kind: 'doorway' });
    toast('Doorway placed — click again for Door, Vent, remove');
  } else {
    const cur = order.indexOf(layout.doors[idx].kind);
    if (cur === order.length - 1) {
      layout.doors.splice(idx, 1);
    } else {
      layout.doors[idx].kind = order[cur + 1];
    }
  }
  scheduleRebuild();
}

function placeCamera(cell) {
  const idx = layout.cameras.findIndex(c => c.cell[0] === cell.x && c.cell[1] === cell.y);
  if (idx !== -1) {
    layout.cameras.splice(idx, 1);
    scheduleRebuild();
    return;
  }
  if (layout.cameras.length >= 16) { toast('Camera limit reached (16).', true); return; }
  const graph = deriveGraph(layout);
  const room = graph.roomOf[cell.y * layout.grid.w + cell.x];
  if (room === -1) { toast('Cameras go inside rooms.', true); return; }
  const centroid = graph.rooms[room].centroid;
  const yaw = Math.atan2((centroid[0] + 0.5) - (cell.x + 0.5), (centroid[1] + 0.5) - (cell.y + 0.5));
  const n = layout.cameras.length + 1;
  layout.cameras.push({
    id: `cam${Date.now() % 100000}_${n}`,
    label: `CAM ${n} ${graph.rooms[room].type.toUpperCase()}`,
    cell: [cell.x, cell.y],
    yaw,
  });
  scheduleRebuild();
}

function placeProp(cell) {
  const idx = layout.props.findIndex(p => p.cell[0] === cell.x && p.cell[1] === cell.y);
  if (idx !== -1) {
    layout.props.splice(idx, 1);
    scheduleRebuild();
    return;
  }
  const arr = cells();
  const t = arr[cell.y * layout.grid.w + cell.x];
  if (t === 0) { toast('Props go inside rooms.', true); return; }
  if (ROOM_TYPES[t] === 'office') { toast('The office already has its desk.', true); return; }
  layout.props.push({ type: propType, cell: [cell.x, cell.y], rot: 0 });
  scheduleRebuild();
}

function applyTool(e, isRightClick) {
  if (isRightClick || tool === 'erase') {
    const hit = pickGround(e);
    if (hit) setCell(hit.x, hit.y, 0);
    return;
  }
  if (BRUSHES.includes(tool)) {
    const hit = pickGround(e);
    if (hit) setCell(hit.x, hit.y, ROOM_TYPES.indexOf(tool));
  } else if (tool === 'door') {
    const edge = pickEdge(e);
    if (edge) cycleDoor(edge);
  } else if (tool === 'camera') {
    const hit = pickGround(e);
    if (hit) placeCamera(hit);
  } else if (tool === 'prop') {
    const hit = pickGround(e);
    if (hit) placeProp(hit);
  }
}

// ---- UI ----

function buildPalette() {
  const toolBtn = (label, value, swatch = null) => {
    const b = el('button', {
      class: `tool-btn${tool === value ? ' active' : ''}`,
      onclick: () => { tool = value; refreshPalette(); },
    }, swatch ? el('span', { class: 'swatch', style: { background: swatch } }) : null, label);
    b.dataset.tool = value;
    return b;
  };

  paletteEl.replaceChildren(...[
    el('div', { class: 'group-label', text: 'Rooms (paint / drag)' }),
    ...BRUSHES.map(t => toolBtn(t === 'office' ? 'office (guard)' : t, t, ROOM_COLORS[t])),
    toolBtn('⌫ erase', 'erase'),
    el('div', { class: 'group-label', text: 'Connections' }),
    toolBtn('▤ door / vent', 'door'),
    el('div', { class: 'group-label', text: 'Equipment' }),
    toolBtn('▣ camera', 'camera'),
    toolBtn('◆ prop', 'prop'),
    tool === 'prop'
      ? el('div', { class: 'col', style: { paddingLeft: '12px' } },
          ...PROP_TYPES.map(pt => {
            const b = el('button', {
              class: `tool-btn${propType === pt ? ' active' : ''}`,
              onclick: () => { propType = pt; refreshPalette(); },
            }, pt);
            return b;
          }))
      : null,
    el('div', { class: 'group-label', text: 'Tips' }),
    el('div', { class: 'hint', text: 'Right-click always erases. Door tool: click a wall between two rooms to cycle doorway → door → vent → none. Office needs exactly 2 defendable entries (door/vent).' }),
  ].filter(Boolean));
}

function refreshPalette() { buildPalette(); }

function togglePreview() {
  previewOn = !previewOn;
  hoverMesh.visible = false;
  if (previewOn && !previewCam) {
    previewCam = new THREE.PerspectiveCamera(55, 1, 0.1, 150);
  }
}

// ---- mode ----

export const builderMode = {
  enter(ctx) {
    ctxRef = ctx;
    layout = ctx.universe.layout;
    previewOn = false;
    defaultCellsBackup = JSON.parse(JSON.stringify({
      cells: layout.cells, doors: layout.doors, cameras: layout.cameras, props: layout.props,
    }));

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a10);
    const s = layout.grid.cell;
    center = new THREE.Vector3(layout.grid.w * s / 2, 0, layout.grid.h * s / 2);
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    camera.up.set(0, 0, -1);

    raycaster = new THREE.Raycaster();
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    worldGroup = new THREE.Group();
    markerGroup = new THREE.Group();
    scene.add(worldGroup, markerGroup);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
    sun.position.set(30, 60, 20);
    scene.add(sun);

    // grid lines
    const gridGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let x = 0; x <= layout.grid.w; x++) pts.push(x * s, 0.03, 0, x * s, 0.03, layout.grid.h * s);
    for (let y = 0; y <= layout.grid.h; y++) pts.push(0, 0.03, y * s, layout.grid.w * s, 0.03, y * s);
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x2c2c3a, transparent: true, opacity: 0.6 })));

    hoverMesh = new THREE.Mesh(
      new THREE.BoxGeometry(s, 0.1, s),
      new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.35 }),
    );
    hoverMesh.visible = false;
    scene.add(hoverMesh);

    rebuildWorld();

    // UI
    bannerEl = el('div', { class: 'validation-banner ok' });
    paletteEl = el('div', { class: 'tool-palette panel' });
    screenEl = el('div', {},
      el('div', { class: 'top-bar' },
        button('◄ Hub', () => ctx.app.switchMode('hub'), 'small'),
        el('h2', { text: `PIZZERIA BUILDER — ${ctx.universe.meta.pizzeriaName}` }),
        el('div', { class: 'spacer' }),
        button('3D Preview (P)', () => togglePreview(), 'small'),
        el('span', { class: 'hint', text: 'wheel: zoom · middle-drag: pan' }),
      ),
      bannerEl,
      paletteEl,
    );
    uiRoot().append(screenEl);
    buildPalette();
    refreshBanner();

    // events
    this._onDown = (e) => {
      if (previewOn) return;
      if (e.target.closest('.tool-palette') || e.target.closest('.top-bar')) return;
      if (e.button === 1) { this._panning = true; this._panLast = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
      if (e.button === 2) { erasingDrag = true; applyTool(e, true); return; }
      if (e.button === 0) { painting = true; applyTool(e, false); }
    };
    this._onMove = (e) => {
      if (previewOn) return;
      if (this._panning) {
        const scale = (zoom * 2) / window.innerHeight;
        center.x -= (e.clientX - this._panLast.x) * scale;
        center.z -= (e.clientY - this._panLast.y) * scale;
        this._panLast = { x: e.clientX, y: e.clientY };
        return;
      }
      // hover feedback
      if (tool === 'door') {
        hoverEdge = pickEdge(e);
        hoverCell = null;
        if (hoverEdge) {
          const horizontal = hoverEdge.a[1] !== hoverEdge.b[1];
          const cx = horizontal ? (hoverEdge.a[0] + 0.5) * s : Math.max(hoverEdge.a[0], hoverEdge.b[0]) * s;
          const cz = horizontal ? Math.max(hoverEdge.a[1], hoverEdge.b[1]) * s : (hoverEdge.a[1] + 0.5) * s;
          hoverMesh.scale.set(horizontal ? 1 : 0.2, 36, horizontal ? 0.2 : 1);
          hoverMesh.position.set(cx, 0.05, cz);
          hoverMesh.visible = true;
        } else hoverMesh.visible = false;
      } else {
        hoverCell = pickGround(e);
        if (hoverCell) {
          hoverMesh.scale.set(1, 1, 1);
          hoverMesh.position.set((hoverCell.x + 0.5) * s, 0.05, (hoverCell.y + 0.5) * s);
          hoverMesh.visible = true;
        } else hoverMesh.visible = false;
      }
      if (painting && BRUSHES.concat(['erase']).includes(tool)) applyTool(e, false);
      if (erasingDrag) applyTool(e, true);
    };
    this._onUp = () => { painting = false; erasingDrag = false; this._panning = false; };
    this._onWheel = (e) => {
      zoom = Math.max(8, Math.min(45, zoom + Math.sign(e.deltaY) * 2.5));
    };
    this._onCtx = (e) => { if (!e.target.closest('.tool-palette')) e.preventDefault(); };
    this._onKey = (e) => {
      if (e.code === 'Escape') ctx.app.switchMode('hub');
      if (e.code === 'KeyP') togglePreview();
    };

    window.addEventListener('mousedown', this._onDown);
    window.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('wheel', this._onWheel);
    window.addEventListener('contextmenu', this._onCtx);
    window.addEventListener('keydown', this._onKey);

    // test hooks
    ctx.debug.builderSetTool = (t) => { tool = t; refreshPalette(); };
    ctx.debug.builderPaintCell = (x, y) => {
      if (tool === 'erase') setCell(x, y, 0);
      else if (BRUSHES.includes(tool)) setCell(x, y, ROOM_TYPES.indexOf(tool));
      rebuildWorld();
    };
    ctx.debug.builderFindCells = (type) => {
      const arr = cells();
      const out = [];
      const idx = ROOM_TYPES.indexOf(type);
      for (let y = 0; y < layout.grid.h; y++) {
        for (let x = 0; x < layout.grid.w; x++) {
          if (arr[y * layout.grid.w + x] === idx) out.push([x, y]);
        }
      }
      return out;
    };
    ctx.debug.builderCycleDoor = (ax, ay, bx, by) => cycleDoor({ a: [ax, ay], b: [bx, by] });
    ctx.debug.builderPreview = (on) => { if (previewOn !== on) togglePreview(); };
    ctx.debug.builderRestoreDefault = () => {
      layout.cells = defaultCellsBackup.cells;
      layout.doors = JSON.parse(JSON.stringify(defaultCellsBackup.doors));
      layout.cameras = JSON.parse(JSON.stringify(defaultCellsBackup.cameras));
      layout.props = JSON.parse(JSON.stringify(defaultCellsBackup.props));
      rebuildWorld();
      refreshBanner();
      return validateLayout(layout, ctxRef.universe.animatronics).ok;
    };
  },

  exit() {
    clearTimeout(rebuildTimer);
    window.removeEventListener('mousedown', this._onDown);
    window.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('mouseup', this._onUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onCtx);
    window.removeEventListener('keydown', this._onKey);
    invalidatePizzeria(layout); // editors downstream should rebuild fresh
    if (ctxRef.slot >= 0) ctxRef.saves.saveSlot(ctxRef.slot, ctxRef.universe);
    scene = null;
  },

  update() {},

  frame(dt, time) {
    if (!scene) return;
    const aspect = window.innerWidth / window.innerHeight;
    if (previewOn && previewCam) {
      // slow fly-around of the build
      const s = layout.grid.cell;
      const cx = layout.grid.w * s / 2, cz = layout.grid.h * s / 2;
      const r = Math.max(layout.grid.w, layout.grid.h) * s * 0.6;
      previewCam.aspect = aspect;
      previewCam.updateProjectionMatrix();
      previewCam.position.set(
        cx + Math.cos(time * 0.18) * r,
        r * 0.55,
        cz + Math.sin(time * 0.18) * r,
      );
      previewCam.lookAt(cx, 0, cz);
      ctxRef.engine.renderer.render(scene, previewCam);
      return;
    }
    camera.left = -zoom * aspect;
    camera.right = zoom * aspect;
    camera.top = zoom;
    camera.bottom = -zoom;
    camera.position.set(center.x, 60, center.z);
    camera.lookAt(center.x, 0, center.z);
    camera.updateProjectionMatrix();
    ctxRef.engine.renderer.render(scene, camera);
  },
};
