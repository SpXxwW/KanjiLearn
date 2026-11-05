import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  direction, distanceToLine, EMPTY, insidePolygon, layoutMap, PITCH, placeChoices, TILE,
} from '../js/map.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const kanji = read('../data/kanji.json').map((k) => k.kanji);
const map = read('../data/map.json');
const layout = layoutMap(map);
const f = map.features;

// Points every few px across each district's shape, in tile units.
function samples(district) {
  const out = [];
  for (const b of district.bands) {
    for (let x = b.left; x <= b.right; x += 6) {
      for (let y = b.top; y <= b.bottom; y += 6) out.push([x / PITCH, y / PITCH]);
    }
  }
  return out;
}

test('every kanji has exactly one home on the map', () => {
  const placed = map.districts.flatMap((d) => d.rows.flatMap((r) => [...r])).filter((c) => c !== EMPTY);
  assert.equal(new Set(placed).size, placed.length, 'a kanji is placed twice');
  assert.deepEqual([...placed].sort(), [...kanji].sort());
});

test('districts have a name, landmark, area and hint, and unique ids', () => {
  for (const d of map.districts) assert.ok(d.name && d.landmark && d.area && d.hint, d.id);
  assert.equal(new Set(map.districts.map((d) => d.id)).size, map.districts.length);
});

test('districts stay inside the city and apart from each other', () => {
  const margin = 12;
  for (const d of layout.districts) {
    assert.ok(d.x >= 0 && d.y >= 0 && d.x + d.w <= layout.width && d.y + d.h <= layout.height, `${d.id} outside`);
    for (const e of layout.districts) {
      if (e === d) continue;
      for (const a of d.bands) {
        for (const b of e.bands) {
          const apart = a.right + margin <= b.left || b.right + margin <= a.left
            || a.bottom + margin <= b.top || b.bottom + margin <= a.top;
          assert.ok(apart, `${d.id} touches ${e.id}`);
        }
      }
    }
  }
});

test('districts are on dry land (islands count) and off the tracks and the river', () => {
  const lines = [
    ...f.railways.map((l) => ['railway', l]),
    ...f.trams.map((l) => ['tram', l]),
    ...f.streets.map((s) => [s.name, s.points]),
    ...(f.runways ?? []).map((r) => [r.name, r.points]),
    ['river', f.river.points],
  ];
  for (const d of layout.districts) {
    for (const p of samples(d)) {
      const onIsland = f.islands.some((i) => insidePolygon(p, i.points));
      for (const lake of f.lakes) assert.ok(onIsland || !insidePolygon(p, lake.points), `${d.id} is in ${lake.name}`);
      for (const [name, line] of lines) assert.ok(distanceToLine(p, line) > 0.35, `${d.id} is on the ${name}`);
    }
  }
});

test('tiles do not overlap', () => {
  const tiles = [...layout.places.values()];
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i];
      const b = tiles[j];
      assert.ok(Math.abs(a.x - b.x) >= TILE || Math.abs(a.y - b.y) >= TILE, `${a.kanji} overlaps ${b.kanji}`);
    }
  }
});

test('a kanji keeps its home when another is added to the map', () => {
  const before = layoutMap(map).places.get('海');
  const grown = structuredClone(map);
  grown.districts.find((d) => d.id === 'water').rows.push('泳');
  const after = layoutMap(grown).places.get('海');
  assert.deepEqual([after.x, after.y], [before.x, before.y]);
});

test('thematic homes: water on the island, study at the university', () => {
  const island = f.islands[0].points;
  for (const k of '水川海洋漢注') {
    const p = layout.places.get(k);
    assert.ok(insidePolygon([(p.x + TILE / 2) / PITCH, (p.y + TILE / 2) / PITCH], island), k);
  }
  for (const k of '学校教習試験問答') assert.equal(layout.places.get(k).district.id, 'study', k);
});

test('direction names the compass point from one home to another', () => {
  const p = (x, y) => ({ x, y });
  assert.equal(direction(p(0, 0), p(100, 0)), 'east');
  assert.equal(direction(p(0, 0), p(0, -100)), 'north');
  assert.equal(direction(p(0, 0), p(-100, 100)), 'south-west');
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
