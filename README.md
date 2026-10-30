# KanjiLearn

A small, free, ad-free kanji quiz for your phone.

- Covers the **JLPT N5 and N4** kanji (247 in all). Pick which levels to practise in the ☰ menu.
- A kanji is shown. You answer either by **multiple choice** or by **typing its meaning**. For multiple choice you choose **how many options** (2–12) and whether they show the **English meaning** or the **kana reading**.
- After answering you see the meanings, on/kun readings, a note on **where the kanji came from**, and a random **example sentence** (with a kana reading and a translation). Tap "Another example" for a different one.
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
data/kanji.json       the kanji, origins and example sentences
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

Updates: after you push a change, the app picks it up the next time it's opened (the time after that if it was already open).

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
- `level` is the JLPT level (`N5` or `N4`) from Jonathan Waller's lists, which Jisho.org also uses. 耳 is the one exception: it is listed under N3 there but was on the old official Level 4 list, so it stays with the N4 set.
- With kana choices, the button shows the first on reading and the first kun reading, so put the most common ones first.
- In kun readings, `.` separates the okurigana (`あ.く` is shown as `あ(く)`).
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
