# FLAC Commander

Plattformübergreifender Musikplayer für lokale Musikbibliotheken: vollständig austauschbare Skins, mehrere
unabhängige Fenster und eine native Audio-Engine in Rust. Die Bedienung greift die Winamp-Tradition auf, Code,
Architektur und Skin-Format sind eigenständig.

**Stand: alle sieben Phasen des ersten Plans umgesetzt.** Die App spielt Playlists aus lokalen Dateien, merkt sich ihren
Zustand und lässt sich mit Skins umgestalten – mitgeliefert sind 39 Skins vom Plattenspieler „Vinyl" (Standard) bis zum Tonbandgerät „Reel", eigene Skins lassen sich als
ZIP importieren. Playlist und Equalizer haben eigene Fenster; Titel gehen lückenlos ineinander über. Klassische
Winamp-Skins lassen sich importieren (erster Schritt: Hauptfenster). Was offen ist und was noch niemand gehört oder
gesehen hat, steht in der [Roadmap](docs/ROADMAP.md) und in den [manuellen Tests](docs/MANUAL-TESTS.md).

## Was heute funktioniert

| Bereich | Stand |
| --- | --- |
| Desktop-App (Tauri 2 + Angular 22) | startet auf macOS (geprüft); Linux und Windows baut und testet die CI |
| Wiedergabe | Play, Pause, Stop, Seek, Lautstärke, nächster/vorheriger Titel, Wiederholen (aus/Playlist/Titel), Zufall |
| Playlist | Dateien per Dialog, Ordner und Dateien per Drag & Drop oder Kommandozeile; Titel, Interpret, Dauer aus den Tags |
| Formate | FLAC, MP3, WAV, Ogg Vorbis, Opus, AAC/M4A, ALAC, AIFF – jeweils durch Tests an echten Dateien belegt |
| Engine | eigener Thread, lock-freier Ringpuffer, Resampling auf die Geräterate, framegenaues Seek, Gapless |
| Klang | 10-Band-Equalizer mit Vorverstärkung und Voreinstellungen, wirkt sofort |
| Visualizer | Spektrum-Balken im Player und als Skin-Baustein; aus bei „Bewegung reduzieren" |
| Robustheit | nicht abspielbare Dateien werden markiert und übersprungen; fehlende Dateien nach dem Neustart markiert; Geräteverlust pausiert |
| Skins | zur Laufzeit wechselbar; eigenes, rein deklaratives Format mit vollständiger Prüfung; sicherer ZIP-Import und Export ([SKIN-FORMAT.md](docs/SKIN-FORMAT.md)) |
| Winamp-Skins | Import klassischer `.wsz` als Konvertierung: Hauptfenster, Tasten, Farben – nicht pixelgenau, an echten Skins noch ungeprüft ([WINAMP-SKINS.md](docs/WINAMP-SKINS.md)) |
| Bibliothek | eigenes Fenster: Musikordner wählen, durch Ordner gehen, Alben als Cover-Raster, Suche über Ordner, Album, Interpret und Titel, sofort abspielen oder zur Playlist hinzufügen – in der laufenden App noch ungeprüft ([ADR 0011](docs/decisions/0011-bibliothek-ohne-datenbank.md)) |
| Fenster | Playlist, Equalizer, Bibliothek und Skin-Auswahl als eigene Fenster; alle Fenster bleiben über das Backend synchron |
| Gemerkt wird | Playlist, aktueller Titel mit Position, Lautstärke, Wiederholen, Zufall, Skin, Fensterplätze, Ordner der Bibliothek |
| Tastatur | zentrales Aktionssystem, Playlist als Listbox bedienbar |
| Fehler und Protokoll | einheitliche Fehlercodes, Texte in Deutsch und Englisch, Logdatei |

Noch nicht vorhanden: Umsortieren der Playlist, Mehrfachauswahl; die Bibliothek kennt keine Sortierung nach Jahr
und keine Ansicht „alle Alben eines Interpreten" über Ordner hinweg.
Die Audio-Ausgabe unter Windows und Linux ist an echter Hardware noch ungeprüft.

### Tastatur

| Taste | Aktion |
| --- | --- |
| Leertaste | Wiedergabe / Pause (ohne Titel: Datei öffnen) |
| V | Stopp |
| ← / → | 5 Sekunden zurück / vor |
| ↑ / ↓ | lauter / leiser |
| Z / B | vorheriger / nächster Titel |
| R / S | Wiederholen umschalten / Zufall |
| ⌘O bzw. Strg+O | Dateien hinzufügen |
| ⌘L bzw. Strg+L | Playlist in eigenem Fenster / im Hauptfenster |
| ⌘E bzw. Strg+E | Equalizer-Fenster |
| ⌘B bzw. Strg+B | Bibliothek-Fenster |
| ⌘K bzw. Strg+K | Skin wählen |
| ⌘0 bzw. Strg+0 | zurück zum Standard-Skin (gilt in jedem Skin) |
| in der Playlist: ↑ ↓ Pos1 Ende | Auswahl bewegen |
| in der Playlist: Enter / Entf | ausgewählten Titel abspielen / entfernen |
| in der Bibliothek: ⌘F bzw. Strg+F | Suchfeld; Esc leert die Suche |
| in der Bibliothek: Tab, Enter | Kachel oder Titel wählen; Enter öffnet ein Album bzw. spielt einen Titel |

## Voraussetzungen

- Node.js 22.22+ oder 24.15+, pnpm 10
- Rust 1.93+ (stable)
- cmake und ein C-Compiler (für libopus; ohne: `--no-default-features`, dann kein Opus)
- Linux zusätzlich: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev
  libssl-dev libasound2-dev`

## Start

```bash
pnpm install
```

```bash
pnpm dev
```

Alles prüfen (Format, Lint, Tests, Build – Frontend und Rust):

```bash
pnpm check
```

Dateien oder Ordner direkt mit der App öffnen bzw. eine Datei über die Engine ohne App abspielen:

```bash
pnpm tauri dev -- -- --volume 0.3 "pfad/zu/einem/album"
```

```bash
cargo run -p fc-core --example play -- "pfad/zur/datei.flac" --seconds 10 --volume 0.3
```

Mehr dazu in [DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Dokumentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) – Schichten, Datenflüsse, Abhängigkeiten
- [AUDIO-ENGINE.md](docs/AUDIO-ENGINE.md) – Audio-Architektur und Threading
- [SKIN-FORMAT.md](docs/SKIN-FORMAT.md) – das Skin-Format und wie man einen Skin baut
- [WINAMP-SKINS.md](docs/WINAMP-SKINS.md) – klassische Skins: Analyse und Stand des Imports
- [SECURITY.md](docs/SECURITY.md) – Sicherheitsmodell, Skin-Import
- [ROADMAP.md](docs/ROADMAP.md) – Phasen und Meilensteine
- [RISKS.md](docs/RISKS.md) – technische Risiken und offene Entscheidungen
- [MANUAL-TESTS.md](docs/MANUAL-TESTS.md) – was nur mit echter Hardware prüfbar ist
- [decisions/](docs/decisions) – Architekturentscheidungen (ADRs)
- [best-practices.md](docs/best-practices.md) – verbindliche Regeln für Code in diesem Repo

## Lizenz

Noch nicht festgelegt (siehe [RISKS.md](docs/RISKS.md), offene Entscheidungen). Bis dahin: alle Rechte vorbehalten.
