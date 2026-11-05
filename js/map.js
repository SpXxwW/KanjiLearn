// Pure kanji-map logic: where each kanji lives and what to ask about it.
// No DOM here so it can be unit-tested with `node --test`.
//
// data/map.json puts every kanji in a district (a block on a city grid) and
// in a spot inside that district. Positions are worked out from that file
// alone, so a kanji's home never moves unless the file is edited.

export const TILE = 52;
export const GAP = 6;
export const PITCH = TILE + GAP;
export const BLOCK_COLS = 5;
export const BLOCK_ROWS = 3;
export const PAD = 14;
export const HEADER = 40;
export const STREET = 44;
export const BLOCK_W = PAD * 2 + BLOCK_COLS * PITCH - GAP;
export const BLOCK_H = HEADER + PAD + BLOCK_ROWS * PITCH - GAP;

export const EMPTY = '・';

// map.json -> { districts, places, width, height }. places maps each kanji to
// { kanji, district, x, y } where x, y is the top-left of its tile in px.
export function layoutMap(map) {
  const places = new Map();
  let cols = 0;
  let rows = 0;
  const districts = map.districts.map((d) => {
    const x = STREET + d.col * (BLOCK_W + STREET);
    const y = STREET + d.row * (BLOCK_H + STREET);
    cols = Math.max(cols, d.col + 1);
    rows = Math.max(rows, d.row + 1);
    const district = { ...d, x, y, w: BLOCK_W, h: BLOCK_H };
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
  return {
    districts,
    places,
    width: STREET + cols * (BLOCK_W + STREET),
    height: STREET + rows * (BLOCK_H + STREET),
  };
}

export function tileCenter(place) {
  return { x: place.x + TILE / 2, y: place.y + TILE / 2 };
}

// Distance between two homes counted in tiles, used to say how far off a
// guess was ("2 tiles away", "3 blocks away").
export function distanceInTiles(a, b) {
  const ca = tileCenter(a);
  const cb = tileCenter(b);
  return Math.round(Math.hypot(ca.x - cb.x, ca.y - cb.y) / PITCH);
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
// district first (they look alike, so place is what tells them apart), then
// from anywhere in `pool`. Returns kanji characters in random order.
export function placeChoices(answer, pool, places, count = 6, rng = Math.random) {
  const home = places.get(answer).district.id;
  const others = pool.filter((k) => k !== answer && places.has(k));
  const near = shuffle(others.filter((k) => places.get(k).district.id === home), rng);
  const far = shuffle(others.filter((k) => places.get(k).district.id !== home), rng);
  const picked = [...near.slice(0, Math.ceil((count - 1) / 2)), ...far].slice(0, count - 1);
  return shuffle([answer, ...picked], rng);
}
