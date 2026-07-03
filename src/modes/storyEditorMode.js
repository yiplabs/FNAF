import {
  el, button, panel, field, textInput, select, choiceGroup, uiRoot, toast,
} from '../ui/dom.js';
import { SPEAKERS, BACKGROUNDS, makeStoryNode, makeChoice } from '../data/schemas.js';
import { validateStory } from '../data/validators.js';

// Author your own branching nights: a node-list editor over the story graph.
// Conditions: night>=N · purpleness>=X · flag:name · !flag:name
// Effects:    purpleness+=X · purpleness=X · flag:name=true|false

let ctxRef, story;
let selected = null;
let listEl, sideEl, validEl, screenEl;

function nodeIds() { return Object.keys(story.nodes); }

function refreshValidation() {
  const errors = validateStory(story);
  validEl.className = `validation-banner ${errors.length ? 'bad' : 'ok'}`;
  validEl.replaceChildren(
    errors.length
      ? el('ul', {}, errors.slice(0, 3).map(e => el('li', { text: `• ${e}` })))
      : el('span', { text: '✔ STORY VALID — every path leads somewhere' }),
  );
}

function renderList() {
  const typeIcon = { dialogue: '💬', choice: '⑂', night: '🌙', ending: '★' };
  listEl.replaceChildren(...[
    el('div', { class: 'group-label', text: `Start node: ${story.startNodeId}` }),
    ...nodeIds().map(id => {
      const n = story.nodes[id];
      return el('div', {
        class: `list-item${id === selected ? ' active' : ''}`,
        onclick: () => { selected = id; refresh(); },
      },
        el('span', { text: typeIcon[n.type] || '?' }),
        el('span', { class: 'grow', text: id }),
        el('span', { class: 'hint', text: n.type }),
      );
    }),
    el('div', { class: 'group-label', text: 'Add node' }),
    el('div', { class: 'choice-grid' },
      ...['dialogue', 'choice', 'night', 'ending'].map(type =>
        button(`+ ${type}`, () => {
          let i = 1;
          while (story.nodes[`${type}${i}`]) i++;
          const id = `${type}${i}`;
          story.nodes[id] = makeStoryNode(type);
          selected = id;
          refresh();
        }, 'small')),
    ),
  ]);
}

function nextSelect(value, onchange) {
  return select([{ value: '', label: '(none)' }, ...nodeIds().map(id => ({ value: id, label: id }))], value ?? '', onchange);
}

function linesArea(n) {
  const ta = el('textarea', { rows: 4, placeholder: 'One line per row. Use {friend} {player} {pizzeria} {era}.' });
  ta.value = (n.lines || []).join('\n');
  ta.addEventListener('input', () => {
    n.lines = ta.value.split('\n').filter(l => l.trim().length).slice(0, 12);
  });
  return ta;
}

function choiceEditor(n) {
  const wrap = el('div', { class: 'col' });
  const rebuild = () => {
    wrap.replaceChildren(
      ...(n.choices || []).map((c, i) => panel(
        el('div', { class: 'col' },
          field(`Choice ${i + 1} text`, textInput(c.text, v => { c.text = v; })),
          field('Leads to', nextSelect(c.next, v => { c.next = v; refreshValidation(); })),
          field('Conditions (comma-sep)', textInput((c.conditions || []).join(', '), v => {
            c.conditions = v.split(',').map(s => s.trim()).filter(Boolean);
          })),
          field('Effects (comma-sep)', textInput((c.effects || []).join(', '), v => {
            c.effects = v.split(',').map(s => s.trim()).filter(Boolean);
          })),
          button('Remove choice', () => { n.choices.splice(i, 1); rebuild(); refreshValidation(); }, 'small danger'),
        ),
      )),
      button('+ Add choice', () => {
        n.choices = n.choices || [];
        if (n.choices.length >= 6) { toast('Max 6 choices.', true); return; }
        n.choices.push(makeChoice());
        rebuild();
        refreshValidation();
      }, 'small primary'),
    );
  };
  rebuild();
  return wrap;
}

function renderSide() {
  const n = story.nodes[selected];
  if (!n) { sideEl.replaceChildren(el('div', { class: 'panel hint', text: 'Select or add a node on the left.' })); return; }

  const common = [
    el('h3', { text: `${selected} — ${n.type}` }),
    el('div', { class: 'row' },
      button('Set as start', () => { story.startNodeId = selected; refresh(); }, 'small'),
      button('Delete node', () => {
        delete story.nodes[selected];
        selected = nodeIds()[0] ?? null;
        refresh();
      }, 'small danger'),
    ),
  ];

  let body;
  if (n.type === 'dialogue') {
    body = el('div', { class: 'col' },
      field('Speaker', choiceGroup(SPEAKERS, n.speaker, v => { n.speaker = v; }).node),
      field('Backdrop', choiceGroup(BACKGROUNDS, n.background, v => { n.background = v; }).node),
      field('Lines', linesArea(n)),
      field('Next node', nextSelect(n.next, v => { n.next = v; refreshValidation(); })),
    );
  } else if (n.type === 'choice') {
    body = el('div', { class: 'col' },
      field('Backdrop', choiceGroup(BACKGROUNDS, n.background, v => { n.background = v; }).node),
      field('Prompt lines', linesArea(n)),
      choiceEditor(n),
    );
  } else if (n.type === 'night') {
    body = el('div', { class: 'col' },
      field('Night number', select(['1', '2', '3', '4', '5', '6', '7'], String(n.night), v => { n.night = +v; })),
      field('After 6AM go to', nextSelect(n.next, v => { n.next = v; refreshValidation(); })),
      el('div', { class: 'hint', text: 'Playing this node runs a full survival night in your pizzeria.' }),
    );
  } else {
    body = el('div', { class: 'col' },
      field('Ending id', textInput(n.endingId, v => { n.endingId = v.trim() || selected; })),
      field('Title (big letters)', textInput(n.title, v => { n.title = v; })),
      field('Mood', choiceGroup([
        { value: 'good', label: 'good / neutral' }, { value: 'bad', label: 'bad (purple)' },
      ], n.bad ? 'bad' : 'good', v => { n.bad = v === 'bad'; }).node),
      field('Epilogue lines', linesArea(n)),
    );
  }

  sideEl.replaceChildren(panel(...common, body));
}

function refresh() {
  renderList();
  renderSide();
  refreshValidation();
}

export const storyEditorMode = {
  enter(ctx) {
    ctxRef = ctx;
    story = ctx.universe.story;
    if (!selected || !story.nodes[selected]) selected = story.startNodeId;

    listEl = el('div', { class: 'list-panel panel' });
    sideEl = el('div', { class: 'side-panel', style: { width: '360px' } });
    validEl = el('div', { class: 'validation-banner ok' });
    screenEl = el('div', {},
      el('div', { class: 'top-bar' },
        button('◄ Hub (Esc)', () => ctx.app.switchMode('hub'), 'small'),
        el('h2', { text: 'STORY EDITOR' }),
        el('div', { class: 'spacer' }),
        button('Reset progress & play from start', () => {
          ctx.universe.progress.nodeId = null;
          ctx.universe.progress.night = 1;
          ctx.universe.progress.flags = {};
          ctx.universe.progress.purpleness = 0;
          ctx.app.switchMode('story');
        }, 'small primary'),
      ),
      validEl, listEl, sideEl,
    );
    uiRoot().append(screenEl);
    refresh();

    this._onKey = (e) => { if (e.code === 'Escape' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) ctx.app.switchMode('hub'); };
    window.addEventListener('keydown', this._onKey);

    ctx.debug.storyValidate = () => validateStory(story);
    ctx.debug.storyEditorSelect = (id) => { selected = id; refresh(); };
  },

  exit() {
    window.removeEventListener('keydown', this._onKey);
    if (ctxRef.slot >= 0) ctxRef.saves.saveSlot(ctxRef.slot, ctxRef.universe);
  },

  update() {},
  frame() {
    ctxRef.engine.renderer.clear(true, true, true);
  },
};
