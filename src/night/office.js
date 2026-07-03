import { el, button } from '../ui/dom.js';

// Office HUD + door/light controls (DOM). nightMode owns the actual state;
// this module renders it and forwards intents.

export function createOfficeUI({ onDoorToggle, onLightDown, onLightUp, onTabletToggle, hasRightEntry, rightKind }) {
  const powerEl = el('span', { class: 'big', text: '100%' });
  const usageEl = el('span', { class: 'usage-pips' }, ...[0, 1, 2, 3].map(() => el('span')));
  const clockEl = el('span', { class: 'big', text: '12 AM' });
  const nightEl = el('span', { text: 'Night 1' });

  const mkSide = (side, kindLabel) => {
    const doorBtn = el('button', { class: 'door-btn', text: `${kindLabel}` });
    doorBtn.addEventListener('click', () => onDoorToggle(side));
    const lightBtn = el('button', { class: 'door-btn', text: 'LIGHT' });
    lightBtn.addEventListener('mousedown', () => onLightDown(side));
    lightBtn.addEventListener('mouseup', () => onLightUp(side));
    lightBtn.addEventListener('mouseleave', () => onLightUp(side));
    return {
      root: el('div', { class: `door-controls ${side}` }, doorBtn, lightBtn),
      doorBtn, lightBtn,
    };
  };

  const left = mkSide('left', 'DOOR');
  const right = hasRightEntry ? mkSide('right', rightKind === 'vent' ? 'VENT' : 'DOOR') : null;

  const tabletBtn = el('button', { class: 'tablet-flip', text: '▲ OPEN MONITOR ▲' });
  tabletBtn.addEventListener('click', () => onTabletToggle());

  const root = el('div', { class: 'night-hud' },
    el('div', { class: 'hud-corner top-right' }, clockEl, el('br'), nightEl),
    el('div', { class: 'hud-corner bottom-left' },
      el('span', { text: 'POWER ' }), powerEl, usageEl),
    left.root,
    right?.root ?? null,
    tabletBtn,
  );

  return {
    root,
    setPower(pct) { powerEl.textContent = `${Math.max(0, Math.ceil(pct))}%`; },
    setUsage(pips) {
      [...usageEl.children].forEach((c, i) => {
        c.className = i < pips ? `on-${Math.min(pips, 4)}` : '';
      });
    },
    setClock(hour, night) {
      clockEl.textContent = hour === 0 ? '12 AM' : `${hour} AM`;
      nightEl.textContent = `Night ${night}`;
    },
    setDoor(side, closed) {
      const s = side === 'left' ? left : right;
      if (!s) return;
      s.doorBtn.classList.toggle('on', closed);
    },
    setLight(side, on) {
      const s = side === 'left' ? left : right;
      if (!s) return;
      s.lightBtn.classList.toggle('light-on', on);
    },
    setControlsVisible(v) {
      left.root.style.display = v ? '' : 'none';
      if (right) right.root.style.display = v ? '' : 'none';
      tabletBtn.textContent = v ? '▲ OPEN MONITOR ▲' : '▼ CLOSE MONITOR ▼';
    },
    setPowerOut() {
      left.root.style.display = 'none';
      if (right) right.root.style.display = 'none';
      tabletBtn.style.display = 'none';
      powerEl.textContent = '—';
    },
  };
}

export function loseScreen({ onRetry, onHub }) {
  return el('div', { class: 'screen', style: { background: 'rgba(0,0,0,0.92)', zIndex: 70 } },
    el('div', { class: 'static-noise' }),
    el('h1', { class: 'ending-title bad', text: 'GAME OVER' }),
    el('div', { class: 'hint', text: 'The suits are always hungry.' }),
    el('div', { class: 'row' },
      button('Retry Night', onRetry, 'primary'),
      button('Give Up (Hub)', onHub),
    ),
  );
}

export function winScreen(nextNight, golden = false) {
  if (golden) {
    return el('div', { class: 'screen fade-in', style: { background: 'rgba(6,4,0,0.94)', zIndex: 70 } },
      el('h1', {
        text: 'THE GOLDEN NIGHT',
        style: {
          fontSize: '52px', letterSpacing: '14px', color: '#e8c84a', textAlign: 'center',
          textShadow: '0 0 24px rgba(232,200,74,0.8), 0 0 80px rgba(232,200,74,0.35)',
        },
      }),
      el('div', { class: 'hint', style: { maxWidth: '560px', textAlign: 'center', lineHeight: '1.8' },
        text: 'Every servo at maximum. Every camera watched you fail to fail. Somewhere in the walls, a golden suit tips its little hat. You have seen everything this place has to offer — and it has seen you.' }),
    );
  }
  return el('div', { class: 'screen fade-in', style: { background: 'rgba(0,0,0,0.9)', zIndex: 70 } },
    el('h1', { class: 'title-glow', text: '6 AM', style: { fontSize: '90px', letterSpacing: '24px' } }),
    el('div', { class: 'hint', text: nextNight ? 'You made it. The day is yours — the night, less so.' : 'You survived the night.' }),
  );
}
