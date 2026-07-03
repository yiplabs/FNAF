import { el } from './dom.js';

// Virtual thumbstick for touch devices. Returns a normalized axis in
// screen convention: x right, z down (matches keyboard axis(): z=-1 forward).

const RANGE = 44;

export function createJoystick() {
  const thumb = el('div', { class: 'vjoy-thumb' });
  const node = el('div', { class: 'vjoy' }, thumb);
  let activeId = null;
  let ax = { x: 0, z: 0 };

  function move(e) {
    const r = node.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RANGE) { dx *= RANGE / len; dy *= RANGE / len; }
    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    ax = { x: dx / RANGE, z: dy / RANGE };
  }

  function reset() {
    activeId = null;
    ax = { x: 0, z: 0 };
    thumb.style.transform = 'translate(-50%, -50%)';
  }

  node.addEventListener('pointerdown', (e) => {
    activeId = e.pointerId;
    try { node.setPointerCapture(e.pointerId); } catch { /* headless */ }
    move(e);
    e.preventDefault();
  });
  node.addEventListener('pointermove', (e) => {
    if (e.pointerId === activeId) move(e);
  });
  node.addEventListener('pointerup', (e) => { if (e.pointerId === activeId) reset(); });
  node.addEventListener('pointercancel', (e) => { if (e.pointerId === activeId) reset(); });

  return { node, axis: () => ax };
}
