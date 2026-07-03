// Tiny DOM helpers — all game UI is DOM overlaid on the canvas.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function button(label, onClick, cls = '') {
  return el('button', { class: `btn ${cls}`.trim(), onclick: onClick, text: label });
}

export function panel(...children) {
  return el('div', { class: 'panel' }, ...children);
}

export function field(labelText, inputNode) {
  return el('label', { class: 'field' }, labelText, inputNode);
}

export function slider({ min = 0, max = 1, step = 0.01, value = 0, oninput }) {
  const input = el('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => oninput(parseFloat(input.value)));
  return input;
}

export function colorInput(value, oninput) {
  const input = el('input', { type: 'color', value });
  input.addEventListener('input', () => oninput(input.value));
  return input;
}

export function textInput(value, oninput, placeholder = '') {
  const input = el('input', { type: 'text', value, placeholder });
  if (oninput) input.addEventListener('input', () => oninput(input.value));
  return input;
}

export function select(options, value, onchange) {
  const node = el('select',
    {},
    ...options.map(o => {
      const opt = typeof o === 'string' ? { value: o, label: o } : o;
      return el('option', { value: opt.value, text: opt.label });
    }),
  );
  node.value = value;
  node.addEventListener('change', () => onchange(node.value));
  return node;
}

// Chip-style exclusive choice group. Returns { node, set }.
export function choiceGroup(options, value, onchange) {
  const buttons = new Map();
  const node = el('div', { class: 'choice-grid' });
  const set = (v) => {
    for (const [val, btn] of buttons) btn.classList.toggle('active', val === v);
  };
  for (const o of options) {
    const opt = typeof o === 'string' ? { value: o, label: o } : o;
    const btn = button(opt.label, () => { set(opt.value); onchange(opt.value); }, 'small');
    buttons.set(opt.value, btn);
    node.append(btn);
  }
  set(value);
  return { node, set };
}

export function toast(message, isError = false) {
  const ui = document.getElementById('ui');
  const node = el('div', { class: `toast${isError ? ' error' : ''}`, text: message });
  ui.append(node);
  setTimeout(() => node.remove(), 3100);
  return node;
}

export function uiRoot() {
  return document.getElementById('ui');
}

export function clearUI() {
  document.getElementById('ui').replaceChildren();
}
