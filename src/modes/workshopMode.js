import * as THREE from 'three';
import {
  el, button, panel, field, slider, colorInput, textInput, select, choiceGroup, uiRoot, toast,
} from '../ui/dom.js';
import { BASE_TYPES, ACCESSORIES, ROUTE_PREFS, ABILITIES, makeAnimatronic } from '../data/schemas.js';
import { buildAnimatronicRig, poseIdle, poseStare, poseWalk, poseJumpscare } from '../world/animatronicRig.js';
import { disposeGeometries } from '../core/gfx.js';

// Animatronic workshop: turntable preview + appearance and AI panels.
// Every edit mutates the universe in place and rebuilds the preview rig.

let ctxRef, scene, camera, rig, spot;
let selected = 0;
let previewPose = 'idle';
let listEl, sideEl, screenEl;

function anims() { return ctxRef.universe.animatronics; }
function current() { return anims()[selected]; }

function rebuildRig() {
  if (rig) {
    scene.remove(rig.group);
    disposeGeometries(rig.group);
  }
  rig = null;
  if (!current()) return;
  rig = buildAnimatronicRig(current());
  rig.group.position.set(0, 0, 0);
  scene.add(rig.group);
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

function edit(path, value) {
  if (!current()) return;
  setByPath(current(), path, value);
  rebuildRig();
}

function renderList() {
  listEl.replaceChildren(...[
    el('div', { class: 'group-label', text: 'Your cast' }),
    ...anims().map((a, i) => el('div', {
      class: `list-item${i === selected ? ' active' : ''}`,
      onclick: () => { selected = i; refresh(); },
    },
      el('span', { class: 'grow', text: a.name }),
      el('span', { class: 'hint', text: a.appearance.baseType }),
    )),
    button('+ New animatronic', () => {
      if (anims().length >= 12) { toast('Cast limit reached (12).', true); return; }
      const id = `a${Date.now() % 1000000}`;
      anims().push(makeAnimatronic(id, `Newcomer ${anims().length + 1}`));
      selected = anims().length - 1;
      refresh();
    }, 'small primary'),
    anims().length > 1
      ? button('Delete selected', () => {
          anims().splice(selected, 1);
          selected = Math.max(0, selected - 1);
          refresh();
        }, 'small danger')
      : null,
  ].filter(Boolean));
}

function aggressionRow(a) {
  const row = el('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } });
  for (let n = 0; n < 7; n++) {
    const wrap = el('div', { class: 'col', style: { gap: '2px', alignItems: 'center' } });
    const label = el('span', { class: 'hint', text: `N${n + 1}` });
    const input = el('input', {
      type: 'number', min: 0, max: 20, value: a.ai.aggression[n],
      style: { width: '42px', background: '#101018', color: '#d8d8e0', border: '1px solid #2c2c3a', borderRadius: '3px', padding: '2px' },
    });
    input.addEventListener('change', () => {
      a.ai.aggression[n] = Math.max(0, Math.min(20, Math.round(+input.value || 0)));
      input.value = a.ai.aggression[n];
    });
    wrap.append(label, input);
    row.append(wrap);
  }
  return row;
}

function renderSide() {
  const a = current();
  if (!a) { sideEl.replaceChildren(); return; }
  const acc = new Set(a.appearance.accessories);

  const accChips = el('div', { class: 'choice-grid' },
    ...ACCESSORIES.map(name => {
      const b = button(name, () => {
        if (acc.has(name)) acc.delete(name); else acc.add(name);
        edit('appearance.accessories', [...acc]);
        b.classList.toggle('active');
      }, `small${acc.has(name) ? ' active' : ''}`);
      return b;
    }));

  const abilitySet = new Set(a.ai.abilities);
  const abilityChips = el('div', { class: 'choice-grid' },
    ...ABILITIES.map(name => {
      const b = button(name, () => {
        if (abilitySet.has(name)) abilitySet.delete(name); else abilitySet.add(name);
        a.ai.abilities = [...abilitySet];
        b.classList.toggle('active');
      }, `small${abilitySet.has(name) ? ' active' : ''}`);
      return b;
    }));

  sideEl.replaceChildren(
    panel(
      el('h3', { text: 'Identity' }),
      el('div', { class: 'col' },
        field('Name', textInput(a.name, v => { a.name = v.slice(0, 32); renderList(); })),
        field('Base body', choiceGroup(BASE_TYPES, a.appearance.baseType, v => edit('appearance.baseType', v)).node),
      ),
    ),
    panel(
      el('h3', { text: 'Looks' }),
      el('div', { class: 'col' },
        el('div', { class: 'row' },
          field('Primary', colorInput(a.appearance.primaryColor, v => edit('appearance.primaryColor', v))),
          field('Secondary', colorInput(a.appearance.secondaryColor, v => edit('appearance.secondaryColor', v))),
          field('Eyes', colorInput(a.appearance.eyeColor, v => edit('appearance.eyeColor', v))),
        ),
        field('Eye glow', slider({ value: a.appearance.eyeGlow, oninput: v => edit('appearance.eyeGlow', v) })),
        field('Withered', slider({ value: a.appearance.withered, oninput: v => edit('appearance.withered', v) })),
        field('Scale', slider({ min: 0.6, max: 1.6, value: a.appearance.scale, oninput: v => edit('appearance.scale', v) })),
        field('Accessories', accChips),
      ),
    ),
    panel(
      el('h3', { text: 'Hunting AI' }),
      el('div', { class: 'col' },
        field('Aggression per night (0-20)', aggressionRow(a)),
        field('Speed', slider({ min: 0.4, max: 3, value: a.ai.speed, oninput: v => { a.ai.speed = v; } })),
        field('Route preference', choiceGroup(ROUTE_PREFS, a.ai.routePreference, v => { a.ai.routePreference = v; }).node),
        field('Abilities', abilityChips),
        field('On stage until night', select(['1', '2', '3', '4', '5', '6', '7'], String(a.ai.stageUntilNight), v => { a.ai.stageUntilNight = +v; })),
        el('div', { class: 'hint', text: 'ventCrawler: can use vent routes · cameraJammer: fills your feed with static nearby · doorRusher: shorter attack delay at your door' }),
      ),
    ),
    panel(
      el('h3', { text: 'Preview pose' }),
      choiceGroup(['idle', 'stare', 'walk', 'jumpscare'], previewPose, v => { previewPose = v; }).node,
    ),
  );
}

function refresh() {
  renderList();
  renderSide();
  rebuildRig();
}

export const workshopMode = {
  enter(ctx) {
    ctxRef = ctx;
    selected = Math.min(selected, Math.max(0, anims().length - 1));

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c12);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
    camera.position.set(0, 1.5, 4.6);
    camera.lookAt(0, 1.15, 0);

    // workshop floor disc + backdrop
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.7, 0.12, 28),
      new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.6, metalness: 0.3 }),
    );
    disc.position.y = -0.06;
    scene.add(disc);
    scene.add(new THREE.AmbientLight(0x8888a0, 0.7));
    spot = new THREE.SpotLight(0xfff1d6, 60, 20, 0.6, 0.5, 1.6);
    spot.position.set(2.5, 4.2, 3);
    scene.add(spot);
    const rim = new THREE.PointLight(0x7b2fbe, 8, 12, 1.8);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    listEl = el('div', { class: 'list-panel panel' });
    sideEl = el('div', { class: 'side-panel' });
    screenEl = el('div', {},
      el('div', { class: 'top-bar' },
        button('◄ Hub (Esc)', () => ctx.app.switchMode('hub'), 'small'),
        el('h2', { text: 'ANIMATRONIC WORKSHOP' }),
        el('div', { class: 'spacer' }),
      ),
      listEl, sideEl,
    );
    uiRoot().append(screenEl);
    refresh();

    this._onKey = (e) => { if (e.code === 'Escape') ctx.app.switchMode('hub'); };
    window.addEventListener('keydown', this._onKey);

    ctx.debug.workshopSelect = (i) => { selected = i; refresh(); };
    ctx.debug.workshopSet = (path, value) => { edit(path, value); renderSide(); };
  },

  exit() {
    window.removeEventListener('keydown', this._onKey);
    if (ctxRef.slot >= 0) ctxRef.saves.saveSlot(ctxRef.slot, ctxRef.universe);
    scene = null;
    rig = null;
  },

  update() {},

  frame(dt, time) {
    if (!scene) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (rig) {
      rig.group.rotation.y = time * 0.45;
      if (previewPose === 'idle') poseIdle(rig, time);
      else if (previewPose === 'stare') poseStare(rig, time, 0);
      else if (previewPose === 'walk') poseWalk(rig, time, 1);
      else poseJumpscare(rig, (time % 1));
    }
    ctxRef.engine.renderer.render(scene, camera);
  },
};
