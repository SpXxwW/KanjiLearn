import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkNextStroke, matchStroke, parsePath, pathLength, resample, strokePoints } from '../js/strokes.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const kanji = read('../data/kanji.json');
const { strokes } = read('../data/strokes.json');

test('every kanji has stroke paths', () => {
  for (const k of kanji) {
    assert.ok(Array.isArray(strokes[k.kanji]) && strokes[k.kanji].length > 0, `no strokes for ${k.kanji}`);
  }
  assert.deepEqual(Object.keys(strokes).sort(), kanji.map((k) => k.kanji).sort());
});

test('parsePath reads absolute and relative curves', () => {
  const pts = parsePath('M10,10c0,10,10,10,10,0');
  assert.deepEqual(pts[0], { x: 10, y: 10 });
  const end = pts[pts.length - 1];
  assert.ok(Math.abs(end.x - 20) < 1e-9 && Math.abs(end.y - 10) < 1e-9);
  // KanjiVG writes numbers without separators before a minus: "1.5-2"
  const line = parsePath('M0,0L10-5');
  assert.deepEqual(line[1], { x: 10, y: -5 });
});

test('every stroke parses to points inside the box', () => {
  for (const [k, paths] of Object.entries(strokes)) {
    for (const pts of strokePoints(paths)) {
      assert.ok(pts.length > 1, k);
      assert.ok(pts.every((p) => p.x > -5 && p.x < 114 && p.y > -5 && p.y < 114), `${k} out of box`);
    }
  }
});

test('resample spreads points evenly', () => {
  const pts = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 5);
  assert.equal(pts.length, 5);
  assert.ok(Math.abs(pts[2].x - 10) < 1e-9 && Math.abs(pts[2].y) < 1e-9);
  assert.ok(Math.abs(pathLength(pts) - 20) < 1e-9);
});

// Seeded wobble so the test is repeatable: a shaky, slightly shifted and
// scaled copy of each stroke, like a finger would draw it.
function wobbly(points, rng) {
  const dx = (rng() - 0.5) * 10;
  const dy = (rng() - 0.5) * 10;
  const scale = 0.9 + rng() * 0.2;
  const phase = rng() * 6;
  const [o] = points;
  return points.map((p, i) => ({
    x: o.x + (p.x - o.x) * scale + dx + 1.5 * Math.sin(i / 3 + phase),
    y: o.y + (p.y - o.y) * scale + dy + 1.5 * Math.cos(i / 4 + phase),
  }));
}

test('a shaky but correct stroke is accepted, for every stroke of every kanji', () => {
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [k, paths] of Object.entries(strokes)) {
    const pts = strokePoints(paths);
    pts.forEach((p, i) => {
      const result = checkNextStroke(wobbly(p, rng), pts, i);
      assert.ok(result.ok, `${k} stroke ${i + 1}: ${result.reason}`);
    });
  }
});

test('a long stroke drawn backwards is rejected as wrong direction', () => {
  for (const [k, paths] of Object.entries(strokes)) {
    for (const p of strokePoints(paths)) {
      if (pathLength(p) < 15) continue;
      assert.equal(matchStroke([...p].reverse(), p).ok, false, k);
    }
  }
  const [stroke] = strokePoints(strokes['一']);
  assert.equal(matchStroke([...stroke].reverse(), stroke).reason, 'direction');
});

test('drawing a later stroke first is never accepted', () => {
  for (const [k, paths] of Object.entries(strokes)) {
    const pts = strokePoints(paths);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        assert.equal(checkNextStroke(pts[j], pts, i).ok, false, `${k}: stroke ${j + 1} accepted as ${i + 1}`);
      }
    }
  }
});

test('a stroke in the wrong place is rejected', () => {
  const [top, bottom] = strokePoints(strokes['二']);
  assert.equal(matchStroke(bottom, top).ok, false);
  assert.equal(matchStroke([{ x: 50, y: 50 }, { x: 51, y: 50 }], top).ok, false);
});
