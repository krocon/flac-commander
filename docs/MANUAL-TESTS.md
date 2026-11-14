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

## Phase 4

| # | Schritt | Erwartet |
| --- | --- | --- |
| S1 | „Skins" (oder ⌘K / Strg+K) | eigenes Fenster mit allen Skins samt Vorschau, Vinyl aktiv |
| S2 | Retro „Verwenden" | Fenster wird 320 × 440 (Inhalt), grünes Display, Pixel-Tasten, Playlist im Skin; nichts ist abgeschnitten, keine Rollbalken am Fenster; Musik läuft dabei weiter |
| S3 | Im Retro-Skin alles bedienen: Tasten, beide Regler, Playlist, Tastenkürzel | wie im Standard-Skin; gedrückte und aktive Tasten sehen anders aus; Tooltips mit Kürzel |
| S4 | Einen eigenen Skin importieren (Kopie von `skins/retro` mit anderer `id`, als ZIP) | „… wurde installiert", erscheint in der Liste, lässt sich verwenden und entfernen |
| S5 | Ein ZIP importieren, dessen `skin.json` einen Fehler hat (z. B. `"accent": "red"`) | Ablehnung mit Liste der Verstöße; der aktive Skin bleibt |
| S6 | ⌘0 / Strg+0 im Retro-Skin | zurück zu Vinyl (Standard) |
| S7 | App mit aktivem Retro-Skin beenden und neu starten | startet im Retro-Skin in der richtigen Größe |
| S8 | Nur Tastatur im Retro-Skin: Tab durch alle Bausteine | sichtbarer Fokus auf jedem Baustein, sinnvolle Reihenfolge |
| S9 | Den aktiven importierten Skin entfernen | die App wechselt auf Vinyl |

## Phase 5

| # | Schritt | Erwartet |
| --- | --- | --- |
| W1 | Knopf „Playlist ⧉" (oder ⌘L / Strg+L) | eigenes Playlist-Fenster erscheint; im Hauptfenster verschwindet die Liste |
| W2 | Im Playlist-Fenster: Doppelklick, Entf, Dateien fallen lassen, Leertaste | Wiedergabe und Liste ändern sich; das Hauptfenster zeigt Titel und Zeit dazu |
| W3 | Im Hauptfenster Titel wechseln, Skin wechseln | Markierung im Playlist-Fenster wandert mit; Farben wechseln in beiden Fenstern |
| W4 | Playlist-Fenster über seinen Schließen-Knopf schließen | Fenster weg, Liste wieder im Hauptfenster; die Musik läuft weiter |
| W5 | Beide Fenster verschieben, App beenden, neu starten | beide Fenster an ihrem Platz und in ihrer Größe |
| W6 | Das Playlist-Fenster auf einen zweiten Bildschirm legen, App beenden, Bildschirm abziehen, starten | das Fenster erscheint auf dem verbliebenen Bildschirm |
| W7 | Hauptfenster schließen, während das Playlist-Fenster offen ist | die App endet und speichert ihren Zustand |

## Phase 6

| # | Schritt | Erwartet |
| --- | --- | --- |
| A1 | Equalizer-Fenster öffnen (⌘E / Strg+E), „Equalizer an", einzelne Bänder ziehen | der Klang ändert sich sofort und passend zum Band (31 Hz: Bass, 16 kHz: Höhen); kein Knacken beim Ziehen |
| A2 | Voreinstellungen durchschalten, „Zurücksetzen" | Regler springen, Klang folgt; ändert man danach einen Regler, zeigt die Auswahl „Eigene" |
| A3 | Alle Bänder und die Vorverstärkung auf +12 dB bei lauter Musik | verzerrt (erwartet, kein Limiter) – aber kein Absturz, keine Aussetzer |
| A4 | Equalizer einstellen, App neu starten | Einstellungen und Schalter wie zuvor |
| A5 | Visualizer im Player ansehen; Pause; Stopp | Balken folgen der Musik (Bass links, Höhen rechts) und fallen bei Pause und Stopp auf null |
| A6 | Systemeinstellung „Bewegung reduzieren" einschalten, App neu starten | kein Visualizer |
| A7 | Ein Live-Album oder ein durchgehendes Werk in FLAC abspielen | die Titel gehen ohne Pause und ohne Knacken ineinander über; die Anzeige wechselt genau am Übergang |
| A8 | Dasselbe mit MP3; mit Zufall; „Titel wiederholen" | keine hörbare Pause (bei MP3 je nach Datei ein winziger Absatz möglich) |

## Phase 7

Dafür braucht es klassische `.wsz`-Dateien, die Sie besitzen dürfen; im Repository liegt keine.

| # | Schritt | Erwartet |
| --- | --- | --- |
| K1 | Drei bis fünf verschiedene `.wsz` importieren | jeder erscheint mit seinem Dateinamen in der Liste; Vorschau zeigt das Hauptfenster |
| K2 | Einen davon verwenden und jede Taste mit dem Original vergleichen | Gesicht 275 × 116 stimmt; **jede Taste zeigt ihr eigenes Bild, normal und gedrückt, an der richtigen Stelle** – Abweichungen sind Fehler in der Koordinatentabelle ([WINAMP-SKINS.md](WINAMP-SKINS.md) Abschnitt 2) |
| K3 | Zufall und Wiederholen einschalten; EQ- und PL-Taste | „an"-Bild erscheint; die Fenster öffnen sich |
| K4 | Titel, Zeit, Regler, Visualizer im Display | an plausibler Stelle, lesbar (bei hellen Displays evtl. schlecht – bekannt) |
| K5 | Einen Skin exportieren, in der Liste entfernen, die exportierte Datei importieren | identischer Skin ist wieder da |
| K6 | Ein beliebiges ZIP ohne `main.bmp` und ohne `skin.json` importieren | Ablehnung mit Grund, nichts wird installiert |

## Bibliothek

Braucht eine echte Sammlung: Ordner je Interpret und Album, Cover in den Tags und als `cover.jpg`, einige Alben ohne.

| # | Schritt | Erwartet |
| --- | --- | --- |
| B1 | ⌘B / Strg+B im Hauptfenster, auch mit einem Skin mit eigenem Layout | Fenster „Library" öffnet sich; erneut: schließt sich; der Knopf im Standard-Layout zeigt den Zustand |
| B2 | „Ordner hinzufügen", einen Musikordner wählen | Ordner-Dialog des Systems; der Ordner erscheint als Kachel; unten zählt „Bibliothek wird eingelesen … n Titel" hoch, das Fenster bleibt bedienbar |
| B3 | Durch Ordner klicken; Breadcrumb zurück | Ordner öffnen mit einem Klick; Breadcrumb zeigt den Weg; „Bibliothek" führt zur Liste der Musikordner |
| B4 | Einen Interpreten-Ordner mit vielen Alben öffnen, scrollen | **Cover erscheinen zügig, Scrollen ruckelt nicht**; Alben ohne Cover zeigen die Platzhalter-Scheibe; Name und Interpret stehen darunter |
| B5 | Album einmal anklicken; doppelklicken | Klick: Rahmen und drei Knöpfe; Doppelklick: **Playlist wird ersetzt, das Album spielt ab Titel 1** |
| B6 | „+" auf einer Kachel bei laufender Musik | Titel hängen an der Playlist, die Musik läuft weiter; unten steht „n Titel zur Playlist hinzugefügt" |
| B7 | Album öffnen (Listen-Knopf oder Tab + Enter) | großes Cover, Album, Interpret, Titelliste mit Dauern; Doppelklick auf einen Titel spielt genau diesen |
| B8 | Suchen: Teil eines Albumnamens; Interpret; Titel; zwei Wörter | Alben und Titel erscheinen beim Tippen; Esc leert die Suche; während des Einlesens kommen Treffer nach |
| B9 | App beenden und neu starten, Bibliothek öffnen | Ordner sind noch da; Fenster am alten Platz; Cover erscheinen sofort (aus dem Cache) |
| B10 | Kachel eines Musikordners: „✕" | Ordner verschwindet aus der Bibliothek, auf der Platte ändert sich nichts |
| B11 | System auf hell und auf dunkel stellen; mehrere Skins durchschalten | das Bibliotheksfenster folgt dem System, **nicht** dem Skin; Kontrast in beiden gut lesbar |
| B12 | Fenster auf Mindestgröße ziehen | Raster bricht um, Kopfzeile bricht um, nichts wird abgeschnitten |
| B13 | Nur Tastatur: Tab durch Kopfzeile, Kacheln, Knöpfe; ⌘F | sichtbarer Fokus; Enter öffnet ein Album bzw. spielt einen Titel; Leertaste auf einer Kachel wirkt wie Enter |
| B14 | Externe Platte als Musikordner, abziehen, App neu starten | der Ordner steht noch in der Liste, leer; Öffnen meldet „Datei nicht gefunden"; nach dem Anstecken und „Neu einlesen" ist alles da |
| B15 | Große Sammlung (> 10 000 Titel): Zeit bis „n Titel in m Ordnern" notieren; währenddessen Musik hören | **keine Aussetzer**; Zeit in die Ergebnistabelle |
| B16 | Hauptfenster im Standard-Layout auf Mindestbreite | vier Knöpfe in einer Zeile, der Titel „FLAC Commander" weicht |

## Ergebnisse

| Datum | Plattform | Geprüft | Ergebnis |
| --- | --- | --- | --- |
| 2026-11-13 | macOS 27, Apple Silicon, CoreAudio, eingebaute Lautsprecher | Phase 1: M1–M4, M6 in der gebündelten App (Debug-Bundle) | bestanden. Der Ton wurde nicht mit dem Ohr geprüft: belegt sind Start und Ende laut Backend und keine Gerätefehler. |
| 2026-11-13 | macOS 27, Apple Silicon, CoreAudio, eingebaute Lautsprecher, 48 kHz | Phase 2 in der gebündelten App: P1 (FLAC 16/44,1), P3 (Klick auf die Leiste), P2 (nur Pause: Zeit steht), P7 (nur →). Engine ohne App: FLAC ab Minute 1, MP3, DTS-WAV abgelehnt | bestanden, 0 Unterläufe. Nicht mit dem Ohr geprüft (4 % Lautstärke, niemand hat zugehört): belegt sind laufende Position, Zustände und fehlende Unterläufe. |
| 2026-11-13 | macOS 27, Apple Silicon | Phase 3 in der gebündelten App: L1 (Ordner mit 12 MP3), L4 (Sprung ans Ende → nächster Titel), L5 (nur „Nächster"), L10 (Neustart) | bestanden: Tags und Dauern erscheinen, Titelwechsel, Liste, Titel, Position 0:06 und Lautstärke 4 % nach dem Neustart wiederhergestellt. |
| 2026-11-13 | macOS 27, Apple Silicon | Phase 4 in der gebündelten App: S1, S2, S7 | bestanden nach zwei Korrekturen (Fensterhöhe ohne Titelleiste, Regler und Playlist-Knöpfe im schmalen Skin). |
| 2026-11-13 | macOS 27, Apple Silicon | Phase 5: Neustart mit gespeichertem Playlist-Fenster (W5 teilweise) | bestanden laut Fensterliste und Protokoll: beide Fenster an ihrem Platz, beide Frontends melden „ready". **Nicht gesehen:** der Bildschirm war gesperrt, Aufnahmen der Fenster waren leer; W1–W4, W6, W7 offen. |
| 2026-11-14 | macOS 27, Frontend im Browser ohne Backend (Testdaten statt Rust) | Bibliothek: nur das Aussehen – Ordnerliste, Raster, Album, Suche, hell und dunkel, 420 px Breite; B16 (Kopfzeile des Hauptfensters bei 380–640 px) | bestanden. **Nicht in der App geprüft:** Ordner-Dialog, Einlesen, echte Cover über `libcover://`, Abspielen, Fenster öffnen und Wiederherstellen (B1–B15). |
| – | Windows 10/11, WASAPI | – | **offen** |
| – | Linux (ALSA/PipeWire) | – | **offen** |

Offen auch unter macOS: Phase 1 M5, M7–M11; Phase 2 P4–P6, P8–P14 und der Rest von P2 und P7; Phase 3 L2, L3,
L6–L9, L11, L12 und der Rest von L5; Phase 4 S3–S6, S8, S9; Phase 5 W1–W4, W6, W7; Phase 6 A1–A8; Phase 7 K1–K6; Bibliothek B1–B15. Ab Phase 5
wurde nichts davon gesehen oder gehört – der Bildschirm war gesperrt; belegt ist es nur durch Tests.
