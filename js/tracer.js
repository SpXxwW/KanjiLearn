// Drawing and watching kanji strokes. Two parts:
//  - playStrokes: animates a kanji being written, a dot running along each
//    stroke and a dotted line showing where the pen moves through the air
//    between strokes, so a kanji can be remembered as one continuous path.
//  - DrawPad: the user draws the kanji with a finger, one stroke at a time,
//    and each stroke is checked for place, shape, direction and order.

import { BOX, checkNextStroke, parsePath } from './strokes.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.append(node);
  return node;
}

export function makeSvg(className) {
  return el('svg', { viewBox: `0 0 ${BOX} ${BOX}`, class: className, 'aria-hidden': 'true' });
}

function grid(svg) {
  const g = el('g', { class: 'grid' }, svg);
  el('rect', { x: 0.5, y: 0.5, width: BOX - 1, height: BOX - 1, rx: 6 }, g);
  el('line', { x1: BOX / 2, y1: 2, x2: BOX / 2, y2: BOX - 2 }, g);
  el('line', { x1: 2, y1: BOX / 2, x2: BOX - 2, y2: BOX / 2 }, g);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Animate one path element being drawn. Resolves when done (or cancelled).
function drawPath(path, dot, ms, token) {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length} ${length}`;
  path.style.strokeDashoffset = length;
  path.style.visibility = 'visible';
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      if (token.cancelled) return resolve();
      const t = Math.min((now - start) / ms, 1);
      path.style.strokeDashoffset = length * (1 - t);
      if (dot) {
        const p = path.getPointAtLength(length * t);
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        path.style.strokeDasharray = '';
        path.style.strokeDashoffset = '';
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

const strokeTime = (path) => Math.max(260, path.getTotalLength() * 9);

// Static picture of a kanji from its stroke paths, with stroke numbers
// placed at the start of each stroke.
export function renderKanji(svg, paths, { numbers = false } = {}) {
  svg.replaceChildren();
  grid(svg);
  const air = el('g', { class: 'air' }, svg);
  const g = el('g', { class: 'strokes' }, svg);
  const nums = el('g', { class: 'nums' }, svg);
  const elements = paths.map((d) => el('path', { d }, g));
  if (numbers) {
    paths.forEach((d, i) => {
      const [p] = parsePath(d);
      const t = el('text', { x: p.x - 4, y: p.y - 2 }, nums);
      t.textContent = i + 1;
    });
  }
  return { air, strokes: elements };
}

// Play the kanji being written. Returns a function that stops the animation.
export function playStrokes(svg, paths, { onDone } = {}) {
  const token = { cancelled: false };
  const { air, strokes } = renderKanji(svg, paths);
  for (const path of strokes) path.style.visibility = 'hidden';
  const dot = el('circle', { r: 3.2, class: 'pen', cx: -10, cy: -10 }, svg);

  (async () => {
    await wait(150);
    let last = null;
    for (const [i, path] of strokes.entries()) {
      if (token.cancelled) return;
      const [start] = parsePath(paths[i]);
      if (last) {
        const line = el('path', { d: `M${last.x},${last.y}L${start.x},${start.y}` }, air);
        await drawPath(line, dot, 220, token);
      }
      await drawPath(path, dot, strokeTime(path), token);
      const points = parsePath(paths[i]);
      last = points[points.length - 1];
      await wait(80);
    }
    dot.remove();
    if (!token.cancelled) onDone?.();
  })();

  return () => {
    token.cancelled = true;
    dot.remove();
    for (const path of strokes) path.style.visibility = 'visible';
  };
}

const MESSAGES = {
  short: 'Too short. Draw the whole stroke.',
  length: 'Right place, but the length is off.',
  place: 'Not quite. Try that stroke again.',
  direction: 'Wrong direction. Start from the other end.',
  order: 'That stroke comes later. Mind the order.',
};

// Finger drawing pad. Calls onDone({ hints, misses }) when every stroke is drawn.
export class DrawPad {
  constructor(container, paths, { onDone, autoHintAfter = 2 } = {}) {
    this.paths = paths;
    this.points = paths.map((d) => parsePath(d));
    this.onDone = onDone;
    this.autoHintAfter = autoHintAfter;
    this.index = 0;
    this.misses = 0;
    this.missesHere = 0;
    this.hinted = new Set();
    this.stopHint = null;

    this.root = document.createElement('div');
    this.root.className = 'pad';
    this.svg = makeSvg('pad-svg');
    grid(this.svg);
    this.doneLayer = el('g', { class: 'strokes' }, this.svg);
    this.hintLayer = el('g', { class: 'hint' }, this.svg);
    this.ink = el('polyline', { class: 'ink', points: '' }, this.svg);
    this.status = document.createElement('p');
    this.status.className = 'pad-status';
    this.status.setAttribute('aria-live', 'polite');
    this.root.append(this.svg, this.status);
    container.replaceChildren(this.root);

    this.drawn = [];
    this.svg.addEventListener('pointerdown', (e) => this.down(e));
    this.svg.addEventListener('pointermove', (e) => this.move(e));
    this.svg.addEventListener('pointerup', (e) => this.up(e));
    this.svg.addEventListener('pointercancel', () => this.clearInk());
    this.say(`Stroke 1 of ${paths.length}`);
  }

  get finished() {
    return this.index >= this.paths.length;
  }

  toBox(e) {
    const r = this.svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * BOX, y: ((e.clientY - r.top) / r.height) * BOX };
  }

  say(text, kind = '') {
    this.status.textContent = text;
    this.status.className = `pad-status ${kind}`;
  }

  down(e) {
    if (this.finished || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.svg.setPointerCapture(e.pointerId);
    this.pointer = e.pointerId;
    this.drawn = [this.toBox(e)];
    this.ink.classList.remove('bad');
    this.renderInk();
  }

  move(e) {
    if (e.pointerId !== this.pointer) return;
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) this.drawn.push(this.toBox(ev));
    this.renderInk();
  }

  up(e) {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.drawn.push(this.toBox(e));
    this.check();
  }

  renderInk() {
    this.ink.setAttribute('points', this.drawn.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  }

  clearInk() {
    this.pointer = null;
    this.drawn = [];
    this.renderInk();
  }

  check() {
    const result = checkNextStroke(this.drawn, this.points, this.index);
    if (result.ok) {
      this.accept();
      return;
    }
    this.misses += 1;
    this.missesHere += 1;
    this.ink.classList.add('bad');
    const drawn = this.drawn;
    setTimeout(() => {
      if (this.drawn === drawn) this.clearInk();
    }, 450);
    this.say(MESSAGES[result.reason] ?? MESSAGES.place, 'bad');
    if (this.missesHere >= this.autoHintAfter) this.hint();
  }

  accept() {
    this.clearInk();
    this.stopHint?.();
    this.hintLayer.replaceChildren();
    const path = el('path', { d: this.paths[this.index] }, this.doneLayer);
    drawPath(path, null, 160, {});
    this.index += 1;
    this.missesHere = 0;
    if (this.finished) {
      this.say('Done!', 'good');
      this.onDone?.({ hints: this.hinted.size, misses: this.misses });
    } else {
      this.say(`Stroke ${this.index + 1} of ${this.paths.length}`);
    }
  }

  // Show where the next stroke goes: a faint copy drawn from its start.
  hint() {
    if (this.finished) return;
    this.hinted.add(this.index);
    this.stopHint?.();
    this.hintLayer.replaceChildren();
    const path = el('path', { d: this.paths[this.index] }, this.hintLayer);
    const [start] = this.points[this.index];
    el('circle', { cx: start.x, cy: start.y, r: 3.4, class: 'start' }, this.hintLayer);
    const token = { cancelled: false };
    this.stopHint = () => { token.cancelled = true; };
    drawPath(path, null, strokeTime(path), token);
  }

  // Fill in the remaining strokes (used for "I don't know").
  finishForUser() {
    while (!this.finished) {
      this.hinted.add(this.index);
      el('path', { d: this.paths[this.index] }, this.doneLayer);
      this.index += 1;
    }
    this.hintLayer.replaceChildren();
    this.clearInk();
  }
}
