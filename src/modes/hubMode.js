import { el, button, panel, field, textInput, uiRoot, toast } from '../ui/dom.js';
import { makeDefaultUniverse } from '../data/defaultUniverse.js';
import { validateLayout, sanitizeUniverse } from '../data/validators.js';

// Per-universe hub: the crossroads between all creation tools and play modes.

let ctxRef;
let screenEl = null;

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
    storyDone
      ? el('div', { class: 'row' },
          button('☠ Night 6: Custom Night', () => ctxRef.app.switchMode('night', { night: 6, standalone: true }), 'danger'),
          el('span', { class: 'hint', text: `Endings seen: ${u.progress.endingsSeen.join(', ')}` }),
        )
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
    renderHub();
  },

  exit() {
    saveNow();
    screenEl = null;
  },

  update() {},
  frame() {
    // static dark backdrop; clear so leftovers from other modes don't linger
    ctxRef.engine.renderer.clear(true, true, true);
  },
};
