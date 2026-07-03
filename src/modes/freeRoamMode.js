import * as THREE from 'three';
import { el, button, uiRoot } from '../ui/dom.js';
import { getPizzeria, invalidatePizzeria } from '../world/pizzeriaMesh.js';
import { buildAnimatronicRig, poseIdle } from '../world/animatronicRig.js';
import { disposeGeometries } from '../core/gfx.js';

// Daytime first-person walk through the player's pizzeria.
// Collision is cell-based: you can cross a room boundary only where a
// doorway/door exists (vents are too small to crawl through).

const EYE = 1.62;
const SPEED = 3.4;
const RADIUS = 0.3;

let ctxRef, scene, camera, pizzeria, rigs = [], pos, screenEl;

function cellAt(x, z) {
  const s = pizzeria.cellSize;
  const cx = Math.floor(x / s), cy = Math.floor(z / s);
  const { w, h } = pizzeria.graph;
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
  return { cx, cy, room: pizzeria.graph.roomOf[cy * pizzeria.graph.w + cx] };
}

const edgeKeyOf = (a, b) => {
  const [p, q] = [a, b].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};

let passableEdges = null;

function buildPassable(layout) {
  passableEdges = new Set();
  for (const d of layout.doors || []) {
    if (d.kind === 'doorway' || d.kind === 'door') passableEdges.add(edgeKeyOf(d.a, d.b));
  }
}

function canStand(x, z) {
  // check the four corner probes of the player circle
  for (const [dx, dz] of [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
    const c = cellAt(x + dx, z + dz);
    if (!c || c.room === -1) return false;
  }
  return true;
}

function tryMove(from, to) {
  // axis-separated, cell-boundary aware
  const attempt = (nx, nz) => {
    if (!canStand(nx, nz)) return null;
    const a = cellAt(from.x, from.z);
    const b = cellAt(nx, nz);
    if (!a || !b) return null;
    if (a.room !== b.room) {
      // crossing rooms is only allowed through a walkable door edge between these cells
      if (!passableEdges.has(edgeKeyOf([a.cx, a.cy], [b.cx, b.cy]))) return null;
    }
    return { x: nx, z: nz };
  };
  let cur = { x: from.x, z: from.z };
  const mx = attempt(to.x, cur.z);
  if (mx) cur = mx;
  const mz = attempt(cur.x, to.z);
  if (mz) cur = { x: cur.x, z: mz.z };
  return cur;
}

export const freeRoamMode = {
  enter(ctx) {
    ctxRef = ctx;
    const layout = ctx.universe.layout;
    invalidatePizzeria(layout);
    pizzeria = getPizzeria(layout);
    buildPassable(layout);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x181820);
    scene.fog = new THREE.Fog(0x181820, 12, 42);
    scene.add(pizzeria.group);

    // daylight-ish fill so the tour feels friendly
    scene.add(new THREE.AmbientLight(0x8890a8, 0.85));
    const sun = new THREE.HemisphereLight(0xd8e2ff, 0x3a3228, 0.5);
    scene.add(sun);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 80);

    // spawn: office if valid, else first room
    const g = pizzeria.graph;
    const spawnRoom = g.office ?? g.rooms[0];
    const s = pizzeria.cellSize;
    pos = new THREE.Vector3((spawnRoom.anchor[0] + 0.5) * s, EYE, (spawnRoom.anchor[1] + 0.5) * s);
    ctx.input.setLook(Math.PI, 0);

    // animatronics on stage(s)
    rigs = [];
    const stages = g.rooms.filter(r => r.type === 'stage');
    const anims = ctx.universe.animatronics;
    anims.forEach((anim, i) => {
      const rig = buildAnimatronicRig(anim);
      const stage = stages[i % Math.max(stages.length, 1)];
      if (!stage) return;
      // spread along the stage
      const cellsSorted = [...stage.cells].sort((a, b) => (a % g.w) - (b % g.w));
      const cellIdx = cellsSorted[Math.floor((i / anims.length) * cellsSorted.length)];
      const cx = cellIdx % g.w, cy = (cellIdx / g.w) | 0;
      rig.group.position.set((cx + 0.5) * s, 0.02, (cy + 0.5) * s);
      // face the room's south (toward likely audience)
      rig.group.rotation.y = 0;
      scene.add(rig.group);
      rigs.push(rig);
    });

    ctx.input.enableLook({ requestLock: !navigator.webdriver });

    screenEl = el('div', {},
      el('div', { class: 'top-bar' },
        button('◄ Hub (Esc)', () => ctx.app.switchMode('hub'), 'small'),
        el('h2', { text: `${ctx.universe.meta.pizzeriaName} — DAY VISIT` }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'hint', text: 'WASD move · mouse / drag to look' }),
      ),
    );
    uiRoot().append(screenEl);

    this._onKey = (e) => { if (e.code === 'Escape') ctx.app.switchMode('hub'); };
    window.addEventListener('keydown', this._onKey);

    ctx.audio.ambient.stageTune();

    ctx.debug.lookAtStage = () => {
      const stage = g.rooms.find(r => r.type === 'stage');
      if (!stage) return;
      const target = new THREE.Vector3((stage.anchor[0] + 0.5) * s, 1.6, (stage.anchor[1] + 0.5) * s);
      // stand a few meters south of the stage, facing it
      pos.set(target.x, EYE, target.z + 6.5);
      const dir = target.clone().sub(pos);
      ctx.input.setLook(Math.atan2(-dir.x, -dir.z), 0.05);
    };
    ctx.debug.teleport = (x, z) => { pos.set(x, EYE, z); };
  },

  exit() {
    window.removeEventListener('keydown', this._onKey);
    ctxRef.input.disableLook();
    ctxRef.audio.ambient.stopStageTune();
    for (const rig of rigs) disposeGeometries(rig.group);
    scene = null;
    rigs = [];
  },

  update(dt) {
    if (!scene) return;
    const { x: ax, z: az } = ctxRef.input.axis();
    if (ax || az) {
      const yaw = ctxRef.input.yaw;
      const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const dir = f.multiplyScalar(-az).add(r.multiplyScalar(ax));
      if (dir.lengthSq() > 0) {
        dir.normalize().multiplyScalar(SPEED * dt);
        const next = tryMove({ x: pos.x, z: pos.z }, { x: pos.x + dir.x, z: pos.z + dir.z });
        pos.x = next.x;
        pos.z = next.z;
      }
    }
  },

  frame(dt, time) {
    if (!scene) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    camera.position.copy(pos);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(ctxRef.input.yaw);
    camera.rotateX(ctxRef.input.pitch);
    for (const rig of rigs) poseIdle(rig, time);
    for (const fan of pizzeria.fans) fan.rotation.z = time * 14;
    ctxRef.engine.renderer.render(scene, camera);
  },
};
