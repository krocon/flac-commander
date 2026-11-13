# FLAC Commander

Plattformübergreifender Musikplayer für lokale Musikbibliotheken: vollständig austauschbare Skins, mehrere
unabhängige Fenster und eine native Audio-Engine in Rust. Die Bedienung greift die Winamp-Tradition auf, Code,
Architektur und Skin-Format sind eigenständig.

**Stand: Phase 0 und 1 abgeschlossen (Grundgerüst).** Die App startet, spricht über eine typisierte IPC-Schicht mit dem
Rust-Kern, schreibt ein Protokoll und kann die Audio-Ausgabe mit einem Testton prüfen. Einen Player gibt es noch
nicht; er entsteht ab Phase 2 ([Roadmap](docs/ROADMAP.md)).

## Was heute funktioniert

| Bereich | Stand |
| --- | --- |
| Desktop-App (Tauri 2 + Angular 22) | startet auf macOS (geprüft); Linux und Windows baut und testet die CI |
| Dekodieren | FLAC, MP3, WAV, Ogg Vorbis, AAC/M4A, ALAC, AIFF – jeweils durch einen Test an einer echten Datei belegt |
| Opus | **nicht unterstützt** (Symphonia 0.6.1 hat keinen Decoder), wird sauber abgelehnt |
| Audio-Ausgabe | Geräteliste, Standardformat, Testton über CPAL |
| Wiedergabe von Dateien | nur als Kommandozeilen-Spike (`examples/play.rs`), noch nicht in der App |
| Fehler | einheitlich als `AppError { code, message, details? }`, im Fenster in Deutsch oder Englisch |
| Protokoll | Datei im Log-Ordner des Systems, inklusive Frontend-Fehlern und Panics |

Noch nicht vorhanden: Playlist, Seek, Lautstärke, Skins, Mehrfenster, Bibliothek, Equalizer, Persistenz.

## Voraussetzungen

- Node.js 22.22+ oder 24.15+, pnpm 10
- Rust 1.93+ (stable)
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

Eine Datei über den Rust-Kern abspielen, ohne die App (Spike aus Phase 0):

```bash
cargo run -p fc-core --example play -- "pfad/zur/datei.flac" --seconds 10
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
