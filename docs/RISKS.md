# Technische Risiken und offene Entscheidungen

Stand: Ende Phase 1.

## Risiken

| # | Risiko | Befund / Auswirkung | Maßnahme | Phase |
| --- | --- | --- | --- | --- |
| R1 | **Opus fehlt** | Symphonia 0.6.1 liest Ogg, hat aber keinen Opus-Decoder (Test `opus_is_refused_as_unsupported`). | Decoder-Adapter evaluieren (auf crates.io gefunden, **ungeprüft**: `symphonia-opus`, `symphonia-adapter-libopus`); bis dahin sauber ablehnen. | 2 |
| R2 | **Geräterate wird systemweit umgestellt** | Unter macOS ändert ein Strom mit abweichender Rate das Gerät dauerhaft (in Phase 0 beobachtet). | Standard: Resampling auf Geräterate; Umschalten nur als Einstellung mit Wiederherstellung. | 2 |
| R3 | **DTS in WAV** | Wird als PCM erkannt und würde als lautes Rauschen abgespielt (Datei in `samples/`). | DTS-Syncwort in den ersten Frames prüfen und ablehnen. | 2 |
| R4 | **Audio-Ausgabe unter Windows und Linux ungeprüft** | Die CI kompiliert und testet, hat aber keine Audio-Hardware. | Manuelle Tests je Plattform ([MANUAL-TESTS.md](MANUAL-TESTS.md)), bevor Phase 2 als fertig gilt. | 2 |
| R5 | **Gerätewechsel** | CPAL meldet einen Wechsel des Standardgeräts nicht überall; abgezogene Geräte kommen als Stromfehler. | Wiederherstellung über den Fehler-Callback; je Plattform manuell prüfen. | 2 |
| R6 | **Mehrere WebViews** | Jedes Fenster ist ein eigener WebView-Prozess mit eigenem Angular-Zustand; sechs Fenster kosten Speicher und Startzeit. | Messen, bevor das Fensterkonzept festgelegt wird; Alternative: mehrere „Fenster" als Bereiche einer WebView, nur abgelöste Fenster als eigene WebView. | 5 |
| R7 | **Rahmenlose/transparente Fenster** | Pixelgenaue Skins brauchen Fenster ohne Systemrahmen; Verhalten (Schatten, Ziehen, Größenänderung, Transparenz) unterscheidet sich je Plattform, unter Linux je Compositor. | Früh ein Prototyp-Fenster je Plattform; Skin-Format erlaubt einen Rückfall auf den Systemrahmen. | 4–5 |
| R8 | **WebKitGTK unter Linux** | Andere Engine als unter macOS/Windows: Unterschiede bei CSS und Performance möglich. | Skins unter Linux in den manuellen Tests; keine Engine-spezifischen CSS-Funktionen ohne Fallback. | 4 |
| R9 | **Medientasten und Tray** | Kein einheitlicher Weg; macOS verlangt „Now Playing"-Integration, Linux MPRIS. | Bibliothek evaluieren (Kandidat `souvlaki`, ungeprüft), hinter `platform/` kapseln. | nach 3 |
| R10 | **AAC-Varianten** | Geprüft ist nur AAC-LC. HE-AAC/HE-AACv2 und geschützte Dateien sind ungeprüft. | Testdateien ergänzen; nicht Unterstütztes ablehnen. | 2 |
| R11 | **Symphonia ist MPL-2.0** | Dateibezogenes Copyleft: Änderungen an Symphonia-Dateien müssten offengelegt werden; die Nutzung als Bibliothek ist unkritisch. | In der Lizenzentscheidung und in den Drittlizenzen des Bundles berücksichtigen. | vor Release |
| R12 | **Unsignierte Builds** | Ohne Signatur/Notarisierung warnen macOS und Windows beim Start. | Zertifikate und Release-Workflow vor dem ersten öffentlichen Build. | vor Release |
| R13 | **Winamp-Skins (`.wsz`)** | Bitmaps mit festen Sprite-Positionen, Regionen, Bitmap-Schriften; Rechte an fremden Skins liegen bei deren Autoren. | Erst Analyse und Mapping (Phase 7), kein fremder Skin im Repo, kein Code aus Webamp ohne Lizenzprüfung. | 7 |
| R14 | **Große Bibliotheken** | Zehntausende Titel dürfen weder Start noch Fenster blockieren. | Scan im Hintergrund, inkrementell, abbrechbar; Fenster holt Seiten statt der ganzen Liste. | 3+ |

## Offene Entscheidungen

| # | Frage | Vorschlag | Braucht |
| --- | --- | --- | --- |
| E1 | **Lizenz des Projekts** | MIT wie die Vorgängerprojekte; verträgt sich mit allen heutigen Abhängigkeiten (Symphonia MPL-2.0 bleibt MPL). Bis zur Entscheidung gibt es keine `LICENSE`-Datei und keine Lizenzangabe in den Manifesten. | Entscheidung des Eigentümers |
| E2 | **Resampler** | `rubato` (reines Rust). | Messung in Phase 2 |
| E3 | **Opus** | reiner Rust-Decoder vor C-Bindung, wenn Qualität und Pflege stimmen. | Evaluierung in Phase 2 |
| E4 | **Persistenz** | Einstellungen und Playlist als versionierte JSON-Dateien, SQLite (`rusqlite`, gebündelt) erst für die Bibliothek. | Phase 3 |
| E5 | **Datei-Dialog** | `tauri-plugin-dialog` nur aus Rust heraus (die WebView erhält keine Dialog-/Dateirechte), eigener Command liefert die Auswahl. | Phase 3 |
| E6 | **Fensterkonzept** | siehe R6: erst messen. | Phase 5 |
| E7 | **Bit-perfect-Modus** | als Einstellung, nicht als Standard (R2). | nach Phase 2 |
