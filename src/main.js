import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createAudio } from './core/audio.js';
import { createSaves } from './core/saves.js';
import { createRng } from './core/rng.js';
import { createApp } from './app.js';
import { menuMode } from './modes/menuMode.js';
import { hubMode } from './modes/hubMode.js';
import { builderMode } from './modes/builderMode.js';
import { makeDefaultUniverse } from './data/defaultUniverse.js';
import { sanitizeUniverse } from './data/validators.js';

const canvas = document.getElementById('gl');
const saves = createSaves();
const engine = createEngine(canvas);
const audio = createAudio(saves);
const input = createInput(canvas, saves);
const rng = createRng(1);

engine.setQuality(saves.get().quality);
saves.onSettingsChanged = () => audio.applyVolumes();

const ctx = {
  engine, input, audio, saves, rng,
  universe: null,   // active universe (set by hub/menu)
  slot: -1,         // active save slot
  debug: {},        // populated by modes for test hooks
};

const app = createApp(ctx);
app.registerMode('menu', menuMode);
app.registerMode('hub', hubMode);
app.registerMode('builder', builderMode);

// ---- debug/test helpers (harmless in normal play) ----
ctx.debug.sanitizeUniverse = sanitizeUniverse;
ctx.debug.newDefaultUniverse = (name = 'Debug U', pizzeriaName = "Freddy's") => {
  ctx.universe = makeDefaultUniverse({ name, pizzeriaName });
  ctx.slot = 0;
  saves.saveSlot(0, ctx.universe);
  app.switchMode('hub');
};

app.switchMode('menu');
engine.start();

// ---- test hook (also handy in devtools) ----
window.__game = {
  mode: () => app.modeName,
  universe: () => ctx.universe,
  ctx,
  app,
  debug: ctx.debug,
};
