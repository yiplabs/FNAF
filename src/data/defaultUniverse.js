import {
  makeUniverse, makeAnimatronic, ROOM_TYPES, encodeCells,
} from './schemas.js';

// The universe every new save starts from: a FNAF-1-homage pizzeria,
// four starter animatronics, and a 5-night branching Purple Guy story.

const T = Object.fromEntries(ROOM_TYPES.map((t, i) => [t, i]));

function buildStarterLayout() {
  const w = 20, h = 14;
  const cells = new Uint8Array(w * h);
  const fill = (type, x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) cells[y * w + x] = T[type];
    }
  };
  const put = (type, ...pts) => { for (const [x, y] of pts) cells[y * w + x] = T[type]; };

  fill('backstage', 2, 1, 4, 4);
  fill('stage', 6, 1, 12, 3);
  fill('arcade', 14, 1, 17, 3);
  fill('dining', 5, 4, 13, 7);
  fill('kitchen', 14, 4, 17, 6);
  fill('storage', 4, 8, 6, 10);
  fill('hall', 7, 8, 8, 12);       // west hall
  fill('office', 9, 11, 11, 12);
  // east vent duct: kitchen -> office
  put('vent', [15, 7], [15, 8], [15, 9], [15, 10], [14, 10], [13, 10], [12, 10], [12, 11]);

  return {
    grid: { w, h, cell: 2.5 },
    cells: encodeCells(cells),
    doors: [
      { a: [4, 4], b: [5, 4], kind: 'doorway' },     // backstage <-> dining
      { a: [9, 3], b: [9, 4], kind: 'doorway' },     // stage <-> dining
      { a: [14, 3], b: [14, 4], kind: 'doorway' },   // arcade <-> kitchen
      { a: [13, 5], b: [14, 5], kind: 'doorway' },   // dining <-> kitchen
      { a: [7, 7], b: [7, 8], kind: 'doorway' },     // dining <-> west hall
      { a: [6, 9], b: [7, 9], kind: 'doorway' },     // storage <-> west hall
      { a: [8, 11], b: [9, 11], kind: 'door' },      // west hall <-> office (LEFT DOOR)
      { a: [15, 6], b: [15, 7], kind: 'vent' },      // kitchen -> vent duct
      { a: [12, 11], b: [11, 11], kind: 'vent' },    // vent duct -> office (RIGHT VENT)
    ],
    cameras: [
      { id: 'cam1', label: '1A SHOW STAGE', cell: [9, 1], yaw: Math.PI },
      { id: 'cam2', label: '1B DINING', cell: [9, 6], yaw: 0 },
      { id: 'cam3', label: '2A BACKSTAGE', cell: [3, 1], yaw: Math.PI },
      { id: 'cam4', label: '2B WEST HALL', cell: [7, 8], yaw: Math.PI },
      { id: 'cam5', label: '3A STORAGE', cell: [5, 8], yaw: Math.PI },
      { id: 'cam6', label: '4A KITCHEN', cell: [16, 4], yaw: Math.PI },
      { id: 'cam7', label: '4B ARCADE', cell: [16, 1], yaw: Math.PI },
      { id: 'cam8', label: '5A VENT', cell: [14, 10], yaw: -Math.PI / 2 },
    ],
    props: [
      { type: 'stagePlatform', cell: [9, 2], rot: 0 },
      { type: 'table', cell: [6, 5], rot: 0 },
      { type: 'table', cell: [8, 5], rot: 0 },
      { type: 'table', cell: [10, 5], rot: 0 },
      { type: 'table', cell: [12, 5], rot: 0 },
      { type: 'table', cell: [7, 6], rot: 0 },
      { type: 'table', cell: [11, 6], rot: 0 },
      { type: 'arcade', cell: [15, 1], rot: 2 },
      { type: 'arcade', cell: [16, 1], rot: 2 },
      { type: 'arcade', cell: [17, 1], rot: 2 },
      { type: 'poster', cell: [6, 4], rot: 0 },
      { type: 'poster', cell: [11, 4], rot: 0 },
      { type: 'shelf', cell: [2, 1], rot: 1 },
      { type: 'shelf', cell: [4, 8], rot: 1 },
      { type: 'shelf', cell: [6, 10], rot: 3 },
      { type: 'fan', cell: [16, 6], rot: 0 },
    ],
  };
}

function buildStarterAnimatronics() {
  const bruno = makeAnimatronic('bruno', 'Bruno');
  bruno.appearance = {
    ...bruno.appearance,
    baseType: 'bear', primaryColor: '#6b4423', secondaryColor: '#d2a679',
    eyeColor: '#cfd8ff', eyeGlow: 0.55, accessories: ['hat', 'bowtie'],
  };
  bruno.ai = {
    aggression: [0, 3, 5, 8, 12, 16, 20], speed: 1,
    routePreference: 'direct', abilities: ['doorRusher'], stageUntilNight: 1,
  };

  const binky = makeAnimatronic('binky', 'Binky');
  binky.appearance = {
    ...binky.appearance,
    baseType: 'bunny', primaryColor: '#5a3d8a', secondaryColor: '#c7b3e6',
    eyeColor: '#ffd7d7', eyeGlow: 0.7, accessories: ['guitar'],
  };
  binky.ai = {
    aggression: [2, 4, 6, 9, 12, 15, 20], speed: 1.25,
    routePreference: 'left', abilities: [], stageUntilNight: 1,
  };

  const clara = makeAnimatronic('clara', 'Clara');
  clara.appearance = {
    ...clara.appearance,
    baseType: 'chicken', primaryColor: '#d9b23a', secondaryColor: '#f2e3b0',
    eyeColor: '#e8d5ff', eyeGlow: 0.65, accessories: ['cupcake'],
  };
  clara.ai = {
    aggression: [1, 3, 6, 9, 12, 15, 20], speed: 1,
    routePreference: 'vents', abilities: ['ventCrawler'], stageUntilNight: 1,
  };

  const vixen = makeAnimatronic('vixen', 'Vixen');
  vixen.appearance = {
    ...vixen.appearance,
    baseType: 'fox', primaryColor: '#8c2d2d', secondaryColor: '#e0c9a6',
    eyeColor: '#fff3b0', eyeGlow: 0.9, accessories: ['hook', 'eyepatch'],
    withered: 0.5,
  };
  vixen.ai = {
    aggression: [0, 0, 4, 8, 12, 16, 20], speed: 1.6,
    routePreference: 'direct', abilities: ['cameraJammer'], stageUntilNight: 2,
  };

  return [bruno, binky, clara, vixen];
}

function buildDefaultStory() {
  return {
    startNodeId: 'intro',
    nodes: {
      intro: {
        type: 'dialogue', speaker: 'narrator', background: 'parking',
        lines: [
          'Summer, {era}. The neon sign of {pizzeria} hums over an empty parking lot.',
          'You and your best friend {friend} just signed on for the night shift. Easy money, the ad said.',
        ],
        next: 'introFriend',
      },
      introFriend: {
        type: 'dialogue', speaker: 'friend', background: 'diner',
        lines: [
          '"Can you believe they gave us both jobs? You watch the cameras, I do maintenance."',
          '"Those animatronics though... the way their eyes follow you. I kind of love it."',
        ],
        next: 'c1',
      },
      c1: {
        type: 'choice', background: 'diner',
        lines: ['{friend} slides his safety paperwork across the table. He hasn\'t filled in a single box. "Cover for me? Just this once."'],
        choices: [
          { text: 'Sign it for him. What are friends for?', next: 'phoneN1', conditions: [], effects: ['purpleness+=0.1', 'flag:complicit=true'] },
          { text: 'Make him do it by the book.', next: 'phoneN1', conditions: [], effects: ['flag:bythebook=true'] },
        ],
      },
      phoneN1: {
        type: 'dialogue', speaker: 'phone', background: 'office',
        lines: [
          '"Uh, hello? Hello hello! Welcome to your first night at {pizzeria}."',
          '"Quick heads-up: the characters do tend to... wander at night. Keep an eye on the cameras. Mind the doors. And whatever you do — don\'t run out of power."',
        ],
        next: 'n1',
      },
      n1: { type: 'night', night: 1, next: 'after1' },
      after1: {
        type: 'dialogue', speaker: 'friend', background: 'stage',
        lines: [
          'Morning. You find {friend} backstage — he was here all night, elbow-deep in Vixen\'s chest cavity.',
          '"Don\'t look at me like that. I\'m just making her... better. Faster. You\'ll see."',
        ],
        next: 'c2',
      },
      c2: {
        type: 'choice', background: 'stage',
        lines: ['His sketches are pinned to the wall: animatronics with too many teeth. Children\'s birthday hats drawn in the margins.'],
        choices: [
          { text: 'Confront him about the sketches.', next: 'phoneN2', conditions: [], effects: ['flag:confronted=true'] },
          { text: 'Say nothing. He\'s always been eccentric.', next: 'phoneN2', conditions: [], effects: ['purpleness+=0.15'] },
        ],
      },
      phoneN2: {
        type: 'dialogue', speaker: 'phone', background: 'office',
        lines: ['"Night two! Fun fact: the animatronics get a little more active as the week goes on. Something about servo calibration. Probably nothing."'],
        next: 'n2',
      },
      n2: { type: 'night', night: 2, next: 'after2' },
      after2: {
        type: 'dialogue', speaker: 'narrator', background: 'diner',
        lines: [
          'Day three. A birthday party. Balloons, cake, screaming kids — the good kind of screaming, at first.',
          'Then Vixen\'s jaw snaps shut on the day-shift manager\'s arm. The music keeps playing. {friend} watches from the doorway, and he is smiling.',
        ],
        next: 'c3',
      },
      c3: {
        type: 'choice', background: 'diner',
        lines: ['Paramedics leave. The owner wants answers. You know {friend} was inside that fox two nights ago.'],
        choices: [
          { text: 'Report his tampering to the owner.', next: 'phoneN3', conditions: [], effects: ['flag:reported=true'] },
          { text: 'Help him hide the maintenance logs.', next: 'phoneN3', conditions: [], effects: ['purpleness+=0.25', 'flag:complicit=true'] },
        ],
      },
      phoneN3: {
        type: 'dialogue', speaker: 'phone', background: 'office',
        lines: ['"So, uh... about the incident. Corporate says it\'s handled. The fox is \'decommissioned\'. Between us? I\'d still keep the west door closed when you hear footsteps."'],
        next: 'n3',
      },
      n3: { type: 'night', night: 3, next: 'after3' },
      after3: {
        type: 'dialogue', speaker: 'friend', background: 'saferoom',
        lines: [
          'You find {friend} in a room that isn\'t on the cameras. A room you\'ve never seen. He looks wrong under the fluorescent light — pale skin gone faintly violet.',
          '"They\'re going to scrap her. Scrap ALL of them. Unless the cameras have a little accident tonight. You could do that for me. One night. No eyes."',
        ],
        next: 'c4',
      },
      c4: {
        type: 'choice', background: 'saferoom',
        lines: ['He\'s your best friend. He is also standing very, very still.'],
        choices: [
          { text: 'Refuse — and photograph this room.', next: 'phoneN4', conditions: [], effects: ['flag:refused=true', 'flag:evidence=true'] },
          { text: 'Do it. One night without cameras.', next: 'phoneN4', conditions: [], effects: ['purpleness+=0.25', 'flag:complicit=true', 'flag:blackout=true'] },
        ],
      },
      phoneN4: {
        type: 'dialogue', speaker: 'phone', background: 'office',
        lines: ['"Night four already! Say, maintenance logged a LOT of after-hours entries this week. You wouldn\'t know anything about that... would you?"'],
        next: 'n4',
      },
      n4: { type: 'night', night: 4, next: 'after4' },
      after4: {
        type: 'dialogue', speaker: 'friend', background: 'saferoom',
        lines: [
          'He doesn\'t come to the diner anymore. He stands in the safe room in the dark, and the skin of his face has gone the color of a bruise.',
          '"One more night," he says, to you or to the suits hanging on the wall. "One more night and everyone gets to stay forever."',
        ],
        next: 'phoneN5',
      },
      phoneN5: {
        type: 'dialogue', speaker: 'phone', background: 'office',
        lines: ['"Last night of the week. Whatever happens in there tonight... it\'s been nice working with you. I mean that."'],
        next: 'n5',
      },
      n5: { type: 'night', night: 5, next: 'finalChoice' },
      finalChoice: {
        type: 'choice', background: 'saferoom',
        lines: [
          '6 AM. You should go home. Instead you\'re in the safe room, and {friend} is waiting between the empty suits with his hand outstretched.',
          '"Stay. Help me finish it. Or walk away and pretend you never saw the purple. Your choice, old friend."',
        ],
        choices: [
          { text: 'Expose him. Hand everything to the police.', next: 'endTruth', conditions: ['flag:reported'], effects: [] },
          { text: 'Show him the photographs. Make him stop.', next: 'endTruth', conditions: ['!flag:reported', 'flag:evidence'], effects: [] },
          { text: 'Take his hand. Follow him into the suit room.', next: 'endFollow', conditions: ['purpleness>=0.5'], effects: ['purpleness+=0.2'] },
          { text: 'Walk away. Quit. Never come back.', next: 'endWalk', conditions: [], effects: [] },
        ],
      },
      endTruth: {
        type: 'ending', endingId: 'truth', title: 'THE TRUTH', bad: false,
        lines: [
          'Police lights wash the parking lot red and blue. They find the safe room, the logs, the sketches.',
          '{friend} is led away without a struggle. At the door he turns and smiles at you with too many teeth.',
          'The pizzeria survives. The animatronics play their songs at dawn — and for the first time all week, nothing watches you back.',
        ],
      },
      endFollow: {
        type: 'ending', endingId: 'followme', title: 'FOLLOW ME', bad: true,
        lines: [
          'His hand is cold. The safe room door closes behind you.',
          '"I always come back," he says, and his skin in the dark is perfectly, completely purple.',
          'The morning crew finds the office empty. On stage there is a new animatronic nobody remembers ordering. It smells faintly of copper. It knows your name.',
        ],
      },
      endWalk: {
        type: 'ending', endingId: 'walkaway', title: 'WALK AWAY', bad: false,
        lines: [
          'You leave your badge on the desk and drive until sunrise.',
          'Three weeks later the newspaper runs it: LOCAL PIZZERIA CLOSES AFTER EMPLOYEE DISAPPEARANCE.',
          'They never found your friend. Some nights, stopped at a red light, you could swear the man on the corner is wearing purple.',
        ],
      },
    },
  };
}

export function makeDefaultUniverse(opts = {}) {
  const u = makeUniverse(opts);
  u.layout = buildStarterLayout();
  u.animatronics = buildStarterAnimatronics();
  u.story = buildDefaultStory();
  return u;
}
