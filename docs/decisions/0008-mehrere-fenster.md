# 0008 – Mehrere Fenster: je Fenster eine WebView, Synchronität über Rust-Events

Status: angenommen (2026-11-13)

## Kontext

Die klassische Bedienung kennt getrennte, frei verschiebbare Fenster (Player, Playlist, Equalizer …). In Tauri 2 ist
jedes Fenster eine eigene WebView mit eigenem JavaScript-Kontext: Angular-Zustand wird nicht geteilt.

## Messung

macOS 27, Apple Silicon, Debug-Bundle, gemessen mit `ps` (Resident Set Size), 2026-11-13:

| | App-Prozess | WebContent | GPU | Netzwerk |
| --- | --- | --- | --- | --- |
| ein Fenster | 111 MB | 53 MB | 24 MB | 10 MB |
| zwei Fenster | 121 MB | 46 MB + 49 MB | 25 MB | 11 MB |

Ein zusätzliches Fenster kostet also rund **50–60 MB** (ein weiterer WebContent-Prozess plus etwas im App-Prozess);
GPU- und Netzwerkprozess teilen sich alle Fenster. Das zweite Fenster war nach dem Start so schnell bereit wie das
erste (beide melden sich in derselben Sekunde im Protokoll). Release-Builds und andere Plattformen sind nicht
gemessen.

## Entscheidung

- **Ein Fenster je abdockbarem Bereich, nur bei Bedarf.** Standard ist ein Fenster mit allem; die Playlist (später
  Equalizer, Visualizer) lässt sich in ein eigenes Fenster legen. Sechs Fenster wären rund 300 MB zusätzlich – das
  soll eine Wahl des Nutzers sein, nicht der Grundzustand.
- **Jedes Fenster zeigt dasselbe Frontend**; welcher Teil erscheint, entscheidet das Fenster-Label (`main`,
  `playlist`). Es gibt keine zweite Anwendung und keinen Router.
- **Synchronität über Rust:** Alle Fenster abonnieren dieselben Events (`player://state`, `playlist://state`,
  `skins://active`, `windows://state`) und holen beim Start einen Schnappschuss. Kein Fenster spricht mit einem
  anderen, keines besitzt Wiedergabezustand.
- **Die Liste der Fenster ist fest** (`windows.rs`); `windows_toggle` lehnt jedes andere Label ab. Alle Fenster haben
  dieselben minimalen Rechte.
- **Nebenfenster werden beim Schließen versteckt**, nicht zerstört: Wiederöffnen ist sofort da, der Platz bleibt.
  Das Hauptfenster beendet die App.
- **Platz, Größe und Sichtbarkeit** jedes Fensters stehen in `state.json` und werden beim Start wiederhergestellt –
  die Position nur, wenn dort noch ein Bildschirm ist.

## Folgen

- Rein fensterbezogener Zustand (Auswahl in der Playlist, offener Dialog) ist je Fenster getrennt; das ist gewollt.
- Jede Änderung der Playlist geht als ganze Liste an alle Fenster (R17) – mit mehreren Fenstern ein Grund mehr, das
  vor der Bibliothek zu ändern.
- Andocken und gemeinsames Verschieben wie bei Winamp gibt es nicht; rahmenlose Fenster ebenfalls nicht (R7).
- In einem Skin mit festem Layout bestimmt der Skin, ob die Playlist im Hauptfenster sitzt; das Playlist-Fenster
  lässt sich trotzdem per ⌘L / Strg+L öffnen.
