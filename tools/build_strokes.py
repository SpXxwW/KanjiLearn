"""Build data/strokes.json: the stroke paths of every kanji in data/kanji.json.

The paths come from KanjiVG (https://kanjivg.tagaini.net), one SVG per kanji,
with strokes in the correct order and drawn in the correct direction. Each
stroke is kept as its SVG path string in KanjiVG's 109x109 coordinate box.

KanjiVG is by Ulrich Apel and contributors, licensed CC BY-SA 3.0, so
data/strokes.json is under the same licence (it says so inside).

Run (needs internet the first time; files are cached in .venv/kanjivg/):
  python3 tools/build_strokes.py
Re-run it after adding kanji to data/kanji.json.
"""

import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.venv' / 'kanjivg'
OUT = ROOT / 'data' / 'strokes.json'
URL = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{}.svg'
SVG = '{http://www.w3.org/2000/svg}'


def fetch(kanji):
    name = f'{ord(kanji):05x}'
    path = CACHE / f'{name}.svg'
    if not path.exists():
        with urllib.request.urlopen(URL.format(name)) as res:
            path.write_bytes(res.read())
    return path


def strokes(svg_path):
    root = ET.parse(svg_path).getroot()
    found = []
    for el in root.iter(f'{SVG}path'):
        match = re.search(r'-s(\d+)$', el.get('id', ''))
        if match:
            found.append((int(match.group(1)), el.get('d')))
    found.sort()
    numbers = [n for n, _ in found]
    assert numbers == list(range(1, len(found) + 1)), f'{svg_path}: strokes {numbers}'
    return [d for _, d in found]


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    kanji = [k['kanji'] for k in json.loads((ROOT / 'data' / 'kanji.json').read_text())]
    with ThreadPoolExecutor(8) as pool:
        files = list(pool.map(fetch, kanji))
    data = {
        'source': 'KanjiVG (https://kanjivg.tagaini.net), by Ulrich Apel and contributors',
        'license': 'CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)',
        'viewBox': 109,
        'strokes': {k: strokes(f) for k, f in zip(kanji, files)},
    }
    lines = [f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v)}' for k, v in data['strokes'].items()]
    head = ',\n'.join(f'  {json.dumps(k)}: {json.dumps(data[k])}' for k in ('source', 'license', 'viewBox'))
    OUT.write_text('{\n' + head + ',\n  "strokes": {\n' + ',\n'.join('  ' + l for l in lines) + '\n  }\n}\n')
    print(f'wrote {OUT.relative_to(ROOT)}: {len(kanji)} kanji')


if __name__ == '__main__':
    main()
