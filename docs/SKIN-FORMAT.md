# Skin-Format (Version 1)

Stand: Phase 7 – implementiert. Maßgeblich ist der Code in `crates/fc-core/src/skins/manifest.rs`; jede Regel hier hat
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
| `keywords` | nein | höchstens 12 Stichwörter mit je 1–30 Zeichen. Die Auswahl filtert nach Name, Beschreibung und Stichwörtern. |
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
| `titleBar` | Farbe der Titelleiste des Fensters, `#rrggbb`. Wirkt, wo das System es zulässt (macOS: durchsichtige Titelleiste); sonst bleibt die Titelleiste, wie das System sie zeichnet. Nur bei `absolute`. |
| `collapsedHeight` | Höhe des Fensters, solange die Titelliste ausgeblendet ist oder ein eigenes Fenster hat (mindestens 60, kleiner als `height`). Alles darunter wird abgeschnitten, die App hängt einen 14 Pixel hohen Griff an, der die Liste zurückholt. Ohne die Angabe behält der Skin seine Liste. Nur bei `absolute`. |
| `resize` | Regeln, nach denen das Fenster wachsen darf – siehe unten. Nur bei `absolute`; ohne `resize` ist die Größe fest. |
| `components` | Liste der Bausteine, höchstens 200. Nur bei `absolute`. |

### `resize`: wie das Fenster wachsen darf

`width` und `height` sind die kleinste Größe. Je Achse nennt der Skin **eine Linie des Hintergrunds, die sich dehnt**:

| Feld | Regel |
| --- | --- |
| `stretchY` | Zeile (CSS-Pixel von oben, innerhalb des Fensters). Wird das Fenster höher, wird diese eine Zeile des Hintergrundbilds in die Länge gezogen. Fehlt sie, ist die Höhe fest. |
| `stretchX` | Spalte, entsprechend für die Breite. Fehlt sie, ist die Breite fest. |
| `maxHeight`, `maxWidth` | größte Höhe bzw. Breite, höchstens 4000; braucht die passende Linie. Ohne Angabe: 4000. |

Für die Bausteine gilt je Achse: Ein Baustein, der **über die Linie reicht, wird länger**; einer, der **ganz dahinter
liegt, rückt mit**; alle anderen bleiben, wo sie sind. Legt ein Skin `stretchY` durch die Playlist, wächst beim
Aufziehen nach unten genau die Titelliste. Die Linie gehört an eine Stelle, an der das Hintergrundbild in der
Dehnrichtung gleichförmig ist (das Innere eines Feldes, keine runde Ecke).

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
| `image` | `states.normal` (Pflicht), `source` | Ein Bild ohne Funktion. Mit `"source": "track.cover"` zeigt es das Cover des laufenden Titels; das eigene Bild bleibt, wo ein Titel keines hat. |
| `spectrum` | `color` | Balken, die der Musik folgen (ohne `color` in der Akzentfarbe). |
| `needle` | `states.normal`, `pivotX`, `pivotY`, `from`, `to` (alle Pflicht), `rest` | Ein Bild, das sich um einen Drehpunkt dreht: bei Titelbeginn um `from` Grad, am Ende um `to` Grad (im Uhrzeigersinn, −360 bis 360), ohne Titel um `rest`. Ziehen spult; per Tastatur ein Regler (Pfeiltasten ±5 s). Beispiel: Tonarm. |
| `spinner` | `states.normal`, `period` (Pflicht, 500–120000 ms je Umdrehung) | Ein Bild, das sich um seine Mitte dreht, solange Musik läuft. Beispiel: Spule, Plattenetikett. Mit `"source": "track.cover"` zeigt es das Cover des Titels, rund beschnitten (Vinyl). |
| `pack` | `states.normal`, `from`, `to` (Pflicht), `rest` | Ein rundes Bild, von dem ein Kreis um die Mitte gezeigt wird. Sein Durchmesser (CSS-Pixel, höchstens die Kastengröße) geht mit dem Fortschritt des Titels von `from` nach `to`; ohne Titel `rest`. Beispiel: das Band auf einer Spule – links `from` groß und `to` klein, rechts umgekehrt. |

**Aktionen** (`action`): `player.togglePlay`, `player.play`, `player.pause`, `player.stop`, `player.next`, `player.previous`, `player.open`,
`player.repeat`, `player.shuffle`, `app.skins`, `app.playlist` (Titelliste aus- und einblenden, ⌘J / Strg+J), `window.playlist` (Titelliste in eigenem Fenster, ⌘L / Strg+L), `window.equalizer`. Es gibt keine frei definierbaren Aktionen.

**Cover:** Das Cover ist das Bild in den Tags der Datei (bevorzugt „Front Cover"), sonst eine Datei `cover`, `folder`, `front` oder `album` (`.jpg`, `.png`, `.webp`) im selben Ordner. Die App liefert nur das Cover des gerade geladenen Titels aus; ein Skin kann keine anderen Dateien ansprechen.

**Textquellen** (`source` bei `text`): `track.title`, `track.artist`, `track.details`, `player.status` (zeigt auch
Fehlermeldungen).

**Zustandsbilder** (`states` bei `button`): `normal`, `hover`, `pressed`, `active` (solange die Funktion an ist:
Wiedergabe läuft, Wiederholen, Zufall), `disabled`. Fehlt ein Zustand, gilt `normal`.

**Pflicht bei `absolute`:** eine Taste mit `player.togglePlay` oder `player.play` und eine mit `app.skins`.

Bildpfade sind relativ zum Paket, mit `/`, ohne `..`, ohne führenden `/`, ohne Laufwerk.

## Was die App hinzufügt, egal was der Skin zeichnet

- Jede Taste hat ihren Namen (`aria-label`), ihren Tooltip mit Tastenkürzel und ist per Tastatur erreichbar; der
  Fokusring kommt von der App.
- Regler sind echte Regler mit vorgelesenem Wert.
- Der Status ist eine Live-Region.
- Tastenkürzel gelten in jedem Skin.

## Importieren und Entfernen

„Skins" (oder ⌘K / Strg+K) öffnet die Auswahl als eigenes Fenster; „Verwenden" schaltet um und schließt es. Dort „Skin importieren …". Angenommen werden `.fcskin`, `.zip` und klassische
Winamp-Skins (`.wsz`), die dabei in dieses Format umgewandelt werden. „Exportieren" speichert jeden Skin als
`.fcskin` zum Weitergeben. Die Prüfung meldet jeden Verstoß mit Stelle und Klartext, zum
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
| **Retro** (`io.github.krocon.retro`) | `absolute`, 320 × 440 | Pixel-Tasten mit Kanten, grünes Display, feste Größe. Alle Grafiken erzeugt `scripts/make-retro-skin.mjs`; es ist keine Kopie eines fremden Skins. |
| **Hi-Fi** (`io.github.krocon.hifi`) | `absolute`, 400 × 528 | gebürstetes Aluminium, gedrehte Knöpfe, bernsteinfarbenes Display |
| **Neon** (`io.github.krocon.neon`) | `absolute`, 380 × 540 | leuchtende Röhren in Cyan und Magenta über einem Gitter, Sonne im Display |
| **Tape** (`io.github.krocon.tape`) | `absolute`, 400 × 540 | heller Skin: Kassette mit Papieretikett, Klaviertasten, Creme und Orange |
| **Vinyl** (`io.github.krocon.vinyl`) | `absolute`, 640 × 400 | **der Standard.** Weicher dunkler Plattenspieler im Querformat; der Tonarm zeigt die Position und lässt sich ziehen, das Etikett dreht sich |
| **Panel** (`io.github.krocon.panel`) | `absolute`, 340 × 560 | heller Skin: matte Frontplatte, runde Drucktasten, eine einzige rote |
| **Reel** (`io.github.krocon.reel`) | `absolute`, 640 × 430 | heller Skin: Tonbandgerät mit weißer Front, zwei Spulen, die sich drehen |
| **Recorder** (`io.github.krocon.recorder`) | `absolute`, 340 × 600 | Taschenrekorder: schwarzes Gehäuse, leuchtendes Display, Tastenring um Play |
| **Deck** (`io.github.krocon.deck`) | `absolute`, 380 × 600 | Kassette auf dunklem gebürstetem Metall, geriffelte Silbertasten |
| **Walk** (`io.github.krocon.walk`) | `absolute`, 360 × 580 | tragbarer Kassettenspieler in Orange und Schwarz |
| **Meter** (`io.github.krocon.meter`) | `absolute`, 380 × 640 | dunkler Stahl, zwei Anzeigefenster, Kassette im Schacht, roter Ring um Play |
| **Ferro** (`io.github.krocon.ferro`) | `absolute`, 400 × 570 | eine große schwarze Kassette mit weißen Spulenkernen |
| **Mixtape** (`io.github.krocon.mixtape`) | `absolute`, 400 × 580 | heller Skin: lautes Etikett in Himmelblau, Weiß und Schwarz, Handschrift |
| **System** (`io.github.krocon.system`) | `absolute`, 380 × 610 | weiße Zeichen auf Schwarz, eine Spule, ein grünes Licht |
| **Console** (`io.github.krocon.console`) | `absolute`, 400 × 580 | heller Skin: mattes Grau, Mulden-Tasten, eine rote |
| **Dial** (`io.github.krocon.dial`) | `absolute`, 360 × 680 | heller Skin: ein großer Drehknopf zeigt die Position und spult |

Dazu kommen 24 weitere, alle `absolute` und aus demselben Generator: **Pocket**, **Keys** (Taschenrechner), **Beat**
(Drum-Machine), **Stripe** (flache Zeichnung), **Amp**, **Lever**, **Switch**, **Patch** (schlichte Fronten), **Magnet**,
**Classic**, **Radar**, **Chrome** (Kassettengeräte), **Studio**, **Needle**, **Dub**, **Gauge** (Zeigerinstrumente; in Needle zeigt
der Zeiger die Position und lässt sich ziehen, in Dub tun das beide Zeiger und der große Drehknopf), **Crimson**, **Nano**, **Silver** (Tonbandgeräte mit Bandwickel),
**Mono**, **Split** (grafisch), **Wheel**, **Click** (Taschenplayer mit Tastenring) und **Ember** (Bernstein auf Schwarz).
Mono, Wheel und Classic zeigen das Cover des Titels.

Alle mitgelieferten Skins lassen sich nach unten aufziehen (`resize.stretchY` durch die Titelliste) und tragen
Stichwörter. In Reel folgt das aufgewickelte Band dem Fortschritt (`pack`).

Die Grafiken aller Skins außer Retro beschreibt `scripts/make-designer-skins.mjs` als HTML und CSS; ein
Headless-Chrome rendert sie in doppelter Auflösung, das Skript schneidet die Tasten je Zustand aus. Es sind eigene
Entwürfe, keine Kopien fremder Skins oder Geräte. Nach einer Änderung: `node scripts/make-designer-skins.mjs`, dann
die Dateiliste in `crates/fc-core/src/skins/mod.rs` (`BUILT_IN`) angleichen.

## Einen eigenen Skin bauen

1. `skins/retro/skin.json` als Vorlage kopieren, `id`, `name` und Bilder ändern.
2. Als ZIP packen (`skin.json` oben) und importieren.
3. Die Meldungen der Prüfung abarbeiten.

## Noch nicht im Format

- Eigenes Aussehen für das Playlist- und das Equalizer-Fenster (sie übernehmen heute Farben und Schrift des Skins).
- Rahmenlose Fenster mit eigener Titelzeile und Ziehbereich.
- Bitmap-Schriften und Bilder für Regler (heute zeichnet die App Regler in den Farben des Skins).
- Ganzzahliges Hochskalieren pixeliger Skins.
- Kontrastwarnung beim Import. Die mitgelieferten Skins prüft ein Test auf WCAG AA (alle Textpaare ≥ 4,5 : 1,
  `the_built_in_skins_meet_wcag_aa`); importierte Skins werden darauf noch nicht geprüft.

## Winamp-Skins (`.wsz`)

Analyse, Abbildung und Grenzen des Imports: [WINAMP-SKINS.md](WINAMP-SKINS.md). Es werden weder fremde Skins
mitgeliefert noch Code aus Webamp übernommen.
