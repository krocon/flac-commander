# 0012 – Mediensteuerung des Systems über `souvlaki`

Status: angenommen (2026-11-14)

## Kontext

Das Kontrollzentrum von macOS zeigte „Not Playing", während die App spielte, und die Medientasten der Tastatur
gingen an ihr vorbei (R9). Jedes System hat dafür eine eigene Schnittstelle: macOS `MPNowPlayingInfoCenter` und
`MPRemoteCommandCenter`, Windows die System Media Transport Controls, Linux MPRIS über D-Bus. Der Workspace verbietet
`unsafe_code`; die Schnittstellen von macOS und Windows sind ohne `unsafe` nicht aufzurufen.

## Entscheidung

- **`souvlaki` 0.9** spricht alle drei Systeme an. Es steckt in `src-tauri/src/platform/media_controls.rs`; `fc-core`
  kennt es nicht.
- **Das System ist eine weitere Ansicht des Players, wie ein Fenster.** Es bekommt, was die Engine gemeldet hat – aus
  demselben Zustands-Callback, der `player://state` sendet –, und schickt Wünsche, die denselben Weg nehmen wie die
  Knöpfe der App (`Session::play`, `next`, `previous`, `player().pause()`, `stop()`, `seek()`). Es gibt keine zweite
  Zustandsquelle.
- **Drei Threads, klar getrennt.** Der Callback der Engine kopiert nur Status, Pfad, Dauer und Position in einen
  Kanal. Der Thread „media-controls" liest Tags und Cover (einmal je Titel) und entscheidet, was das System erfahren
  muss. Das System selbst wird nur auf dem Hauptthread angefasst (`run_on_main_thread`): macOS erwartet das, unter
  Windows gehört das Objekt zum Fenster. Die Wünsche des Systems kommen auf dessen Thread an und werden sofort an
  den Thread „media-controls" weitergereicht.
- **Das System zählt die Position selbst weiter.** Es erfährt sie beim Titelwechsel, bei Pause und Wiedergabe und
  wenn unsere mehr als 1,5 s von seiner abweicht (Sprung). Die Engine meldet fünfmal je Sekunde; davon geht fast
  nichts weiter.
- **Gestoppt heißt: kein Eintrag.** Nach Stopp, nach dem Ende der Liste und ohne Titel wird der Eintrag geleert –
  aber erst nach 400 ms, weil die Engine zwischen zwei Titeln kurz „gestoppt" meldet und der Eintrag sonst flackert.
- **Cover als Datei.** Das System nimmt ein Cover als URL. Das Cover des laufenden Titels liegt als eine Datei im
  Cache-Ordner der App (`now-playing/cover-<n>`); sie wird beim Titelwechsel ersetzt, Reste räumt der nächste Start
  weg.
- **Ohne Mediensteuerung läuft die App wie bisher** (kein Sitzungsbus unter Linux, kein Fenster unter Windows): eine
  Warnung im Protokoll, sonst nichts.

## Alternativen

- **`MPNowPlayingInfoCenter` direkt über `objc2-media-player`:** bräuchte `unsafe` in unserem Code, also eine Ausnahme
  vom Lint, und deckte nur macOS ab; Windows und Linux kämen als zwei weitere eigene Anbindungen dazu.
- **Ein Tauri-Plugin:** Ein offizielles gibt es nicht. Die inoffiziellen hängen die WebView dazwischen; der Zustand
  käme dann aus dem Fenster statt aus der Engine.
- **Die Linux-Variante mit `zbus` (reines Rust):** zöge einen asynchronen D-Bus-Stapel in den Baum. `dbus` und
  `libdbus-sys` sind über den Datei-Dialog ohnehin vorhanden; neu ist dort nur `dbus-crossroads`.

## Folgen

- Neue Crates: `souvlaki`; unter macOS `objc`, `block`, `dispatch`, `malloc_buf`, `base64` (die älteren
  Objective-C-Bindungen, nicht `objc2`), unter Linux `dbus-crossroads`. Unter Windows nutzt es das vorhandene
  `windows`.
- `block` 0.1.6 löst eine „future incompatibility"-Warnung des Compilers aus (statische Variable eines unbewohnten
  Typs). Heute nur eine Warnung; wird sie zum Fehler, braucht es eine neue Version von `souvlaki` (der Autor
  kündigt eine 1.0 an) oder die direkte Anbindung. Steht in R9.
- `souvlaki` meldet unter macOS kein „Stopp" und unter keinem System Wiederholen; Zufall, Lautstärke, „Öffnen",
  „Beenden" wertet die App bewusst nicht aus.
- Unter macOS geprüft (Tests und laufende App, siehe MANUAL-TESTS). **Unter Windows und Linux nur übersetzt, nicht
  ausprobiert.**
