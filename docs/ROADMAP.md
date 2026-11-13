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

## Phase 3 – Playlist und Persistenz ✅

- [x] Playlist im Kern (`playlist.rs`): Next/Previous, Wiederholen aus/Titel/Playlist, Zufall; Tests für alle Regeln
- [x] Sitzung (`session.rs`): Titelwechsel am Ende, nicht abspielbare Titel markieren und überspringen
      (Abbruch nach sechs Fehlschlägen in Folge), Tags im Hintergrund
- [x] Metadaten mit Lofty: Titel, Interpret, Album, Dauer
- [x] Dateien per Dialog (Mehrfachauswahl), Dateien und Ordner per Drag & Drop und Kommandozeile
- [x] Speichern und Wiederherstellen (`storage.rs`): Playlist, aktueller Titel mit Position, Lautstärke,
      Wiederholen, Zufall – versionierte JSON-Datei, atomar geschrieben
- [x] Fehlende Dateien werden nach dem Neustart markiert, nicht entfernt
- [x] Oberfläche: Playlist als Listbox, Vor/Zurück, Wiederholen, Zufall, Drop-Hinweis
- [x] gebündelte App unter macOS geprüft: Ordner öffnen, Tags, Next, Titelwechsel am Ende, Neustart stellt alles her
- [ ] Albumcover (Lofty liefert sie; Anzeige kommt mit den Skins)
- [ ] Umsortieren und Mehrfachauswahl in der Playlist
- [ ] Verschobene Dateien wiederfinden (heute: als fehlend markiert)
- [ ] Drag & Drop in der echten App von Hand prüfen ([MANUAL-TESTS.md](MANUAL-TESTS.md) L3)

## Phase 4 – Skin-Engine ✅

- [x] Manifest-Schema v1 mit vollständiger Prüfung und Diagnose je Stelle ([SKIN-FORMAT.md](SKIN-FORMAT.md))
- [x] Zwei Layout-Arten: `flow` (App legt an, Skin färbt) und `absolute` (Skin platziert Bausteine, feste Fenstergröße)
- [x] Skin-Bibliothek: mitgelieferte Skins im Programm eingebettet, importierte im Datenordner
- [x] Sicherer ZIP-Import: Zip-Slip, Links, Dekompressionsbombe, Dateitypen nach Inhalt – je mit Test
- [x] Bilder nur über das Protokoll `skin://`, das ausschließlich geprüfte Dateien kennt
- [x] Wechsel zur Laufzeit für alle Fenster; aktiver Skin wird gespeichert; Fenstergröße folgt dem Skin
- [x] Mitgelieferte Skins: **Modern** und **Retro** (eigene, erzeugte Grafik); Test auf WCAG AA
- [x] Skin-Auswahl mit Vorschau, Import, Entfernen; ⌘0 / Strg+0 als fester Weg zurück
- [x] gebündelte App unter macOS geprüft: Wechsel auf Retro, Neustart, Fenstergröße
- [ ] Import eines Fremd-Skins und Ablehnung eines fehlerhaften in der echten App von Hand prüfen (S4, S5)
- [ ] Kontrastwarnung für importierte Skins
- [ ] Rahmenlose Fenster, Bilder für Regler, Bitmap-Schriften, Hochskalieren

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
