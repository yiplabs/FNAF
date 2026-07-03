import { createEngine } from './core/engine.js';
import { createInput } from './core/input.js';
import { createAudio } from './core/audio.js';
import { createSaves } from './core/saves.js';
import { createRng } from './core/rng.js';
import { createApp } from './app.js';
import { menuMode } from './modes/menuMode.js';

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
