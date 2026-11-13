# FLAC Commander

Plattformübergreifender Musikplayer für lokale Musikbibliotheken: vollständig austauschbare Skins, mehrere
unabhängige Fenster und eine native Audio-Engine in Rust. Die Bedienung greift die Winamp-Tradition auf, Code,
Architektur und Skin-Format sind eigenständig.

**Stand: Phase 3 abgeschlossen (Playlist und Persistenz).** Die App spielt Playlists aus lokalen Dateien und Ordnern,
zeigt Titel und Interpret aus den Tags und merkt sich Playlist, Position, Lautstärke und Wiedergabemodus. Skins und
mehrere Fenster folgen ([Roadmap](docs/ROADMAP.md)).

## Was heute funktioniert

| Bereich | Stand |
| --- | --- |
| Desktop-App (Tauri 2 + Angular 22) | startet auf macOS (geprüft); Linux und Windows baut und testet die CI |
| Wiedergabe | Play, Pause, Stop, Seek, Lautstärke, nächster/vorheriger Titel, Wiederholen (aus/Playlist/Titel), Zufall |
| Playlist | Dateien per Dialog, Ordner und Dateien per Drag & Drop oder Kommandozeile; Titel, Interpret, Dauer aus den Tags |
| Formate | FLAC, MP3, WAV, Ogg Vorbis, Opus, AAC/M4A, ALAC, AIFF – jeweils durch Tests an echten Dateien belegt |
| Engine | eigener Thread, lock-freier Ringpuffer, Resampling auf die Geräterate, framegenaues Seek |
| Robustheit | nicht abspielbare Dateien werden markiert und übersprungen; fehlende Dateien nach dem Neustart markiert; Geräteverlust pausiert |
| Gemerkt wird | Playlist, aktueller Titel mit Position, Lautstärke, Wiederholen, Zufall |
| Tastatur | zentrales Aktionssystem, Playlist als Listbox bedienbar |
| Fehler und Protokoll | einheitliche Fehlercodes, Texte in Deutsch und Englisch, Logdatei |

Noch nicht vorhanden: Skins, Mehrfenster, Bibliothek, Equalizer, Albumcover, Umsortieren der Playlist, Mehrfachauswahl.
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
| in der Playlist: ↑ ↓ Pos1 Ende | Auswahl bewegen |
| in der Playlist: Enter / Entf | ausgewählten Titel abspielen / entfernen |

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
- [SKIN-FORMAT.md](docs/SKIN-FORMAT.md) – Entwurf des Skin-Formats
- [SECURITY.md](docs/SECURITY.md) – Sicherheitsmodell, Skin-Import
- [ROADMAP.md](docs/ROADMAP.md) – Phasen und Meilensteine
- [RISKS.md](docs/RISKS.md) – technische Risiken und offene Entscheidungen
- [MANUAL-TESTS.md](docs/MANUAL-TESTS.md) – was nur mit echter Hardware prüfbar ist
- [decisions/](docs/decisions) – Architekturentscheidungen (ADRs)
- [best-practices.md](docs/best-practices.md) – verbindliche Regeln für Code in diesem Repo

## Lizenz

Noch nicht festgelegt (siehe [RISKS.md](docs/RISKS.md), offene Entscheidungen). Bis dahin: alle Rechte vorbehalten.
