import * as THREE from 'three';
import { el, button, panel, field, textInput, uiRoot, toast } from '../ui/dom.js';
import { makeDefaultUniverse } from '../data/defaultUniverse.js';
import { validateLayout, sanitizeUniverse } from '../data/validators.js';
import { getPizzeria, invalidatePizzeria } from '../world/pizzeriaMesh.js';

// Per-universe hub: the crossroads between all creation tools and play modes.
// The backdrop is your actual pizzeria, slowly orbited from above.

let ctxRef;
let screenEl = null;
let scene = null, camera = null, orbitCenter = null, orbitRadius = 20;

function buildBackdrop() {
  scene = null;
  try {
    const layout = ctxRef.universe.layout;
    invalidatePizzeria(layout);
    const pizzeria = getPizzeria(layout);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);
    scene.fog = new THREE.Fog(0x050508, 20, 70);
    scene.add(pizzeria.group);
    scene.add(new THREE.AmbientLight(0x555577, 0.7));
    const s = layout.grid.cell;
    orbitCenter = new THREE.Vector3(layout.grid.w * s / 2, 0, layout.grid.h * s / 2);
    orbitRadius = Math.max(layout.grid.w, layout.grid.h) * s * 0.62;
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  } catch (err) {
    console.warn('hub backdrop unavailable', err);
    scene = null;
  }
}

function saveNow() {
  if (ctxRef.universe && ctxRef.slot >= 0) {
    ctxRef.saves.saveSlot(ctxRef.slot, ctxRef.universe);
  }
}

function renderCreateForm() {
  screenEl?.remove();
  let name = 'My Universe';
  let pizzeria = "Freddy's on 5th";
  let era = '1987';
  let backstory = '';

  const backstoryInput = el('textarea', { rows: 4, placeholder: 'Optional lore for your universe…' });
  backstoryInput.addEventListener('input', () => { backstory = backstoryInput.value; });

  const nameInput = textInput(name, v => { name = v; });
  nameInput.dataset.id = 'uname';
  const pizzeriaInput = textInput(pizzeria, v => { pizzeria = v; });
  pizzeriaInput.dataset.id = 'pname';

  screenEl = el('div', { class: 'screen fade-in' },
    el('h2', { class: 'title-glow', text: 'NEW UNIVERSE' }),
    panel(el('div', { class: 'col', style: { width: '380px' } },
      field('Universe name', nameInput),
      field('Pizzeria name', pizzeriaInput),
      field('Era / year', textInput(era, v => { era = v; })),
      field('Backstory', backstoryInput),
      el('div', { class: 'hint', text: 'Starts with a classic pizzeria, 4 animatronics and a full story — rebuild all of it however you like.' }),
      el('div', { class: 'row' },
        button('Create', () => {
          const slot = ctxRef.saves.firstFreeSlot();
          if (slot === -1) { toast('All save slots are full — delete one first.', true); return; }
          ctxRef.universe = makeDefaultUniverse({
            name: name.trim() || 'My Universe',
            pizzeriaName: pizzeria.trim() || "Freddy's",
            era: era.trim() || '1987',
            backstory,
          });
          ctxRef.slot = slot;
          saveNow();
          ctxRef.audio.sfx.uiClick();
          buildBackdrop();
          renderHub();
        }, 'primary'),
        button('Cancel', () => ctxRef.app.switchMode('menu')),
      ),
    )),
  );
  uiRoot().append(screenEl);
}

function renderHub() {
  screenEl?.remove();
  const u = ctxRef.universe;
  const { ok: playable, errors } = validateLayout(u.layout, u.animatronics);
  const storyDone = u.progress.endingsSeen.length > 0;

  const card = (title, desc, onClick, disabled = false) => {
    const node = el('div', {
      class: `hub-card${disabled ? ' disabled' : ''}`,
      onclick: disabled ? () => toast(errors[0] || 'Unavailable', true) : () => { ctxRef.audio.sfx.uiClick(); onClick(); },
    }, el('h3', { text: title }), el('p', { text: desc }));
    return node;
  };

  const nightLabel = u.progress.nodeId === null && u.progress.night === 1
    ? 'Begin the story from the first day.'
    : `Continue — Night ${u.progress.night}.`;

  // endings gallery: every authored ending + the secret golden night
  const endingNodes = Object.values(u.story.nodes).filter(n => n.type === 'ending');
  const endingChip = (endingId, title, bad) => {
    const seen = u.progress.endingsSeen.includes(endingId);
    return el('span', {
      class: 'hint',
      style: {
        border: `1px solid ${seen ? (bad ? '#7b2fbe' : '#c9a227') : '#2c2c3a'}`,
        borderRadius: '4px', padding: '4px 10px',
        color: seen ? (bad ? '#a86fd8' : '#e8c84a') : '#55555f',
        letterSpacing: '2px',
      },
      text: seen ? title : '? ? ?',
    });
  };
  const galleryRow = el('div', { class: 'row', style: { flexWrap: 'wrap', justifyContent: 'center' } },
    el('span', { class: 'hint', text: 'ENDINGS:' }),
    ...endingNodes.map(n => endingChip(n.endingId, n.title, n.bad)),
    endingChip('golden', 'THE GOLDEN NIGHT', false),
  );

  screenEl = el('div', { class: 'screen fade-in' },
    el('div', { class: 'top-bar' },
      button('◄ Menu', () => { saveNow(); ctxRef.app.switchMode('menu'); }, 'small'),
      el('h2', { text: `${u.meta.name} — ${u.meta.pizzeriaName} (${u.meta.era})` }),
      el('div', { class: 'spacer' }),
      button('Export', () => { saveNow(); ctxRef.saves.exportUniverse(u); }, 'small'),
      button('Import', async () => {
        const raw = await ctxRef.saves.importUniverseFile();
        if (!raw) { toast('Import cancelled or unreadable.', true); return; }
        const clean = sanitizeUniverse(raw);
        if (!clean) { toast('Not a valid universe file.', true); return; }
        ctxRef.universe = clean;
        saveNow();
        toast(`Imported "${clean.meta.name}"`);
        buildBackdrop();
        renderHub();
      }, 'small'),
    ),
    el('div', { class: 'hub-grid' },
      card('▶ Play Story', playable ? nightLabel : 'Fix the pizzeria layout first!', () => ctxRef.app.switchMode('story'), !playable),
      card('Pizzeria Builder', 'Paint rooms, place doors, cameras and props. Your floor plan IS the game map.', () => ctxRef.app.switchMode('builder')),
      card('Animatronic Workshop', 'Design your cast: bodies, colors, accessories — and how they hunt.', () => ctxRef.app.switchMode('workshop')),
      card('Characters', 'Customize yourself and your friend. Keep an eye on him.', () => ctxRef.app.switchMode('characters')),
      card('Story Editor', 'Author your own branching nights, choices and endings.', () => ctxRef.app.switchMode('storyeditor')),
      card('Free Roam', playable ? 'Walk your pizzeria in daylight. Meet the band.' : 'Fix the pizzeria layout first!', () => ctxRef.app.switchMode('freeroam'), !playable),
    ),
    galleryRow,
    storyDone
      ? button('☠ Night 6: All Servos Maxed', () => ctxRef.app.switchMode('night', { night: 6, custom: true }), 'danger')
      : null,
    playable ? null : el('div', { class: 'validation-banner bad', style: { position: 'static', transform: 'none' } },
      el('ul', {}, errors.slice(0, 3).map(e => el('li', { text: `• ${e}` })))),
    el('div', { class: 'disclaimer', text: 'Unofficial fan project — FNAF was created by Scott Cawthon.' }),
  );
  uiRoot().append(screenEl);
}

export const hubMode = {
  enter(ctx, params = {}) {
    ctxRef = ctx;
    if (params.newUniverse) {
      renderCreateForm();
      return;
    }
    if (typeof params.slot === 'number') {
      const raw = ctx.saves.loadSlot(params.slot);
      const clean = raw ? sanitizeUniverse(raw) : null;
      if (!clean) {
        toast('Save slot unreadable.', true);
        ctx.app.switchMode('menu');
        return;
      }
      ctx.universe = clean;
      ctx.slot = params.slot;
    }
    if (!ctx.universe) {
      ctx.app.switchMode('menu');
      return;
    }
    buildBackdrop();
    renderHub();
  },

  exit() {
    saveNow();
    screenEl = null;
    scene = null;
  },

  update() {},
  frame(dt, time) {
    if (!scene) {
      ctxRef.engine.renderer.clear(true, true, true);
      return;
    }
    const a = time * 0.08;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    camera.position.set(
      orbitCenter.x + Math.cos(a) * orbitRadius,
      orbitRadius * 0.85,
      orbitCenter.z + Math.sin(a) * orbitRadius,
    );
    camera.lookAt(orbitCenter.x, 0, orbitCenter.z);
    ctxRef.engine.renderer.render(scene, camera);
  },
};
