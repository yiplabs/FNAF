// Keyboard + mouse-look abstraction.
// Pointer lock when available; falls back to drag-to-look (also the headless path).

export function createInput(canvas, settings) {
  const keys = new Set();
  const input = {
    yaw: 0,
    pitch: 0,
    pointerLocked: false,
    lookEnabled: false,
    minPitch: -1.35,
    maxPitch: 1.35,

    isDown(code) { return keys.has(code); },

    axis() {
      // WASD/arrows -> {x: strafe, z: forward}
      let x = 0, z = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return { x, z };
    },

    enableLook({ requestLock = true } = {}) {
      input.lookEnabled = true;
      if (requestLock) tryLock();
    },

    disableLook() {
      input.lookEnabled = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },

    setLook(yaw, pitch) {
      input.yaw = yaw;
      input.pitch = Math.max(input.minPitch, Math.min(input.maxPitch, pitch));
    },
  };

  function tryLock() {
    try {
      const p = canvas.requestPointerLock?.();
      // Some browsers return a promise that rejects (headless): swallow it,
      // drag-to-look below still works.
      if (p && p.catch) p.catch(() => {});
    } catch { /* drag fallback */ }
  }

  function applyLookDelta(dx, dy) {
    const sens = 0.0022 * (settings?.get().sensitivity ?? 1);
    input.yaw -= dx * sens;
    input.pitch -= dy * sens;
    input.pitch = Math.max(input.minPitch, Math.min(input.maxPitch, input.pitch));
  }

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    keys.add(e.code);
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (e) => {
    if (!input.lookEnabled) return;
    if (input.pointerLocked) {
      applyLookDelta(e.movementX, e.movementY);
    } else if (dragging) {
      applyLookDelta(e.clientX - dragLast.x, e.clientY - dragLast.y);
      dragLast = { x: e.clientX, y: e.clientY };
    }
  });

  let dragging = false;
  let dragLast = { x: 0, y: 0 };
  canvas.addEventListener('mousedown', (e) => {
    if (!input.lookEnabled) return;
    if (!input.pointerLocked) {
      dragging = true;
      dragLast = { x: e.clientX, y: e.clientY };
      tryLock();
    }
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  return input;
}
