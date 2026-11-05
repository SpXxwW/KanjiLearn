import { buildChoices, checkAnswer, choiceLabel, formatKun, kanaLabel, pickNext } from './quiz.js';
import { loadLearned, loadSettings, saveLearned, saveSettings } from './storage.js';
import { DrawPad, playStrokes, renderKanji, makeSvg } from './tracer.js';
import { createMap } from './mapscreen.js';

const RECENT_SIZE = 5;

const $ = (id) => document.getElementById(id);

const state = {
  kanji: [],
  strokes: {},
  map: null,
  pad: null,
  stopPlay: null,
  learned: loadLearned(),
  settings: loadSettings(),
  current: null,
  answered: false,
  recent: [],
  exampleIndex: 0,
  session: { correct: 0, total: 0 },
};

// Kanji in the levels chosen in the menu.
const active = () => state.kanji.filter((k) => state.settings.levels.includes(k.level));
const unlearned = () => active().filter((k) => !state.learned.has(k.kanji));
const learnedEntries = () => state.kanji.filter((k) => state.learned.has(k.kanji));

function persistLearned() {
  if (!saveLearned(state.learned)) {
    alert("Couldn't save your progress on this device (storage is full or blocked).");
  }
}

function renderStats() {
  const pool = active();
  const learned = pool.filter((k) => state.learned.has(k.kanji)).length;
  $('stats').textContent = `${pool.length - learned} to learn · ${learned} learned`;
}

function renderSession() {
  const { correct, total } = state.session;
  $('session').textContent = total ? `This session: ${correct} / ${total}` : '';
}

// ---- Quiz ----

function nextQuestion() {
  stopPath();
  state.pad = null;
  state.current = pickNext(unlearned(), state.recent);
  state.answered = false;
  $('reveal').hidden = true;
  renderStats();
  renderSession();

  const done = !state.current;
  $('done').hidden = !done;
  $('card').hidden = done;
  if (done) {
    $('choices').hidden = true;
    $('type-form').hidden = true;
    return;
  }

  state.recent = [...state.recent, state.current.kanji].slice(-RECENT_SIZE);
  renderAnswerArea();
  window.scrollTo(0, 0);
}

function renderAnswerArea() {
  const { mode } = state.settings;
  const typing = mode === 'type';
  const drawing = mode === 'draw';
  $('choices').hidden = mode !== 'choice';
  $('type-form').hidden = !typing;
  $('draw-area').hidden = !drawing;
  $('kanji').hidden = drawing;
  $('prompt').hidden = !drawing;
  $('kanji').textContent = state.current.kanji;
  if (drawing) {
    renderDrawing();
  } else if (typing) {
    const input = $('type-input');
    input.value = '';
    input.focus({ preventScroll: true });
  } else {
    renderChoices();
  }
}

function renderChoices() {
  const { choiceCount, choiceStyle } = state.settings;
  const buttons = buildChoices(state.current, active(), choiceCount, choiceStyle).map((choice) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    if (choiceStyle === 'kana') btn.lang = 'ja';
    btn.textContent = choice.label;
    btn.dataset.correct = choice.correct;
    btn.addEventListener('click', () => answerChoice(btn, choice));
    return btn;
  });
  $('choices').replaceChildren(...buttons);
}

// ---- Draw mode: meaning + reading shown, the kanji is drawn by finger ----

function renderDrawing() {
  const k = state.current;
  $('prompt-meaning').textContent = k.meanings.slice(0, 3).join(', ');
  $('prompt-kana').textContent = kanaLabel(k);
  state.pad = new DrawPad($('pad-holder'), state.strokes[k.kanji], { onDone: finishDrawing });
  $('hint-btn').disabled = false;
  $('draw-giveup').disabled = false;
}

function finishDrawing({ hints, misses }) {
  $('hint-btn').disabled = true;
  $('draw-giveup').disabled = true;
  if (state.answered) return;
  const n = state.current.kanji;
  if (hints > 0) {
    reveal(false, `Drawn with help on ${hints} stroke${hints > 1 ? 's' : ''}. Watch the path below and try ${n} again later.`);
  } else if (misses > 0) {
    reveal(true, `Correct! (${misses} stroke${misses > 1 ? 's' : ''} needed a second try)`);
  } else {
    reveal(true, 'Perfect! Drawn from memory.');
  }
}

function giveUpDrawing() {
  if (state.answered || !state.pad) return;
  state.pad.finishForUser();
  $('hint-btn').disabled = true;
  $('draw-giveup').disabled = true;
  reveal(false, 'Here is the answer:');
  watchPath();
}

// ---- Stroke path on the answer card ----

function renderPath() {
  stopPath();
  const paths = state.strokes[state.current.kanji];
  const svg = makeSvg('path-svg');
  $('reveal-path').replaceChildren(svg);
  renderKanji(svg, paths, { numbers: true });
  $('stroke-count').textContent = `${paths.length} stroke${paths.length > 1 ? 's' : ''}`;
}

function watchPath() {
  stopPath();
  const svg = $('reveal-path').querySelector('svg');
  const paths = state.strokes[state.current.kanji];
  $('watch-btn').textContent = '■ Stop';
  state.stopPlay = playStrokes(svg, paths, { onDone: () => {
    state.stopPlay = null;
    $('watch-btn').textContent = '▶ Watch again';
  } });
}

function stopPath() {
  state.stopPlay?.();
  state.stopPlay = null;
  $('watch-btn').textContent = '▶ Watch the path';
}

function toggleWatch() {
  if (state.stopPlay) stopPath();
  else watchPath();
}

function answerChoice(picked, choice) {
  if (state.answered) return;
  for (const btn of $('choices').children) {
    btn.disabled = true;
    if (btn.dataset.correct === 'true') btn.classList.add('correct');
  }
  if (!choice.correct) picked.classList.add('wrong');
  reveal(choice.correct, choice.correct
    ? 'Correct!'
    : `Not quite. “${choice.label}” is ${choice.kanji}.`);
}

function answerTyped(event) {
  event.preventDefault();
  if (state.answered) {
    nextQuestion();
    return;
  }
  const input = $('type-input').value.trim();
  if (!input) return;
  const result = checkAnswer(input, state.current);
  if (!result.correct) reveal(false, `Not quite. You typed “${input}”.`);
  else if (result.typo) reveal(true, `Correct! (close enough to “${result.matched}”)`);
  else reveal(true, 'Correct!');
}

function reveal(correct, verdict) {
  const k = state.current;
  state.answered = true;
  state.session.total += 1;
  if (correct) state.session.correct += 1;

  $('verdict').textContent = verdict;
  $('verdict').className = `verdict ${correct ? 'good' : 'bad'}`;
  $('reveal-kanji').textContent = k.kanji;
  $('meanings').textContent = k.meanings.join(', ');
  $('onyomi').textContent = k.on.join('、') || '–';
  $('kunyomi').textContent = k.kun.map(formatKun).join('、') || '–';
  $('origin').textContent = k.origin;
  renderPath();

  state.exampleIndex = Math.floor(Math.random() * k.examples.length);
  renderExample();
  $('ex-next').hidden = k.examples.length < 2;
  renderLearnedButton();
  renderSession();

  $('type-input').blur(); // drop the keyboard so the explanation is readable
  $('reveal').hidden = false;
  $('reveal').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderExample() {
  const ex = state.current.examples[state.exampleIndex];
  $('ex-jp').textContent = ex.jp;
  $('ex-kana').textContent = ex.kana;
  $('ex-en').textContent = ex.en;
}

function nextExample() {
  state.exampleIndex = (state.exampleIndex + 1) % state.current.examples.length;
  renderExample();
}

function renderLearnedButton() {
  const isLearned = state.learned.has(state.current.kanji);
  $('learned-btn').textContent = isLearned ? '✓ Learned (undo)' : 'Mark as learned';
  $('learned-btn').classList.toggle('on', isLearned);
}

function toggleLearned() {
  const { kanji } = state.current;
  if (state.learned.has(kanji)) state.learned.delete(kanji);
  else state.learned.add(kanji);
  persistLearned();
  renderLearnedButton();
  renderStats();
}

// ---- Screens: quiz, menu and map. Menu and map push a history entry so the
// Android back button / swipe returns to the quiz instead of leaving the app.

function openScreen(name) {
  if (history.state?.screen) history.replaceState({ screen: name }, '');
  else history.pushState({ screen: name }, '');
  showScreen(name);
}

function showScreen(name) {
  const leavingMap = !$('map-screen').hidden && name !== 'map';
  $('quiz-screen').hidden = name !== 'quiz';
  $('menu-screen').hidden = name !== 'menu';
  $('map-screen').hidden = name !== 'map';
  document.body.classList.toggle('on-map', name === 'map');
  $('map-btn').classList.toggle('on', name === 'map');
  if (leavingMap) state.map?.hide();
  if (name === 'menu') showMenu();
  else if (name === 'map') {
    stopPath();
    window.scrollTo(0, 0);
    document.documentElement.style.setProperty('--topbar-h', `${document.querySelector('.topbar').offsetHeight}px`);
    state.map.show();
  } else {
    if (!state.current) nextQuestion();
    else renderStats();
  }
}

function closeScreen() {
  if (history.state?.screen) history.back(); // popstate does the rest
  else showScreen('quiz');
}

// ---- Menu ----

function showMenu() {
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.checked = radio.value === state.settings.mode;
  }
  for (const radio of document.querySelectorAll('input[name="choice-style"]')) {
    radio.checked = radio.value === state.settings.choiceStyle;
  }
  for (const box of document.querySelectorAll('input[name="level"]')) {
    box.checked = state.settings.levels.includes(box.value);
  }
  $('choice-count').value = state.settings.choiceCount;
  renderChoiceSettings();
  renderLearnedList();
  window.scrollTo(0, 0);
}

function renderChoiceSettings() {
  $('choice-settings').hidden = state.settings.mode !== 'choice';
  $('draw-note').hidden = state.settings.mode !== 'draw';
  $('choice-count-value').textContent = `(${state.settings.choiceCount})`;
}

function changeSetting(key, value) {
  state.settings[key] = value;
  saveSettings(state.settings);
  renderChoiceSettings();
  if (state.current && !state.answered) renderAnswerArea();
}

function changeLevels(event) {
  const levels = [...document.querySelectorAll('input[name="level"]:checked')].map((box) => box.value);
  if (levels.length === 0) {
    event.target.checked = true; // keep at least one level
    return;
  }
  state.settings.levels = levels;
  saveSettings(state.settings);
  // The current kanji may no longer be in the chosen levels.
  if (state.current && !levels.includes(state.current.level)) state.current = null;
}

function renderLearnedList() {
  const entries = learnedEntries();
  $('learned-count').textContent = entries.length ? `(${entries.length})` : '';
  $('learned-empty').hidden = entries.length > 0;
  $('unmark-all').hidden = entries.length === 0;

  const items = entries.map((entry) => {
    const li = document.createElement('li');
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.lang = 'ja';
    glyph.textContent = entry.kanji;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = choiceLabel(entry);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small secondary';
    btn.textContent = 'Unmark';
    btn.addEventListener('click', () => {
      state.learned.delete(entry.kanji);
      persistLearned();
      renderLearnedList();
      renderStats();
    });
    li.append(glyph, label, btn);
    return li;
  });
  $('learned-list').replaceChildren(...items);
}

function unmarkAll() {
  if (!confirm('Unmark all learned kanji? They will show up in the quiz again.')) return;
  state.learned.clear();
  persistLearned();
  renderLearnedList();
  renderStats();
}

// ---- Startup ----

function bindEvents() {
  $('type-form').addEventListener('submit', answerTyped);
  $('dont-know').addEventListener('click', () => {
    if (!state.answered) reveal(false, 'Here is the answer:');
  });
  $('next-btn').addEventListener('click', nextQuestion);
  $('learned-btn').addEventListener('click', toggleLearned);
  $('ex-next').addEventListener('click', nextExample);
  $('menu-btn').addEventListener('click', () => ($('menu-screen').hidden ? openScreen('menu') : closeScreen()));
  $('map-btn').addEventListener('click', () => {
    if (!state.map) return; // data didn't load
    if ($('map-screen').hidden) openScreen('map');
    else closeScreen();
  });
  $('done-menu').addEventListener('click', () => openScreen('menu'));
  $('back-btn').addEventListener('click', closeScreen);
  $('hint-btn').addEventListener('click', () => state.pad?.hint());
  $('draw-giveup').addEventListener('click', giveUpDrawing);
  $('watch-btn').addEventListener('click', toggleWatch);
  $('unmark-all').addEventListener('click', unmarkAll);
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', (e) => changeSetting('mode', e.target.value));
  }
  for (const radio of document.querySelectorAll('input[name="choice-style"]')) {
    radio.addEventListener('change', (e) => changeSetting('choiceStyle', e.target.value));
  }
  $('choice-count').addEventListener('input', (e) => changeSetting('choiceCount', Number(e.target.value)));
  for (const box of document.querySelectorAll('input[name="level"]')) {
    box.addEventListener('change', changeLevels);
  }
  window.addEventListener('popstate', () => showScreen(history.state?.screen ?? 'quiz'));
}

// When a new version has been deployed, the new service worker takes over
// in the background. Reload onto it right away if the app has only just
// opened; otherwise offer a button, so a quiz in progress isn't lost.
function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const hadWorker = Boolean(navigator.serviceWorker.controller);
  const opened = Date.now();
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorker || reloading) return; // first install: nothing old to replace
    if (Date.now() - opened < 15000 && state.session.total === 0) {
      reloading = true;
      location.reload();
    } else {
      $('update-bar').hidden = false;
    }
  });
  navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
  $('update-btn').addEventListener('click', () => location.reload());
}

async function init() {
  bindEvents();
  try {
    const [kanji, strokes, map] = await Promise.all(
      ['data/kanji.json', 'data/strokes.json', 'data/map.json'].map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
    );
    state.kanji = kanji;
    state.strokes = strokes.strokes;
    state.map = createMap(map, {
      entries: () => state.kanji,
      active: () => active().map((k) => k.kanji),
      unlearned: () => unlearned().map((k) => k.kanji),
      strokes: (kanji) => state.strokes[kanji],
      settings: state.settings,
      saveSettings: () => saveSettings(state.settings),
    });
  } catch {
    $('card').hidden = true;
    $('load-error').hidden = false;
    return;
  }
  nextQuestion();

  watchForUpdates();
  // Ask the browser not to evict our saved progress when space runs low.
  navigator.storage?.persist?.();
}

init();
