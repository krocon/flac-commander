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

## Phase 2

Vorbereitung: App mit leiser Startlautstärke und einer Datei starten, z. B.
`open "target/debug/bundle/macos/FLAC Commander.app" --args --volume 0.2 /pfad/datei.flac`.

| # | Schritt | Erwartet |
| --- | --- | --- |
| P1 | Start mit Datei | Dateiname, Format (`FLAC · 44,1 kHz · 16 Bit · Stereo`), Dauer; Musik läuft, Zeit zählt hoch, „Wiedergabe läuft" |
| P2 | Pause, einige Sekunden warten, Wiedergabe | Zeit steht in der Pause; es geht an derselben Stelle weiter, ohne Knacken |
| P3 | Auf die Seekleiste klicken; Regler ziehen | Zeit springt, Musik geht dort weiter; beim Ziehen folgt die Zeitanzeige, gesprungen wird beim Loslassen |
| P4 | Zurück an den Anfang springen (FLAC!) | Musik beginnt wirklich von vorn (Symphonia-Fehler R15) |
| P5 | Lautstärkeregler ziehen | Lautstärke folgt sofort und stufenlos |
| P6 | Stopp, Wiedergabe | Zeit auf 0:00, Wiedergabe von vorn |
| P7 | Tastatur: Leertaste, ←/→, ↑/↓, V, ⌘O bzw. Strg+O | Pause/Wiedergabe, ±5 s, Lautstärke ±5 %, Stopp, Dialog |
| P8 | „Datei öffnen": je eine Datei jedes Formats; eine Textdatei mit `.mp3`; die DTS-WAV | Musik bzw. verständliche Fehlermeldung, kein Rauschen, kein Absturz |
| P9 | Während der Wiedergabe die WebView neu laden (Debug-Build: Rechtsklick → Neu laden) | Musik läuft ohne Unterbrechung weiter; das Fenster zeigt nach dem Laden Titel und laufende Zeit |
| P10 | Titel bis zum Ende laufen lassen | Stopp bei 0:00, „Gestoppt", kein Fehler |
| P11 | Während der Wiedergabe das Ausgabegerät abziehen bzw. deaktivieren, dann Wiedergabe | Pause mit Fehlermeldung, Position bleibt; Wiedergabe setzt auf dem neuen Standardgerät fort |
| P12 | 10 Minuten spielen, dabei andere Programme benutzen | keine Aussetzer; die Zeile „Aussetzer" erscheint nicht |
| P13 | Datei mit 44,1 kHz auf einem 48-kHz-Gerät; danach Systemeinstellung des Geräts prüfen | klingt richtig (Tonhöhe, Tempo); das Gerät steht weiter auf 48 kHz |
| P14 | Datei von einem Netzlaufwerk; Laufwerk während der Wiedergabe trennen | Wiedergabe, Seek ohne lange Hänger; nach dem Trennen Fehlermeldung statt Absturz |

## Phase 3

Vorbereitung: `open "target/debug/bundle/macos/FLAC Commander.app" --args --volume 0.2 /pfad/zu/einem/album`.

| # | Schritt | Erwartet |
| --- | --- | --- |
| L1 | Start mit einem Album-Ordner | alle Audiodateien des Ordners in Namensreihenfolge, erster Titel spielt; nach kurzer Zeit „Interpret – Titel" und Dauer je Zeile, unten Anzahl und Gesamtdauer |
| L2 | „Dateien hinzufügen": mehrere Dateien wählen | werden angehängt, die erste davon spielt |
| L3 | Dateien und einen Ordner aus dem Dateimanager auf das Fenster ziehen | beim Ziehen erscheint der Hinweisrahmen; nach dem Loslassen hängen die Titel an; läuft schon Musik, läuft sie weiter |
| L4 | Titel bis zum Ende laufen lassen (oder kurz vor das Ende springen) | der nächste Titel beginnt von selbst, die Markierung in der Liste wandert mit |
| L5 | Nächster/Vorheriger (Tasten B/Z); „Vorheriger" nach mehr als 3 Sekunden | Titelwechsel; nach 3 Sekunden springt „Vorheriger" an den Anfang desselben Titels |
| L6 | Wiederholen durchschalten (aus → Playlist → Titel), Zufall an/aus | Anzeige der Schalter; Verhalten am Ende des Titels bzw. der Liste passt |
| L7 | Doppelklick auf einen Eintrag; in der Liste ↑/↓, Enter, Entf | spielt; Auswahl wandert und bleibt sichtbar; Enter spielt, Entf entfernt |
| L8 | Den laufenden Titel entfernen; „Playlist leeren" | Wiedergabe stoppt, Anzeige „Kein Titel geladen" |
| L9 | Eine Textdatei als `.mp3` in die Liste | beim Abspielen durchgestrichen markiert (Tooltip mit Grund), der nächste Titel spielt |
| L10 | App beenden und neu starten | dieselbe Liste, derselbe Titel an derselben Stelle, gestoppt; Lautstärke, Wiederholen, Zufall wie zuvor |
| L11 | Vor dem Neustart eine Datei der Liste umbenennen | Eintrag bleibt, ist als nicht abspielbar markiert und wird übersprungen |
| L12 | Ordner mit einigen Tausend Titeln hinzufügen | Fenster bleibt bedienbar, Tags füllen sich nach und nach |

## Ergebnisse

| Datum | Plattform | Geprüft | Ergebnis |
| --- | --- | --- | --- |
| 2026-11-13 | macOS 27, Apple Silicon, CoreAudio, eingebaute Lautsprecher | Phase 1: M1–M4, M6 in der gebündelten App (Debug-Bundle) | bestanden. Der Ton wurde nicht mit dem Ohr geprüft: belegt sind Start und Ende laut Backend und keine Gerätefehler. |
| 2026-11-13 | macOS 27, Apple Silicon, CoreAudio, eingebaute Lautsprecher, 48 kHz | Phase 2 in der gebündelten App: P1 (FLAC 16/44,1), P3 (Klick auf die Leiste), P2 (nur Pause: Zeit steht), P7 (nur →). Engine ohne App: FLAC ab Minute 1, MP3, DTS-WAV abgelehnt | bestanden, 0 Unterläufe. Nicht mit dem Ohr geprüft (4 % Lautstärke, niemand hat zugehört): belegt sind laufende Position, Zustände und fehlende Unterläufe. |
| 2026-11-13 | macOS 27, Apple Silicon | Phase 3 in der gebündelten App: L1 (Ordner mit 12 MP3), L4 (Sprung ans Ende → nächster Titel), L5 (nur „Nächster"), L10 (Neustart) | bestanden: Tags und Dauern erscheinen, Titelwechsel, Liste, Titel, Position 0:06 und Lautstärke 4 % nach dem Neustart wiederhergestellt. |
| – | Windows 10/11, WASAPI | – | **offen** |
| – | Linux (ALSA/PipeWire) | – | **offen** |

Offen auch unter macOS: Phase 1 M5, M7–M11; Phase 2 P4–P6, P8–P14 und der Rest von P2 und P7; Phase 3 L2, L3,
L6–L9, L11, L12 und der Rest von L5.
