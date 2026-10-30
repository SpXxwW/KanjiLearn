// Everything is stored on the device in localStorage. No accounts, no server.

const LEARNED_KEY = 'kanjilearn.learned.v1';
const SETTINGS_KEY = 'kanjilearn.settings.v1';

export const LEVELS = ['N5', 'N4'];
const CHOICE_COUNTS = { min: 2, max: 12 };

const DEFAULT_SETTINGS = { mode: 'choice', choiceCount: 10, choiceStyle: 'en', levels: LEVELS };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadLearned() {
  return new Set(read(LEARNED_KEY, []));
}

export function saveLearned(learned) {
  return write(LEARNED_KEY, [...learned]);
}

export function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
  const count = Number(settings.choiceCount);
  settings.choiceCount = Number.isInteger(count)
    ? Math.min(Math.max(count, CHOICE_COUNTS.min), CHOICE_COUNTS.max)
    : DEFAULT_SETTINGS.choiceCount;
  if (!['en', 'kana'].includes(settings.choiceStyle)) settings.choiceStyle = 'en';
  const levels = Array.isArray(settings.levels) ? settings.levels.filter((l) => LEVELS.includes(l)) : [];
  settings.levels = levels.length ? levels : LEVELS;
  return settings;
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, settings);
}
