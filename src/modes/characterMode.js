import * as THREE from 'three';
import {
  el, button, panel, field, slider, colorInput, textInput, choiceGroup, uiRoot,
} from '../ui/dom.js';
import { HAIR_STYLES, CHARACTER_ACCESSORIES } from '../data/schemas.js';
import { buildCharacterRig, applyPurpleness, poseCharacterIdle, poseCharacterOminous } from '../world/characterRig.js';
import { disposeGeometries } from '../core/gfx.js';

// Side-by-side customization of the player and the friend.
// The friend preview shows the current story purpleness — he IS becoming
// the Purple Guy, and this screen is where you notice.

let ctxRef, scene, camera;
let rigs = { player: null, friend: null };
let editing = 'player';
let sideEl, screenEl, tabsEl;

function chars() { return ctxRef.universe.characters; }

function rebuildRig(role) {
  if (rigs[role]) {
    scene.remove(rigs[role].group);
    disposeGeometries(rigs[role].group);
  }
  const rig = buildCharacterRig(chars()[role]);
  rig.group.position.x = role === 'player' ? -1.1 : 1.1;
  if (role === 'friend') applyPurpleness(rig, ctxRef.universe.progress.purpleness);
  scene.add(rig.group);
  rigs[role] = rig;
}

function renderSide() {
  const c = chars()[editing];
  const p = ctxRef.universe.progress.purpleness;
  sideEl.replaceChildren(...[
    panel(
      el('h3', { text: editing === 'player' ? 'You — the night guard' : 'Your friend' }),
      el('div', { class: 'col' },
        field('Name', textInput(c.name, v => { c.name = v.slice(0, 24); })),
        field('Skin tone', slider({ value: c.skinTone, oninput: v => { c.skinTone = v; rebuildRig(editing); } })),
        field('Hair style', choiceGroup(HAIR_STYLES, c.hairStyle, v => { c.hairStyle = v; rebuildRig(editing); }).node),
        el('div', { class: 'row' },
          field('Hair', colorInput(c.hairColor, v => { c.hairColor = v; rebuildRig(editing); })),
          field('Uniform', colorInput(c.uniformColor, v => { c.uniformColor = v; rebuildRig(editing); })),
          field('Hat', colorInput(c.hatColor, v => { c.hatColor = v; rebuildRig(editing); })),
        ),
        field('Wear hat', choiceGroup([
          { value: 'yes', label: 'hat on' }, { value: 'no', label: 'hat off' },
        ], c.hatOn ? 'yes' : 'no', v => { c.hatOn = v === 'yes'; rebuildRig(editing); }).node),
        field('Accessory', choiceGroup(CHARACTER_ACCESSORIES, c.accessory, v => { c.accessory = v; rebuildRig(editing); }).node),
      ),
    ),
    editing === 'friend'
      ? panel(
          el('h3', { text: 'Condition' }),
          el('div', { class: 'col' },
            el('div', { class: 'hint', text: `Purpleness: ${(p * 100).toFixed(0)}% — this advances with your story choices. There is no slider. There is no going back.` }),
            p > 0.55 ? el('div', { class: 'hint', style: { color: '#a86fd8' }, text: 'He doesn\'t blink as much as he used to.' }) : null,
          ),
        )
      : null,
  ].filter(Boolean));
}

function renderTabs() {
  tabsEl.replaceChildren(
    button(chars().player.name || 'Player', () => { editing = 'player'; renderTabs(); renderSide(); },
      `small${editing === 'player' ? ' active' : ''}`),
    button(chars().friend.name || 'Friend', () => { editing = 'friend'; renderTabs(); renderSide(); },
      `small${editing === 'friend' ? ' active' : ''}`),
  );
}

export const characterMode = {
  enter(ctx) {
    ctxRef = ctx;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c12);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
    camera.position.set(0, 1.35, 4.8);
    camera.lookAt(0, 1.05, 0);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.7, 0.1, 32),
      new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.7 }),
    );
    floor.position.y = -0.05;
    scene.add(floor);
    scene.add(new THREE.AmbientLight(0x9090a8, 0.8));
    const key = new THREE.SpotLight(0xfff1d6, 50, 20, 0.7, 0.5, 1.6);
    key.position.set(2, 4, 3.5);
    scene.add(key);
    const rim = new THREE.PointLight(0x7b2fbe, 6, 12, 1.8);
    rim.position.set(-3, 2.2, -1.5);
    scene.add(rim);

    rebuildRig('player');
    rebuildRig('friend');

    tabsEl = el('div', { class: 'row' });
    sideEl = el('div', { class: 'side-panel' });
    screenEl = el('div', {},
      el('div', { class: 'top-bar' },
        button('◄ Hub (Esc)', () => ctx.app.switchMode('hub'), 'small'),
        el('h2', { text: 'CHARACTERS' }),
        tabsEl,
        el('div', { class: 'spacer' }),
      ),
      sideEl,
    );
    uiRoot().append(screenEl);
    renderTabs();
    renderSide();

    this._onKey = (e) => { if (e.code === 'Escape') ctx.app.switchMode('hub'); };
    window.addEventListener('keydown', this._onKey);

    ctx.debug.characterSet = (role, key2, value) => {
      chars()[role][key2] = value;
      rebuildRig(role);
      renderSide();
    };
  },

  exit() {
    window.removeEventListener('keydown', this._onKey);
    if (ctxRef.slot >= 0) ctxRef.saves.saveSlot(ctxRef.slot, ctxRef.universe);
    disposeGeometries(scene);
    scene = null;
    rigs = { player: null, friend: null };
  },

  update() {},

  frame(dt, time) {
    if (!scene) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    const p = ctxRef.universe.progress.purpleness;
    if (rigs.player) {
      rigs.player.group.rotation.y = Math.sin(time * 0.3) * 0.5;
      poseCharacterIdle(rigs.player, time);
    }
    if (rigs.friend) {
      rigs.friend.group.rotation.y = -Math.sin(time * 0.3) * 0.5;
      poseCharacterOminous(rigs.friend, time, p);
    }
    ctxRef.engine.renderer.render(scene, camera);
  },
};
