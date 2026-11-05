// Draws the kanji city's scenery as one SVG: lakes, the rapids, the ridge,
// streets, railway, tram lines, landmarks and the district shapes. Tiles
// (the kanji themselves) are separate buttons placed on top by mapscreen.js.

import { PAD, PITCH } from './map.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent?.append(node);
  return node;
}

const px = ([x, y]) => [x * PITCH, y * PITCH];
const fmt = (n) => Math.round(n * 10) / 10;

// Smooth curve through the points (Catmull-Rom turned into cubic Béziers),
// so shorelines and tracks look drawn rather than plotted.
export function smoothPath(points, closed = false) {
  const p = points;
  const n = p.length;
  const at = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${fmt(p[0][0])},${fmt(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${fmt(c1[0])},${fmt(c1[1])},${fmt(c2[0])},${fmt(c2[1])},${fmt(p2[0])},${fmt(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

function text(parent, x, y, content, cls, extra = {}) {
  const t = el('text', { x: fmt(x), y: fmt(y), class: cls, ...extra }, parent);
  t.textContent = content;
  return t;
}

export function districtHue(index) {
  return Math.round((index * 137.5 + 20) % 360);
}

export function drawCity(map, layout) {
  const f = map.features;
  const svg = el('svg', {
    class: 'city',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    width: layout.width,
    height: layout.height,
    'aria-hidden': 'true',
  });
  el('rect', { class: 'land', width: layout.width, height: layout.height }, svg);

  for (const forest of f.forests) el('path', { class: 'forest', d: smoothPath(forest.points.map(px), true) }, svg);
  for (const lake of f.lakes) el('path', { class: 'lake', d: smoothPath(lake.points.map(px), true) }, svg);
  for (const island of f.islands) el('path', { class: 'island', d: smoothPath(island.points.map(px), true) }, svg);

  const river = smoothPath(f.river.points.map(px));
  el('path', { class: 'river', d: river }, svg);
  el('path', { class: 'rapids', d: river }, svg);

  for (const street of f.streets) {
    const d = smoothPath(street.points.map(px));
    el('path', { class: 'street-casing', d }, svg);
    el('path', { class: 'street', d }, svg);
  }
  for (const line of f.railways) {
    const d = smoothPath(line.map(px));
    el('path', { class: 'rail-bed', d }, svg);
    el('path', { class: 'rail', d }, svg);
    el('path', { class: 'rail-ties', d }, svg);
  }
  for (const line of f.trams) {
    const d = smoothPath(line.map(px));
    el('path', { class: 'tram-casing', d }, svg);
    el('path', { class: 'tram', d }, svg);
  }

  for (const label of f.labels) {
    const [x, y] = px([label.x, label.y]);
    const extra = label.rotate ? { transform: `rotate(${label.rotate} ${fmt(x)} ${fmt(y)})` } : {};
    text(svg, x, y, label.text, `label label-${label.kind}`, extra);
  }

  // Districts: an outer stroke in the edge colour, then the fill on top with
  // a same-coloured stroke, which rounds the corners of the outline.
  layout.districts.forEach((d, i) => {
    const g = el('g', { class: 'district', style: `--hue:${districtHue(i)}` }, svg);
    const points = d.outline.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
    el('polygon', { class: 'district-edge', points }, g);
    el('polygon', { class: 'district-fill', points }, g);
    const name = text(g, d.x + PAD + 2, d.y + 24, '', 'district-name');
    el('tspan', { class: 'district-mark', lang: 'ja' }, name).textContent = `${d.landmark} `;
    el('tspan', {}, name).textContent = d.name;
  });

  for (const mark of f.landmarks) {
    const [x, y] = px([mark.x, mark.y]);
    text(svg, x, y + 9, mark.icon, 'landmark-icon');
    if (mark.label) text(svg, x, y + 30, mark.label, 'label label-landmark');
  }
  return svg;
}
