# 0005 – Logging mit `log` und tauri-plugin-log

Status: angenommen (2026-11-13)

## Kontext

Fehler sollen „verständlich angezeigt und protokolliert" werden. Der Kern darf Tauri nicht kennen; das Frontend soll
in dieselbe Datei schreiben, damit ein Fehlerbericht aus einer Datei besteht.

## Entscheidung

- `fc-core` nutzt nur die Fassade `log` (`log::info!` …).
- `src-tauri` richtet `tauri-plugin-log` ein: Ausgabe auf stdout und in eine Datei im Log-Ordner des Systems,
  Rotation bei 2 MB (drei alte Dateien), `DEBUG` in Debug-Builds, `INFO` in Release-Builds.
- Panics landen über einen Hook im Protokoll.
- Das Frontend schreibt über die Fassade `LogApi` (JS-Teil des Plugins); ein eigener `ErrorHandler` protokolliert
  alles Unbehandelte. Ohne Backend (Browser) geht es auf die Konsole.
- **Nie im Audio-Callback loggen** (I/O und Sperren im Echtzeit-Pfad).

## Alternativen

Eigener Datei-Logger plus eigener Command: weniger Abhängigkeit, aber Rotation, Zeitstempel und Zielordner je
Plattform müssten selbst gebaut und getestet werden. Das Plugin ist offiziell gepflegt; die WebView-Berechtigung
(`log:default`) erlaubt nur das Anhängen von Zeilen.

## Folgen

Eine Abhängigkeit mehr und eine Plugin-Berechtigung in `capabilities/default.json` – die einzige neben
`core:default`.
