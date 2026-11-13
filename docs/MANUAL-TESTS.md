# Manuelle Tests

Was sich wegen echter Audio-Hardware oder echter Fenster nicht zuverlässig automatisieren lässt. Je Plattform vor
dem Abschluss einer Phase durchgehen und das Ergebnis mit Datum in die Tabelle am Ende eintragen.

## Phase 1

Vorbereitung: `pnpm tauri build --debug --bundles app` (macOS) bzw. `pnpm dev`, App starten.

| # | Schritt | Erwartet |
| --- | --- | --- |
| M1 | App starten | Fenster „FLAC Commander" erscheint, Version rechts oben, keine Fehlermeldung |
| M2 | Abschnitt „System" lesen | Plattform und Audio-Backend stimmen (macOS: CoreAudio, Windows: WASAPI, Linux: ALSA); Protokollordner existiert |
| M3 | Abschnitt „Audio-Ausgabe" lesen | Standardformat und alle Ausgabegeräte des Systems; genau eines trägt „Standard" |
| M4 | „Testton abspielen" | Knopf wird inaktiv, „Testton läuft …", **ein kurzer, leiser 440-Hz-Ton ohne Knacken**, danach „Testton abgespielt", Knopf wieder aktiv |
| M5 | Während des Tons erneut klicken (schnell doppelt) | genau ein Ton |
| M6 | Protokolldatei öffnen | Zeilen „started on …", „test tone started", „test tone finished" |
| M7 | Standardgerät im System wechseln, „Neu laden", Testton | Liste zeigt das neue Standardgerät, Ton kommt dort |
| M8 | Alle Ausgabegeräte deaktivieren (wo möglich), „Neu laden" | Hinweis „Kein Ausgabegerät gefunden", Testton-Knopf inaktiv, kein Absturz |
| M9 | Systemsprache Deutsch / Englisch | Oberfläche folgt der ersten Systemsprache |
| M10 | Fenster auf Mindestgröße ziehen | Inhalt bleibt lesbar und bedienbar, nichts wird abgeschnitten |
| M11 | Nur Tastatur: Tab bis „Testton abspielen", Leertaste | sichtbarer Fokus, Ton startet |
| M12 | Spike: `cargo run -p fc-core --example play -- <FLAC> --seconds 10` | Musik ohne Aussetzer; Ausgabe meldet `underrun callbacks: 0` |

## Ergebnisse

| Datum | Plattform | Geprüft | Ergebnis |
| --- | --- | --- | --- |
| 2026-11-13 | macOS 27, Apple Silicon, CoreAudio, eingebaute Lautsprecher | M1–M4, M6 in der gebündelten App (Debug-Bundle); M12 mit FLAC 16/44,1, MP3 und FLAC 24/96, je 1–2 s | bestanden. Der Ton wurde nicht mit dem Ohr geprüft: belegt sind Start und Ende laut Backend, 0 Unterläufe, keine Gerätefehler. |
| – | Windows 10/11, WASAPI | – | **offen** |
| – | Linux (ALSA/PipeWire) | – | **offen** |

Offen auch unter macOS: M5, M7–M11.

## Ab Phase 2 (Vorschau)

Wiedergabe über längere Zeit ohne Aussetzer, Seek, Pause/Fortsetzen, Lautstärke, Gerät abziehen während der
Wiedergabe, Ruhezustand und Aufwachen, Wiedergabe läuft weiter beim Neuladen der WebView, Dateien mit 44,1/48/96/192
kHz auf einem 48-kHz-Gerät.
