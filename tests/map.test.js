import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCK_COLS, BLOCK_ROWS, EMPTY, layoutMap, placeChoices, TILE } from '../js/map.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const kanji = read('../data/kanji.json').map((k) => k.kanji);
const map = read('../data/map.json');
const layout = layoutMap(map);

test('every kanji has exactly one home on the map', () => {
  const placed = map.districts.flatMap((d) => d.rows.flatMap((r) => [...r])).filter((c) => c !== EMPTY);
  assert.equal(new Set(placed).size, placed.length, 'a kanji is placed twice');
  assert.deepEqual([...placed].sort(), [...kanji].sort());
});

test('districts fit their block and never share a grid cell', () => {
  const cells = new Set();
  for (const d of map.districts) {
    assert.ok(d.rows.length <= BLOCK_ROWS, `${d.id} has too many rows`);
    for (const r of d.rows) assert.ok([...r].length <= BLOCK_COLS, `${d.id} row "${r}" too long`);
    assert.ok(Number.isInteger(d.col) && Number.isInteger(d.row), d.id);
    const key = `${d.col},${d.row}`;
    assert.ok(!cells.has(key), `two districts at ${key}`);
    cells.add(key);
    assert.ok(d.name && d.landmark && d.hint, `${d.id} needs a name, landmark and hint`);
  }
  assert.equal(new Set(map.districts.map((d) => d.id)).size, map.districts.length);
});

test('tiles do not overlap and stay inside the world', () => {
  const spots = new Set();
  for (const p of layout.places.values()) {
    const key = `${p.x},${p.y}`;
    assert.ok(!spots.has(key), `overlap at ${p.kanji}`);
    spots.add(key);
    assert.ok(p.x >= p.district.x && p.x + TILE <= p.district.x + p.district.w, p.kanji);
    assert.ok(p.y >= p.district.y && p.y + TILE <= p.district.y + p.district.h, p.kanji);
    assert.ok(p.x + TILE <= layout.width && p.y + TILE <= layout.height);
  }
});

test('a kanji keeps its home when another is added to the map', () => {
  const before = layoutMap(map).places.get('海');
  const grown = structuredClone(map);
  grown.districts.find((d) => d.id === 'water').rows[1] += '泳';
  const after = layoutMap(grown).places.get('海');
  assert.deepEqual([after.x, after.y], [before.x, before.y]);
});

test('placeChoices includes the answer, mostly neighbours, no repeats', () => {
  for (let i = 0; i < 30; i++) {
    const choices = placeChoices('海', kanji, layout.places, 6);
    assert.equal(choices.length, 6);
    assert.equal(new Set(choices).size, 6);
    assert.ok(choices.includes('海'));
    const neighbours = choices.filter((c) => c !== '海' && layout.places.get(c).district.id === 'water');
    assert.ok(neighbours.length >= 2);
  }
});
