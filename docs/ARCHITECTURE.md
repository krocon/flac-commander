# Architektur

Stand: Phase 5. Was hier als „geplant" markiert ist, existiert noch nicht.

## Schichten

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Angular 22 (WebView)                         src/                    │
│   features/…   Komponenten + Stores (Signals)                        │
│   core/…       Fassaden (*Api), Fehler, i18n, Log                    │
│   core/backend call() = einziges invoke(), subscribe() = einziges    │
│                listen()                                              │
└───────────────▲──────────────────────────────┬───────────────────────┘
        Events  │ (Zustandsänderungen)         │ Commands (Anfrage/Antwort)
┌───────────────┴──────────────────────────────▼───────────────────────┐
│ Tauri-Schicht                                src-tauri/              │
│   commands/…   dünn, async, validiert, ruft fc-core                  │
│   events.rs    Namen und Payloads der Events                         │
│   lib.rs       App-Lifecycle, Logging, AppState                      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ Rust-Funktionsaufrufe
┌───────────────────────────────▼──────────────────────────────────────┐
│ Rust-Kern                                    crates/fc-core/         │
│   audio/       player (Engine), decode, resample, output, dts, tone  │
│   session.rs   Player + Playlist + Speichern; playlist.rs, metadata, │
│   storage.rs   error.rs                                              │
│   skins/       Manifest, Prüfung, ZIP-Import, Bibliothek             │
│   geplant: library                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Architekturregeln

1. **`fc-core` kennt weder Tauri noch eine WebView.** Der Kern ist eine eigene Crate ohne `tauri`-Abhängigkeit; der
   Compiler erzwingt die Regel. Er lässt sich aus Tests, Beispielen und der Kommandozeile betreiben
   ([ADR 0001](decisions/0001-cargo-workspace-mit-kern-crate.md)).
2. **Audio gehört dem Prozess, nicht einem Fenster.** Die Engine läuft als eigener Thread im Rust-Prozess
   (`AppState.player`). Eine WebView, die neu lädt, fragt mit `player_state` den Zustand ab und zeigt den laufenden
   Titel; sie startet nichts.
3. **Das Frontend simuliert keinen Backend-Zustand.** Ein Store zeigt, was Rust gemeldet hat. Ein Klick auf „Pause"
   schickt nur den Befehl; die Anzeige wechselt, wenn die Engine „pausiert" meldet. Eigener Zustand des Fensters ist
   allein der Wert eines Schiebereglers, solange er gezogen wird.
4. **Komponenten rufen nie `invoke()`/`listen()`.** Sie sprechen mit einer abstrakten Fassade (`SystemApi`), die in
   `app.config.ts` an die Tauri-Implementierung gebunden wird. Tests ersetzen die Fassade (`src/testing/fake-apis.ts`).
5. **Commands sind `async`**, Blockierendes läuft über `commands::blocking()` (`spawn_blocking`).
6. **Fehler haben überall dieselbe Form:** `AppError { code, message, details? }`. Die Code-Liste ist auf beiden Seiten
   von Hand gepflegt und auf beiden Seiten getestet (`error.rs` ↔ `core/errors/app-error.ts`).

## Datenflüsse

### Command (Anfrage mit Antwort) – Beispiel `system_info`

```text
Diagnostics (Komponente) → DiagnosticsStore.load()
  → SystemApi.systemInfo()            (Fassade)
  → call('system_info')               (core/backend/call.ts, einziges invoke)
  → commands::system::system_info     (src-tauri, async)
  → fc_core::audio::output::output_status()   (über spawn_blocking)
  ← SystemInfo (serde, camelCase)  ← Promise ← Signal `info` ← Template
```

Fehler nehmen denselben Weg zurück: `Err(AppError)` → abgelehntes Promise → `toAppError()` → Signal `error` →
`describeError()` (Text in der aktuellen Sprache). Antworten überholter Aufrufe werden verworfen (Zähler im Store).

### Event (Zustandsänderung) – Beispiel Testton

```text
Klick → DiagnosticsStore.playTestTone()
  → wartet, bis das Event-Abo steht (sonst könnte das Ende verloren gehen)
  → call('start_test_tone') → spawn_test_tone(): eigener Thread öffnet die Ausgabe
  ← Ok(()) sobald der Stream läuft           → Store: 'playing'
  … Audio-Callback rendert den Ton …
  ← Event audio://test-tone-finished {error} → Store: 'done' | 'failed'
```

Regel für die Aufteilung: **Commands** für alles mit Antwort, **Events** für Zustandsänderungen, die Rust von sich aus
meldet. Hochfrequente Audiodaten gehen nie über IPC; für Visualisierungen sind reduzierte Analysewerte vorgesehen
(Phase 6).

### Wiedergabe

```text
Klick / Taste → Aktion → PlayerStore → PlayerApi → call('player_play' | 'player_seek' | …)
  → commands::player → Player (Befehlsqueue) → Engine-Thread            – der Command kehrt sofort zurück
Engine-Thread: Decoder → Resampler → Kanal-Mapping → Ringpuffer → Renderer (Audio-Callback) → Gerät
Engine-Thread → PlayerState bei jeder Änderung, beim Abspielen alle ≤ 200 ms
  → Event player://state an alle Fenster → PlayerStore → Signals → Template
Fenster startet oder lädt neu → erst Event abonnieren, dann call('player_state') → Schnappschuss
```

### Playlist und Sitzung

```text
PlaylistStore → PlaylistApi → call('playlist_play' | 'playlist_next' | …) → Session
Session: Playlist (reine Daten und Regeln) wählt den Eintrag → Player.load(pfad)
Engine meldet PlayerState → Session hört mit:
  finished gestiegen        → Playlist.advance(Auto) → nächster Titel
  Datei nicht abspielbar    → Eintrag markieren, nächster Titel (höchstens sechsmal in Folge)
  Lautstärke geändert       → speichern
Session → Event playlist://state an alle Fenster; Tags liest ein eigener Thread nach
Session → Saver-Thread → state.json (entprellt, atomar); beim Beenden sofort, mit Position
```

Der Player kennt keine Liste, die Playlist kein Audio; nur die Sitzung kennt beide. Auswahl in der Liste ist
Zustand des Fensters und geht nicht ans Backend.

### Skins

```text
SkinStore → SkinApi → call('skins_activate', id) → SkinLibrary (geprüfte Skins im Speicher)
  → Fenstergröße setzen → Event skins://active { info, theme, player } an alle Fenster
SkinStore: theme → CSS-Variablen --player-* am Dokument
App: layout 'flow' → Standard-Player + Playlist;  layout 'absolute' → SkinnedPlayer, der die
     Bausteine des Skins an ihren Positionen rendert und dieselben Stores und Aktionen nutzt
Bilder: <img>/background → skin://localhost/<id>/<pfad> → Rust liefert die geprüfte Datei aus dem Speicher
```

Ein Skin bringt kein Verhalten mit: Tasten führen Aktionen des Aktionssystems aus, Texte kommen aus `PlayerView`,
das der Standard-Player ebenfalls nutzt.

Fallengelassene Dateien nimmt Rust direkt aus dem Fensterereignis; das Fenster erfährt nur, dass gezogen wird
(für den Hinweis), nie einen Pfad.

„Datei öffnen" läuft vollständig in Rust: Der Command zeigt den System-Dialog, übergibt den Pfad der Engine und
meldet dem Fenster nur, ob etwas gewählt wurde. Die WebView bekommt nie ein Dateirecht und schickt nie einen Pfad.

Details: [AUDIO-ENGINE.md](AUDIO-ENGINE.md).

## Frontend

- Angular 22, standalone, zoneless (kein `zone.js`), Signals; `OnPush` ist Default und wird nicht gesetzt.
- **Stores** je Feature (`features/<name>/<name>.store.ts`), kein globaler Riesen-Store. Geplant:
  `PlayerStore`, `PlaylistStore`, `LibraryStore`, `SkinStore`, `WindowStore`, `EqualizerStore` – jeder spiegelt
  einen Ausschnitt des Rust-Zustands und hält daneben nur echten UI-Zustand (Auswahl, Suchtext).
- **Texte** in Katalogen je Feature (`*-texts.ts` Englisch als Quelle, `*-texts.de.ts`), Laufzeit-Sprachwechsel über
  `core/i18n/i18n.ts`. Kein Text im Template.
- **Farben, Schriften, Radien** nur als CSS-Variablen `--player-*` (`src/styles.css`). Das ist die Schnittstelle, die
  Skins ab Phase 4 überschreiben.
- **Tastatur nur über das Aktionssystem** (`core/actions/`): Features registrieren Aktionen mit Kürzel, die
  App-Wurzel hat den einzigen `keydown`-Listener. Tasten, die das fokussierte Element selbst braucht (Leertaste auf
  einem Button, Pfeile auf einem Regler, Tippen in einem Feld), bleiben dort. Tooltips zeigen das Kürzel über
  `actions.hint(id)`.
- **Event-Abos** enden mit ihrem Besitzer: `untilDestroyed(subscribe(...), destroyRef)` – auch wenn der Besitzer
  zerstört wird, bevor das Abo steht.

## Mehrere Fenster

Jedes Fenster ist eine eigene WebView mit eigenem JavaScript-Kontext und zeigt dasselbe Frontend; das Fenster-Label
(`main`, `playlist`) entscheidet, welcher Teil erscheint. Fenster teilen nichts in der WebView: Sie bleiben synchron,
weil alle dieselben Events aus Rust hören und beim Start einen Schnappschuss holen. Kein Fenster startet eine Engine.

```text
Knopf / ⌘L → WindowsStore → call('windows_toggle', 'playlist') → windows.rs
  erzeugt, zeigt oder versteckt das Fenster → Event windows://state { open } an alle Fenster
  → Hauptfenster blendet seine eingebettete Playlist aus bzw. ein
Verschieben / Größe ändern → windows.rs merkt sich den Platz → state.json
```

Die Fensterliste ist fest (`windows.rs`), Nebenfenster werden beim Schließen nur versteckt. Messung und Begründung:
[ADR 0008](decisions/0008-mehrere-fenster.md).

## Projektstruktur

```text
crates/fc-core/          Rust-Kern (kein Tauri)
  src/audio/             player, decode, resample, dts, formats, output, tone
  src/session.rs         Player + Playlist + Persistenz
  src/playlist.rs, metadata.rs, storage.rs, error.rs
  src/skins/             manifest (Schema, Prüfung), Bibliothek, ZIP-Import
  tests/formats.rs       Dekodieren und Seek an echten Dateien
  tests/player.rs        die Engine gegen ein simuliertes Ausgabegerät
  tests/session.rs       Titelwechsel, defekte Dateien, Speichern/Wiederherstellen
  tests/fixtures/        selbst erzeugte Sinus-Dateien (scripts/make-fixtures.sh)
  examples/              play (Engine ohne App), probe (Symphonia + Lofty)
src-tauri/               Tauri-Schale: commands/, events.rs, windows.rs, lib.rs, capabilities/
src/app/core/            actions, backend, errors, i18n, log, player, playlist, skins, system, windows
src/app/features/        player (auch SkinnedPlayer), playlist, skins, diagnostics
skins/                   mitgelieferte Skins (ins Programm eingebettet)
src/testing/             Fake-Fassaden für Tests
docs/                    diese Dokumentation, decisions/ (ADRs)
```

## Abhängigkeiten

Neue Abhängigkeiten nur mit Begründung in dieser Tabelle. Reines Rust ohne Systembibliotheken wird bevorzugt.

### Rust

| Crate | Version | Lizenz | Wozu | Anmerkung |
| --- | --- | --- | --- | --- |
| `tauri`, `tauri-build` | 2.12 / 2.7 | MIT/Apache-2.0 | Desktop-Schale | nur in `src-tauri` |
| `tauri-plugin-log` | 2.10 | MIT/Apache-2.0 | Logdatei, auch für das Frontend | einziges Plugin mit WebView-Berechtigung |
| `tauri-plugin-dialog` | 2.8 | MIT/Apache-2.0 | System-Dialog „Datei öffnen" | nur aus Rust genutzt, keine WebView-Berechtigung |
| `symphonia` | 0.6.1 | **MPL-2.0** | Container und Decoder | reines Rust; kein Opus ([ADR 0003](decisions/0003-audio-bibliotheken.md)) |
| `symphonia-adapter-libopus` | 0.3 | MIT/Apache-2.0, libopus BSD-artig | Opus-Decoder | **C-Bibliothek, gebündelt, braucht cmake**; optionales Feature `opus` ([ADR 0006](decisions/0006-resampling-opus-seek.md)) |
| `zip`, `flate2` | 9.5 / 1.1 | MIT bzw. MIT/Apache-2.0 | Skin-Pakete entpacken | nur Deflate, reines Rust (miniz_oxide) |
| `rubato` | 5.1 | MIT/Apache-2.0 | Resampling auf die Geräterate | reines Rust |
| `cpal` | 0.18.2 | Apache-2.0 | Audio-Ausgabe | CoreAudio, WASAPI, ALSA |
| `serde`, `serde_json` | 1 | MIT/Apache-2.0 | DTOs über IPC | |
| `thiserror` | 2 | MIT/Apache-2.0 | `AppError` | |
| `log` | 0.4 | MIT/Apache-2.0 | Logging-Fassade im Kern | |
| `rtrb` | 0.4.1 | MIT/Apache-2.0 | lock-freier SPSC-Ringpuffer Engine → Callback | |
| `lofty` | 0.25.5 | MIT/Apache-2.0 | Tags: Titel, Interpret, Album, Dauer | reines Rust |

### npm

| Paket | Wozu |
| --- | --- |
| `@angular/*` 22.2 | Frontend |
| `@tauri-apps/api` 2.12 | `invoke`, `listen` (nur in `core/backend`) |
| `@tauri-apps/plugin-log` 2.10 | Frontend-Zeilen in die Logdatei (nur in `core/log`) |
| `rxjs`, `tslib` | von Angular verlangt; eigener Code nutzt RxJS bisher nicht |

Entwicklung: Angular CLI/Build, Vitest + jsdom, ESLint mit angular-eslint (inkl. Accessibility-Regeln), Prettier,
Tauri CLI.

## Abweichungen von `best-practices.md`

Die Regeln stammen aus Vorgängerprojekten; einige setzen dort vorhandene Infrastruktur voraus, die es hier noch nicht
gibt. Stand heute:

- **`pnpm texts` / `pnpm contrast`**: Prüfskripte fehlen noch. Die Vollständigkeit der Kataloge prüft
  `core/i18n/catalogs.spec.ts`; die Kontrastprüfung kommt mit dem Skin-System (Phase 4), weil dann erst mehrere
  Farbsätze existieren.
- **`tauri-plugin-log`** ist ein Plugin mit WebView-Berechtigung (`log:default`: Zeilen schreiben). Das widerspricht
  „schmale Commands statt breiter Plugins" nicht im Kern – die Berechtigung erlaubt nur das Anhängen von Logzeilen –,
  ist aber eine bewusste Ausnahme.
- **libopus** ist eine C-Bibliothek entgegen „reines Rust ohne Systembibliotheken bevorzugen": bewusst, abschaltbar,
  begründet in ADR 0006.
- Regeln zu SQL, Datenbankverbindungen, Geheimnissen und GuiExpert Table betreffen dieses Projekt (noch) nicht.
