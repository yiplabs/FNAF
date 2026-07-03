// Headless smoke verification: starts vite, drives the game with Playwright,
// screenshots each checked state to verify-out/, fails on any console error.
//
// Usage: node scripts/verify.mjs [m1] [m2] ... (no args = run all available)

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE_URL = 'http://127.0.0.1:5173/';
const OUT = new URL('../verify-out/', import.meta.url).pathname;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

mkdirSync(OUT, { recursive: true });

const wanted = process.argv.slice(2);
const consoleErrors = [];
let failures = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✔ ${name}`);
  } else {
    failures++;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}${name}.png` });
}

async function nonBlack(page, name, maxBlackRatio = 0.97) {
  // sample the canvas: reject if almost every pixel is black
  const ratio = await page.evaluate(() => {
    const gl = document.getElementById('gl');
    const c = document.createElement('canvas');
    const w = (c.width = 64), h = (c.height = 36);
    const cx = c.getContext('2d');
    cx.drawImage(gl, 0, 0, w, h);
    const data = cx.getImageData(0, 0, w, h).data;
    let black = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 8 && data[i + 1] < 8 && data[i + 2] < 8) black++;
    }
    return black / (w * h);
  });
  ok(`${name}: canvas not black (black ratio ${(ratio * 100).toFixed(0)}%)`, ratio < maxBlackRatio);
}

async function waitVite() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('vite dev server never came up');
}

// ---------------- milestone checks ----------------

const checks = {
  async m1(page) {
    console.log('M1: scaffold + menu');
    ok('mode is menu', await page.evaluate(() => window.__game.mode()) === 'menu');
    ok('WebGL context alive', await page.evaluate(() => !window.__game.ctx.engine.contextLost));
    const body = await page.textContent('body');
    ok('disclaimer present', /Scott Cawthon/.test(body));
    ok('title present', /FAZ-SIM/.test(body));
    await page.waitForTimeout(700);
    await nonBlack(page, 'menu');
    await shot(page, 'm1-menu');
    // settings panel opens
    await page.click('text=SETTINGS');
    ok('settings panel', /QUALITY/i.test(await page.textContent('body')));
    await shot(page, 'm1-settings');
    await page.click('text=BACK');
  },

  async m2(page) {
    console.log('M2: data + saves + hub');
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.mode() === 'menu');
    await page.click('text=NEW UNIVERSE');
    await page.waitForFunction(() => window.__game.mode() === 'hub');
    ok('new universe form shown', /UNIVERSE NAME/i.test(await page.textContent('body')));
    await page.fill('input[data-id="uname"]', 'Test Universe');
    await page.fill('input[data-id="pname"]', "Testy's Pizza");
    await page.click('text=CREATE');
    await page.waitForTimeout(300);
    ok('universe created', await page.evaluate(() => window.__game.universe()?.meta.name) === 'Test Universe');
    ok('hub cards shown', /WORKSHOP/i.test(await page.textContent('body')));
    await shot(page, 'm2-hub');
    // persisted?
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__game?.mode() === 'menu');
    await page.click('text=CONTINUE');
    const body = await page.textContent('body');
    ok('slot shows saved universe', /Test Universe/.test(body));
    await page.click('text=LOAD');
    await page.waitForFunction(() => window.__game.mode() === 'hub');
    ok('reloaded universe', await page.evaluate(() => window.__game.universe()?.meta.name) === 'Test Universe');
    // export/import round trip (in-page, no file dialog)
    const roundTrip = await page.evaluate(() => {
      const u = window.__game.universe();
      const json = JSON.stringify(u);
      const copy = JSON.parse(json);
      const { sanitizeUniverse } = window.__game.ctx.debug;
      const clean = sanitizeUniverse(copy);
      return clean && clean.meta.name === u.meta.name && clean.animatronics.length === u.animatronics.length;
    });
    ok('export/import sanitize round-trip', roundTrip);
  },

  async m3(page) {
    console.log('M3: builder + graph + validation');
    await ensureUniverse(page);
    await page.evaluate(() => window.__game.app.switchMode('builder'));
    await page.waitForTimeout(800);
    ok('mode is builder', await page.evaluate(() => window.__game.mode()) === 'builder');
    const banner = await page.textContent('.validation-banner');
    ok('default layout is PLAYABLE', /PLAYABLE/.test(banner), banner.trim());
    await nonBlack(page, 'builder');
    await shot(page, 'm3-builder');
    // paint: break the map by erasing office cells -> banner goes red
    const bad = await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      d.builderSetTool('erase');
      const officeCells = d.builderFindCells('office');
      for (const [x, y] of officeCells) d.builderPaintCell(x, y);
      return document.querySelector('.validation-banner')?.className;
    });
    ok('erasing office invalidates map', /bad/.test(bad));
    await shot(page, 'm3-invalid');
    // paint office back somewhere connected + door
    const okAgain = await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      return d.builderRestoreDefault();
    });
    ok('restore default layout validates', okAgain === true);
  },

  async m4(page) {
    console.log('M4: rigs + free-roam + workshop + characters');
    await ensureUniverse(page);
    await page.evaluate(() => window.__game.app.switchMode('freeroam'));
    await page.waitForTimeout(600);
    ok('mode freeroam', await page.evaluate(() => window.__game.mode()) === 'freeroam');
    await page.evaluate(() => window.__game.ctx.debug.lookAtStage?.());
    await page.waitForTimeout(400);
    await nonBlack(page, 'freeroam');
    await shot(page, 'm4-freeroam-stage');
    // workshop
    await page.evaluate(() => window.__game.app.switchMode('workshop'));
    await page.waitForTimeout(500);
    await shot(page, 'm4-workshop');
    const changed = await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      d.workshopSelect(0);
      d.workshopSet('appearance.baseType', 'fox');
      d.workshopSet('appearance.accessories', ['hook', 'eyepatch']);
      return window.__game.universe().animatronics[0].appearance.baseType;
    });
    ok('workshop edit mutates universe', changed === 'fox');
    await page.waitForTimeout(400);
    await shot(page, 'm4-workshop-fox');
    // characters
    await page.evaluate(() => window.__game.app.switchMode('characters'));
    await page.waitForTimeout(500);
    ok('character mode up', await page.evaluate(() => window.__game.mode()) === 'characters');
    await shot(page, 'm4-characters');
  },

  async m5(page) {
    console.log('M5: night gameplay');
    await ensureUniverse(page);
    // deterministic night
    await page.evaluate(() => {
      window.__game.ctx.debug.setSeed(42);
      window.__game.app.switchMode('night', { night: 1, standalone: true });
    });
    await page.waitForTimeout(800);
    ok('mode night', await page.evaluate(() => window.__game.mode()) === 'night');
    const hud = await page.textContent('body');
    ok('clock shows 12 AM', /12\s*AM/i.test(hud));
    ok('power shown', /POWER/i.test(hud));
    await nonBlack(page, 'office');
    await shot(page, 'm5-office');
    // camera tablet
    await page.evaluate(() => window.__game.ctx.debug.toggleTablet(true));
    await page.waitForTimeout(500);
    ok('cam label visible', await page.locator('.cam-label').count() > 0);
    await shot(page, 'm5-tablet');
    await page.evaluate(() => window.__game.ctx.debug.toggleTablet(false));
    // closed door forces retreat
    const retreat = await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      d.pressDoor('left', true); // close
      d.forceMoveToOffice(0, 'left');
      d.stepSim(6); // let an attack window elapse against closed door
      const room = d.animRoom(0);
      d.pressDoor('left', false);
      return room;
    });
    ok('closed door => animatronic pushed back', retreat !== 'officeEntry', `room=${retreat}`);
    // open door => jumpscare
    await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      d.forceMoveToOffice(0, 'left');
      d.stepSim(10);
    });
    await page.waitForTimeout(400);
    const jumped = await page.evaluate(() => window.__game.ctx.debug.nightState());
    ok('open door => jumpscare', jumped === 'jumpscare' || jumped === 'lost', `state=${jumped}`);
    await shot(page, 'm5-jumpscare');
    // fresh night, skip to 6AM
    await page.evaluate(() => {
      window.__game.app.switchMode('night', { night: 1, standalone: true });
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__game.ctx.debug.skipToHour(6));
    await page.waitForTimeout(800);
    const won = await page.evaluate(() => window.__game.ctx.debug.nightState());
    ok('6AM => night won', won === 'won', `state=${won}`);
    await shot(page, 'm5-6am');
  },

  async m6(page) {
    console.log('M6: story runtime + editor + purpleness');
    await ensureUniverse(page);
    await page.evaluate(() => window.__game.app.switchMode('story'));
    await page.waitForTimeout(500);
    ok('story mode', await page.evaluate(() => window.__game.mode()) === 'story');
    ok('dialogue visible', await page.locator('.dialog-box').count() > 0);
    await shot(page, 'm6-dialogue');
    // walk the default story to the bad ending via debug
    const result = await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      d.storySetState({ purpleness: 0.85, flags: { complicit: true } });
      d.storyJump('finalChoice');
      return {
        purple: window.__game.universe().progress.purpleness,
        node: d.storyNode(),
      };
    });
    ok('story state settable', result.purple >= 0.8 && result.node === 'finalChoice');
    await page.waitForTimeout(400);
    await shot(page, 'm6-final-choice');
    const ending = await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      d.storyChoose(/FOLLOW|help/i);
      return new Promise(res => setTimeout(() => res({
        seen: window.__game.universe().progress.endingsSeen,
        node: d.storyNode(),
      }), 600));
    });
    ok('bad ending reached', ending.seen.includes('followme'), JSON.stringify(ending));
    await shot(page, 'm6-ending');
    // story editor opens and validates
    await page.evaluate(() => window.__game.app.switchMode('storyeditor'));
    await page.waitForTimeout(400);
    ok('story editor mode', await page.evaluate(() => window.__game.mode()) === 'storyeditor');
    const vtext = await page.evaluate(() => window.__game.ctx.debug.storyValidate().join('; '));
    ok('default story graph valid', vtext === '', vtext);
    await shot(page, 'm6-editor');
  },

  async m8(page) {
    console.log('M8: hub backdrop, endings gallery, builder preview');
    await ensureUniverse(page);
    await page.waitForTimeout(700);
    await nonBlack(page, 'hub-orbit');
    const body = await page.textContent('body');
    ok('endings gallery shown', /ENDINGS:/.test(body) && /\? \? \?/.test(body));
    await shot(page, 'm8-hub');
    await page.evaluate(() => window.__game.app.switchMode('builder'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__game.ctx.debug.builderPreview(true));
    await page.waitForTimeout(600);
    await nonBlack(page, 'builder-preview');
    await shot(page, 'm8-builder-preview');
    await page.evaluate(() => window.__game.ctx.debug.builderPreview(false));
    // dialogue blips don't crash without audio unlock
    await page.evaluate(() => window.__game.ctx.audio.sfx.dialogueBlip('phone'));
    ok('dialogueBlip safe', true);
  },

  async m7(page) {
    console.log('M7: audio + full loop');
    await ensureUniverse(page);
    await page.mouse.click(200, 200); // gesture to unlock audio
    await page.waitForTimeout(300);
    const audioState = await page.evaluate(() => window.__game.ctx.audio.context?.state);
    ok('AudioContext running after gesture', audioState === 'running', String(audioState));
    // full loop: story intro -> night 1 -> won -> back in story
    await page.evaluate(() => {
      const d = window.__game.ctx.debug;
      d.storyReset();
      window.__game.app.switchMode('story');
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__game.ctx.debug.storyFastForwardToNight());
    await page.waitForFunction(() => window.__game.mode() === 'night', null, { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__game.ctx.debug.skipToHour(6));
    await page.waitForFunction(() => window.__game.mode() === 'story', null, { timeout: 8000 });
    const night = await page.evaluate(() => window.__game.universe().progress.night);
    ok('night advanced after 6AM', night >= 2, `night=${night}`);
    await shot(page, 'm7-post-night-story');
    // gallery
    for (const [mode, name] of [['hub', 'hub'], ['builder', 'builder'], ['workshop', 'workshop'], ['characters', 'characters'], ['freeroam', 'freeroam'], ['storyeditor', 'storyeditor']]) {
      await page.evaluate((m) => window.__game.app.switchMode(m), mode);
      await page.waitForTimeout(600);
      await shot(page, `m7-gallery-${name}`);
    }
  },
};

async function ensureUniverse(page) {
  // fresh default universe in slot 0, hub loaded
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.mode() === 'menu');
  await page.evaluate(() => window.__game.ctx.debug.newDefaultUniverse?.('Verify U', "Freddy's on 5th"));
  await page.waitForFunction(() => window.__game.mode() === 'hub');
}

// ---------------- runner ----------------

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
  env: { ...process.env },
});

try {
  await waitVite();
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--js-flags=--random-seed=1234',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });

  const toRun = wanted.length ? wanted : Object.keys(checks);
  for (const name of toRun) {
    if (!checks[name]) { console.error(`unknown check ${name}`); failures++; continue; }
    try {
      await checks[name](page);
    } catch (err) {
      failures++;
      console.error(`  ✘ ${name} threw: ${err.message}`);
      await shot(page, `${name}-error`).catch(() => {});
    }
  }

  const realErrors = consoleErrors.filter(e => !/favicon|Autoplay|WebGL.*deprecat|GroupMarkerNotSet|swiftshader|GPU stall/i.test(e));
  if (realErrors.length) {
    failures++;
    console.error('Console errors:');
    for (const e of realErrors.slice(0, 12)) console.error('   ', e);
  } else {
    console.log('  ✔ zero console errors');
  }

  await browser.close();
} finally {
  vite.kill('SIGTERM');
}

console.log(failures ? `\nFAILED (${failures})` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
