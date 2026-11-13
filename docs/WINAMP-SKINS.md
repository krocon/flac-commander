# Klassische Winamp-Skins (`.wsz`): Analyse und Stand des Imports

Stand: Phase 7. Dieses Dokument beschreibt, wie klassische Skins (Winamp 2.x) aufgebaut sind, wie ihre Teile auf unser
Format abgebildet werden und was der Importer heute kann.

**Zur Herkunft der Angaben:** Dateinamen, Fenstermaße und Sprite-Positionen sind das seit Jahrzehnten öffentlich
dokumentierte Layout des Formats, hier aus dem Gedächtnis des Autors zusammengetragen. Sie sind **nicht an echten
`.wsz`-Dateien nachgemessen**: Im Repository liegt kein fremder Skin, und der Importer ist nur gegen einen im Test
selbst gezeichneten Skin geprüft, der diesem Layout folgt. Vor einem Ausbau gehört jede Zahl in der Tabelle unten an
einigen echten Skins kontrolliert ([MANUAL-TESTS.md](MANUAL-TESTS.md) K1–K4). Es ist weder Code noch Grafik aus
Winamp oder Webamp enthalten.

## 1. Aufbau eines `.wsz`

Ein ZIP-Archiv mit Dateien fester Namen (Groß-/Kleinschreibung uneinheitlich, manchmal in einem Unterordner):

| Datei | Inhalt |
| --- | --- |
| `main.bmp` | Gesicht des Hauptfensters, 275 × 116 |
| `titlebar.bmp` | Titelzeile (aktiv/inaktiv), Schließen/Minimieren/Shade, Titelzeile des „Windowshade"-Modus |
| `cbuttons.bmp` | Transport-Tasten: Zurück, Play, Pause, Stop, Vor, Auswerfen – normal und gedrückt |
| `shufrep.bmp` | Zufall, Wiederholen, Tasten für Equalizer- und Playlist-Fenster – je normal/gedrückt/an |
| `posbar.bmp` | Positionsleiste und ihr Schieber |
| `volume.bmp`, `balance.bmp` | Lautstärke und Balance: 28 Hintergrundstufen übereinander plus Schieber |
| `playpaus.bmp` | Anzeige Play/Pause/Stop im Display |
| `monoster.bmp` | Anzeige Mono/Stereo |
| `numbers.bmp` / `nums_ex.bmp` | Ziffern der Zeitanzeige |
| `text.bmp` | Bitmap-Schrift für Titel, kbps, kHz (Zeichen 5 × 6) |
| `pledit.bmp`, `pledit.txt` | Rahmen des Playlist-Fensters; Farben und Schrift der Liste als Text |
| `eqmain.bmp`, `eq_ex.bmp` | Equalizer-Fenster |
| `viscolor.txt` | 24 Farben der Visualisierung |
| `region.txt` | optionale Fensterform (Polygone) für nicht rechteckige Skins |
| `*.cur` | Mauszeiger |
| `gen.bmp`, `genex.bmp`, `mb.bmp`, `avs.bmp`, `video.bmp` | Rahmen weiterer Fenster |

Die Bitmaps sind Windows-BMP, meist 8 Bit mit Palette oder 24 Bit, unkomprimiert.

## 2. Prinzip: feste Rechtecke

Ein klassischer Skin enthält kein Layout. Jede Bedienfläche des Hauptfensters liegt an einer festen Position, und ihr
Aussehen in jedem Zustand ist ein festes Rechteck in einem der Sprite-Blätter. Ein Skin ändert nur die Pixel.

### Hauptfenster (Koordinaten im Fenster 275 × 116) und Quellen

| Element | Position, Größe | Quelle | normal | gedrückt | an |
| --- | --- | --- | --- | --- | --- |
| Zurück | 16,88 · 23 × 18 | `cbuttons.bmp` | 0,0 | 0,18 | – |
| Play | 39,88 · 23 × 18 | `cbuttons.bmp` | 23,0 | 23,18 | – |
| Pause | 62,88 · 23 × 18 | `cbuttons.bmp` | 46,0 | 46,18 | – |
| Stop | 85,88 · 23 × 18 | `cbuttons.bmp` | 69,0 | 69,18 | – |
| Vor | 108,88 · 22 × 18 | `cbuttons.bmp` | 92,0 | 92,18 | – |
| Auswerfen | 136,89 · 22 × 16 | `cbuttons.bmp` | 114,0 | 114,16 | – |
| Zufall | 164,89 · 47 × 15 | `shufrep.bmp` | 28,0 | 28,15 | 28,30 |
| Wiederholen | 211,89 · 28 × 15 | `shufrep.bmp` | 0,0 | 0,15 | 0,30 |
| Equalizer-Fenster | 219,58 · 23 × 12 | `shufrep.bmp` | 0,61 | 46,61 | 0,73 |
| Playlist-Fenster | 242,58 · 23 × 12 | `shufrep.bmp` | 23,61 | 69,61 | 23,73 |
| Positionsleiste | 16,72 · 248 × 10 | `posbar.bmp` | Leiste 0,0; Schieber 248,0 (29 × 10) | Schieber 278,0 | – |
| Lautstärke | 107,57 · 68 × 13 | `volume.bmp` | 28 Stufen je 68 × 15 untereinander | Schieber unten | – |
| Balance | 177,57 · 38 × 13 | `balance.bmp` | wie Lautstärke | | – |
| Zeit | ab 48,26 · Ziffern 9 × 13 | `numbers.bmp` | | | |
| Titel (Laufschrift) | 111,27 · 154 × 6 | `text.bmp` | | | |
| kbps / kHz | 111,43 / 156,43 | `text.bmp` | | | |
| Mono/Stereo | 212,41 / 239,41 | `monoster.bmp` | | | |
| Play/Pause-Anzeige | 26,28 · 9 × 9 | `playpaus.bmp` | | | |
| Visualisierung | 24,43 · 76 × 16 | Farben aus `viscolor.txt` | | | |

### Farben als Text

Nur `pledit.txt` nennt Farben lesbar:

```ini
[Text]
Normal=#00FF00
Current=#FFFFFF
NormalBG=#000000
SelectedBG=#0000C6
Font=Arial
```

## 3. Abbildung auf unser Format

| Klassisch | Unser Format | Stand |
| --- | --- | --- |
| `main.bmp` | `background` eines `absolute`-Layouts, 275 × 116 | ✅ umgesetzt |
| Tasten aus `cbuttons.bmp` | `button` mit `states.normal` / `pressed` | ✅ umgesetzt |
| Play und Pause als zwei Tasten | Aktionen `player.play`, `player.pause` (neu im Katalog) | ✅ umgesetzt |
| Zufall, Wiederholen aus `shufrep.bmp` | `button` mit `states.active` | ✅ umgesetzt |
| EQ-/PL-Tasten | `button` → `window.equalizer`, `window.playlist` | ✅ umgesetzt |
| Farben aus `pledit.txt` | `theme` (Text, Akzent, Hintergrund) | ✅ umgesetzt |
| Titel, Zeit | `text` / `time` an der klassischen Stelle, in der Schrift des Systems | ⚠️ ohne Bitmap-Schrift und ohne Laufschrift |
| Positionsleiste, Lautstärke | `seekbar` / `volume` an der klassischen Stelle, von der App gezeichnet | ⚠️ ohne die Bilder aus `posbar.bmp` / `volume.bmp` |
| Visualisierung | `spectrum`-Baustein an der klassischen Stelle | ⚠️ Balken in der Farbe „Current"; die 24 Farben aus `viscolor.txt` sind ungenutzt |
| Titelzeile, Schließen, Shade | – (das Fenster behält den Systemrahmen) | ❌ |
| Balance, Mono/Stereo, kbps/kHz, Play-Anzeige | – | ❌ kein Baustein dafür |
| Playlist- und Equalizer-Fenster (`pledit.bmp`, `eqmain.bmp`) | – (unsere Fenster in den Farben des Skins) | ❌ |
| `region.txt` (Fensterform) | – | ❌ rechteckig |
| Mauszeiger | – | ❌ |
| „Skin wählen" | hat kein klassisches Gegenstück | ✅ als Taste in einem 24 Pixel hohen Streifen unter dem Gesicht |

Der Importer erzeugt ein gewöhnliches Paket unseres Formats und schickt es durch dieselbe Prüfung wie jeden anderen
Skin. Im Datenordner liegt danach nur unser Format (PNG und `skin.json`), nicht das Archiv.

## 4. Grenzen

- **Kein pixelgenaues Abbild.** Text, Zeit und beide Regler zeichnet die App; sie sitzen an der richtigen Stelle,
  sehen aber nicht wie im Original aus. Auf Skins, deren Display hell ist, kann die aus `pledit.txt` genommene
  Textfarbe schlecht lesbar sein.
- **Nur das Hauptfenster.** Playlist und Equalizer erscheinen als unsere Fenster in den Farben des Skins.
- **Kein Shade-Modus, keine Fensterform, keine Mauszeiger, keine Balance.**
- **Fehlende oder defekte Blätter kosten nur ihre Tasten.** Was sich nicht ausschneiden lässt, erscheint als von der
  App gezeichnete Taste im Streifen (Wiedergabe und „Skin wählen" fehlen nie). Ohne brauchbares `main.bmp` wird der
  Skin abgelehnt.
- **Bitmaps:** unkomprimiert mit 1, 4, 8, 24 oder 32 Bit. RLE-komprimierte BMP werden nicht gelesen.
- **Archive:** dieselben Grenzen wie für eigene Skins. Einträge mit `\` im Namen (manche unter Windows gepackte
  Archive) werden als Ganzes abgelehnt.
- **Moderne Skins** (`.wal`, Winamp 3/5 mit XML und Skripten) sind ein anderes Format und nicht vorgesehen: Sie
  enthalten ausführbare Skripte.

## 5. Rechte

Skins gehören ihren Autoren. Die App liefert keinen fremden Skin mit; der Nutzer importiert Dateien, die er hat. Das
Standard-Aussehen von Winamp wird nicht nachgebaut – der mitgelieferte „Retro"-Skin ist eine eigene Zeichnung
(`scripts/make-retro-skin.mjs`).

## 6. Nächste Schritte (inkrementell)

1. Die Tabelle in Abschnitt 2 an echten Skins nachmessen und korrigieren.
2. Bilder für Regler im Format (`track`/`thumb` für `seekbar` und `volume`) → `posbar.bmp`, `volume.bmp` nutzbar.
3. Farben aus `viscolor.txt` für den Visualizer.
4. Bitmap-Schrift als Baustein (`text.bmp`, `numbers.bmp`) samt Laufschrift.
5. Rahmenloses Fenster mit `titlebar.bmp` als Ziehbereich (hängt an R7).
6. Eigene Layouts für Playlist- und Equalizer-Fenster.
