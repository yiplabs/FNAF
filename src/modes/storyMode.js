import * as THREE from 'three';
import { el, button, uiRoot, toast } from '../ui/dom.js';
import { checkCondition, applyEffect, validateStory } from '../data/validators.js';
import { buildCharacterRig, applyPurpleness, poseCharacterIdle, poseCharacterOminous } from '../world/characterRig.js';
import { buildAnimatronicRig, poseIdle } from '../world/animatronicRig.js';

// Story runtime: dialogue and choices between nights, rendered over small
// 3D tableaus. Night nodes hand off to nightMode and resume on 6AM.

let ctxRef, u;
let scene, camera, rigs;
let screenEl, dialogEl;
let nodeId = null;
let lineIdx = 0, charIdx = 0, typing = false;

function story() { return u.story; }
function node() { return story().nodes[nodeId]; }

function interp(text) {
  return String(text)
    .replaceAll('{friend}', u.characters.friend.name)
    .replaceAll('{player}', u.characters.player.name)
    .replaceAll('{pizzeria}', u.meta.pizzeriaName)
    .replaceAll('{era}', u.meta.era);
}

// ---------- tableaus ----------

function checkerTexture() {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 128;
  const c = cnv.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      c.fillStyle = (x + y) % 2 ? '#181820' : '#0c0c12';
      c.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

function buildTableau(kind) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050508);
  scene.fog = new THREE.Fog(0x050508, 8, 26);
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
  camera.position.set(0, 1.5, 5.2);
  camera.lookAt(0, 1.2, 0);
  rigs = { chars: [], anims: [], lights: [] };

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  scene.add(new THREE.AmbientLight(0x33334a, 0.6));

  const addChar = (role, x, faceX = 0) => {
    const rig = buildCharacterRig(u.characters[role]);
    if (role === 'friend') applyPurpleness(rig, u.progress.purpleness);
    rig.group.position.set(x, 0, 0);
    rig.group.rotation.y = Math.atan2(faceX - x, 2.2);
    scene.add(rig.group);
    rigs.chars.push({ rig, role });
    return rig;
  };

  if (kind === 'diner') {
    const key = new THREE.PointLight(0xffd9a0, 22, 18, 1.7);
    key.position.set(0, 3.2, 1.5);
    scene.add(key);
    addChar('player', -1.15, 1);
    addChar('friend', 1.15, -1);
    // table between them
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 14),
      new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.6 }));
    table.position.set(0, 0.75, 0.3);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: 0x444450 }));
    leg.position.set(0, 0.37, 0.3);
    scene.add(table, leg);
  } else if (kind === 'office') {
    const key = new THREE.PointLight(0xbfd4ff, 16, 16, 1.7);
    key.position.set(0, 2.8, 2);
    scene.add(key);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a4038 }));
    desk.position.set(0, 0.8, 0.6);
    scene.add(desk);
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x992222, emissive: 0xff3333, emissiveIntensity: 0.8 }));
    phone.position.set(-0.6, 0.9, 0.55);
    phone.name = 'phone';
    scene.add(phone);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x111118, emissive: 0x2a3a55, emissiveIntensity: 1 }));
    monitor.position.set(0.5, 1.08, 0.6);
    monitor.rotation.y = -0.25;
    scene.add(monitor);
  } else if (kind === 'stage') {
    const key = new THREE.SpotLight(0xc9a227, 60, 25, 0.7, 0.5, 1.7);
    key.position.set(0, 5, 4);
    scene.add(key);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 3),
      new THREE.MeshStandardMaterial({ color: 0x2c2015 }));
    platform.position.set(0, 0.2, -0.6);
    scene.add(platform);
    u.animatronics.slice(0, 3).forEach((anim, i) => {
      const rig = buildAnimatronicRig(anim);
      rig.group.position.set((i - 1) * 2.1, 0.4, -0.6);
      scene.add(rig.group);
      rigs.anims.push(rig);
    });
  } else if (kind === 'parking') {
    scene.fog = new THREE.Fog(0x0a0614, 6, 30);
    scene.background = new THREE.Color(0x0a0614);
    const moon = new THREE.PointLight(0x8899cc, 10, 40, 1.4);
    moon.position.set(-6, 8, -4);
    scene.add(moon);
    // neon sign
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xc9276a, emissiveIntensity: 1.6 }));
    sign.position.set(0, 3.6, -3);
    sign.name = 'neon';
    scene.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x333340 }));
    pole.position.set(0, 1.6, -3);
    scene.add(pole);
    addChar('player', -1, 1);
    addChar('friend', 1, -1);
  } else { // saferoom
    scene.fog = new THREE.Fog(0x030304, 4, 18);
    const bulb = new THREE.PointLight(0xffe9c0, 14, 12, 1.9);
    bulb.position.set(0, 2.9, 0.5);
    bulb.name = 'bulb';
    scene.add(bulb);
    // empty suit slumped in the corner
    if (u.animatronics[0]) {
      const suit = buildAnimatronicRig(u.animatronics[0]);
      suit.group.position.set(-2.4, 0, -1.6);
      suit.group.rotation.y = 0.6;
      suit.group.rotation.z = 0.12;
      suit.joints.head.rotation.x = 0.7;
      suit.joints.jaw.rotation.x = 0.5;
      scene.add(suit.group);
      rigs.anims.push({ ...suit, static: true });
    }
    addChar('friend', 0.9, -1);
    addChar('player', -1.3, 1);
  }
}

// ---------- node rendering ----------

function saveProgress() {
  if (ctxRef.slot >= 0) ctxRef.saves.saveSlot(ctxRef.slot, u);
}

function enterNode(id, { render = true } = {}) {
  const n = story().nodes[id];
  if (!n) {
    toast(`Story node "${id}" is missing — returning to hub.`, true);
    ctxRef.app.switchMode('hub');
    return;
  }
  nodeId = id;
  u.progress.nodeId = id;
  lineIdx = 0;
  charIdx = 0;

  if (n.type === 'night') {
    saveProgress();
    const nightNo = n.night;
    ctxRef.app.switchMode('night', {
      night: nightNo,
      onComplete: () => {
        u.progress.night = Math.max(u.progress.night, nightNo + 1);
        u.progress.nodeId = n.next || null;
        saveProgress();
        ctxRef.app.switchMode('story');
      },
    });
    return;
  }

  if (n.type === 'ending') {
    if (!u.progress.endingsSeen.includes(n.endingId)) {
      u.progress.endingsSeen.push(n.endingId);
    }
    saveProgress();
  }

  if (render) renderNode();
}

function visibleChoices(n) {
  return (n.choices || []).filter(c => (c.conditions || []).every(cond => checkCondition(cond, u.progress)));
}

function renderNode() {
  const n = node();
  buildTableau(n.background || (n.type === 'ending' ? 'saferoom' : 'diner'));
  screenEl.replaceChildren();

  if (n.type === 'dialogue' || n.type === 'choice') {
    const speaker = n.type === 'dialogue' ? n.speaker : 'narrator';
    const speakerName =
      speaker === 'friend' ? u.characters.friend.name
      : speaker === 'player' ? u.characters.player.name
      : speaker === 'phone' ? '☏ PHONE'
      : '';
    dialogEl = el('div', { class: `dialog-box ${speaker}` },
      speakerName ? el('div', { class: 'speaker', text: speakerName }) : null,
      el('div', { class: 'line' }),
      el('div', { class: 'continue-hint', text: n.type === 'dialogue' ? 'click / space ▸' : '' }),
    );
    const wrap = el('div', { class: 'screen dialog-screen' },
      el('div', { class: 'top-bar' },
        button('◄ Hub', () => ctxRef.app.switchMode('hub'), 'small'),
        el('h2', { text: u.meta.pizzeriaName }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'hint', text: `Night ${u.progress.night}` }),
      ),
      dialogEl,
    );
    screenEl.append(wrap);
    typing = true;
  } else if (n.type === 'ending') {
    const wrap = el('div', { class: 'screen fade-in', style: { background: 'rgba(2,2,4,0.55)' } },
      el('h1', { class: `ending-title${n.bad ? ' bad' : ''}`, text: n.title }),
      el('div', { class: 'col', style: { maxWidth: '640px', textAlign: 'center' } },
        ...(n.lines || []).map(l => el('p', { text: interp(l), style: { lineHeight: '1.7', marginBottom: '10px' } }))),
      el('div', { class: 'row' },
        button('Return to Hub', () => ctxRef.app.switchMode('hub'), 'primary'),
        button('Endings: ' + u.progress.endingsSeen.length, () => {}, 'small'),
      ),
    );
    screenEl.append(wrap);
  }
}

function currentLineFull() {
  const n = node();
  const lines = n.lines || [];
  return interp(lines[lineIdx] ?? '');
}

function showChoices() {
  const n = node();
  if (n.type !== 'choice') return;
  const choices = visibleChoices(n);
  const stack = el('div', { class: 'choice-stack' },
    ...choices.map(c => el('button', {
      class: 'choice-btn',
      text: interp(c.text),
      onclick: () => pickChoice(c),
    })),
  );
  if (!choices.length) {
    stack.append(el('button', { class: 'choice-btn', text: '…there is nothing left to say.', onclick: () => ctxRef.app.switchMode('hub') }));
  }
  dialogEl.after(stack);
}

function pickChoice(c) {
  ctxRef.audio.sfx.uiClick();
  for (const eff of c.effects || []) applyEffect(eff, u.progress);
  saveProgress();
  if (c.next) enterNode(c.next);
  else ctxRef.app.switchMode('hub');
}

function advance() {
  const n = node();
  if (!n || (n.type !== 'dialogue' && n.type !== 'choice')) return;
  const lines = n.lines || [];
  if (typing) {
    // finish the line instantly
    typing = false;
    charIdx = currentLineFull().length;
    dialogEl.querySelector('.line').textContent = currentLineFull();
    if (n.type === 'choice' && lineIdx >= lines.length - 1) showChoices();
    return;
  }
  if (lineIdx < lines.length - 1) {
    lineIdx++;
    charIdx = 0;
    typing = true;
  } else if (n.type === 'dialogue') {
    if (n.next) enterNode(n.next);
    else ctxRef.app.switchMode('hub');
  }
}

export const storyMode = {
  enter(ctx) {
    ctxRef = ctx;
    u = ctx.universe;
    if (!u) { ctx.app.switchMode('menu'); return; }

    screenEl = el('div', {});
    uiRoot().append(screenEl);

    this._onClick = (e) => {
      if (e.target.closest('.choice-btn') || e.target.closest('.btn') || e.target.closest('.top-bar')) return;
      advance();
    };
    this._onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') advance();
      if (e.code === 'Escape') ctx.app.switchMode('hub');
    };
    window.addEventListener('click', this._onClick);
    window.addEventListener('keydown', this._onKey);

    // debug hooks
    ctx.debug.storyNode = () => nodeId;
    ctx.debug.storyJump = (id) => enterNode(id);
    ctx.debug.storySetState = ({ purpleness, flags, night } = {}) => {
      if (purpleness !== undefined) u.progress.purpleness = purpleness;
      if (flags) Object.assign(u.progress.flags, flags);
      if (night !== undefined) u.progress.night = night;
    };
    ctx.debug.storyChoose = (regex) => {
      const n = node();
      if (n?.type !== 'choice') return false;
      // make sure choices are on screen
      if (typing) advance();
      const c = visibleChoices(n).find(ch => regex.test(interp(ch.text)));
      if (!c) return false;
      pickChoice(c);
      return true;
    };
    ctx.debug.storyReset = () => {
      u.progress.night = 1;
      u.progress.nodeId = null;
      u.progress.flags = {};
      u.progress.purpleness = 0;
      saveProgress();
    };
    ctx.debug.storyValidate = () => validateStory(u.story);
    ctx.debug.storyFastForwardToNight = () => {
      let guard = 0;
      while (guard++ < 60) {
        const n = node();
        if (!n) return false;
        if (n.type === 'night') return true; // enterNode already switched modes
        if (n.type === 'ending') return false;
        if (n.type === 'dialogue') {
          if (!n.next) return false;
          enterNode(n.next, { render: false });
        } else if (n.type === 'choice') {
          const c = visibleChoices(n)[0];
          if (!c) return false;
          for (const eff of c.effects || []) applyEffect(eff, u.progress);
          if (!c.next) return false;
          enterNode(c.next, { render: false });
        }
        if (ctxRef.app.modeName !== 'story') return true; // handed off to night
      }
      return false;
    };

    enterNode(u.progress.nodeId || story().startNodeId);
  },

  exit() {
    window.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
    scene = null;
    dialogEl = null;
  },

  update() {},

  frame(dt, time) {
    if (!scene) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    // typewriter
    if (typing && dialogEl) {
      charIdx += dt * 42;
      const full = currentLineFull();
      const shown = full.slice(0, Math.floor(charIdx));
      dialogEl.querySelector('.line').textContent = shown;
      if (shown.length >= full.length) {
        typing = false;
        const n = node();
        if (n.type === 'choice' && lineIdx >= (n.lines || []).length - 1) showChoices();
      }
    }

    // tableau life
    for (const { rig, role } of rigs.chars) {
      if (role === 'friend') poseCharacterOminous(rig, time, u.progress.purpleness);
      else poseCharacterIdle(rig, time, 1.7);
    }
    for (const rig of rigs.anims) {
      if (!rig.static) poseIdle(rig, time);
    }
    const neon = scene.getObjectByName('neon');
    if (neon) neon.material.emissiveIntensity = Math.sin(time * 7) > -0.85 ? 1.6 : 0.3;
    const bulb = scene.getObjectByName('bulb');
    if (bulb) bulb.position.x = Math.sin(time * 0.9) * 0.5;
    const phone = scene.getObjectByName('phone');
    if (phone) phone.material.emissiveIntensity = Math.sin(time * 5) > 0 ? 1.2 : 0.15;
    camera.position.x = Math.sin(time * 0.13) * 0.25;

    ctxRef.engine.renderer.render(scene, camera);
  },
};
