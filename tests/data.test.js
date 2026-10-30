// Sanity checks for data/kanji.json, so mistakes are caught when adding kanji.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChoices, normalize } from '../js/quiz.js';
import { LEVELS } from '../js/storage.js';

const kanji = JSON.parse(readFileSync(new URL('../data/kanji.json', import.meta.url), 'utf8'));

const KANJI_CHAR = /\p{Script=Han}/u;
const KATAKANA = /^[゠-ヿ]+$/u;
const HIRAGANA_READING = /^-?[぀-ゟ]+(\.[぀-ゟ]+)?-?$/u;

test('has entries', () => {
  assert.ok(kanji.length >= 50);
});

test('every kanji appears once', () => {
  const seen = new Set();
  for (const k of kanji) {
    assert.ok(!seen.has(k.kanji), `duplicate ${k.kanji}`);
    seen.add(k.kanji);
  }
});

test('the label shown as a choice is unique for each kanji', () => {
  const seen = new Map();
  for (const k of kanji) {
    const key = normalize(k.meanings[0]);
    assert.ok(!seen.has(key), `${k.kanji} and ${seen.get(key)} both have main meaning "${key}"`);
    seen.set(key, k.kanji);
  }
});

test('kana choices for every kanji have distinct labels', () => {
  for (const k of kanji) {
    const labels = buildChoices(k, kanji, 12, 'kana').map((c) => c.label);
    assert.equal(new Set(labels).size, labels.length, `${k.kanji}: ${labels}`);
  }
});

for (const k of kanji) {
  test(`entry ${k.kanji} is well-formed`, () => {
    assert.equal([...k.kanji].length, 1, 'kanji is a single character');
    assert.ok(KANJI_CHAR.test(k.kanji), 'kanji is a Han character');
    assert.ok(LEVELS.includes(k.level), `level is one of ${LEVELS}`);
    assert.ok(k.meanings.length > 0 && k.meanings.every((m) => normalize(m)), 'has meanings');
    assert.ok(k.on.every((r) => KATAKANA.test(r)), `on'yomi in katakana: ${k.on}`);
    assert.ok(k.kun.every((r) => HIRAGANA_READING.test(r)), `kun'yomi in hiragana: ${k.kun}`);
    assert.ok(k.on.length + k.kun.length > 0, 'has a reading');
    assert.ok(k.origin.length > 20, 'has an origin note');
    assert.ok(k.examples.length >= 2, 'has at least two examples');
    for (const ex of k.examples) {
      assert.ok(ex.jp.includes(k.kanji), `example uses the kanji: ${ex.jp}`);
      assert.ok(!KANJI_CHAR.test(ex.kana), `kana line has no kanji: ${ex.kana}`);
      assert.ok(ex.en.length > 0, `example has a translation: ${ex.jp}`);
    }
  });
}
