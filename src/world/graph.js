import { ROOM_TYPES, decodeCells } from '../data/schemas.js';

// Derives the playable room graph from the painted grid:
// rooms = connected components of same cell type, edges = the layout's doors.
// Everything downstream (validation, cameras, AI pathing, mesh walls) uses this.

export function deriveGraph(layout) {
  const { w, h } = layout.grid;
  const cells = decodeCells(layout.cells, w * h);
  const roomOf = new Int16Array(w * h).fill(-1);
  const rooms = [];

  // flood fill connected components of identical non-void type
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cells[i] === 0 || roomOf[i] !== -1) continue;
      const type = ROOM_TYPES[cells[i]];
      const id = rooms.length;
      const queue = [i];
      const cellList = [];
      roomOf[i] = id;
      while (queue.length) {
        const ci = queue.pop();
        cellList.push(ci);
        const cx = ci % w, cy = (ci / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (roomOf[ni] === -1 && cells[ni] === cells[i]) {
            roomOf[ni] = id;
            queue.push(ni);
          }
        }
      }
      let sx = 0, sy = 0;
      for (const ci of cellList) { sx += ci % w; sy += (ci / w) | 0; }
      rooms.push({
        id,
        type,
        cells: cellList,
        centroid: [sx / cellList.length, sy / cellList.length],
      });
    }
  }

  // anchor: free-ish cell nearest centroid (where animatronics stand)
  for (const room of rooms) {
    let best = room.cells[0], bestD = Infinity;
    for (const ci of room.cells) {
      const cx = ci % w, cy = (ci / w) | 0;
      const d = (cx - room.centroid[0]) ** 2 + (cy - room.centroid[1]) ** 2;
      if (d < bestD) { bestD = d; best = ci; }
    }
    room.anchor = [best % w, (best / w) | 0];
  }

  // edges from authored doors
  const edges = [];
  for (const door of layout.doors || []) {
    const [ax, ay] = door.a, [bx, by] = door.b;
    if (ax < 0 || ay < 0 || ax >= w || ay >= h || bx < 0 || by < 0 || bx >= w || by >= h) continue;
    const ra = roomOf[ay * w + ax], rb = roomOf[by * w + bx];
    if (ra === -1 || rb === -1 || ra === rb) continue;
    edges.push({ a: ra, b: rb, kind: door.kind, cells: [door.a, door.b] });
  }

  const officeRooms = rooms.filter(r => r.type === 'office');
  const office = officeRooms[0] ?? null;

  // defendable office entries, sided left/right by door position vs office centroid
  let entries = [];
  if (office) {
    entries = edges
      .filter(e => (e.a === office.id || e.b === office.id) && (e.kind === 'door' || e.kind === 'vent'))
      .map(e => {
        const doorX = (e.cells[0][0] + e.cells[1][0]) / 2;
        const doorY = (e.cells[0][1] + e.cells[1][1]) / 2;
        return { edge: e, x: doorX, y: doorY, otherRoom: e.a === office.id ? e.b : e.a };
      })
      .sort((p, q) => p.x - q.x || p.y - q.y);
  }
  const officeEntries = {};
  if (entries.length >= 1) officeEntries.left = entries[0];
  if (entries.length >= 2) officeEntries.right = entries[entries.length - 1];

  // BFS distance-to-office over all edges
  const distToOffice = new Array(rooms.length).fill(Infinity);
  if (office) {
    distToOffice[office.id] = 0;
    const queue = [office.id];
    while (queue.length) {
      const cur = queue.shift();
      for (const e of edges) {
        const other = e.a === cur ? e.b : e.b === cur ? e.a : -1;
        if (other !== -1 && distToOffice[other] === Infinity) {
          distToOffice[other] = distToOffice[cur] + 1;
          queue.push(other);
        }
      }
    }
  }

  // camera -> room coverage
  const cameraRooms = new Map();
  for (const cam of layout.cameras || []) {
    const [cx, cy] = cam.cell;
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const r = roomOf[cy * w + cx];
    if (r !== -1) cameraRooms.set(cam.id, r);
  }

  return { rooms, edges, roomOf, office, officeRooms, officeEntries, distToOffice, cameraRooms, cells, w, h };
}

// Can this animatronic traverse this edge? Vent edges need a vent crawler.
export function edgeUsable(edge, animatronic) {
  if (edge.kind === 'vent') return animatronic.ai.abilities.includes('ventCrawler');
  return true;
}

// Rooms reachable from `startRoom` for a given animatronic.
export function reachableRooms(graph, startRoom, animatronic) {
  const seen = new Set([startRoom]);
  const queue = [startRoom];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of graph.edges) {
      if (!edgeUsable(e, animatronic)) continue;
      const other = e.a === cur ? e.b : e.b === cur ? e.a : -1;
      if (other !== -1 && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}
