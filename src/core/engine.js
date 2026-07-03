import * as THREE from 'three';

// One renderer + one fixed-timestep loop for the whole app.
// Modes own their scene/camera and register update/render via app.js.

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5; // avoid spiral-of-death on slow (SwiftShader) frames

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: true, // lets tests/screenshots sample the canvas
  });
  renderer.setClearColor(0x060608);
  renderer.shadowMap.enabled = false;

  const engine = {
    renderer,
    quality: 'low',
    onFixedUpdate: null, // (dt) => void, called at 60Hz sim rate
    onFrame: null,       // (dt, time) => void, called once per rAF (render here)
    elapsed: 0,
    _accumulator: 0,
    _last: performance.now(),
    _running: false,
    contextLost: false,

    setQuality(q) {
      engine.quality = q;
      const base = Math.min(window.devicePixelRatio || 1, 2);
      const ratio = q === 'high' ? base : q === 'medium' ? Math.min(base, 1) : 0.75;
      renderer.setPixelRatio(ratio);
      engine.resize();
    },

    resize() {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    },

    start() {
      if (engine._running) return;
      engine._running = true;
      engine._last = performance.now();
      requestAnimationFrame(tick);
    },

    // Advance the simulation clock manually (used by debug hooks/tests).
    stepSim(seconds) {
      const steps = Math.round(seconds / FIXED_DT);
      for (let i = 0; i < steps; i++) {
        engine.elapsed += FIXED_DT;
        engine.onFixedUpdate?.(FIXED_DT);
      }
    },
  };

  function tick(now) {
    if (!engine._running) return;
    const frameDt = Math.min((now - engine._last) / 1000, 0.25);
    engine._last = now;

    engine._accumulator += frameDt;
    let steps = 0;
    while (engine._accumulator >= FIXED_DT && steps < MAX_STEPS) {
      engine.elapsed += FIXED_DT;
      engine.onFixedUpdate?.(FIXED_DT);
      engine._accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) engine._accumulator = 0;

    engine.onFrame?.(frameDt, engine.elapsed);
    requestAnimationFrame(tick);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    engine.contextLost = true;
    console.error('WebGL context lost');
  });

  window.addEventListener('resize', () => engine.resize());
  engine.setQuality(navigator.webdriver ? 'low' : 'medium');
  return engine;
}

export { FIXED_DT };
