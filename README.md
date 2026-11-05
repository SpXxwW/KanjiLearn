# KanjiLearn

A small, free, ad-free kanji quiz for your phone.

- Covers **1,965 kanji**: every JLPT N5 and N4 kanji, and every Jōyō (official everyday-use) kanji on the N3, N2 and N1 lists. Rare N1 kanji used mostly in names (伊, 彦, 智…) are left out. Pick which levels to practise in the ☰ menu; new installs start with N5 and N4.
- A kanji is shown. You answer either by **multiple choice** or by **typing its meaning**. For multiple choice you choose **how many options** (2–12) and whether they show the **English meaning** or the **kana reading**.
- After answering you see the meanings, on/kun readings, a note on **where the kanji came from**, and a random **example sentence** (with a kana reading and a translation). Tap "Another example" for a different one.
- **Draw it** mode: you're shown the meaning and reading and draw the kanji with your finger, one stroke at a time. Each stroke is checked for place, shape, direction and order. After two misses on a stroke (or when you tap "Show next stroke") a faint guide shows where it goes.
- **Watch the path**: every answer shows the kanji with numbered strokes. Tap ▶ and a dot traces it in order, with a dotted line where the pen moves between strokes, so each kanji can be remembered as one continuous path (like the pattern of a PIN on a keypad).
- **Kanji map** (🗺️ button): a lakeside city, loosely shaped like Tampere, where every kanji has a fixed home. The N5 and N4 kanji live in the city centre; the N3–N1 kanji live out in the suburbs, grouped by radical. Näsijärvi is to the north and Pyhäjärvi to the south, with the Tammerkoski rapids running between them. The Pyynikki ridge is to the west, the railway runs north–south through the station, and the tram runs along Hämeenkatu out to Hervanta. Districts sit where their theme belongs: water kanji on an island in the lake, animals at the Särkänniemi zoo, study kanji at the University, sickness at the Hospital, running at the Ratina stadium, numbers at the Hervanta tech campus. Others group kanji that share a part, like Gates (門) or Words (言). The suburbs follow the same idea, one theme per radical:
  - *Lielahti* (west shore of Näsijärvi): 氵 water in the Harbour, Marina, Beach and Pier; 糸 thread at the old mill.
  - *Teivo* (racetrack, far west): 馬 horses, 足 and 走 feet, 車 carts, 力 strength, 刂 blades and weapons.
  - *Tesoma*: 亻 people, 女 women, 子 children, 衣 and 巾 cloth.
  - *Airport* (Pirkkala, south of Pyhäjärvi): 辶 roads and 彳 going, 羽 wings and 鳥 birds, and the weather station with 日, 月 and ⻗ rain.
  - *Pirkkala fields*: 艹 plants, 禾 and 米 grain, 田 and 土 fields, animals, 酉 the brewery.
  - *Hervanta*: 言 words at the campus library, 金 metals in the lab, 石 and 火 at the quarry, 宀 and 門 homes in the blocks, 貝 money at the mall, 口 mouths on the plaza.
  - *Kauppi*: 木 trees in the forest, ⺮ bamboo, and the body (⺼, 目, 頁, 疒) at the hospital.
  - *Messukylä*: 心 and 忄 feelings around the old church, 礻 shrines.
  - *Rantaperkiö*: 扌 hands at the works, 阝 hills.
  - Kanji whose radical has no theme live in "odds and ends" districts sorted by stroke count (e.g. *2–4 strokes*), spread over the suburbs.

  Inside each suburb district, N3 kanji come first, then N2, then N1. Each district has its own shape and colour. Three modes:
  - *Explore*: drag, pinch or zoom, and tap a kanji to see it, watch its path or draw it.
  - *Find it*: a kanji is shown, the map is blank, and you tap where it lives. If you're wrong, an arrow shows the route from your guess to its real home.
  - *What's here?*: a blank spot is marked and you pick (or draw) the kanji that lives there.
- **Mark as learned** and the kanji won't be asked again. Unmark it any time from the ☰ menu.
- Works offline and keeps your progress on the device. No account or server.

## Stack

A plain **Progressive Web App**: HTML, CSS and vanilla JavaScript with no framework and no build step.

- It runs on Android and iPhone from the same code.
- "Add to Home Screen" gives it an icon and opens it full-screen like a normal app.
- A service worker (`sw.js`) caches everything, so it works with no connection.
- Hosting is free on GitHub Pages, and there's no app store.

```
index.html            page structure
css/style.css         styles (light + dark mode)
js/app.js             screens and buttons
js/quiz.js            quiz logic: answer checking, choices, picking the next kanji
js/storage.js         saves learned kanji + settings in localStorage
js/strokes.js         stroke paths -> points, and checking a drawn stroke
js/tracer.js          draw pad and "watch the path" animation
js/map.js             kanji map layout (where each kanji lives)
js/city.js            draws the city: lakes, rapids, railway, tram, districts
js/mapscreen.js       the map screen: pan/zoom, explore and the map quizzes
data/kanji.json       the kanji, origins and example sentences
data/strokes.json     stroke paths from KanjiVG (built by tools/build_strokes.py)
data/map.json         the kanji city: scenery, districts and each kanji's spot
sw.js                 offline cache
manifest.webmanifest  home-screen app settings
tests/                node tests for the logic and the data file
tools/check_data.py   checks the data against real dictionaries (see below)
```

## Run it locally

```sh
npm start            # serves on http://localhost:8080
npm test             # runs the tests (Node 18+)
```

Any static file server works, e.g. `python3 -m http.server 8080`. Opening `index.html` directly as a file won't work, because browsers block loading the data file that way.

## Put it on your phone

1. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick `main` and `/ (root)`.
2. After a minute it's live at `https://<your-username>.github.io/KanjiLearn/`.
3. Open that link on your phone:
   - **Android (Chrome):** ⋮ menu → *Add to Home screen* / *Install app*.
   - **iPhone (Safari):** Share button → *Add to Home Screen*.

On iPhone, use the home-screen version. Safari can clear saved data for websites you haven't visited in a while, but apps added to the home screen keep it.

Updates: after you push a change (and GitHub Pages has deployed it, about a minute), the app finds the new version the next time it's opened and reloads itself onto it within a few seconds. If you're in the middle of a quiz it shows a "Reload" button instead. When releasing, bump `CACHE` in `sw.js` (e.g. `kanjilearn-v5` → `v6`); that's what tells installed apps there's a new version.

## Adding kanji

Add an object to `data/kanji.json`:

```json
{
  "kanji": "空",
  "level": "N4",
  "meanings": ["sky", "empty"],
  "on": ["クウ"],
  "kun": ["そら", "から", "あ.く"],
  "origin": "穴 (hole) + 工 (sound)...",
  "examples": [
    { "jp": "空が青いです。", "kana": "そらがあおいです。", "en": "The sky is blue." },
    { "jp": "...", "kana": "...", "en": "..." }
  ]
}
```

- `meanings[0]` is the main meaning, and the first two appear on the multiple-choice button. Typing any meaning counts as correct.
- `level` is the JLPT level (`N5`–`N1`) from Jonathan Waller's lists, which Jisho.org also uses. 耳 is the one exception: it is listed under N3 there but was on the old official Level 4 list, so it stays with the N4 set.
- With kana choices, the button shows the first on reading and the first kun reading, so put the most common ones first.
- In kun readings, `.` separates the okurigana (`あ.く` is shown as `あ(く)`).
- Run `python3 tools/build_strokes.py` to fetch its stroke paths from KanjiVG into `data/strokes.json`.
- Give it a home in `data/map.json`: add it to the end of a row, or as a new row, in a fitting district. Don't move kanji that are already placed; their place is what you've memorised. `npm test` checks that every district stays on dry land, off the tracks and the river, and clear of its neighbours. If a district grows into something, move the whole district (its `x`, `y`), never single kanji.
- On/kun readings for the N3–N1 kanji follow the official Jōyō table (rare readings last). Each example's kana line was generated with MeCab + UniDic and then checked by hand; single-kanji words MeCab tends to misread (米, 箱, 額…) were fixed.
- Then run `npm test`. It checks for duplicates, readings in the wrong script, examples that don't contain the kanji, kanji left in the kana line, and so on.

### Checking against dictionaries

`tools/check_data.py` compares the data with dictionaries instead of trusting it:

- every on/kun reading and meaning against **KANJIDIC2**, the kanji dictionary behind Jisho.org's kanji pages;
- every level against Waller's JLPT lists;
- every example's kana line against the reading of the Japanese line from **MeCab + UniDic**, plus **JMdict** (Jisho.org's word dictionary) for each word.

```sh
python3 -m venv .venv
.venv/bin/pip install jamdict jamdict-data fugashi unidic-lite
curl -o .venv/kanji-data.json https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json
.venv/bin/python tools/check_data.py
```

It prints anything that doesn't match for a person to look at. Some hits are fine (a sentence can have two valid readings), so it is a review aid, not a test. It takes several minutes.

Origin notes follow commonly cited etymologies. Where scholars disagree or a popular explanation is only a memory aid, the note says so.

## Credits

Readings, meanings and component notes for the N3–N1 kanji were checked against [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) (EDRDG licence) and [Kanjium](https://github.com/mifunetoshiro/kanjium) (CC BY-SA 4.0); the origin notes and example sentences are written for this app.

Stroke paths come from [KanjiVG](https://kanjivg.tagaini.net) by Ulrich Apel and contributors, under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). `data/strokes.json` is a derived work under the same licence.
