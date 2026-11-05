// Pure stroke logic: turning KanjiVG paths into points and checking whether a
// stroke drawn by finger matches the expected one. No DOM, so it can be
// unit-tested with `node --test`. Coordinates are in KanjiVG's 109x109 box.

export const BOX = 109;

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

function cubic(p0, p1, p2, p3, steps, out) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
}

// SVG path string -> list of points along it. Handles the commands KanjiVG
// uses (M, L, C, S, H, V, Z and their lowercase forms); curves are flattened.
export function parsePath(d, steps = 8) {
  const points = [];
  let pos = { x: 0, y: 0 };
  let start = pos;
  let lastControl = null;
  for (const [, cmd, args] of d.matchAll(/([MLCSHVZmlcshvz])([^MLCSHVZmlcshvz]*)/g)) {
    const nums = (args.match(NUMBER) || []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const at = (x, y) => (rel ? { x: pos.x + x, y: pos.y + y } : { x, y });
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      points.push(start);
      pos = start;
      lastControl = null;
      continue;
    }
    const size = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4 }[C];
    for (let i = 0; i + size <= nums.length; i += size) {
      const n = nums.slice(i, i + size);
      let next = pos;
      if (C === 'M' && i === 0) {
        next = at(n[0], n[1]);
        start = next;
        points.push(next);
        lastControl = null;
      } else if (C === 'M' || C === 'L') {
        next = at(n[0], n[1]);
        points.push(next);
        lastControl = null;
      } else if (C === 'H') {
        next = { x: rel ? pos.x + n[0] : n[0], y: pos.y };
        points.push(next);
        lastControl = null;
      } else if (C === 'V') {
        next = { x: pos.x, y: rel ? pos.y + n[0] : n[0] };
        points.push(next);
        lastControl = null;
      } else if (C === 'C') {
        const c1 = at(n[0], n[1]);
        const c2 = at(n[2], n[3]);
        next = at(n[4], n[5]);
        cubic(pos, c1, c2, next, steps, points);
        lastControl = c2;
      } else if (C === 'S') {
        const c1 = lastControl ? { x: 2 * pos.x - lastControl.x, y: 2 * pos.y - lastControl.y } : pos;
        const c2 = at(n[0], n[1]);
        next = at(n[2], n[3]);
        cubic(pos, c1, c2, next, steps, points);
        lastControl = c2;
      }
      pos = next;
    }
  }
  return points;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

// `count` points spread evenly along the line, so two strokes drawn at
// different speeds can be compared point by point.
export function resample(points, count = 24) {
  if (points.length === 0) return [];
  const total = pathLength(points);
  if (total === 0) return Array.from({ length: count }, () => ({ ...points[0] }));
  const step = total / (count - 1);
  const out = [{ ...points[0] }];
  let carried = 0;
  for (let i = 1; i < points.length && out.length < count; i++) {
    let a = points[i - 1];
    const b = points[i];
    let seg = dist(a, b);
    while (carried + seg >= step && out.length < count) {
      const t = (step - carried) / seg;
      a = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      out.push(a);
      seg = dist(a, b);
      carried = 0;
    }
    carried += seg;
  }
  while (out.length < count) out.push({ ...points[points.length - 1] });
  return out;
}

function meanDistance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += dist(a[i], b[i]);
  return total / a.length;
}

// How far off a drawn stroke may be (in the 109 box) and still count. Long
// strokes get a little more room, because a finger wobbles more over them.
export function tolerance(expectedLength) {
  return Math.min(13 + expectedLength * 0.1, 21);
}

// Does the finger stroke `drawn` match `expected` (both lists of points)?
// It has to be in the right place, have the right shape and go in the right
// direction. Returns { ok, reason } where reason explains a miss.
export function matchStroke(drawn, expected) {
  const expLen = pathLength(expected);
  const drawnLen = pathLength(drawn);
  if (drawn.length < 2 || drawnLen < Math.min(4, expLen * 0.5)) return { ok: false, reason: 'short' };

  const a = resample(drawn);
  const b = resample(expected);
  const forward = meanDistance(a, b);
  const backward = meanDistance([...a].reverse(), b);
  const limit = tolerance(expLen);

  // Small strokes (dots, ticks) are hard to draw with a precise shape, so
  // for them place and direction are enough.
  const small = expLen < 15;
  const ratio = drawnLen / Math.max(expLen, 1);
  if (!small && (ratio < 0.45 || ratio > 2.2)) return { ok: false, reason: forward < limit * 1.6 ? 'length' : 'place' };
  if (backward + 2 < forward && backward < limit) return { ok: false, reason: 'direction' };
  if (forward > (small ? limit + 6 : limit)) return { ok: false, reason: 'place' };
  return { ok: true, reason: null };
}

// Check the stroke drawn when stroke number `index` (0-based) is due. Besides
// matchStroke, it catches strokes drawn out of order: if the drawn line is
// clearly closer to a later stroke than to the one due, it is that later
// stroke, drawn too early.
export function checkNextStroke(drawn, strokes, index) {
  const result = matchStroke(drawn, strokes[index]);
  if (!result.ok) return result;
  const a = resample(drawn);
  const due = meanDistance(a, resample(strokes[index]));
  for (let j = index + 1; j < strokes.length; j++) {
    const other = meanDistance(a, resample(strokes[j]));
    if (other + 3.5 < due) return { ok: false, reason: 'order' };
  }
  return result;
}

// Point lists for each stroke of a kanji, from its KanjiVG path strings.
export function strokePoints(paths) {
  return paths.map((d) => parsePath(d));
}
