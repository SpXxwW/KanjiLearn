"""Check data/kanji.json against real dictionaries (not just its own format).

  - Readings and meanings are compared with KANJIDIC2, the kanji dictionary
    behind Jisho.org's kanji pages (EDRDG, via the jamdict-data package).
  - JLPT levels are compared with Jonathan Waller's N5-N1 lists (the lists
    Jisho.org and most study sites use), from the kanji-data project.
  - Each example's kana line is compared with the reading MeCab + UniDic
    (NINJAL's dictionary) gives for the Japanese line, and every word with a
    kanji in it is looked up in JMdict, the dictionary behind Jisho.org's
    word search.

Anything flagged is something for a person to look at, not automatically
wrong: a sentence can have more than one valid reading.

Setup (once):
  python3 -m venv .venv
  .venv/bin/pip install jamdict jamdict-data fugashi unidic-lite
  curl -o .venv/kanji-data.json \
    https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json
Run:
  .venv/bin/python tools/check_data.py [path/to/kanji-data.json]
"""

import json
import re
import sys
from functools import lru_cache
from pathlib import Path

import fugashi
from jamdict import Jamdict

ROOT = Path(__file__).resolve().parent.parent
LEVELS_FILE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.venv' / 'kanji-data.json'

KANJI = re.compile(r'[㐀-鿿々]')
NOT_KANA = re.compile(r'[^ぁ-ゖー]')


def hira(text):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in text)


def kana_only(text):
    return NOT_KANA.sub('', hira(text))


jam = Jamdict()
tagger = fugashi.Tagger()
levels = json.loads(LEVELS_FILE.read_text()) if LEVELS_FILE.exists() else None
problems = 0


def flag(kanji, message):
    global problems
    problems += 1
    print(f'{kanji}: {message}', flush=True)


def kanjidic(kanji):
    char = jam.lookup(kanji).chars[0]
    on, kun, meanings = set(), set(), []
    for group in char.rm_groups:
        for r in group.readings:
            if r.r_type == 'ja_on':
                on.add(r.value)
            elif r.r_type == 'ja_kun':
                kun.add(r.value)
        meanings += [m.value.lower() for m in group.meanings if m.m_lang in ('', 'en')]
    return on, kun, meanings


@lru_cache(maxsize=None)
def word_glosses(kanji):
    """English glosses of JMdict words written with just this kanji, or with
    this kanji plus kana (e.g. 行く for 行)."""
    glosses = []
    for entry in jam.lookup(f'{kanji}%', strict_lookup=True).entries:
        if any(k.text == kanji or re.fullmatch(f'{kanji}[ぁ-ゖ]+', k.text) for k in entry.kanji_forms):
            for sense in entry.senses:
                glosses += [re.sub(r'^to ', '', g.text.lower()) for g in sense.gloss]
    return glosses


def matches_gloss(meaning, gloss):
    return meaning == gloss or re.search(rf'\b{re.escape(meaning)}\b', gloss)


@lru_cache(maxsize=None)
def word_readings(surface, lemma):
    """JMdict readings for a word as written here. Inflected words ("買い")
    are looked up by their dictionary form ("買う") and the ending swapped."""
    readings = set()
    for form in {surface, lemma}:
        if not form or not KANJI.search(form):
            continue
        # Kana ending of the dictionary form, e.g. "う" in 買う.
        stem_len = len(form.rstrip('ぁ-ゖ'))
        if form != surface and surface[:stem_len] != form[:stem_len]:
            continue
        ending = form[stem_len:]
        for entry in jam.lookup(form, strict_lookup=True).entries:
            if not any(k.text == form for k in entry.kanji_forms):
                continue
            for kana in entry.kana_forms:
                r = kana.text
                if ending and not r.endswith(ending):
                    continue
                readings.add(r[:len(r) - len(ending)] + surface[stem_len:])
    return {kana_only(r) for r in readings}


def lattice(sentence, n=30):
    """Every (start, end, kana) piece from MeCab's n best parses and JMdict."""
    pieces = set()
    for parse in tagger.nbestToNodeList(sentence, n):
        pos = 0
        for w in parse:
            start = sentence.index(w.surface, pos)
            end = start + len(w.surface)
            pos = end
            lemma = re.sub(r'-.*', '', w.feature.orthBase or w.feature.lemma or '')
            options = {kana_only(w.feature.kana or w.surface)} | word_readings(w.surface, lemma)
            if not KANJI.search(w.surface):
                options.add(kana_only(w.surface))
            pieces |= {(start, end, o) for o in options}
    return pieces


def reading_matches(sentence, kana):
    """Can the kana line be spelled out by a path through the lattice?"""
    pieces = lattice(sentence)
    reachable = {(0, 0)}  # (position in sentence, position in kana)
    frontier = [(0, 0)]
    while frontier:
        i, j = frontier.pop()
        if i == len(sentence) and j == len(kana):
            return True
        for start, end, r in pieces:
            if start == i and kana.startswith(r, j) and (end, j + len(r)) not in reachable:
                reachable.add((end, j + len(r)))
                frontier.append((end, j + len(r)))
    return False


def unknown_words(sentence):
    """Words containing a kanji that JMdict doesn't have (as written or as lemma)."""
    missing = []
    for word in tagger(sentence):
        if not KANJI.search(word.surface) or word.feature.pos2 == '固有名詞':
            continue  # names (山田, 田中) are in JMnedict, not JMdict
        lemma = re.sub(r'-.*', '', word.feature.lemma or '')
        found = any(
            jam.lookup(form, strict_lookup=True).entries
            for form in {word.surface, lemma, word.feature.orthBase or ''} if form
        )
        if not found:
            missing.append(word.surface)
    return missing


data = json.loads((ROOT / 'data' / 'kanji.json').read_text())
for k in data:
    c = k['kanji']
    on, kun, meanings = kanjidic(c)
    on = {r.strip('-') for r in on}
    kun = {r.strip('-') for r in kun}
    for r in k['on']:
        if r not in on:
            flag(c, f'on reading {r} not in KANJIDIC2 ({"、".join(sorted(on))})')
    for r in k['kun']:
        if r.strip('-') not in kun:
            flag(c, f'kun reading {r} not in KANJIDIC2 ({"、".join(sorted(kun))})')
    for m in k['meanings']:
        m_low = m.lower()
        if not any(matches_gloss(m_low, g) for g in meanings) and \
                not any(matches_gloss(m_low, g) for g in word_glosses(c)):
            flag(c, f'meaning "{m}" not in KANJIDIC2/JMdict ({"; ".join(meanings)})')
    if levels:
        expected = levels.get(c, {}).get('jlpt_new')
        if expected and k.get('level') != f'N{expected}':
            flag(c, f'level {k.get("level")}, Waller list says N{expected}')
    for ex in k['examples']:
        if not reading_matches(ex['jp'], kana_only(ex['kana'])):
            best = kana_only(''.join(w.feature.kana or w.surface for w in tagger(ex['jp'])))
            flag(c, f'kana line may not match: {ex["jp"]} / {ex["kana"]} (MeCab: {best})')
        for word in unknown_words(ex['jp']):
            flag(c, f'"{word}" not found in JMdict: {ex["jp"]}')

print(f'\n{len(data)} kanji checked, {problems} things to look at.')
