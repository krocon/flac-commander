# Architektur

Stand: Phase 1. Was hier als „geplant" markiert ist, existiert noch nicht.

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
│   audio/       Formate, Decoder (Symphonia), Ausgabe (CPAL), Testton │
│   error.rs     AppError / ErrorCode                                  │
│   geplant: engine, playlist, metadata, library, skins, storage       │
└──────────────────────────────────────────────────────────────────────┘
```

### Architekturregeln

1. **`fc-core` kennt weder Tauri noch eine WebView.** Der Kern ist eine eigene Crate ohne `tauri`-Abhängigkeit; der
   Compiler erzwingt die Regel. Er lässt sich aus Tests, Beispielen und der Kommandozeile betreiben
   ([ADR 0001](decisions/0001-cargo-workspace-mit-kern-crate.md)).
2. **Audio gehört dem Prozess, nicht einem Fenster.** Zustand liegt in `AppState` bzw. (ab Phase 2) in der Engine im
   Rust-Prozess. Schließen oder Neuladen einer WebView beendet keine Wiedergabe.
3. **Das Frontend simuliert keinen Backend-Zustand.** Ein Store zeigt, was Rust gemeldet hat. Beispiel heute: Der
   Testton ist „läuft", weil der Command zurückkam, und „fertig", weil das Event kam – nie wegen eines Timers.
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

### Geplant ab Phase 2: Wiedergabe

```text
UI → Command (play/pause/seek/volume) → Befehlsqueue → Engine-Thread
Engine-Thread: Decoder → Resampler → Ringpuffer (lock-frei) → Audio-Callback → Gerät
Engine-Thread → Event player://state (bei Änderung) und player://position (wenige Hz) → Stores
Neues/neu geladenes Fenster → Command player_state → vollständiger Schnappschuss
```

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
- **Event-Abos** enden mit ihrem Besitzer: `untilDestroyed(subscribe(...), destroyRef)` – auch wenn der Besitzer
  zerstört wird, bevor das Abo steht.

## Mehrere Fenster (geplant, Phase 5)

Jedes Tauri-Fenster ist eine eigene WebView mit eigenem JavaScript-Kontext; Angular-Zustand wird nicht geteilt. Die
Synchronisation läuft deshalb über Rust: Fenster abonnieren dieselben Events und holen beim Start einen Schnappschuss.
Kein Fenster startet eine eigene Engine. Offene Punkte (Speicherbedarf je WebView, rahmenlose und transparente Fenster
je Plattform, Andocken/Snapping) stehen in [RISKS.md](RISKS.md).

## Projektstruktur

```text
crates/fc-core/          Rust-Kern (kein Tauri)
  src/audio/             formats, decode, output, tone
  src/error.rs
  tests/formats.rs       Formatunterstützung an echten Dateien
  tests/fixtures/        selbst erzeugte Sinus-Dateien (scripts/make-fixtures.sh)
  examples/              play (Abspiel-Spike), probe (Symphonia + Lofty)
src-tauri/               Tauri-Schale: commands/, events.rs, lib.rs, capabilities/
src/app/core/            backend, errors, i18n, log, system
src/app/features/        diagnostics (Phase 1); player, playlist, … folgen
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
| `symphonia` | 0.6.1 | **MPL-2.0** | Container und Decoder | reines Rust; kein Opus ([ADR 0003](decisions/0003-audio-bibliotheken.md)) |
| `cpal` | 0.18.2 | Apache-2.0 | Audio-Ausgabe | CoreAudio, WASAPI, ALSA |
| `serde`, `serde_json` | 1 | MIT/Apache-2.0 | DTOs über IPC | |
| `thiserror` | 2 | MIT/Apache-2.0 | `AppError` | |
| `log` | 0.4 | MIT/Apache-2.0 | Logging-Fassade im Kern | |
| `rtrb` (dev) | 0.4.1 | MIT/Apache-2.0 | lock-freier SPSC-Ringpuffer | heute nur im Spike, ab Phase 2 regulär |
| `lofty` (dev) | 0.25.5 | MIT/Apache-2.0 | Tags | heute nur zur Evaluierung, ab Phase 3 regulär |

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

- **Aktionssystem für Tastatur** (`core/actions/`): noch nicht vorhanden; Phase 1 hat nur native Buttons. Es kommt mit
  der Player-Oberfläche (Phase 2), bevor das erste Tastenkürzel entsteht.
- **`pnpm texts` / `pnpm contrast`**: Prüfskripte fehlen noch. Die Vollständigkeit der Kataloge prüft
  `core/i18n/catalogs.spec.ts`; die Kontrastprüfung kommt mit dem Skin-System (Phase 4), weil dann erst mehrere
  Farbsätze existieren.
- **`tauri-plugin-log`** ist ein Plugin mit WebView-Berechtigung (`log:default`: Zeilen schreiben). Das widerspricht
  „schmale Commands statt breiter Plugins" nicht im Kern – die Berechtigung erlaubt nur das Anhängen von Logzeilen –,
  ist aber eine bewusste Ausnahme.
- Regeln zu SQL, Datenbankverbindungen, Geheimnissen und GuiExpert Table betreffen dieses Projekt (noch) nicht.
