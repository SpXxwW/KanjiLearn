import { buildChoices, checkAnswer, choiceLabel, formatKun, pickNext } from './quiz.js';
import { loadLearned, loadSettings, saveLearned, saveSettings } from './storage.js';

const RECENT_SIZE = 5;

const $ = (id) => document.getElementById(id);

const state = {
  kanji: [],
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
  $('kanji').textContent = state.current.kanji;
  renderAnswerArea();
  window.scrollTo(0, 0);
}

function renderAnswerArea() {
  const typing = state.settings.mode === 'type';
  $('choices').hidden = typing;
  $('type-form').hidden = !typing;
  if (typing) {
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

// ---- Menu ----

function openMenu() {
  history.pushState({ menu: true }, '');
  showMenu();
}

function showMenu() {
  $('quiz-screen').hidden = true;
  $('menu-screen').hidden = false;
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

function closeMenu() {
  if (history.state?.menu) history.back(); // popstate does the rest
  else hideMenu();
}

function hideMenu() {
  $('menu-screen').hidden = true;
  $('quiz-screen').hidden = false;
  if (!state.current) nextQuestion();
  else renderStats();
}

function renderChoiceSettings() {
  $('choice-settings').hidden = state.settings.mode !== 'choice';
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
  $('menu-btn').addEventListener('click', openMenu);
  $('done-menu').addEventListener('click', openMenu);
  $('back-btn').addEventListener('click', closeMenu);
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
  // Android back button / swipe closes the menu instead of leaving the app.
  window.addEventListener('popstate', () => {
    if (!$('menu-screen').hidden) hideMenu();
  });
}

async function init() {
  bindEvents();
  try {
    const res = await fetch('data/kanji.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.kanji = await res.json();
  } catch {
    $('card').hidden = true;
    $('load-error').hidden = false;
    return;
  }
  nextQuestion();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  // Ask the browser not to evict our saved progress when space runs low.
  navigator.storage?.persist?.();
}

init();
