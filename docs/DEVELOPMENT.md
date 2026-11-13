# Entwicklung

## Voraussetzungen

- Node.js 22.22+ oder 24.15+, pnpm 10 (`corepack enable`)
- Rust stable 1.93+ mit `rustfmt` und `clippy`
- macOS: Xcode Command Line Tools
- Windows: WebView2 (in Windows 10/11 enthalten), MSVC-Build-Tools
- Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev
  libasound2-dev`
- Nur zum Neuerzeugen der Testdateien: ffmpeg mit `libmp3lame` und `libopus`

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `pnpm install` | Abhängigkeiten |
| `pnpm dev` | Desktop-App im Entwicklungsmodus (startet `ng serve` auf Port 1460 und das Rust-Programm) |
| `pnpm start` | nur das Frontend im Browser – ohne Backend, die App zeigt dann „Desktop-Backend nicht verfügbar" |
| `pnpm test` | Frontend-Tests (Vitest) |
| `pnpm lint` | ESLint inkl. Accessibility-Regeln für Templates |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm build` | Frontend-Build nach `dist/` |
| `pnpm rust:test` | alle Rust-Tests |
| `pnpm rust:lint` | Clippy mit `-D warnings` |
| `pnpm rust:fmt` | `cargo fmt --check` |
| `pnpm check` | alles oben, in der Reihenfolge der CI |
| `pnpm tauri build --debug --bundles app` | gebündelte App zum Ausprobieren (`target/debug/bundle/`) |
| `pnpm tauri:build:mac` / `:linux` / `:windows` | Release-Pakete je Plattform |
| `pnpm fixtures` | Testdateien neu erzeugen (`scripts/make-fixtures.sh`) |

### Der Kern ohne App

```bash
cargo run -p fc-core --example probe -- "datei.flac" "datei.mp3"
```

```bash
cargo run -p fc-core --example play -- "datei.flac" --seconds 10 --gain 0.3
```

`play` fragt das Gerät nach der Abtastrate der Datei. Unter macOS stellt das das Gerät systemweit um und es bleibt so
(zurücksetzen in „Audio-MIDI-Setup"). Siehe [AUDIO-ENGINE.md](AUDIO-ENGINE.md).

## Protokoll

| Plattform | Ort |
| --- | --- |
| macOS | `~/Library/Logs/io.github.krocon.flac-commander/flac-commander.log` |
| Windows | `%LOCALAPPDATA%\io.github.krocon.flac-commander\logs\` |
| Linux | `~/.local/share/io.github.krocon.flac-commander/logs/` |

Der genaue Ordner steht im Fenster unter „Protokollordner". Zeitstempel sind UTC. Debug-Builds protokollieren ab
`DEBUG`, Release-Builds ab `INFO`; die Datei rotiert bei 2 MB, drei alte bleiben.

## Einen Command hinzufügen

1. Logik in `fc-core` (reines Modul, Unit-Tests daneben), Ergebnis als `AppResult<T>`.
2. Dünner `async`-Command in `src-tauri/src/commands/<bereich>.rs`; Blockierendes über `commands::blocking()`.
   In `lib.rs` bei `generate_handler!` eintragen.
3. DTO mit `#[serde(rename_all = "camelCase")]` und ein Test, der die JSON-Form festhält.
4. Frontend: Interface in `core/<bereich>/*.models.ts`, Methode in der Fassade (`*Api` + `Tauri*Api`), Fake in
   `src/testing/fake-apis.ts`.
5. Neuer Fehlercode? In `error.rs` (`ErrorCode` und `ALL`), in `app-error.ts` (`BACKEND_ERROR_CODES`), Texte in
   `error-texts.ts` und `error-texts.de.ts`. Die Tests auf beiden Seiten schlagen an, wenn eine Stelle fehlt.

Ein Event: Name und Payload in `src-tauri/src/events.rs` (mit Test der JSON-Form), im Frontend eine `on…`-Methode der
Fassade über `subscribe()`; der Store bindet das Abo mit `untilDestroyed()` an seine Lebensdauer.

## Tests

- **Rust:** Unit-Tests neben dem Code; `crates/fc-core/tests/formats.rs` dekodiert echte Dateien. Kein Test braucht
  Audio-Hardware – was Hardware braucht, steht in [MANUAL-TESTS.md](MANUAL-TESTS.md).
- **Angular:** `*.spec.ts` neben dem Code. Stores gegen `FakeSystemApi`, deren Antworten der Test selbst auslöst
  (`Deferred`). **Keine festen Pausen:** Tests warten mit `vi.waitFor` auf den Zustand, den sie prüfen.
- **Ende zu Ende:** die gebündelte App starten und die manuellen Tests durchgehen.

## Regeln

Verbindlich ist [best-practices.md](best-practices.md). Was davon hier noch nicht gilt, steht in
[ARCHITECTURE.md](ARCHITECTURE.md) unter „Abweichungen".

Git: ein Branch `feat/<slug>` je Prompt, Commits nach jeder grünen Phase (Conventional Commits).
