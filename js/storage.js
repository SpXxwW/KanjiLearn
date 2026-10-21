// Everything is stored on the device in localStorage. No accounts, no server.

const LEARNED_KEY = 'kanjilearn.learned.v1';
const SETTINGS_KEY = 'kanjilearn.settings.v1';

const DEFAULT_SETTINGS = { mode: 'choice' };

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
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) };
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, settings);
}
