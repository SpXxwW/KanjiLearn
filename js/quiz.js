// Pure quiz logic. No DOM access here so it can be unit-tested with `node --test`.

// Lowercase, strip punctuation and leading "to"/articles so "To eat!" matches "eat".
export function normalize(text) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(to|a|an|the) /, '');
}

export function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

// A typed answer is correct if it matches any meaning. One typo is forgiven on
// longer words ("electricty"), but never on short ones where it changes the word.
export function checkAnswer(input, entry) {
  const guess = normalize(input);
  if (!guess) return { correct: false, matched: null, typo: false };

  for (const meaning of entry.meanings) {
    if (normalize(meaning) === guess) return { correct: true, matched: meaning, typo: false };
  }
  for (const meaning of entry.meanings) {
    const target = normalize(meaning);
    if (target.length >= 5 && editDistance(guess, target) <= 1) {
      return { correct: true, matched: meaning, typo: true };
    }
  }
  return { correct: false, matched: null, typo: false };
}

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function choiceLabel(entry) {
  return entry.meanings.slice(0, 2).join(', ');
}

export function toHiragana(text) {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// Main on and kun reading, e.g. "コウ・たか(い)". "-" (used in suffix/prefix
// readings like "-び") is dropped for display.
export function kanaLabel(entry) {
  const on = entry.on[0];
  const kun = entry.kun[0] && formatKun(entry.kun[0].replace(/-/g, ''));
  return [on, kun].filter(Boolean).join('・');
}

// Every reading of a kanji without okurigana, in hiragana: 高 -> こう, たか.
function readingKeys(entry) {
  return [...entry.on, ...entry.kun].map((r) => toHiragana(r.replace(/-/g, '').split('.')[0]));
}

const CHOICE_STYLES = {
  en: { label: choiceLabel, keys: (e) => e.meanings.map(normalize) },
  kana: { label: kanaLabel, keys: readingKeys },
};

// One correct answer plus distractors drawn from `all`. No two choices may
// share a meaning (or, for kana choices, a reading), so "word" or "コウ" can
// never appear as both a right and a wrong answer.
export function buildChoices(entry, all, count, style = 'en', rng = Math.random) {
  const { label, keys } = CHOICE_STYLES[style];
  const taken = new Set(keys(entry));
  const distractors = [];
  for (const candidate of shuffle(all, rng)) {
    if (distractors.length === count - 1) break;
    if (candidate === entry) continue;
    const candidateKeys = keys(candidate);
    if (candidateKeys.some((k) => taken.has(k))) continue;
    distractors.push(candidate);
    candidateKeys.forEach((k) => taken.add(k));
  }
  return shuffle([entry, ...distractors], rng).map((e) => ({
    kanji: e.kanji,
    label: label(e),
    correct: e === entry,
  }));
}

// Random pick from the pool, avoiding the last few shown when there is room to.
export function pickNext(pool, recent = [], rng = Math.random) {
  if (pool.length === 0) return null;
  const keep = Math.min(recent.length, pool.length - 1);
  const avoid = new Set(keep > 0 ? recent.slice(recent.length - keep) : []);
  const candidates = pool.filter((e) => !avoid.has(e.kanji));
  return candidates[Math.floor(rng() * candidates.length)];
}

// "あたら.しい" -> "あたら(しい)": okurigana shown in brackets.
export function formatKun(reading) {
  return reading.replace(/\.(.+)$/, '($1)');
}
