// Tiny DOM helpers. Text is always inserted as text (never as HTML), so names and notes are safe.

/** h('div', {class: 'card', onclick: fn}, 'text', childEl, [more]) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  children.flat(Infinity).forEach(c => {
    if (c == null || c === false) return;
    el.append(c.nodeType ? c : String(c));
  });
  return el;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-03-12', '2026-03-15' → '12–15 Mar 2026' */
export function formatDates(from, to) {
  if (!from) return '';
  const [y1, m1, d1] = from.split('-').map(Number);
  const one = `${d1} ${MONTHS[m1 - 1]} ${y1}`;
  if (!to || to === from) return one;
  const [y2, m2, d2] = to.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y1}`;
  return `${one} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
}

export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
