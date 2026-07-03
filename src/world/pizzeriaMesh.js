import * as THREE from 'three';
import { deriveGraph } from './graph.js';
import { buildProp } from './props.js';
import { ROOM_COLORS } from '../data/schemas.js';

// Turns a painted layout into a THREE.Group: merged floor/wall/ceiling geometry,
// door openings with closable covers, per-room lights, camera fixtures, props.
// Cached per layout object; call invalidate(layout) after editing.

export const WALL_H = 3;
const DOOR_W = 1.6, DOOR_H = 2.2;
const VENT_W = 1.1, VENT_H = 0.85;
const WALL_T = 0.16;

const cache = new WeakMap();

export function invalidatePizzeria(layout) {
  cache.delete(layout);
}

export function getPizzeria(layout) {
  let entry = cache.get(layout);
  if (!entry) {
    entry = buildPizzeria(layout);
    cache.set(layout, entry);
  }
  return entry;
}

// ---- merged-geometry helpers ----

function makeArrays() {
  return { pos: [], nrm: [], col: [] };
}

function pushBox(a, cx, cy, cz, sx, sy, sz, color, shade = 1) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const r = color.r * shade, g = color.g * shade, b = color.b * shade;
  const quads = [
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
  ];
  for (const [p1, p2, p3, p4, n] of quads) {
    a.pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
    for (let i = 0; i < 6; i++) {
      a.nrm.push(...n);
      a.col.push(r, g, b);
    }
  }
}

function pushQuad(a, corners, normal, color, shade = 1) {
  const [p1, p2, p3, p4] = corners;
  a.pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
  for (let i = 0; i < 6; i++) {
    a.nrm.push(...normal);
    a.col.push(color.r * shade, color.g * shade, color.b * shade);
  }
}

function toMesh(a, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
  return new THREE.Mesh(geo, material);
}

// ---- wall segment builders (opening-aware) ----

const WALL_COLOR = new THREE.Color(0x5a5266);
const WALL_TRIM = new THREE.Color(0x3a3442);
const doorKey = (a, b) => {
  const [p, q] = [a, b].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};

// Wall runs along local axis at boundary; build full or with opening.
// cx,cz = wall segment center; horizontal = true if wall runs along X.
function buildWallSegment(arrays, cx, cz, s, horizontal, opening) {
  const box = (offAlong, offY, len, hgt) => {
    const bx = horizontal ? cx + offAlong : cx;
    const bz = horizontal ? cz : cz + offAlong;
    pushBox(arrays,
      bx, offY + hgt / 2, bz,
      horizontal ? len : WALL_T, hgt, horizontal ? WALL_T : len,
      WALL_COLOR, 0.9 + ((bx * 7 + bz * 13) % 5) * 0.02,
    );
  };

  if (!opening) {
    box(0, 0, s, WALL_H);
    return;
  }
  const w = opening.kind === 'vent' ? VENT_W : DOOR_W;
  const h = opening.kind === 'vent' ? VENT_H : DOOR_H;
  const side = (s - w) / 2;
  // side pieces
  box(-(w / 2 + side / 2), 0, side, WALL_H);
  box(w / 2 + side / 2, 0, side, WALL_H);
  // lintel above opening
  box(0, h, w, WALL_H - h);
}

// ---- main build ----

export function buildPizzeria(layout) {
  const s = layout.grid.cell;
  const graph = deriveGraph(layout);
  const { w, h, cells, roomOf } = graph;

  const group = new THREE.Group();
  group.name = 'pizzeria';

  const floorA = makeArrays();
  const wallA = makeArrays();
  const ceilA = makeArrays();

  const typeColors = {};
  for (const [type, hex] of Object.entries(ROOM_COLORS)) {
    typeColors[type] = new THREE.Color(hex).multiplyScalar(0.42);
  }
  const ceilColor = new THREE.Color(0x1c1a22);

  // door edge lookup
  const doorAt = new Map();
  for (const d of layout.doors || []) doorAt.set(doorKey(d.a, d.b), d);

  const roomType = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : cells[y * w + x];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = roomType(x, y);
      if (t <= 0) continue;
      const room = graph.rooms[roomOf[y * w + x]];
      const base = typeColors[room.type] || typeColors.hall;
      const shade = ((x + y) % 2 ? 0.85 : 1) * (0.92 + ((x * 31 + y * 17) % 7) * 0.02);
      // floor + ceiling quads
      const x0 = x * s, x1 = (x + 1) * s, z0 = y * s, z1 = (y + 1) * s;
      pushQuad(floorA, [[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0]], [0, 1, 0], base, shade);
      pushQuad(ceilA, [[x0, WALL_H, z0], [x1, WALL_H, z0], [x1, WALL_H, z1], [x0, WALL_H, z1]], [0, -1, 0], ceilColor, 0.9 + ((x + y) % 3) * 0.05);

      // walls to east + south neighbors (and west/north when at grid edge / void)
      const neighbors = [
        { nx: x + 1, ny: y, cx: x1, cz: z0 + s / 2, horizontal: false },
        { nx: x, ny: y + 1, cx: x0 + s / 2, cz: z1, horizontal: true },
        { nx: x - 1, ny: y, cx: x0, cz: z0 + s / 2, horizontal: false, onlyIfOutside: true },
        { nx: x, ny: y - 1, cx: x0 + s / 2, cz: z0, horizontal: true, onlyIfOutside: true },
      ];
      for (const nb of neighbors) {
        const nt = roomType(nb.nx, nb.ny);
        const sameRoom = nt > 0 && roomOf[nb.ny * w + nb.nx] === roomOf[y * w + x];
        if (sameRoom) continue;
        if (nb.onlyIfOutside && nt > 0) continue; // interior boundary built by the neighbor's own pass
        const door = nt > 0 ? doorAt.get(doorKey([x, y], [nb.nx, nb.ny])) : null;
        buildWallSegment(wallA, nb.cx, nb.cz, s, nb.horizontal, door);
      }
    }
  }

  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  group.add(toMesh(floorA, vcMat), toMesh(wallA, vcMat), toMesh(ceilA, vcMat));

  // ---- closable covers on defendable edges (door + vent kinds) ----
  const doorMeshes = new Map();
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6e7480, metalness: 0.65, roughness: 0.4 });
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x59606c, metalness: 0.6, roughness: 0.5 });
  for (const d of layout.doors || []) {
    if (d.kind !== 'door' && d.kind !== 'vent') continue;
    const [ax, ay] = d.a, [bx, by] = d.b;
    const horizontal = ay !== by; // boundary runs along X if cells stack vertically
    const cx = horizontal ? (ax + 0.5) * s : Math.max(ax, bx) * s;
    const cz = horizontal ? Math.max(ay, by) * s : (ay + 0.5) * s;
    const isDoor = d.kind === 'door';
    const cw = isDoor ? DOOR_W : VENT_W;
    const chh = isDoor ? DOOR_H : VENT_H;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? cw : WALL_T * 0.7, chh, horizontal ? WALL_T * 0.7 : cw),
      isDoor ? doorMat : ventMat,
    );
    // ribbed look: add two horizontal ribs
    for (const ry of [-chh / 4, chh / 4]) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? cw : WALL_T * 0.9, 0.06, horizontal ? WALL_T * 0.9 : cw),
        ventMat,
      );
      rib.position.y = ry;
      mesh.add(rib);
    }
    const closedY = chh / 2;
    const openY = chh / 2 + chh + 0.05; // slid up into/above the lintel
    mesh.position.set(cx, openY, cz);
    mesh.visible = false; // hidden while open
    mesh.userData = { kind: d.kind, closedY, openY, key: doorKey(d.a, d.b) };
    group.add(mesh);
    doorMeshes.set(doorKey(d.a, d.b), mesh);
  }

  // ---- props ----
  const fans = [];
  for (const p of layout.props || []) {
    const mesh = buildProp(p, s);
    if (!mesh) continue;
    const blades = mesh.getObjectByName('fanBlades');
    if (blades) fans.push(blades);
    group.add(mesh);
  }

  // ---- office furniture (hardcoded) ----
  if (graph.office) {
    const [ox, oy] = graph.office.anchor;
    const desk = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.8 }));
    top.position.y = 0.78;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.8), new THREE.MeshStandardMaterial({ color: 0x333038 }));
    legL.position.set(-0.85, 0.39, 0);
    const legR = legL.clone(); legR.position.x = 0.85;
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x1a1a22, emissive: 0x2a3a55, emissiveIntensity: 0.7 }),
    );
    monitor.position.set(-0.4, 1.05, -0.1);
    monitor.rotation.y = 0.3;
    desk.add(top, legL, legR, monitor);
    const deskFan = buildProp({ type: 'fan', cell: [0, 0], rot: 0 }, 0);
    deskFan.scale.setScalar(0.55);
    deskFan.position.set(0.55, 0.82, 0);
    const fb = deskFan.getObjectByName('fanBlades');
    if (fb) fans.push(fb);
    desk.add(deskFan);
    desk.position.set((ox + 0.5) * s, 0, (oy + 0.5) * s - 0.9);
    group.add(desk);
  }

  // ---- camera fixtures ----
  const camMat = new THREE.MeshStandardMaterial({ color: 0x2a2a33, metalness: 0.5, roughness: 0.5 });
  for (const cam of layout.cameras || []) {
    const [cxc, cyc] = cam.cell;
    const fixture = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.42), camMat);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x111118, emissive: 0xff2222, emissiveIntensity: 0.8 }),
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.02, 0.24);
    fixture.add(body, lens);
    fixture.position.set((cxc + 0.5) * s, WALL_H - 0.35, (cyc + 0.5) * s);
    fixture.rotation.y = cam.yaw;
    fixture.rotation.x = 0.25;
    group.add(fixture);
  }

  // ---- per-room lights (pooled: biggest rooms first) ----
  const lights = [];
  const sorted = [...graph.rooms].sort((a, b) => b.cells.length - a.cells.length);
  const budget = 14;
  for (const room of sorted.slice(0, budget)) {
    const [ax, ay] = room.anchor;
    const isOffice = room.type === 'office';
    const light = new THREE.PointLight(
      isOffice ? 0xbfd4ff : 0xffd9a0,
      isOffice ? 14 : 9,
      s * 4.2,
      1.7,
    );
    light.position.set((ax + 0.5) * s, WALL_H - 0.6, (ay + 0.5) * s);
    light.userData.roomId = room.id;
    group.add(light);
    lights.push(light);
  }

  return { group, graph, doorMeshes, fans, lights, cellSize: s };
}

// world position helpers
export function cellCenter(layout, cell, y = 0) {
  const s = layout.grid.cell;
  return new THREE.Vector3((cell[0] + 0.5) * s, y, (cell[1] + 0.5) * s);
}
