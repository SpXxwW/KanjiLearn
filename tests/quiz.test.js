import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChoices, checkAnswer, formatKun, kanaLabel, normalize, pickNext, toHiragana } from '../js/quiz.js';

const sun = { kanji: '日', meanings: ['sun', 'day'] };
const elec = { kanji: '電', meanings: ['electricity', 'lightning'] };

test('normalize strips case, punctuation, "to" and articles', () => {
  assert.equal(normalize('  To Eat! '), 'eat');
  assert.equal(normalize('the Sun'), 'sun');
  assert.equal(normalize("o'clock"), 'oclock');
  assert.equal(normalize('Ｓｕｎ'), 'sun'); // full-width input from a Japanese keyboard
});

test('checkAnswer accepts any meaning', () => {
  assert.equal(checkAnswer('day', sun).correct, true);
  assert.equal(checkAnswer('SUN', sun).correct, true);
  assert.equal(checkAnswer('moon', sun).correct, false);
  assert.equal(checkAnswer('   ', sun).correct, false);
});

test('checkAnswer forgives one typo on long words only', () => {
  assert.deepEqual(checkAnswer('electricty', elec), { correct: true, matched: 'electricity', typo: true });
  assert.equal(checkAnswer('dat', sun).correct, false);
  assert.equal(checkAnswer('electrcty', elec).correct, false);
});

const pool = Array.from({ length: 30 }, (_, i) => ({ kanji: `k${i}`, meanings: [`m${i}`] }));

test('buildChoices returns one correct answer and unique meanings', () => {
  const choices = buildChoices(pool[0], pool, 10);
  assert.equal(choices.length, 10);
  assert.equal(choices.filter((c) => c.correct).length, 1);
  assert.equal(new Set(choices.map((c) => c.label)).size, 10);
});

test('buildChoices skips distractors that share a meaning', () => {
  const word = { kanji: '語', meanings: ['language', 'word'] };
  const say = { kanji: '言', meanings: ['say', 'word'] };
  for (let i = 0; i < 20; i++) {
    const choices = buildChoices(word, [word, say, ...pool], 10);
    assert.ok(!choices.some((c) => c.kanji === '言'));
  }
});

test('buildChoices honours the requested number of choices', () => {
  for (const count of [2, 4, 7, 12]) {
    assert.equal(buildChoices(pool[0], pool, count).length, count);
  }
});

const high = { kanji: '高', meanings: ['tall'], on: ['コウ'], kun: ['たか.い'] };
const school = { kanji: '校', meanings: ['school'], on: ['コウ'], kun: [] };
const kanaPool = Array.from({ length: 30 }, (_, i) => ({
  kanji: `k${i}`, meanings: [`m${i}`], on: [`ア${'イ'.repeat(i)}`], kun: [],
}));

test('kanaLabel shows the main on and kun reading', () => {
  assert.equal(kanaLabel(high), 'コウ・たか(い)');
  assert.equal(kanaLabel(school), 'コウ');
  assert.equal(kanaLabel({ on: [], kun: ['-び'] }), 'び');
});

test('kana choices never repeat a reading of the answer', () => {
  for (let i = 0; i < 20; i++) {
    const choices = buildChoices(high, [high, school, ...kanaPool], 6, 'kana');
    assert.equal(choices.length, 6);
    assert.ok(!choices.some((c) => c.kanji === '校'));
    assert.equal(choices.find((c) => c.correct).label, 'コウ・たか(い)');
  }
});

test('toHiragana converts katakana only', () => {
  assert.equal(toHiragana('コウ・たか'), 'こう・たか');
});

test('buildChoices copes with fewer kanji than choices', () => {
  assert.equal(buildChoices(pool[0], pool.slice(0, 4), 10).length, 4);
});

test('pickNext avoids recently shown kanji', () => {
  const recent = pool.slice(0, 5).map((k) => k.kanji);
  for (let i = 0; i < 50; i++) {
    assert.ok(!recent.includes(pickNext(pool, recent).kanji));
  }
});

test('pickNext still returns something from a tiny pool', () => {
  assert.equal(pickNext([pool[0]], ['k0']), pool[0]);
  assert.equal(pickNext([pool[0], pool[1]], ['k0']), pool[1]);
  assert.equal(pickNext([], []), null);
});

test('formatKun shows okurigana in brackets', () => {
  assert.equal(formatKun('あたら.しい'), 'あたら(しい)');
  assert.equal(formatKun('やま'), 'やま');
});
