# Skin-Format (Version 1)

Stand: Phase 4 – implementiert. Maßgeblich ist der Code in `crates/fc-core/src/skins/manifest.rs`; jede Regel hier hat
dort einen Test (`skins/tests.rs`). Die mitgelieferten Skins unter [`skins/`](../skins) sind zugleich die Beispiele.

## Grundsätze

1. **Ein Skin ist Daten, kein Programm.** Kein JavaScript, kein HTML, kein frei geschriebenes CSS. Ein Skin wählt Werte
   und ordnet Bausteine an, die die App bereitstellt.
2. **Skins ändern die Darstellung, nie die Logik.** Was eine Taste tut, was ein Text sagt und wie ein Regler bedient
   und vorgelesen wird, gehört der App und ist in jedem Skin gleich.
3. **Ein ungültiger Skin wird als Ganzes abgelehnt.** Die Prüfung läuft vollständig in Rust, bevor irgendetwas
   angezeigt wird, und nennt alle Verstöße auf einmal. Die App behält den bisherigen Skin.
4. **Es gibt immer einen Weg zurück.** Ein Skin mit eigenem Layout muss eine Taste „Skin wählen" enthalten, und
   ⌘0 / Strg+0 schaltet in jedem Skin auf den Standard-Skin zurück.

## Paket

Ein ZIP-Archiv (Endung `.fcskin` oder `.zip`) mit `skin.json` auf oberster Ebene – oder in genau einem Ordner, wie ihn
„Ordner komprimieren" erzeugt. Außer `skin.json` sind nur Bilder erlaubt: **PNG, JPEG, WebP**, erkannt am Inhalt,
nicht an der Endung. SVG ist nicht erlaubt (kann Skripte und externe Verweise enthalten).

| Grenze | Wert |
| --- | --- |
| Dateien je Paket | 200 |
| Größe je Datei | 5 MB |
| Paket entpackt | 30 MB |
| Bild je Seite | 4096 Pixel |
| Archivdatei | 40 MB |

## `skin.json`

```json
{
  "formatVersion": 1,
  "id": "org.example.neon",
  "name": "Neon",
  "version": "1.0.0",
  "author": "Jane Doe",
  "description": "Pink on black.",
  "minAppVersion": "0.1.0",
  "preview": "preview.png",
  "theme": { "background": "#101010", "accent": "#ff2bd6", "radius": 2 },
  "windows": { "player": { "layout": "flow" } }
}
```

| Feld | Pflicht | Regel |
| --- | --- | --- |
| `formatVersion` | ja | `1`. Andere Versionen werden abgelehnt. |
| `id` | ja | 3–100 Zeichen aus `a–z`, `0–9`, `.`, `-`; beginnt mit einem Buchstaben; kein `..`. Bestimmt den Installationsordner. Die Ids der mitgelieferten Skins sind vergeben. |
| `name` | ja | 1–100 Zeichen, keine Steuerzeichen. |
| `version` | ja | drei Zahlen, `1.0.0`. |
| `author`, `description` | nein | höchstens 100 bzw. 500 Zeichen. Werden als Text angezeigt, nie als HTML. |
| `minAppVersion` | nein | drei Zahlen. Ist die App älter, wird der Skin mit Hinweis abgelehnt. |
| `preview` | nein | Bild im Paket, wird in der Auswahl gezeigt. |
| `theme` | nein | siehe unten. |
| `windows.player` | nein | siehe unten. Fehlt es, legt die App ihren Standard-Player an. |

Unbekannte Schlüssel sind ein Fehler, an jeder Stelle.

### `theme`

Jedes Feld setzt genau eine CSS-Variable; was fehlt, behält den Standardwert der App.

| Feld | Variable | Wert |
| --- | --- | --- |
| `background`, `surface`, `surfaceRaised` | `--player-background`, `-surface`, `-surface-raised` | Farbe |
| `foreground`, `muted` | `--player-foreground`, `-muted` | Farbe |
| `accent`, `accentContrast` | `--player-accent`, `-accent-contrast` | Farbe |
| `border`, `ok`, `danger`, `focus` | `--player-border`, `-ok`, `-danger`, `-focus` | Farbe |
| `fontFamily`, `fontMono` | `--player-font-family`, `-font-mono` | Schriftnamen mit Komma getrennt; nur Buchstaben, Ziffern, Leerzeichen, `-`, `_`, Anführungszeichen; höchstens 200 Zeichen |
| `radius` | `--player-radius` | 0–32 (CSS-Pixel) |

Eine **Farbe** ist `#rgb`, `#rgba`, `#rrggbb` oder `#rrggbbaa` – nichts sonst. Schriftdateien kann ein Skin nicht
mitbringen; er nennt Schriften, die das System hat.

### `windows.player`

| Feld | Regel |
| --- | --- |
| `layout` | `flow` (Standard): Die App legt den Player an, in der Größe veränderbar; der Skin liefert Farben und Schrift. `absolute`: Der Skin platziert jeden Baustein selbst in einem Fenster fester Größe. |
| `width`, `height` | nur bei `absolute`, dann Pflicht: 200–2000 × 100–2000 CSS-Pixel. Das ist die Größe des Fensterinhalts. |
| `background` | Bild im Paket, füllt das Fenster. |
| `pixelated` | `true`: Bilder ohne Glättung skalieren (Pixel-Art). |
| `components` | Liste der Bausteine, höchstens 200. Nur bei `absolute`. |

### Bausteine

Jeder Baustein hat `type`, `x`, `y`, `width`, `height` (CSS-Pixel, muss ganz im Fenster liegen).

| `type` | Weitere Felder | Verhalten |
| --- | --- | --- |
| `button` | `action` (Pflicht), `states` | Führt eine Aktion der App aus. Mindestens 12 × 12. Ohne Bilder zeichnet die App eine beschriftete Taste. |
| `seekbar` | – | Positionsregler des laufenden Titels. |
| `volume` | – | Lautstärkeregler. |
| `text` | `source` (Pflicht), `fontSize` (6–72), `color`, `align` | Eine Zeile Text; zu langer Text wird mit „…" gekürzt. |
| `time` | `source` (Pflicht), `fontSize`, `color`, `align` | `position` oder `duration`. |
| `playlist` | – | Die Playlist mit ihren Knöpfen. |
| `image` | `states.normal` (Pflicht) | Ein Bild ohne Funktion. |

**Aktionen** (`action`): `player.togglePlay`, `player.stop`, `player.next`, `player.previous`, `player.open`,
`player.repeat`, `player.shuffle`, `app.skins`. Es gibt keine frei definierbaren Aktionen.

**Textquellen** (`source` bei `text`): `track.title`, `track.artist`, `track.details`, `player.status` (zeigt auch
Fehlermeldungen).

**Zustandsbilder** (`states` bei `button`): `normal`, `hover`, `pressed`, `active` (solange die Funktion an ist:
Wiedergabe läuft, Wiederholen, Zufall), `disabled`. Fehlt ein Zustand, gilt `normal`.

**Pflicht bei `absolute`:** eine Taste mit `player.togglePlay` und eine mit `app.skins`.

Bildpfade sind relativ zum Paket, mit `/`, ohne `..`, ohne führenden `/`, ohne Laufwerk.

## Was die App hinzufügt, egal was der Skin zeichnet

- Jede Taste hat ihren Namen (`aria-label`), ihren Tooltip mit Tastenkürzel und ist per Tastatur erreichbar; der
  Fokusring kommt von der App.
- Regler sind echte Regler mit vorgelesenem Wert.
- Der Status ist eine Live-Region.
- Tastenkürzel gelten in jedem Skin.

## Importieren und Entfernen

„Skins" → „Skin importieren …" (oder ⌘K / Strg+K). Die Prüfung meldet jeden Verstoß mit Stelle und Klartext, zum
Beispiel:

```text
theme.accent: must be a colour like #rgb, #rrggbb or #rrggbbaa
windows.player.components[3]: must have a size and lie inside the window
```

Importierte Skins liegen im Datenordner der App unter `skins/<id>/`. Ein Import mit derselben Id ersetzt den
vorhandenen; mitgelieferte Skins lassen sich weder ersetzen noch entfernen. Ein installierter Skin, der nicht (mehr)
gültig ist, wird beim Start ausgelassen und protokolliert.

## Mitgelieferte Skins

| Skin | Layout | Was er zeigt |
| --- | --- | --- |
| **Modern** (`io.github.krocon.modern`) | `flow` | dunkel, ruhig, in der Größe veränderbar – der Standard |
| **Retro** (`io.github.krocon.retro`) | `absolute`, 320 × 440 | Pixel-Tasten mit Kanten, grünes Display, feste Größe. Alle Grafiken erzeugt `scripts/make-retro-skin.mjs`; es ist keine Kopie eines fremden Skins. |

## Einen eigenen Skin bauen

1. `skins/retro/skin.json` als Vorlage kopieren, `id`, `name` und Bilder ändern.
2. Als ZIP packen (`skin.json` oben) und importieren.
3. Die Meldungen der Prüfung abarbeiten.

## Noch nicht im Format

- Weitere Fenster (Playlist, Equalizer als eigene Fenster) – mit dem Mehrfenster-Konzept.
- Rahmenlose Fenster mit eigener Titelzeile und Ziehbereich.
- Bitmap-Schriften und Bilder für Regler (heute zeichnet die App Regler in den Farben des Skins).
- Ganzzahliges Hochskalieren pixeliger Skins.
- Kontrastwarnung beim Import. Die mitgelieferten Skins prüft ein Test auf WCAG AA (alle Textpaare ≥ 4,5 : 1,
  `the_built_in_skins_meet_wcag_aa`); importierte Skins werden darauf noch nicht geprüft.

## Winamp-Skins (`.wsz`)

Analyse und Importer sind Phase 7, siehe [WINAMP-SKINS.md](WINAMP-SKINS.md), sobald vorhanden. Es werden weder fremde
Skins mitgeliefert noch Code aus Webamp übernommen.
