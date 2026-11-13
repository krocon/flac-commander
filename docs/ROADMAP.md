# Roadmap

Jede Phase endet mit einem lauffähigen Stand, grünem `pnpm check` und einem Bericht. Eine Phase beginnt erst, wenn die
vorige fertig ist.

## Phase 0 – Technische Validierung ✅

- [x] Versionen geprüft: Angular 22.2, Tauri 2.12, Rust 1.93+, Symphonia 0.6.1, CPAL 0.18.2, Lofty 0.25.5
- [x] Dekodieren aller Zielformate an echten Dateien gemessen (`tests/formats.rs`) – Opus fehlt
- [x] Ausgabe über CPAL unter macOS: Spike spielt FLAC und MP3 ohne Unterläufe
- [x] Lofty an Dateien aus `samples/` geprüft (`examples/probe.rs`): Titel, Interpret, Album, Cover werden gelesen
- [x] Architekturentscheidungen als ADRs, Risiken in [RISKS.md](RISKS.md)
- [ ] Ausgabe unter Windows und Linux an echter Hardware (manuell, [MANUAL-TESTS.md](MANUAL-TESTS.md))

## Phase 1 – Projektgerüst ✅

- [x] Cargo-Workspace: `fc-core` (ohne Tauri) und `src-tauri`
- [x] Angular-22-App: zoneless, Signals, Fassaden, Laufzeit-i18n (de/en), Design-Tokens
- [x] IPC-Abstraktion: `call()` / `subscribe()`, Commands `system_info`, `start_test_tone`, Event
      `audio://test-tone-finished`
- [x] Fehlervertrag `AppError` mit Test auf beiden Seiten
- [x] Logging: Datei im Log-Ordner, Frontend-Fehler und Panics eingeschlossen
- [x] CI: Frontend (Format, Lint, Test, Build) und Rust (fmt, clippy, test) auf Linux, macOS, Windows
- [x] Start der gebündelten App unter macOS geprüft

## Phase 2 – Audio-MVP ✅

- [x] Engine-Thread mit Befehlsqueue und Zustandsmaschine (`audio/player.rs`), 26 Tests gegen ein simuliertes Gerät
- [x] Ringpuffer zwischen Engine und Callback, Positionszählung im Callback
- [x] Resampling auf die Geräterate (rubato), Kanal-Mapping – das Gerät wird nicht umgestellt
- [x] Play, Pause, Stop, Seek (framegenau), Lautstärke; Rampen gegen Knacken
- [x] Event `player://state`, Command `player_state` für neue oder neu geladene Fenster
- [x] DTS in WAV wird erkannt und abgelehnt; Opus über libopus (Feature `opus`)
- [x] Geräteverlust: Pause mit Meldung, Fortsetzen auf dem neuen Gerät
- [x] Oberfläche: Titel, Format, Zeit, Seekbar, Lautstärke, Transport-Tasten; Aktionssystem für Tastenkürzel
- [x] Datei öffnen über den System-Dialog (in Rust) und über die Kommandozeile
- [x] gebündelte App unter macOS geprüft (Wiedergabe, Seek, Pause, Tastatur)
- [ ] Nachweis in der echten App: Wiedergabe läuft weiter, wenn die WebView neu lädt (Architektur und Store-Test
      decken es ab; der Handtest steht aus, [MANUAL-TESTS.md](MANUAL-TESTS.md) P9)
- [ ] Manuelle Tests unter Windows und Linux
- [ ] Erkennen eines gewechselten Standardgeräts (R5)

## Phase 3 – Playlist und Persistenz

- [ ] Playlist und Queue im Kern (Next/Previous, Wiederholen, Zufall), Tests für alle Operationen
- [ ] Metadaten mit Lofty (Titel, Interpret, Album, Dauer, Cover)
- [ ] Drag & Drop; mehrere Dateien im Dialog
- [ ] Einstellungen (Lautstärke, letzter Titel) und Playlist speichern und wiederherstellen (versionierte Dateien)
- [ ] Fehlende und verschobene Dateien behandeln

## Phase 4 – Skin-Engine

- [ ] Manifest-Schema v1 mit Validierung und Fehlerdiagnose ([SKIN-FORMAT.md](SKIN-FORMAT.md))
- [ ] Skin-Loader und Asset-Protokoll, sicherer ZIP-Import ([SECURITY.md](SECURITY.md))
- [ ] Wechsel zur Laufzeit
- [ ] Mitgelieferte Skins: Retro (eigene Grafik, Winamp-inspiriert) und Modern (dunkel)
- [ ] Kontrastprüfung der mitgelieferten Skins

## Phase 5 – Mehrfenster

- [ ] Messung: Kosten mehrerer WebViews (R6), dann Entscheidung zum Fensterkonzept
- [ ] Player-, Playlist-, Equalizer-Fenster; Position und Größe speichern und wiederherstellen
- [ ] Synchronisation über Rust-Events

## Phase 6 – Advanced Audio

- [ ] Equalizer (10 Bänder) und DSP-Kette im Engine-Thread
- [ ] Spektrumanalyse mit reduzierten Werten für Visualisierungen
- [ ] Gapless Playback

## Phase 7 – Community und Kompatibilität

- [ ] Analyse `.wsz`: Dateiaufbau, Sprites, Zustände, Mapping, Grenzen – als Dokument, vor jedem Code
- [ ] Inkrementeller Importer
- [ ] Skin-Browser, Skin-Export, Skin-Dokumentation
- [ ] Plugin-API prüfen

## Bewusst später

MilkDrop-Kompatibilität, Plugin-Marktplatz, Streaming- und Online-Dienste, Skin-Editor, Geräte-Synchronisation,
umfangreiche Tag-Bearbeitung.
