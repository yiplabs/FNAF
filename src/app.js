import { clearUI } from './ui/dom.js';

// Mode state machine. Every mode module exports:
//   { enter(ctx, params), exit(), update(dt), frame(dt, time) }
// update() runs on the fixed 60Hz sim step; frame() runs per rAF and renders.

export function createApp(ctx) {
  const modes = new Map();
  let current = null;
  let currentName = 'none';

  const app = {
    ctx,

    registerMode(name, mod) {
      modes.set(name, mod);
    },

    get modeName() { return currentName; },

    switchMode(name, params = {}) {
      const next = modes.get(name);
      if (!next) {
        console.error(`Unknown mode: ${name}`);
        return;
      }
      try {
        current?.exit?.();
      } catch (err) {
        console.error('Mode exit failed', err);
      }
      clearUI();
      ctx.input.disableLook();
      currentName = name;
      current = next;
      current.enter(ctx, params);
    },
  };

  ctx.engine.onFixedUpdate = (dt) => current?.update?.(dt);
  ctx.engine.onFrame = (dt, time) => current?.frame?.(dt, time);

  ctx.app = app;
  return app;
}
