// The kanji map screen: a city where every kanji has a fixed home.
//  - Explore: look around, tap a kanji to see it, watch its path, draw it.
//  - Find it: a kanji is shown; tap where it lives on the map.
//  - What's here?: a spot is marked; say which kanji lives there.
// In the two quiz modes the tiles are blank, so recall comes from place.

import { drawCity } from './city.js';
import { direction, distanceInTiles, layoutMap, placeChoices, PITCH, TILE, tileCenter } from './map.js';
import { formatKun, kanaLabel, pickNext } from './quiz.js';
import { DrawPad, makeSvg, playStrokes, renderKanji } from './tracer.js';

const $ = (id) => document.getElementById(id);
const MIN_SCALE = 0.04;
const MAX_SCALE = 2.5;
const RECENT_SIZE = 8;

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'on') for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
    else if (key in node && key !== 'lang') node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

export function createMap(mapData, ctx) {
  const layout = layoutMap(mapData);
  const byKanji = () => new Map(ctx.entries().map((e) => [e.kanji, e]));
  const viewport = $('map-viewport');
  const world = $('map-world');
  const panel = $('map-panel');
  const tiles = new Map();
  const view = { x: 0, y: 0, scale: 1 };
  let built = false;
  let question = null; // { kanji, answered }
  let recent = [];
  const score = { right: 0, total: 0 };
  let stopPlay = null;
  let lines = null;

  // ---- Building the world ----

  function build() {
    world.style.width = `${layout.width}px`;
    world.style.height = `${layout.height}px`;
    world.append(drawCity(mapData, layout));
    for (const place of layout.places.values()) {
      const tile = h('button', { type: 'button', class: 'tile', lang: 'ja' }, place.kanji);
      tile.dataset.kanji = place.kanji;
      tile.style.cssText = `left:${place.x}px;top:${place.y}px;width:${TILE}px;height:${TILE}px`;
      tiles.set(place.kanji, tile);
      world.append(tile);
    }
    lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'map-lines');
    lines.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    lines.style.cssText = `width:${layout.width}px;height:${layout.height}px`;
    lines.innerHTML = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z"/></marker></defs>';
    world.append(lines);
    built = true;
  }

  // ---- Panning and zooming ----

  function apply(animate = false) {
    world.classList.toggle('glide', animate);
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  }

  function clampView() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const w = layout.width * view.scale;
    const hgt = layout.height * view.scale;
    const margin = 0;
    view.x = Math.min(Math.max(view.x, vw - w - margin), margin);
    view.y = Math.min(Math.max(view.y, vh - hgt - margin), margin);
    if (w < vw) view.x = (vw - w) / 2;
    if (hgt < vh) view.y = (vh - hgt) / 2;
  }

  function zoomAt(factor, cx, cy, animate = false) {
    const scale = Math.min(Math.max(view.scale * factor, MIN_SCALE), MAX_SCALE);
    const k = scale / view.scale;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.scale = scale;
    clampView();
    apply(animate);
  }

  // Show the box (in world px) as large as fits, up to `maxScale`.
  function fit(box, maxScale = 1.1, animate = true) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const pad = 24;
    view.scale = Math.min(Math.max(Math.min((vw - pad * 2) / box.w, (vh - pad * 2) / box.h, maxScale), MIN_SCALE), MAX_SCALE);
    view.x = vw / 2 - (box.x + box.w / 2) * view.scale;
    view.y = vh / 2 - (box.y + box.h / 2) * view.scale;
    clampView();
    apply(animate);
  }

  const fitAll = () => fit({ x: 0, y: 0, w: layout.width, h: layout.height }, 1, true);

  function fitPlaces(kanjiList, maxScale = 1) {
    const ps = kanjiList.map((k) => layout.places.get(k));
    const x = Math.min(...ps.map((p) => p.x)) - 30;
    const y = Math.min(...ps.map((p) => p.y)) - 50;
    const x2 = Math.max(...ps.map((p) => p.x + TILE)) + 30;
    const y2 = Math.max(...ps.map((p) => p.y + TILE)) + 30;
    fit({ x, y, w: x2 - x, h: y2 - y }, maxScale);
  }

  // A kanji's district with some of the city around it, so the landmarks
  // that lead there stay in view.
  function fitAround(kanji) {
    const d = layout.places.get(kanji).district;
    const m = PITCH * 2.5;
    fit({ x: d.x - m, y: d.y - m, w: d.w + m * 2, h: d.h + m * 2 }, 0.9);
  }

  // Keep the view where it is, but slide so this tile is comfortably visible.
  function bringIntoView(kanji) {
    const c = tileCenter(layout.places.get(kanji));
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const sx = view.x + c.x * view.scale;
    const sy = view.y + c.y * view.scale;
    const m = 60;
    if (sx > m && sx < vw - m && sy > m && sy < vh - m) return;
    view.x = vw / 2 - c.x * view.scale;
    view.y = vh / 2 - c.y * view.scale;
    clampView();
    apply(true);
  }

  const pointers = new Map();
  let gesture = null;
  let dragged = false;

  function local(e) {
    const r = viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    if (e.target.closest('.map-zoom')) return;
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) dragged = false;
    startGesture();
  }

  function startGesture() {
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      gesture = { x: view.x, y: view.y, from: pts[0], moved: 0 };
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      gesture = {
        x: view.x, y: view.y, scale: view.scale,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      };
      dragged = true;
    }
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, local(e));
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      const dx = pts[0].x - gesture.from.x;
      const dy = pts[0].y - gesture.from.y;
      if (Math.hypot(dx, dy) > 6) dragged = true;
      if (!dragged) return;
      view.x = gesture.x + dx;
      view.y = gesture.y + dy;
    } else {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = Math.min(Math.max(gesture.scale * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.dist), MIN_SCALE), MAX_SCALE);
      const k = scale / gesture.scale;
      view.scale = scale;
      view.x = mid.x - (gesture.mid.x - gesture.x) * k;
      view.y = mid.y - (gesture.mid.y - gesture.y) * k;
    }
    clampView();
    apply();
  }

  function onUp(e) {
    if (!pointers.delete(e.pointerId)) return;
    startGesture();
    if (pointers.size === 0) gesture = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const p = local(e);
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), p.x, p.y);
  }

  function onTileClick(e) {
    const tile = e.target.closest('.tile');
    if (!tile || dragged) return;
    const { kanji } = tile.dataset;
    if (ctx.settings.mapMode === 'explore') showCard(kanji);
    else if (ctx.settings.mapMode === 'find') guessPlace(kanji);
  }

  // ---- Tiles ----

  function resetTiles() {
    const active = new Set(ctx.active());
    const quiz = ctx.settings.mapMode !== 'explore';
    world.classList.toggle('quiz', quiz);
    for (const [kanji, tile] of tiles) {
      tile.className = 'tile';
      tile.classList.toggle('off', !active.has(kanji));
      tile.setAttribute('aria-label', quiz ? 'hidden kanji' : kanji);
    }
    clearLines();
  }

  function mark(kanji, ...classes) {
    const tile = tiles.get(kanji);
    tile.classList.add(...classes);
    if (classes.includes('shown')) tile.setAttribute('aria-label', kanji);
  }

  function clearLines() {
    lines?.querySelectorAll('line').forEach((l) => l.remove());
  }

  // Arrow from a wrong guess to the right home: the route to remember.
  function drawRoute(from, to) {
    const a = tileCenter(layout.places.get(from));
    const b = tileCenter(layout.places.get(to));
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const trim = Math.min(TILE * 0.55, len / 3);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x + ux * trim);
    line.setAttribute('y1', a.y + uy * trim);
    line.setAttribute('x2', b.x - ux * trim);
    line.setAttribute('y2', b.y - uy * trim);
    line.setAttribute('marker-end', 'url(#arrow)');
    lines.append(line);
  }

  // ---- Panel helpers ----

  // "Market Hall, City centre"; areas named like their district are said once.
  const home = (d) => (d.area && d.area !== d.name ? `${d.name}, ${d.area}` : d.name);

  function stopAnimation() {
    stopPlay?.();
    stopPlay = null;
  }

  function scoreLine() {
    return score.total ? h('p', { class: 'muted map-score' }, `This session: ${score.right} / ${score.total}`) : null;
  }

  function describe(entry) {
    const place = layout.places.get(entry.kanji);
    return h('div', { class: 'map-card-head' },
      h('span', { class: 'map-card-kanji', lang: 'ja' }, entry.kanji),
      h('div', {},
        h('p', { class: 'map-card-meaning' }, entry.meanings.slice(0, 3).join(', ')),
        h('p', { class: 'map-card-readings', lang: 'ja' }, [entry.on.join('、'), entry.kun.map(formatKun).join('、')].filter(Boolean).join(' ｜ ')),
        h('p', { class: 'muted map-card-home' }, `Lives in ${home(place.district)} · ${place.district.hint}`)));
  }

  // Stroke picture with "watch" and "draw" buttons.
  function strokeTools(kanji) {
    const holder = h('div', { class: 'map-path' });
    const svg = makeSvg('path-svg');
    holder.append(svg);
    renderKanji(svg, ctx.strokes(kanji), { numbers: true });
    const watch = h('button', { type: 'button', class: 'btn small secondary' }, '▶ Watch the path');
    const draw = h('button', { type: 'button', class: 'btn small secondary' }, '✍ Draw it');
    const status = h('p', { class: 'muted map-draw-status' });
    watch.addEventListener('click', () => {
      stopAnimation();
      if (!holder.contains(svg)) holder.replaceChildren(svg);
      stopPlay = playStrokes(svg, ctx.strokes(kanji));
    });
    draw.addEventListener('click', () => {
      stopAnimation();
      status.textContent = '';
      new DrawPad(holder, ctx.strokes(kanji), {
        onDone: ({ hints, misses }) => {
          status.textContent = hints
            ? `Done, with help on ${hints} stroke${hints > 1 ? 's' : ''}.`
            : misses ? 'Done! A few strokes needed a second try.' : 'Perfect! Drawn from memory.';
        },
      });
    });
    return h('div', { class: 'map-tools' }, holder, h('div', { class: 'map-tool-btns' }, watch, draw, status));
  }

  function setPanel(...children) {
    stopAnimation();
    panel.replaceChildren(...children.filter(Boolean));
  }

  // ---- Explore ----

  function startExplore(message = true) {
    question = null;
    resetTiles();
    if (message) {
      setPanel(h('p', { class: 'map-help' },
        'Every kanji has a fixed home in this lakeside city. The N5 and N4 kanji live in the centre: water kanji on the island, ',
        'study kanji at the University, animals at the Zoo. The harder ones live out in the suburbs, grouped by their radical: ',
        '氵 water on the Lielahti shore, 馬 horses at Teivo, 辶 roads at the airport, 言 words at the Hervanta campus, 木 trees in Kauppi. ',
        'Use the lakes, the rapids, the railway (striped) and the tram (yellow) to find your way. ',
        'Drag to move, pinch or use + − to zoom, and tap a kanji to see it.'));
    }
  }

  function showCard(kanji) {
    const entry = byKanji().get(kanji);
    for (const tile of tiles.values()) tile.classList.remove('picked');
    mark(kanji, 'picked');
    setPanel(describe(entry), strokeTools(kanji));
    bringIntoView(kanji);
  }

  // ---- Quiz modes ----

  function pool() {
    const unlearned = ctx.unlearned();
    return unlearned.length ? unlearned : ctx.active();
  }

  function nextQuestion() {
    resetTiles();
    const list = pool().filter((k) => layout.places.has(k)).map((kanji) => ({ kanji }));
    const pick = pickNext(list, recent);
    if (!pick) {
      setPanel(h('p', { class: 'map-help' }, 'No kanji to ask about. Choose a level in the ☰ menu.'));
      return;
    }
    recent = [...recent, pick.kanji].slice(-RECENT_SIZE);
    question = { kanji: pick.kanji, answered: false };
    if (ctx.settings.mapMode === 'find') askFind();
    else askWhats();
  }

  function nextButton() {
    const btn = h('button', { type: 'button', class: 'btn primary' }, 'Next →');
    btn.addEventListener('click', nextQuestion);
    return btn;
  }

  function askFind() {
    const entry = byKanji().get(question.kanji);
    const giveUp = h('button', { type: 'button', class: 'btn secondary' }, 'Show me');
    giveUp.addEventListener('click', () => answerFind(null));
    setPanel(
      h('div', { class: 'map-ask' },
        h('span', { class: 'map-ask-kanji', lang: 'ja' }, entry.kanji),
        h('div', {},
          h('p', { class: 'map-ask-q' }, 'Where does this kanji live?'),
          infoPeek(entry))),
      h('div', { class: 'row' }, giveUp),
      scoreLine());
  }

  // Meaning and reading start hidden behind an eye, so you can first try to
  // find the kanji from its shape alone.
  function infoPeek(entry) {
    const text = h('span', { class: 'map-peek-text', hidden: true },
      `${entry.meanings.slice(0, 2).join(', ')} · `, h('span', { lang: 'ja' }, kanaLabel(entry)));
    const veil = h('span', { class: 'map-peek-veil' }, 'Meaning and reading hidden');
    const eye = h('button', { type: 'button', class: 'eye-btn', 'aria-label': 'Show meaning and reading', 'aria-pressed': 'false' }, '👁');
    eye.addEventListener('click', () => {
      const showing = text.hidden;
      text.hidden = !showing;
      veil.hidden = showing;
      eye.classList.toggle('on', showing);
      eye.setAttribute('aria-pressed', String(showing));
      eye.setAttribute('aria-label', showing ? 'Hide meaning and reading' : 'Show meaning and reading');
    });
    return h('p', { class: 'muted map-peek' }, eye, veil, text);
  }

  function guessPlace(kanji) {
    if (!question || question.answered) {
      if (question?.answered) showCardInline(kanji);
      return;
    }
    answerFind(kanji);
  }

  function answerFind(guess) {
    question.answered = true;
    const target = question.kanji;
    const entry = byKanji().get(target);
    const place = layout.places.get(target);
    const right = guess === target;
    score.total += 1;
    if (right) score.right += 1;
    mark(target, 'shown', 'good');
    let verdict;
    if (right) {
      verdict = `Yes! ${target} lives in ${home(place.district)}.`;
      bringIntoView(target);
    } else if (guess) {
      mark(guess, 'shown', 'bad');
      drawRoute(guess, target);
      const gp = layout.places.get(guess);
      const away = distanceInTiles(gp, place);
      const where = gp.district === place.district
        ? `${away} tile${away > 1 ? 's' : ''} away, in the same district`
        : `in ${home(place.district)}, ${away} tiles ${direction(gp, place)} of there. Follow the arrow`;
      verdict = `That spot is ${guess}. ${target} lives ${where}.`;
      fitPlaces([guess, target], 1);
    } else {
      verdict = `${target} lives in ${home(place.district)}: ${place.district.hint}.`;
      fitAround(target);
    }
    setPanel(
      h('p', { class: `verdict ${right ? 'good' : 'bad'}` }, verdict),
      describe(entry),
      h('div', { class: 'row' }, nextButton()),
      scoreLine());
  }

  // After a "find it" answer, tapping other tiles peeks at them.
  function showCardInline(kanji) {
    mark(kanji, 'shown');
  }

  function askWhats() {
    const target = question.kanji;
    mark(target, 'target');
    const choices = placeChoices(target, ctx.active(), layout.places, 6).map((kanji) => {
      const btn = h('button', { type: 'button', class: 'choice glyph-choice', lang: 'ja' }, kanji);
      btn.dataset.kanji = kanji;
      btn.addEventListener('click', () => answerWhats(kanji, btn));
      return btn;
    });
    const draw = h('button', { type: 'button', class: 'link-btn' }, '✍ Draw it instead');
    draw.addEventListener('click', () => drawWhats());
    setPanel(
      h('p', { class: 'map-ask-q' }, `What lives at the marked spot in ${home(layout.places.get(target).district)}?`),
      h('div', { class: 'choices glyph-choices', id: 'map-choices' }, ...choices),
      draw,
      scoreLine());
    fitAround(target);
  }

  function drawWhats() {
    const target = question.kanji;
    const holder = h('div', { class: 'map-path big' });
    const giveUp = h('button', { type: 'button', class: 'btn secondary' }, "I don't know");
    const hint = h('button', { type: 'button', class: 'btn secondary' }, 'Show next stroke');
    setPanel(
      h('p', { class: 'map-ask-q' }, `Draw what lives at the marked spot in ${home(layout.places.get(target).district)}.`),
      holder,
      h('div', { class: 'row' }, giveUp, hint));
    const pad = new DrawPad(holder, ctx.strokes(target), {
      onDone: ({ hints }) => finishWhats(hints === 0, hints
        ? `It's ${target}. You needed help on ${hints} stroke${hints > 1 ? 's' : ''}.`
        : `Yes! ${target} lives here, and you drew it from memory.`),
    });
    hint.addEventListener('click', () => pad.hint());
    giveUp.addEventListener('click', () => {
      pad.finishForUser();
      finishWhats(false, `It's ${target}.`);
    });
  }

  function answerWhats(kanji, btn) {
    if (question.answered) return;
    const right = kanji === question.kanji;
    for (const b of $('map-choices').children) {
      b.disabled = true;
      if (b.dataset.kanji === question.kanji) b.classList.add('correct');
    }
    if (!right) {
      btn.classList.add('wrong');
      const where = layout.places.get(kanji);
      mark(kanji, 'shown', 'bad');
      drawRoute(question.kanji, kanji);
      fitPlaces([question.kanji, kanji], 1);
      finishWhats(false, `It's ${question.kanji}. ${kanji} lives in ${home(where.district)}. Follow the arrow.`, false);
    } else {
      finishWhats(true, `Yes! ${question.kanji} lives here.`, false);
    }
  }

  function finishWhats(right, verdict, replacePanel = true) {
    if (question.answered) return;
    question.answered = true;
    score.total += 1;
    if (right) score.right += 1;
    const target = question.kanji;
    tiles.get(target).classList.remove('target');
    mark(target, 'shown', right ? 'good' : 'bad');
    const entry = byKanji().get(target);
    const parts = [h('p', { class: `verdict ${right ? 'good' : 'bad'}` }, verdict), describe(entry), h('div', { class: 'row' }, nextButton()), scoreLine()];
    if (replacePanel) {
      const pad = panel.querySelector('.map-path');
      panel.replaceChildren(parts[0], ...(pad ? [pad] : []), ...parts.slice(1).filter(Boolean));
    } else {
      panel.querySelector('.link-btn')?.remove();
      panel.querySelector('.map-score')?.remove();
      panel.append(...parts.filter(Boolean));
    }
  }

  // ---- Modes ----

  function setMode(mode) {
    ctx.settings.mapMode = mode;
    ctx.saveSettings();
    start();
  }

  function start() {
    for (const radio of document.querySelectorAll('input[name="map-mode"]')) {
      radio.checked = radio.value === ctx.settings.mapMode;
    }
    if (ctx.settings.mapMode === 'explore') startExplore();
    else nextQuestion();
  }

  let firstShow = true;

  function show() {
    if (!built) build();
    // The viewport only has a size once the screen is visible.
    requestAnimationFrame(() => {
      if (firstShow) {
        // Open on the city centre: the rapids, Hämeenkatu and the station.
        const home = mapData.home;
        fit({ x: home.x * PITCH, y: home.y * PITCH, w: home.w * PITCH, h: home.h * PITCH }, 1, false);
        firstShow = false;
      }
      start();
    });
  }

  function hide() {
    stopAnimation();
  }

  viewport.addEventListener('pointerdown', onDown);
  // Moves and releases are followed on the window so a drag keeps going when
  // the finger leaves the map, without pointer capture (which would stop
  // taps from reaching the tiles).
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  world.addEventListener('click', onTileClick);
  $('zoom-in').addEventListener('click', () => zoomAt(1.4, viewport.clientWidth / 2, viewport.clientHeight / 2, true));
  $('zoom-out').addEventListener('click', () => zoomAt(1 / 1.4, viewport.clientWidth / 2, viewport.clientHeight / 2, true));
  $('zoom-fit').addEventListener('click', fitAll);
  for (const radio of document.querySelectorAll('input[name="map-mode"]')) {
    radio.addEventListener('change', (e) => setMode(e.target.value));
  }
  window.addEventListener('resize', () => {
    if (!viewport.clientWidth) return;
    clampView();
    apply();
  });

  return { show, hide, layout };
}
