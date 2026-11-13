# 0001 – Cargo-Workspace mit eigener Kern-Crate ohne Tauri

Status: angenommen (2026-11-13)

## Kontext

Die Audio-Engine muss unabhängig von der Oberfläche laufen und darf weder Angular noch eine WebView kennen. In einem
einzigen `src-tauri`-Crate wäre das nur eine Konvention; ein versehentliches `use tauri::…` in der Engine fiele nicht
auf.

## Entscheidung

Zwei Crates in einem Workspace:

- `crates/fc-core`: Audio und Anwendungslogik, **ohne** `tauri`-Abhängigkeit.
- `src-tauri`: Commands, Events, Lifecycle – ruft `fc-core`.

Workspace-weit gilt: `unsafe_code = "forbid"`, Clippy verbietet `unwrap`, `expect` und `panic` außerhalb von Tests.

## Folgen

- Der Compiler erzwingt die Architekturregel.
- Der Kern ist ohne App testbar und nutzbar (`cargo run -p fc-core --example play`); ein späteres CLI oder ein
  Hintergrunddienst braucht keine Umbauten.
- Tests des Kerns bauen ohne WebView-Abhängigkeiten und laufen schnell.
- Preis: DTOs, die über IPC gehen, liegen teils im Kern (`serde`), teils in `src-tauri`.
