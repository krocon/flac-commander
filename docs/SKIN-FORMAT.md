# Skin-Format (Entwurf)

**Status: Entwurf für Phase 4. Nichts davon ist implementiert.** Vorhanden ist heute nur die Schnittstelle, auf der
Skins aufsetzen: die CSS-Variablen `--player-*` in `src/styles.css`. Der Entwurf wird vor der Umsetzung noch einmal
gegen die Player-Oberfläche aus Phase 2/3 geprüft.

## Grundsätze

1. **Ein Skin ist Daten, kein Programm.** Kein JavaScript, kein frei geschriebenes CSS, kein HTML. Ein Skin wählt Werte
   und ordnet vorgegebene Bausteine an.
2. **Skins ändern die Darstellung, nie die Logik.** Jeder Baustein („Play-Taste", „Seekbar", „Titelanzeige") gehört
   der App; der Skin bestimmt, ob, wo und wie er erscheint.
3. **Ein ungültiger Skin wird abgelehnt, nicht halb geladen.** Die Validierung läuft vollständig in Rust und liefert
   eine Liste verständlicher Diagnosen; die App bleibt beim bisherigen Skin.
4. **Bedienbarkeit bleibt.** Jeder Baustein behält Namen, Rolle, Tastaturbedienung und sichtbaren Fokus, egal wie der
   Skin ihn zeichnet. Pflicht-Bausteine (Play/Pause, Lautstärke) kann ein Skin nicht entfernen.

## Paket

Ein Ordner oder ein ZIP-Archiv (`.fcskin`) mit:

```text
skin.json          Manifest (Pflicht)
preview.png        Vorschaubild (optional)
assets/…           Grafiken: PNG, JPEG, WebP; SVG nur nach Bereinigung (siehe SECURITY.md)
```

## Manifest `skin.json`

```json
{
  "formatVersion": 1,
  "id": "io.github.example.cyberpunk",
  "name": "Cyberpunk",
  "version": "1.0.0",
  "author": "Community",
  "description": "Dark futuristic player skin",
  "minAppVersion": "0.4.0",
  "preview": "preview.png",
  "theme": {
    "background": "#141414",
    "surface": "#1e1e1e",
    "foreground": "#f5f5f5",
    "muted": "#a8a8a8",
    "accent": "#ffdd00",
    "accentContrast": "#141414",
    "border": "#3a3a3a",
    "fontFamily": "system-ui, sans-serif",
    "radius": 6
  },
  "windows": {
    "player": {
      "width": 420,
      "height": 180,
      "resizable": false,
      "frame": "none",
      "background": "assets/player-background.png",
      "components": [
        {
          "type": "button",
          "action": "player.playPause",
          "x": 16, "y": 120, "width": 32, "height": 32,
          "states": {
            "normal": "assets/play.png",
            "hover": "assets/play-hover.png",
            "pressed": "assets/play-pressed.png",
            "active": "assets/pause.png"
          }
        },
        { "type": "seekbar", "x": 16, "y": 96, "width": 388, "height": 10 },
        { "type": "text", "source": "track.title", "x": 16, "y": 16, "width": 300, "height": 20 }
      ]
    }
  }
}
```

### Felder

| Feld | Pflicht | Regel |
| --- | --- | --- |
| `formatVersion` | ja | Ganzzahl. Die App lädt nur Versionen, die sie kennt; ältere werden migriert, neuere abgelehnt. |
| `id` | ja | Eindeutig, `[a-z0-9.-]`, höchstens 100 Zeichen. Bestimmt den Installationsordner. |
| `name`, `version` | ja | `version` ist SemVer. |
| `author`, `description` | nein | Klartext, begrenzte Länge; wird nie als HTML ausgegeben. |
| `minAppVersion` | nein | SemVer; ist die App älter, wird der Skin mit Hinweis abgelehnt. |
| `preview` | nein | Relativer Pfad im Paket. |
| `theme` | nein | Feste Schlüsselmenge; jeder Wert wird auf eine `--player-*`-Variable abgebildet. Unbekannte Schlüssel sind ein Fehler. Farben als `#rgb`/`#rrggbb`/`#rrggbbaa`. |
| `windows` | nein | Schlüssel aus fester Menge: `player`, `playlist`, `equalizer`, `visualizer`, `library`, `skins`. Fehlt ein Fenster, gilt das Standardlayout der App mit den Farben des Skins. |
| `windows.*.frame` | nein | `system` (Standard) oder `none` (rahmenlos, der Skin liefert Titelzeile und Schließen-Baustein mit). |
| `components[].type` | ja | Aus dem Katalog der App: `button`, `toggle`, `slider`, `seekbar`, `text`, `time`, `image`, `list`, `spectrum`, `dragRegion`. |
| `components[].action` / `source` | je Typ | Aus festen Listen (`player.play`, `player.next`, `track.title` …). Es gibt keine frei definierbaren Aktionen. |
| `states` | nein | `normal`, `hover`, `pressed`, `active`, `disabled`, `focus`. Fehlt `focus`, zeichnet die App ihren eigenen Fokusring. |

Maße sind CSS-Pixel im Koordinatensystem des Fensters. Für pixelige Retro-Skins gibt es je Fenster
`"scaling": "pixelated"` und einen ganzzahligen Skalierungsfaktor in den Einstellungen des Nutzers.

### Layout-Modi

- **`absolute`** (wie im Beispiel): feste Positionen, für pixelgenaue Skins mit Hintergrundgrafik.
- **`flow`**: der Skin nennt nur Reihenfolge und Sichtbarkeit von Bausteinen in benannten Bereichen; die App legt sie
  aus. Für moderne, in der Größe veränderbare Skins.

Ein Fenster nutzt genau einen Modus.

## Validierung und Diagnose

`validate_skin(path) -> Result<Skin, Vec<SkinDiagnostic>>` in `fc-core`, ohne Tauri, mit Unit-Tests für jede Regel:

- Schema: Pflichtfelder, Typen, Wertebereiche, unbekannte Schlüssel.
- Pfade: nur relativ, ohne `..`, ohne absoluten Anteil, ohne Laufwerk; die Datei muss im Paket existieren.
- Dateien: erlaubte Typen nach Inhalt (nicht nach Endung), Größen- und Maßgrenzen.
- Geometrie: Bausteine liegen im Fenster; Pflicht-Bausteine sind vorhanden und groß genug zum Treffen.
- Kontrast: Warnung (kein Fehler), wenn `foreground`/`background` unter WCAG AA liegt.

Eine Diagnose nennt Stelle (`windows.player.components[2].states.hover`), Regel und Klartext.

## Laden und Wechseln

Rust validiert und gibt dem Frontend ein bereinigtes Modell; Grafiken liefert ein eigenes URL-Schema, das nur Dateien
des aktiven, validierten Skins ausgibt. Das Frontend setzt die CSS-Variablen und rendert die Bausteine aus dem Modell.
Ein Wechsel braucht keinen Neustart: neues Modell, neue Variablen, Fenstergrößen anpassen. Schlägt das Laden fehl,
bleibt der alte Skin aktiv.

## Mitgelieferte Skins (Phase 4)

- **Retro**: pixelig, feste Größe, eigene Grafiken im Stil klassischer Player – keine Kopie fremder Skins.
- **Modern**: dunkel, `flow`-Layout, in der Größe veränderbar; entspricht dem heutigen Basisthema.

## Winamp-Skins (`.wsz`), Phase 7

Klassische Skins sind ZIP-Archive mit Bitmaps fester Namen (`main.bmp`, `cbuttons.bmp`, `titlebar.bmp`, `pledit.bmp`
…), Textdateien für Farben und Regionen und Bitmap-Schriften; Bedienelemente sind Ausschnitte fester Position in
diesen Bitmaps. Ein Importer würde daraus ein Paket dieses Formats erzeugen (`absolute`-Layout mit festem Mapping).
Vor jedem Code steht die in der Roadmap genannte Analyse; die Grenzen (Regionen, Schriften, Mini-Modus, Verhalten
einzelner Skins) werden dort dokumentiert. Es werden weder fremde Skins mitgeliefert noch Code aus Webamp übernommen,
ohne Lizenz und Rechte zu prüfen.
