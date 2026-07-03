// Data model factories — every persisted object is produced here so shapes
// stay consistent. Version bumps go through migrate() in validators.js.

export const SAVE_VERSION = 1;

export const ROOM_TYPES = [
  'void', 'office', 'stage', 'dining', 'hall', 'vent',
  'kitchen', 'arcade', 'backstage', 'storage',
];

export const ROOM_COLORS = {
  void: '#000000',
  office: '#3a6ea5',
  stage: '#a5762a',
  dining: '#7a4a4a',
  hall: '#4a4a55',
  vent: '#3d5c48',
  kitchen: '#707a3a',
  arcade: '#6a3a7a',
  backstage: '#5c4a36',
  storage: '#4f4f42',
};

export const BASE_TYPES = ['bear', 'bunny', 'chicken', 'fox', 'custom'];
export const ACCESSORIES = ['hat', 'bowtie', 'hook', 'guitar', 'cupcake', 'eyepatch'];
export const ROUTE_PREFS = ['left', 'right', 'vents', 'random', 'direct'];
export const ABILITIES = ['ventCrawler', 'cameraJammer', 'doorRusher'];
export const HAIR_STYLES = ['short', 'long', 'ponytail', 'bald'];
export const CHARACTER_ACCESSORIES = ['badge', 'flashlight', 'none'];
export const SPEAKERS = ['player', 'friend', 'phone', 'narrator'];
export const BACKGROUNDS = ['office', 'diner', 'stage', 'parking', 'saferoom'];

export const PURPLE = '#7b2fbe';

export function makeGrid(w = 20, h = 14, cell = 2.5) {
  return { w, h, cell };
}

export function encodeCells(arr) {
  // Uint8Array -> base64
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function decodeCells(str, len) {
  const out = new Uint8Array(len);
  try {
    const bin = atob(str);
    for (let i = 0; i < Math.min(bin.length, len); i++) out[i] = bin.charCodeAt(i);
  } catch { /* leave zeroed */ }
  return out;
}

export function makeLayout() {
  const grid = makeGrid();
  return {
    grid,
    cells: encodeCells(new Uint8Array(grid.w * grid.h)),
    doors: [],    // {a:[x,y], b:[x,y], kind:'doorway'|'door'|'vent'}
    cameras: [],  // {id, label, cell:[x,y], yaw}
    props: [],    // {type, cell:[x,y], rot}
  };
}

export function makeAnimatronic(id, name = 'Unnamed') {
  return {
    id,
    name,
    appearance: {
      baseType: 'bear',
      primaryColor: '#7a4a21',
      secondaryColor: '#d2a679',
      eyeColor: '#f5f5ff',
      eyeGlow: 0.6,
      accessories: [],
      withered: 0,
      scale: 1,
    },
    ai: {
      aggression: [0, 2, 4, 7, 10, 13, 20], // index = night-1
      speed: 1,
      routePreference: 'random',
      abilities: [],
      stageUntilNight: 1,
    },
  };
}

export function makeCharacter(role) {
  return {
    name: role === 'player' ? 'Mike' : 'Vince',
    role,
    skinTone: 0.5,          // 0 dark .. 1 light
    hairStyle: 'short',
    hairColor: '#3b2a1a',
    uniformColor: role === 'player' ? '#2b3a67' : '#4a3b67',
    hatOn: role === 'player',
    hatColor: '#222222',
    accessory: role === 'player' ? 'badge' : 'none',
  };
}

export function makeStoryNode(type = 'dialogue') {
  const base = { type, lines: [], background: 'office' };
  switch (type) {
    case 'dialogue': return { ...base, speaker: 'narrator', next: '' };
    case 'choice': return { ...base, choices: [] };
    case 'night': return { type: 'night', night: 1, next: '' };
    case 'ending': return { type: 'ending', endingId: 'ending', title: 'THE END', bad: false, lines: [] };
    default: return base;
  }
}

export function makeChoice() {
  return { text: 'Continue', next: '', conditions: [], effects: [] };
}

export function makeStory() {
  return {
    startNodeId: 'intro',
    nodes: {
      intro: { type: 'dialogue', speaker: 'narrator', lines: ['It begins.'], background: 'diner', next: 'n1' },
      n1: { type: 'night', night: 1, next: 'end' },
      end: { type: 'ending', endingId: 'end', title: 'THE END', bad: false, lines: ['You survived.'] },
    },
  };
}

export function makeProgress(seed = 1) {
  return {
    night: 1,
    nodeId: null,     // null = story not started; storyMode falls back to startNodeId
    flags: {},
    purpleness: 0,
    endingsSeen: [],
    seed,
  };
}

export function makeUniverse({ name = 'My Universe', pizzeriaName = "Freddy's on 5th", era = '1987', backstory = '' } = {}) {
  return {
    version: SAVE_VERSION,
    meta: {
      name,
      pizzeriaName,
      era,
      backstory,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    layout: makeLayout(),
    animatronics: [],
    characters: { player: makeCharacter('player'), friend: makeCharacter('friend') },
    story: makeStory(),
    progress: makeProgress(Math.floor(Math.random() * 1e9) + 1),
  };
}
