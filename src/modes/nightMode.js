import * as THREE from 'three';
import { el, uiRoot } from '../ui/dom.js';
import { getPizzeria, invalidatePizzeria } from '../world/pizzeriaMesh.js';
import { buildAnimatronicRig, poseIdle, poseStare, poseWalk } from '../world/animatronicRig.js';
import { createDirector } from '../night/aiDirector.js';
import { createOfficeUI, loseScreen, winScreen } from '../night/office.js';
import { createTablet } from '../night/tablet.js';
import { createJumpscare } from '../night/jumpscare.js';
import { disposeGeometries } from '../core/gfx.js';

// The classic loop: 12AM–6AM in the office you built, watching the cameras
// you placed, against the animatronics you designed.

const HOUR = 72;              // real seconds per in-game hour
const NIGHT_END = 6 * HOUR;
const DRAIN_PER_PIP = 0.075;  // % per second per usage pip

let ctxRef, params;
let scene, officeCam, pizzeria, graph;
let director, tablet, officeUI, jumpscare;
let rigs = [];                // parallel to director.agents
let simTime, power, powerOut, doomAt, state, nextCreakAt, nextClatterAt;
let doors, lights, doorBindings;
let baseYaw, screenEl, lightMeshes;
let winTimer = null;

const keyOf = (a, b) => {
  const [p, q] = [a, b].sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};

function usagePips() {
  return 1 + (doors.left.closed ? 1 : 0) + (doors.right.closed ? 1 : 0)
    + ((lights.left || lights.right) ? 1 : 0) + (tablet.isOpen ? 1 : 0);
}

function bindDoors() {
  doorBindings = {};
  for (const side of ['left', 'right']) {
    const entry = graph.officeEntries[side];
    if (!entry) continue;
    const mesh = pizzeria.doorMeshes.get(keyOf(entry.edge.cells[0], entry.edge.cells[1]));
    doorBindings[side] = { entry, mesh };
  }
}

function setDoor(side, closed) {
  if (powerOut || state !== 'running') return;
  if (!doorBindings[side]) return;
  if (doors[side].closed === closed) return;
  doors[side].closed = closed;
  officeUI.setDoor(side, closed);
  ctxRef.audio.sfx.doorSlam();
}

function outerCellOfEntry(entry) {
  // the entry edge cell that is NOT inside the office
  const [a, b] = entry.edge.cells;
  const inOffice = (c) => graph.roomOf[c[1] * graph.w + c[0]] === graph.office.id;
  return inOffice(a) ? b : a;
}

function placeRigs(time) {
  const s = pizzeria.cellSize;
  const officeAnchor = graph.office.anchor;
  const officePos = new THREE.Vector3((officeAnchor[0] + 0.5) * s, 0, (officeAnchor[1] + 0.5) * s);
  const roomCount = new Map();

  director.agents.forEach((agent, i) => {
    const rig = rigs[i];
    if (!rig || jumpscare.active) return;
    let px, pz;
    if (agent.entry) {
      const cell = outerCellOfEntry(doorBindings[agent.entry.side]?.entry ?? graph.officeEntries[agent.entry.side]);
      px = (cell[0] + 0.5) * s;
      pz = (cell[1] + 0.5) * s;
    } else {
      const room = graph.rooms[agent.room];
      const n = roomCount.get(agent.room) ?? 0;
      roomCount.set(agent.room, n + 1);
      px = (room.anchor[0] + 0.5) * s + (n ? Math.cos(n * 2.4) * 0.9 : 0);
      pz = (room.anchor[1] + 0.5) * s + (n ? Math.sin(n * 2.4) * 0.9 : 0);
    }
    rig.group.position.set(px, 0.02, pz);
    const bodyYaw = Math.atan2(officePos.x - px, officePos.z - pz);
    rig.group.rotation.y = bodyYaw;

    const onStage = graph.rooms[agent.room]?.type === 'stage' && !agent.entry;
    const moving = time - agent.lastMoveAt < 1.2 && !agent.entry;
    if (onStage && params.night < agent.anim.ai.stageUntilNight) {
      poseIdle(rig, time);
    } else if (moving) {
      poseWalk(rig, time, agent.anim.ai.speed);
    } else {
      // head tracks the camera that watches them
      const viewed = tablet.viewedRoom() === agent.room && tablet.isOpen;
      let headYaw = 0;
      if (viewed) {
        const camPos = tablet.camera.position;
        const toCam = Math.atan2(camPos.x - px, camPos.z - pz);
        headYaw = THREE.MathUtils.clamp(wrapAngle(toCam - bodyYaw), -1.15, 1.15);
      }
      poseStare(rig, time, headYaw);
    }
  });
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function triggerJumpscare(agent) {
  if (state !== 'running') return;
  state = 'jumpscare';
  tablet.close();
  ctxRef.audio.ambient.stopMusicBox();
  ctxRef.audio.ambient.stopFan();
  ctxRef.audio.sfx.stopLightBuzz();
  const rig = rigs[agent.idx];
  jumpscare.trigger(rig, () => {
    state = 'lost';
    screenEl.append(loseScreen({
      onRetry: () => ctxRef.app.switchMode('night', params),
      onHub: () => ctxRef.app.switchMode('hub'),
    }));
  });
}

function winNight() {
  if (state !== 'running') return;
  state = 'won';
  tablet.close();
  ctxRef.audio.ambient.stopMusicBox();
  ctxRef.audio.ambient.stopFan();
  ctxRef.audio.sfx.stopLightBuzz();
  ctxRef.audio.sfx.chime6AM();
  // surviving the maxed-out custom night earns the secret golden ending
  const golden = !params.onComplete && params.night >= 6;
  if (golden && !ctxRef.universe.progress.endingsSeen.includes('golden')) {
    ctxRef.universe.progress.endingsSeen.push('golden');
  }
  screenEl.append(winScreen(!!params.onComplete, golden));
  if (ctxRef.slot >= 0) ctxRef.saves.saveSlot(ctxRef.slot, ctxRef.universe);
  winTimer = setTimeout(() => {
    if (params.onComplete) params.onComplete();
    else ctxRef.app.switchMode('hub');
  }, golden ? 5000 : 2800);
}

function goPowerOut() {
  if (powerOut) return;
  powerOut = true;
  power = 0;
  doors.left.closed = false;
  doors.right.closed = false;
  tablet.close();
  officeUI.setPowerOut();
  ctxRef.audio.sfx.powerOutDrone();
  ctxRef.audio.ambient.stopFan();
  ctxRef.audio.ambient.musicBox();
  for (const l of lightMeshes) l.intensity = 0;
  doomAt = simTime + 10 + ctxRef.rng.next() * 14;
}

export const nightMode = {
  enter(ctx, p = {}) {
    ctxRef = ctx;
    params = { night: 1, ...p };
    const u = ctx.universe;
    const night = params.night;

    // deterministic per night
    ctx.rng.reseed((u.progress.seed || 1) + night * 1000);

    invalidatePizzeria(u.layout);
    pizzeria = getPizzeria(u.layout);
    graph = pizzeria.graph;

    if (!graph.office || !graph.officeEntries.left) {
      ctx.app.switchMode('hub');
      return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020204);
    scene.fog = new THREE.Fog(0x020204, 10, 34);
    scene.add(pizzeria.group);
    scene.add(new THREE.AmbientLight(0x1a1a28, 0.55));

    // night lighting: dim every room hard, office soft
    lightMeshes = pizzeria.lights;
    for (const l of lightMeshes) {
      if (l.userData.orig === undefined) l.userData.orig = l.intensity;
      const isOffice = l.userData.roomId === graph.office.id;
      l.intensity = l.userData.orig * (isOffice ? 0.5 : 0.16);
    }

    officeCam = new THREE.PerspectiveCamera(68, 1, 0.08, 60);
    const s = pizzeria.cellSize;
    const oc = graph.office.anchor;
    officeCam.position.set((oc[0] + 0.5) * s, 1.42, (oc[1] + 0.5) * s + 0.55);

    // face the midpoint of the defendable entries
    const entries = [graph.officeEntries.left, graph.officeEntries.right].filter(Boolean);
    const mid = entries.reduce((acc, e) => {
      acc.x += (e.x + 0.5) * s / entries.length;
      acc.z += (e.y + 0.5) * s / entries.length;
      return acc;
    }, { x: 0, z: 0 });
    baseYaw = Math.atan2(officeCam.position.x - mid.x, officeCam.position.z - mid.z);
    ctx.input.setLook(baseYaw, 0);
    ctx.input.enableLook({ requestLock: false });

    // state
    simTime = 0;
    power = 100;
    powerOut = false;
    state = 'running';
    nextCreakAt = 14 + ctx.rng.next() * 20;
    nextClatterAt = 8;
    doors = { left: { closed: false }, right: { closed: false } };
    lights = { left: false, right: false };

    director = createDirector({ universe: u, graph, rng: ctx.rng, night, maxed: !!params.custom });

    rigs = director.agents.map(a => {
      const rig = buildAnimatronicRig(a.anim);
      scene.add(rig.group);
      return rig;
    });

    tablet = createTablet({ layout: u.layout, graph, audio: ctx.audio, cameraFixtures: pizzeria.cameraFixtures });
    jumpscare = createJumpscare({ audio: ctx.audio });
    bindDoors();

    const toggleTablet = () => {
      if (powerOut || state !== 'running') return;
      if (tablet.isOpen) {
        tablet.close();
        officeUI.setControlsVisible(true);
      } else {
        lights.left = lights.right = false;
        officeUI.setLight('left', false);
        officeUI.setLight('right', false);
        ctx.audio.sfx.stopLightBuzz();
        tablet.open();
        officeUI.setControlsVisible(false);
      }
    };

    officeUI = createOfficeUI({
      hasRightEntry: !!graph.officeEntries.right,
      rightKind: graph.officeEntries.right?.edge.kind,
      onQuit: () => ctx.app.switchMode('hub'),
      onDoorToggle: (side) => setDoor(side, !doors[side].closed),
      onLightDown: (side) => {
        if (powerOut || tablet.isOpen) return;
        lights[side] = true;
        officeUI.setLight(side, true);
        ctx.audio.sfx.lightBuzz();
      },
      onLightUp: (side) => {
        if (!lights[side]) return;
        lights[side] = false;
        officeUI.setLight(side, false);
        ctx.audio.sfx.stopLightBuzz();
      },
      onTabletToggle: toggleTablet,
    });
    officeUI.setClock(0, night);

    screenEl = el('div', {}, officeUI.root, tablet.root);
    uiRoot().append(screenEl);

    // Space also flips the monitor, like slamming the tablet down
    this._onKey = (e) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        toggleTablet();
      }
    };
    window.addEventListener('keydown', this._onKey);

    ctx.audio.ambient.fanHum();

    // ---- debug hooks ----
    ctx.debug.toggleTablet = (open) => {
      if (open && !tablet.isOpen) { tablet.open(); officeUI.setControlsVisible(false); }
      if (!open && tablet.isOpen) { tablet.close(); officeUI.setControlsVisible(true); }
    };
    ctx.debug.tabletOpen = () => tablet.isOpen;
    ctx.debug.doorClosed = (side) => !!doors[side]?.closed;
    ctx.debug.openCam = (id) => tablet.selectById(id);
    ctx.debug.pressDoor = (side, closed) => setDoor(side, closed);
    ctx.debug.forceMoveToOffice = (idx, side) => director.forceToEntry(idx, side, simTime);
    ctx.debug.stepSim = (seconds) => ctx.engine.stepSim(seconds);
    ctx.debug.animRoom = (idx) => director.agents[idx]?.entry ? 'officeEntry' : director.agents[idx]?.room;
    ctx.debug.nightState = () => state;
    ctx.debug.skipToHour = (h) => { simTime = h * HOUR; };
    ctx.debug.instantJumpscare = () => triggerJumpscare(director.agents[0]);
    ctx.debug.instantWin = () => { simTime = NIGHT_END; };
  },

  exit() {
    clearTimeout(winTimer);
    window.removeEventListener('keydown', this._onKey);
    ctxRef.input.disableLook();
    ctxRef.audio.stopAllLoops();
    // restore lighting for other modes
    if (lightMeshes) for (const l of lightMeshes) l.intensity = l.userData.orig ?? l.intensity;
    // rigs may have been stolen by the jumpscare scene; rebuild next time
    invalidatePizzeria(ctxRef.universe.layout);
    for (const rig of rigs) disposeGeometries(rig.group);
    disposeGeometries(scene); // includes the (now cache-invalidated) pizzeria
    scene = null;
    rigs = [];
  },

  update(dt) {
    if (!scene || state !== 'running') return;
    simTime += dt;

    // power
    if (!powerOut) {
      power -= usagePips() * DRAIN_PER_PIP * dt;
      if (power <= 0) goPowerOut();
    } else if (simTime >= doomAt) {
      const atDoor = director.agents.find(a => a.entry);
      const closest = atDoor ?? director.agents.reduce((best, a) =>
        (graph.distToOffice[a.room] < graph.distToOffice[best.room] ? a : best), director.agents[0]);
      if (closest) triggerJumpscare(closest);
      return;
    }

    // clock
    const hour = Math.floor(simTime / HOUR);
    officeUI.setClock(Math.min(hour, 6), params.night);
    if (simTime >= NIGHT_END) { winNight(); return; }

    officeUI.setPower(power);
    officeUI.setUsage(usagePips());

    // the building settles around you
    if (simTime >= nextCreakAt && !powerOut) {
      ctxRef.audio.sfx.creak();
      nextCreakAt = simTime + 12 + ctxRef.rng.next() * 28;
    }

    director.tick({
      now: simTime,
      hour,
      viewedRoom: tablet.viewedRoom(),
      isDoorClosed: (side) => !!doors[side]?.closed,
      powerOut,
      onJumpscare: (agent) => triggerJumpscare(agent),
      onMove: (agent, edgeKind) => {
        if (edgeKind === 'vent') ctxRef.audio.sfx.ventScuttle();
        else if (graph.distToOffice[agent.room] <= 2) ctxRef.audio.sfx.footstepThud();
      },
      onArriveEntry: () => ctxRef.audio.sfx.servoWhir(),
      onDoorBang: () => ctxRef.audio.sfx.doorSlam(),
    });

    // kitchen clatter: someone is rummaging where the pots live
    if (simTime >= nextClatterAt) {
      const inKitchen = director.agents.some(a => graph.rooms[a.room]?.type === 'kitchen');
      if (inKitchen) ctxRef.audio.sfx.potClatter();
      nextClatterAt = simTime + 6 + ctxRef.rng.next() * 8;
    }

    // door cover animation
    for (const side of ['left', 'right']) {
      const b = doorBindings[side];
      if (!b?.mesh) continue;
      const target = doors[side].closed && !powerOut ? b.mesh.userData.closedY : b.mesh.userData.openY;
      const y = b.mesh.position.y;
      const ny = y + Math.sign(target - y) * Math.min(Math.abs(target - y), 9 * dt);
      b.mesh.position.y = ny;
      b.mesh.visible = Math.abs(ny - b.mesh.userData.openY) > 0.03;
    }
  },

  frame(dt, time) {
    if (!scene) return;
    if (jumpscare.frame(dt, ctxRef.engine.renderer)) return;

    placeRigs(time);
    for (const fan of pizzeria.fans) fan.rotation.z = time * 12;

    // door lights reveal whoever waits outside
    for (const side of ['left', 'right']) {
      const b = doorBindings[side];
      if (!b) continue;
      if (!b.flicker) {
        b.flicker = new THREE.PointLight(0xfff2cc, 0, pizzeria.cellSize * 2.6, 1.6);
        const cell = outerCellOfEntry(b.entry);
        b.flicker.position.set((cell[0] + 0.5) * pizzeria.cellSize, 2.2, (cell[1] + 0.5) * pizzeria.cellSize);
        scene.add(b.flicker);
      }
      const on = lights[side] && !powerOut && !tablet.isOpen;
      b.flicker.intensity = on ? (Math.random() > 0.12 ? 16 : 3) : 0;
    }

    if (tablet.isOpen) {
      tablet.update(dt, director.jamLevel(tablet.viewedRoom()));
      tablet.camera.aspect = window.innerWidth / window.innerHeight;
      tablet.camera.updateProjectionMatrix();
      ctxRef.engine.renderer.render(scene, tablet.camera);
    } else {
      // clamped office pan
      const rel = wrapAngle(ctxRef.input.yaw - baseYaw);
      ctxRef.input.yaw = baseYaw + THREE.MathUtils.clamp(rel, -1.35, 1.35);
      ctxRef.input.pitch = THREE.MathUtils.clamp(ctxRef.input.pitch, -0.5, 0.55);
      officeCam.aspect = window.innerWidth / window.innerHeight;
      officeCam.updateProjectionMatrix();
      officeCam.rotation.set(0, 0, 0);
      officeCam.rotateY(ctxRef.input.yaw);
      officeCam.rotateX(ctxRef.input.pitch);
      // power-out darkness: everything but glowing eyes fades
      ctxRef.engine.renderer.render(scene, officeCam);
    }
  },
};
