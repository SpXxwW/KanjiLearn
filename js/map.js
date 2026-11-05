// Pure kanji-map logic: where each kanji lives and what to ask about it.
// No DOM here so it can be unit-tested with `node --test`.
//
// data/map.json describes a city loosely shaped like Tampere: lakes, the
// rapids, the railway, tram lines and districts. Everything is measured in
// tiles; one tile is PITCH pixels. A district sits at (x, y) and holds its
// kanji in rows, so a kanji's home never moves unless the file is edited.

export const TILE = 52;
export const GAP = 6;
export const PITCH = TILE + GAP;
export const PAD = 10;
export const HEADER = 34;

export const EMPTY = '・';

// First and last filled spot of a row ("・・水川" -> [2, 3]), or null.
function span(row) {
  const chars = [...row];
  const first = chars.findIndex((c) => c !== EMPTY);
  if (first < 0) return null;
  let last = chars.length - 1;
  while (chars[last] === EMPTY) last--;
  return [first, last];
}

// Outline of a district: one band per row, as wide as that row's tiles, so
// every district gets its own silhouette. Points go down the right side and
// back up the left.
function outline(ox, oy, rows) {
  const bands = rows.map((row, r) => {
    const s = span(row) ?? [0, 0];
    const top = r === 0 ? oy : oy + HEADER + r * PITCH - GAP / 2;
    const bottom = r === rows.length - 1 ? oy + HEADER + (r + 1) * PITCH - GAP + PAD : oy + HEADER + (r + 1) * PITCH - GAP / 2;
    return { left: ox + s[0] * PITCH, right: ox + PAD * 2 + (s[1] + 1) * PITCH - GAP, top, bottom };
  });
  const right = bands.flatMap((b) => [[b.right, b.top], [b.right, b.bottom]]);
  const left = [...bands].reverse().flatMap((b) => [[b.left, b.bottom], [b.left, b.top]]);
  return { points: [...right, ...left], bands };
}

// map.json -> { districts, places, width, height }. places maps each kanji to
// { kanji, district, x, y } where x, y is the top-left of its tile in px.
export function layoutMap(map) {
  const places = new Map();
  const districts = map.districts.map((d) => {
    const x = d.x * PITCH;
    const y = d.y * PITCH;
    const { points, bands } = outline(x, y, d.rows);
    const district = {
      ...d,
      x,
      y,
      w: Math.max(...bands.map((b) => b.right)) - x,
      h: bands[bands.length - 1].bottom - y,
      outline: points,
      bands,
    };
    d.rows.forEach((row, r) => {
      [...row].forEach((kanji, c) => {
        if (kanji === EMPTY) return;
        places.set(kanji, {
          kanji,
          district,
          col: c,
          row: r,
          x: x + PAD + c * PITCH,
          y: y + HEADER + r * PITCH,
        });
      });
    });
    return district;
  });
  return { districts, places, width: map.width * PITCH, height: map.height * PITCH };
}

export function tileCenter(place) {
  return { x: place.x + TILE / 2, y: place.y + TILE / 2 };
}

// Distance between two homes counted in tiles, used to say how far off a
// guess was.
export function distanceInTiles(a, b) {
  const ca = tileCenter(a);
  const cb = tileCenter(b);
  return Math.round(Math.hypot(ca.x - cb.x, ca.y - cb.y) / PITCH);
}

// Compass direction from one home to another ("north-east"), so a wrong
// guess can say which way to go.
export function direction(from, to) {
  const a = tileCenter(from);
  const b = tileCenter(to);
  const angle = (Math.atan2(a.y - b.y, b.x - a.x) * 180) / Math.PI; // 0 = east, 90 = north
  const names = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  return names[(Math.round(angle / 45) + 8) % 8];
}

// ---- Geometry (in tile units), used by the tests to keep homes on dry land
// and off the tracks.

export function insidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distanceToLine([x, y], line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1];
    const [x2, y2] = line[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Choices for "What lives here?": the right kanji plus kanji from the same
// district first (place is what tells them apart), then from anywhere in
// `pool`. Returns kanji characters in random order.
export function placeChoices(answer, pool, places, count = 6, rng = Math.random) {
  const home = places.get(answer).district.id;
  const others = pool.filter((k) => k !== answer && places.has(k));
  const near = shuffle(others.filter((k) => places.get(k).district.id === home), rng);
  const far = shuffle(others.filter((k) => places.get(k).district.id !== home), rng);
  const picked = [...near.slice(0, Math.ceil((count - 1) / 2)), ...far].slice(0, count - 1);
  return shuffle([answer, ...picked], rng);
}
