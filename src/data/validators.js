import {
  SAVE_VERSION, ROOM_TYPES, BASE_TYPES, ACCESSORIES, ROUTE_PREFS, ABILITIES,
  HAIR_STYLES, CHARACTER_ACCESSORIES, SPEAKERS, BACKGROUNDS,
  makeUniverse, makeAnimatronic, makeCharacter, makeLayout, makeStory, makeProgress,
  encodeCells, decodeCells,
} from './schemas.js';
import { deriveGraph, reachableRooms } from '../world/graph.js';

// ---------- layout validation (drives the builder banner + Play gating) ----------

export function validateLayout(layout, animatronics = []) {
  const errors = [];
  let graph;
  try {
    graph = deriveGraph(layout);
  } catch (err) {
    return { ok: false, errors: [`Layout unreadable: ${err.message}`], graph: null };
  }

  const { rooms, officeRooms, office, officeEntries } = graph;

  if (rooms.length < 4) errors.push(`Need at least 4 rooms — have ${rooms.length}.`);

  if (officeRooms.length !== 1) {
    errors.push(`Need exactly one Office room — have ${officeRooms.length}.`);
  } else {
    const defendable = graph.edges.filter(e =>
      (e.a === office.id || e.b === office.id) && (e.kind === 'door' || e.kind === 'vent'));
    const openings = graph.edges.filter(e =>
      (e.a === office.id || e.b === office.id) && e.kind === 'doorway');
    if (defendable.length !== 2) {
      errors.push(`Office needs exactly 2 defendable entries (door or vent) — has ${defendable.length}.`);
    }
    if (openings.length > 0) {
      errors.push('Office has an open doorway — animatronics would walk right in. Use door or vent.');
    }
  }

  const stages = rooms.filter(r => r.type === 'stage');
  if (stages.length < 1) errors.push('Need at least one Show Stage room.');

  // connectivity: every room reachable from the office over any edge kind
  if (office) {
    const unreachable = rooms.filter(r => graph.distToOffice[r.id] === Infinity);
    if (unreachable.length) {
      errors.push(`${unreachable.length} room(s) not connected to the rest (add doors): ${unreachable.slice(0, 4).map(r => r.type).join(', ')}${unreachable.length > 4 ? '…' : ''}`);
    }
  }

  // every animatronic must be able to reach the office from the stage
  if (office && stages.length && errors.length === 0) {
    for (const anim of animatronics) {
      const reach = reachableRooms(graph, stages[0].id, anim);
      if (!reach.has(office.id)) {
        errors.push(`${anim.name} can never reach the Office${anim.ai.abilities.includes('ventCrawler') ? '' : ' (vents need the Vent Crawler ability)'} — fix routes or abilities.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, graph };
}

// ---------- story graph validation (story editor + import) ----------

export function validateStory(story) {
  const errors = [];
  const nodes = story?.nodes || {};
  const ids = Object.keys(nodes);
  if (!ids.length) return ['Story has no nodes.'];
  if (!nodes[story.startNodeId]) errors.push(`Start node "${story.startNodeId}" does not exist.`);

  const targets = (node) => {
    if (node.type === 'dialogue' || node.type === 'night') return node.next ? [node.next] : [];
    if (node.type === 'choice') return (node.choices || []).map(c => c.next).filter(Boolean);
    return [];
  };

  for (const [id, node] of Object.entries(nodes)) {
    if (node.type !== 'ending' && targets(node).length === 0) {
      errors.push(`Node "${id}" leads nowhere — add a next node or make it an ending.`);
    }
    for (const t of targets(node)) {
      if (!nodes[t]) errors.push(`Node "${id}" links to missing node "${t}".`);
    }
    if (node.type === 'choice' && !(node.choices || []).length) {
      errors.push(`Choice node "${id}" has no choices.`);
    }
  }

  // reachability from start
  const seen = new Set();
  const queue = [story.startNodeId];
  while (queue.length) {
    const id = queue.shift();
    if (!nodes[id] || seen.has(id)) continue;
    seen.add(id);
    queue.push(...targets(nodes[id]));
  }
  const unreachable = ids.filter(id => !seen.has(id));
  if (unreachable.length) errors.push(`Unreachable node(s): ${unreachable.slice(0, 6).join(', ')}${unreachable.length > 6 ? '…' : ''}`);
  if (![...seen].some(id => nodes[id]?.type === 'ending')) errors.push('No ending is reachable from the start node.');

  return errors;
}

// ---------- condition / effect DSL (regex-parsed, no eval) ----------

export function checkCondition(cond, progress) {
  let m;
  if ((m = /^night\s*>=\s*(\d+)$/.exec(cond))) return progress.night >= +m[1];
  if ((m = /^night\s*<=\s*(\d+)$/.exec(cond))) return progress.night <= +m[1];
  if ((m = /^purpleness\s*>=\s*([\d.]+)$/.exec(cond))) return progress.purpleness >= +m[1];
  if ((m = /^purpleness\s*<=\s*([\d.]+)$/.exec(cond))) return progress.purpleness <= +m[1];
  if ((m = /^!flag:(\w+)$/.exec(cond))) return !progress.flags[m[1]];
  if ((m = /^flag:(\w+)$/.exec(cond))) return !!progress.flags[m[1]];
  console.warn(`Unknown condition "${cond}" — treating as false`);
  return false;
}

export function applyEffect(effect, progress) {
  let m;
  if ((m = /^purpleness\s*\+=\s*([\d.]+)$/.exec(effect))) {
    progress.purpleness = clamp01(progress.purpleness + +m[1]);
  } else if ((m = /^purpleness\s*=\s*([\d.]+)$/.exec(effect))) {
    progress.purpleness = clamp01(+m[1]);
  } else if ((m = /^flag:(\w+)\s*=\s*(true|false)$/.exec(effect))) {
    progress.flags[m[1]] = m[2] === 'true';
  } else if ((m = /^flag:(\w+)$/.exec(effect))) {
    progress.flags[m[1]] = true;
  } else if ((m = /^night\s*\+=\s*(\d+)$/.exec(effect))) {
    progress.night += +m[1];
  } else {
    console.warn(`Unknown effect "${effect}" — ignored`);
  }
}

// ---------- import sanitization: never trust user JSON ----------

const clamp01 = v => Math.max(0, Math.min(1, num(v, 0)));
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v, d = '') => (typeof v === 'string' ? v.slice(0, 4000) : d);
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);
const color = (v, d = '#888888') => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const oneOf = (v, list, d = list[0]) => (list.includes(v) ? v : d);
const arr = (v) => (Array.isArray(v) ? v : []);

export function sanitizeUniverse(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const u = makeUniverse();

  u.version = SAVE_VERSION;
  const meta = raw.meta || {};
  u.meta.name = str(meta.name, 'Imported Universe').slice(0, 60) || 'Imported Universe';
  u.meta.pizzeriaName = str(meta.pizzeriaName, "Freddy's").slice(0, 60) || "Freddy's";
  u.meta.era = str(meta.era, '1987').slice(0, 20);
  u.meta.backstory = str(meta.backstory);
  u.meta.createdAt = num(meta.createdAt, Date.now());
  u.meta.updatedAt = Date.now();

  // layout
  const L = raw.layout || {};
  const lay = makeLayout();
  lay.grid.w = Math.max(6, Math.min(40, Math.round(num(L.grid?.w, 20))));
  lay.grid.h = Math.max(6, Math.min(40, Math.round(num(L.grid?.h, 14))));
  lay.grid.cell = Math.max(1.5, Math.min(4, num(L.grid?.cell, 2.5)));
  const n = lay.grid.w * lay.grid.h;
  const cells = decodeCells(str(L.cells), n);
  for (let i = 0; i < n; i++) if (cells[i] >= ROOM_TYPES.length) cells[i] = 0;
  lay.cells = encodeCells(cells);
  const cellOk = (c) => Array.isArray(c) && c.length === 2 &&
    Number.isInteger(c[0]) && Number.isInteger(c[1]) &&
    c[0] >= 0 && c[0] < lay.grid.w && c[1] >= 0 && c[1] < lay.grid.h;
  lay.doors = arr(L.doors).filter(d => d && cellOk(d.a) && cellOk(d.b))
    .map(d => ({ a: [d.a[0], d.a[1]], b: [d.b[0], d.b[1]], kind: oneOf(d.kind, ['doorway', 'door', 'vent']) }))
    .slice(0, 200);
  lay.cameras = arr(L.cameras).filter(c => c && cellOk(c.cell))
    .map((c, i) => ({ id: str(c.id, `cam${i + 1}`).slice(0, 20) || `cam${i + 1}`, label: str(c.label, `CAM ${i + 1}`).slice(0, 24), cell: [c.cell[0], c.cell[1]], yaw: num(c.yaw) }))
    .slice(0, 32);
  lay.props = arr(L.props).filter(p => p && cellOk(p.cell))
    .map(p => ({ type: oneOf(p.type, ['table', 'arcade', 'poster', 'stagePlatform', 'shelf', 'fan']), cell: [p.cell[0], p.cell[1]], rot: Math.abs(Math.round(num(p.rot))) % 4 }))
    .slice(0, 300);
  u.layout = lay;

  // animatronics
  u.animatronics = arr(raw.animatronics).slice(0, 12).map((a, i) => {
    const clean = makeAnimatronic(str(a?.id, `a${i + 1}`).slice(0, 24) || `a${i + 1}`, str(a?.name, `Animatronic ${i + 1}`).slice(0, 32) || `Animatronic ${i + 1}`);
    const ap = a?.appearance || {};
    clean.appearance = {
      baseType: oneOf(ap.baseType, BASE_TYPES),
      primaryColor: color(ap.primaryColor, '#7a4a21'),
      secondaryColor: color(ap.secondaryColor, '#d2a679'),
      eyeColor: color(ap.eyeColor, '#f5f5ff'),
      eyeGlow: clamp01(ap.eyeGlow),
      accessories: arr(ap.accessories).filter(x => ACCESSORIES.includes(x)).slice(0, 6),
      withered: clamp01(ap.withered),
      scale: Math.max(0.6, Math.min(1.6, num(ap.scale, 1))),
    };
    const ai = a?.ai || {};
    const agg = arr(ai.aggression).map(v => Math.max(0, Math.min(20, Math.round(num(v)))));
    while (agg.length < 7) agg.push(agg.length ? agg[agg.length - 1] : 0);
    clean.ai = {
      aggression: agg.slice(0, 7),
      speed: Math.max(0.4, Math.min(3, num(ai.speed, 1))),
      routePreference: oneOf(ai.routePreference, ROUTE_PREFS, 'random'),
      abilities: arr(ai.abilities).filter(x => ABILITIES.includes(x)),
      stageUntilNight: Math.max(1, Math.min(7, Math.round(num(ai.stageUntilNight, 1)))),
    };
    return clean;
  });
  // unique ids
  const seen = new Set();
  for (const a of u.animatronics) {
    while (seen.has(a.id)) a.id += 'x';
    seen.add(a.id);
  }

  // characters
  for (const role of ['player', 'friend']) {
    const c = raw.characters?.[role] || {};
    const clean = makeCharacter(role);
    clean.name = str(c.name, clean.name).slice(0, 24) || clean.name;
    clean.skinTone = clamp01(c.skinTone ?? 0.5);
    clean.hairStyle = oneOf(c.hairStyle, HAIR_STYLES);
    clean.hairColor = color(c.hairColor, '#3b2a1a');
    clean.uniformColor = color(c.uniformColor, '#2b3a67');
    clean.hatOn = bool(c.hatOn, clean.hatOn);
    clean.hatColor = color(c.hatColor, '#222222');
    clean.accessory = oneOf(c.accessory, CHARACTER_ACCESSORIES, 'none');
    u.characters[role] = clean;
  }

  // story
  const s = raw.story || {};
  const story = makeStory();
  story.nodes = {};
  const rawNodes = (s.nodes && typeof s.nodes === 'object') ? s.nodes : {};
  for (const [id, node] of Object.entries(rawNodes).slice(0, 200)) {
    const nid = id.slice(0, 40);
    if (!node || typeof node !== 'object') continue;
    const type = oneOf(node.type, ['dialogue', 'choice', 'night', 'ending']);
    const lines = arr(node.lines).map(l => str(l).slice(0, 500)).slice(0, 12);
    if (type === 'dialogue') {
      story.nodes[nid] = { type, speaker: oneOf(node.speaker, SPEAKERS, 'narrator'), background: oneOf(node.background, BACKGROUNDS), lines, next: str(node.next).slice(0, 40) };
    } else if (type === 'choice') {
      story.nodes[nid] = {
        type, background: oneOf(node.background, BACKGROUNDS), lines,
        choices: arr(node.choices).slice(0, 6).map(ch => ({
          text: str(ch?.text, 'Continue').slice(0, 200) || 'Continue',
          next: str(ch?.next).slice(0, 40),
          conditions: arr(ch?.conditions).map(x => str(x).slice(0, 60)).slice(0, 6),
          effects: arr(ch?.effects).map(x => str(x).slice(0, 60)).slice(0, 6),
        })),
      };
    } else if (type === 'night') {
      story.nodes[nid] = { type, night: Math.max(1, Math.min(7, Math.round(num(node.night, 1)))), next: str(node.next).slice(0, 40) };
    } else {
      story.nodes[nid] = { type, endingId: str(node.endingId, nid).slice(0, 40) || nid, title: str(node.title, 'THE END').slice(0, 60) || 'THE END', bad: bool(node.bad), lines };
    }
  }
  story.startNodeId = str(s.startNodeId, 'intro').slice(0, 40);
  if (!story.nodes[story.startNodeId]) {
    const first = Object.keys(story.nodes)[0];
    if (first) story.startNodeId = first;
    else story.nodes = makeStory().nodes, story.startNodeId = 'intro';
  }
  u.story = story;

  // progress
  const p = raw.progress || {};
  const prog = makeProgress(Math.max(1, Math.round(num(p.seed, 1))));
  prog.night = Math.max(1, Math.min(7, Math.round(num(p.night, 1))));
  prog.nodeId = p.nodeId === null ? null : (str(p.nodeId).slice(0, 40) || null);
  if (prog.nodeId && !story.nodes[prog.nodeId]) prog.nodeId = null;
  prog.purpleness = clamp01(p.purpleness);
  prog.endingsSeen = arr(p.endingsSeen).map(e => str(e).slice(0, 40)).slice(0, 20);
  if (p.flags && typeof p.flags === 'object') {
    for (const [k, v] of Object.entries(p.flags).slice(0, 64)) {
      prog.flags[String(k).slice(0, 40)] = !!v;
    }
  }
  u.progress = prog;

  return u;
}
