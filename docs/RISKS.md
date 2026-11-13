# Technische Risiken und offene Entscheidungen

Stand: Ende Phase 2.

## Risiken

| # | Risiko | Befund / Auswirkung | Maßnahme | Phase |
| --- | --- | --- | --- | --- |
| R1 | **Opus nur über C-Bibliothek** | Symphonia 0.6.1 hat keinen Opus-Decoder. Gelöst mit `symphonia-adapter-libopus` (Feature `opus`); der Build braucht dafür cmake und einen C-Compiler. | Neu bewerten, sobald Symphonia Opus kann oder ein Rust-Decoder gereift ist ([ADR 0006](decisions/0006-resampling-opus-seek.md)). | erledigt, beobachten |
| R2 | **Geräterate wird systemweit umgestellt** | Unter macOS ändert ein Strom mit abweichender Rate das Gerät dauerhaft (in Phase 0 beobachtet). | **Gelöst:** Die Engine resampelt auf die Geräterate und stellt das Gerät nie um. | erledigt |
| R3 | **DTS in WAV** | Wird als PCM erkannt und würde als lautes Rauschen abgespielt (Datei in `samples/`). | **Gelöst:** Erkennung am Syncwort, Ablehnung mit `unsupported_format` (Test und echte Datei). | erledigt |
| R4 | **Audio-Ausgabe unter Windows und Linux ungeprüft** | Die CI kompiliert und testet, hat aber keine Audio-Hardware. | Manuelle Tests je Plattform ([MANUAL-TESTS.md](MANUAL-TESTS.md)). **Weiter offen** – dafür braucht es einen Windows- und einen Linux-Rechner. | offen |
| R5 | **Gerätewechsel** | CPAL meldet einen Wechsel des Standardgeräts nicht überall; abgezogene Geräte kommen als Stromfehler. | Stromfehler sind behandelt (Pause, Fortsetzen auf neuem Gerät). **Offen:** ein Wechsel des Standardgeräts ohne Fehler wird nicht bemerkt. | 3 |
| R6 | **Mehrere WebViews** | Jedes Fenster ist ein eigener WebView-Prozess mit eigenem Angular-Zustand; sechs Fenster kosten Speicher und Startzeit. | Messen, bevor das Fensterkonzept festgelegt wird; Alternative: mehrere „Fenster" als Bereiche einer WebView, nur abgelöste Fenster als eigene WebView. | 5 |
| R7 | **Rahmenlose/transparente Fenster** | Pixelgenaue Skins brauchen Fenster ohne Systemrahmen; Verhalten (Schatten, Ziehen, Größenänderung, Transparenz) unterscheidet sich je Plattform, unter Linux je Compositor. | Früh ein Prototyp-Fenster je Plattform; Skin-Format erlaubt einen Rückfall auf den Systemrahmen. | 4–5 |
| R8 | **WebKitGTK unter Linux** | Andere Engine als unter macOS/Windows: Unterschiede bei CSS und Performance möglich. | Skins unter Linux in den manuellen Tests; keine Engine-spezifischen CSS-Funktionen ohne Fallback. | 4 |
| R9 | **Medientasten und Tray** | Kein einheitlicher Weg; macOS verlangt „Now Playing"-Integration, Linux MPRIS. | Bibliothek evaluieren (Kandidat `souvlaki`, ungeprüft), hinter `platform/` kapseln. | nach 3 |
| R10 | **AAC-Varianten** | Geprüft ist nur AAC-LC. HE-AAC/HE-AACv2 und geschützte Dateien sind ungeprüft. | Testdateien ergänzen; nicht Unterstütztes ablehnen. | 2 |
| R11 | **Symphonia ist MPL-2.0** | Dateibezogenes Copyleft: Änderungen an Symphonia-Dateien müssten offengelegt werden; die Nutzung als Bibliothek ist unkritisch. | In der Lizenzentscheidung und in den Drittlizenzen des Bundles berücksichtigen. | vor Release |
| R12 | **Unsignierte Builds** | Ohne Signatur/Notarisierung warnen macOS und Windows beim Start. | Zertifikate und Release-Workflow vor dem ersten öffentlichen Build. | vor Release |
| R13 | **Winamp-Skins (`.wsz`)** | Bitmaps mit festen Sprite-Positionen, Regionen, Bitmap-Schriften; Rechte an fremden Skins liegen bei deren Autoren. | Erst Analyse und Mapping (Phase 7), kein fremder Skin im Repo, kein Code aus Webamp ohne Lizenzprüfung. | 7 |
| R15 | **Symphonia-Fehler: FLAC-Rückwärts-Seek** | Nach einem Seek zurück liefert der FLAC-Leser ein Paket der neuen Stelle und fährt dann an der alten fort. | Umgangen: Strom je Seek neu öffnen, nur vorwärts suchen; durch Tests abgesichert. Upstream melden. | umgangen |
| R16 | **Volle Lautstärke beim Start** | Die Lautstärke wird noch nicht gespeichert und beginnt bei 100 %. | Speichern mit den Einstellungen. | 3 |
| R14 | **Große Bibliotheken** | Zehntausende Titel dürfen weder Start noch Fenster blockieren. | Scan im Hintergrund, inkrementell, abbrechbar; Fenster holt Seiten statt der ganzen Liste. | 3+ |

## Offene Entscheidungen

| # | Frage | Vorschlag | Braucht |
| --- | --- | --- | --- |
| E1 | **Lizenz des Projekts** | MIT wie die Vorgängerprojekte; verträgt sich mit allen heutigen Abhängigkeiten (Symphonia MPL-2.0 bleibt MPL). Bis zur Entscheidung gibt es keine `LICENSE`-Datei und keine Lizenzangabe in den Manifesten. | Entscheidung des Eigentümers |
| E2 | ~~Resampler~~ | entschieden: `rubato` ([ADR 0006](decisions/0006-resampling-opus-seek.md)) | – |
| E3 | ~~Opus~~ | entschieden: libopus-Adapter als Feature ([ADR 0006](decisions/0006-resampling-opus-seek.md)) | – |
| E4 | **Persistenz** | Einstellungen und Playlist als versionierte JSON-Dateien, SQLite (`rusqlite`, gebündelt) erst für die Bibliothek. | Phase 3 |
| E5 | ~~Datei-Dialog~~ | umgesetzt: `tauri-plugin-dialog` nur aus Rust, die WebView hat keine Dialog- oder Dateirechte | – |
| E6 | **Fensterkonzept** | siehe R6: erst messen. | Phase 5 |
| E7 | **Bit-perfect-Modus** | als Einstellung, nicht als Standard (R2). | nach Phase 2 |
