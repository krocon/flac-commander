# Sicherheit

## Stand heute (Phase 5)

- **Keine Netzwerkzugriffe.** Die App verbindet sich mit nichts.
- **Minimale Rechte der WebView** (`src-tauri/capabilities/default.json`): `core:default` (eigene Commands, Events)
  und `log:default` (Logzeilen anhängen). Kein Dateisystem-, Shell-, Dialog- oder HTTP-Plugin.
- **Feste Fensterliste.** Die App kennt genau ihre eigenen Fenster (`main`, `playlist`); ein Command kann kein
  anderes öffnen, und jedes Fenster lädt nur das eigene Frontend. Alle Fenster haben dieselben minimalen Rechte.
- **Strikte CSP** (`tauri.conf.json`): `default-src 'self'`, Skripte nur aus dem Bundle, Verbindungen nur zur IPC.
  Einzige Ausnahme: `style-src 'unsafe-inline'`, weil Angular Komponenten-Styles zur Laufzeit einfügt.
- **Jede Fähigkeit ist ein eigener, schmaler Command.** `system_info` liest; `start_test_tone` spielt einen festen,
  leisen Ton; die `player_*`-Commands steuern die Engine und nehmen nur Zahlen entgegen (Position, Lautstärke).
- **Die WebView nennt nie einen Dateipfad.** `playlist_open` zeigt den System-Dialog in Rust; fallengelassene
  Dateien nimmt Rust aus dem Fensterereignis. Die Playlist-Commands nehmen nur Ids, einen Modus und einen Schalter.
  Die Wahl geht direkt an die Sitzung; das Dialog-Plugin hat keine WebView-Berechtigung. Der Titel des Dialogs kommt aus dem Frontend
  und wird gekürzt und von Steuerzeichen befreit.
- **Kein `unsafe`** im eigenen Rust-Code (`unsafe_code = "forbid"`), kein `unwrap`/`expect`/`panic` außerhalb von
  Tests (Clippy, `-D warnings`).
- **Protokoll:** enthält Programmereignisse und Fehlertexte mit Dateipfaden, keine Inhalte.

## Dateien des Nutzers

- Pfade kommen aus dem Datei-Dialog des Systems, von der Kommandozeile oder (ab Phase 3) per Drag & Drop, nie aus
  Skin- oder Playlist-Inhalten ohne Prüfung. Die WebView erhält kein allgemeines Leserecht; Rust öffnet die Datei.
- Audiodateien sind fremde Daten: Decoder laufen in reinem Rust (Symphonia) – mit einer Ausnahme: Opus dekodiert
  libopus (C, abschaltbares Feature). Fehler werden zu `AppError`, nie zu einem Absturz. Dafür gibt es Tests mit beschädigten und falsch benannten Dateien.
- Metadaten (Titel, Interpret) sind fremde Daten: gekürzt, von Steuerzeichen befreit, als Text ausgegeben, nie als
  HTML.
- Ordner werden begrenzt durchsucht (Tiefe 12, 20 000 Titel); symbolischen Links auf Ordner wird nicht gefolgt.
- `state.json` wird wie fremde Daten gelesen: Werte außerhalb ihres Bereichs werden korrigiert, höchstens 50 000
  Einträge, Unlesbares wird beiseitegelegt statt die App am Start zu hindern.

## Skins

Ein Skin kommt von Dritten und ist nicht vertrauenswürdig. Das Format ([SKIN-FORMAT.md](SKIN-FORMAT.md)) ist deshalb
rein deklarativ; dazu kommen diese Regeln für den Import. Jede ist umgesetzt und hat einen Test
(`crates/fc-core/src/skins/tests.rs`, `src-tauri/src/commands/skins.rs`).

| Angriff | Regel |
| --- | --- |
| Ausführbarer Inhalt | Kein JavaScript, kein HTML, kein frei geschriebenes CSS. Werte aus dem Manifest werden typisiert (Farbe, Zahl, Aufzählung) und nur als solche gesetzt – nie als Zeichenkette in ein Stylesheet kopiert. |
| Path Traversal | Asset-Pfade sind relativ, ohne `..`, ohne absoluten Anteil, ohne Laufwerksbuchstaben oder UNC; nach dem Auflösen muss der Pfad im Skin-Ordner liegen. |
| Zip Slip | Beim Entpacken wird jeder Eintragsname wie ein Asset-Pfad geprüft; symbolische Links und Sondereinträge werden abgelehnt. |
| Dekompressionsbombe | Grenzen für Zahl der Einträge, Größe je Datei, Gesamtgröße und Kompressionsverhältnis; gezählt wird beim Entpacken, nicht nach den Angaben im Archiv. |
| Übergroße Bilder | Maße werden vor dem Dekodieren aus dem Header gelesen und begrenzt. |
| Falscher Dateityp | Erlaubt sind PNG, JPEG, WebP – erkannt am Inhalt, nicht an der Endung. |
| SVG | Nicht erlaubt: SVG kann Skripte, externe Verweise und eingebettetes HTML enthalten. |
| Nachladen aus dem Netz | Keine URLs in Manifesten; die CSP lässt ohnehin nur das eigene Schema zu. |
| Absturz durch ungültige Daten | Validierung vollständig vor dem Aktivieren; bei Fehlern bleibt der bisherige Skin. |
| Unbedienbare Oberfläche | Pflicht-Bausteine (Wiedergabe, Skin wählen) und Mindestgröße für Tasten; ⌘0 / Strg+0 stellt den Standard-Skin wieder her und gehört keinem Skin. |
| CSS einschleusen | Farben nur als `#`-Hexwerte, Schriften nur aus einem engen Zeichensatz; die Werte werden als einzelne CSS-Variablen gesetzt, nie in ein Stylesheet kopiert. |
| Eingebaute Skins überschreiben | Ein Import mit der Id eines mitgelieferten Skins wird abgelehnt. |

Skin-Bilder liefert das Protokoll `skin://` aus dem Speicher: Es kennt nur Dateien, die die Prüfung gesehen hat,
liest also nie vom Dateisystem, gibt `skin.json` nicht heraus und sendet `X-Content-Type-Options: nosniff`. Die CSP
erlaubt `skin:` ausschließlich für Bilder.

## Abhängigkeiten

Neue Crates und Pakete nur mit Begründung ([ARCHITECTURE.md](ARCHITECTURE.md), Tabelle). Reines Rust ohne
Systembibliotheken wird bevorzugt. `Cargo.lock` und `pnpm-lock.yaml` sind eingecheckt, die CI baut mit `--locked`
bzw. `--frozen-lockfile`.

## Schwachstellen melden

Solange das Projekt nicht veröffentlicht ist: als Issue im Repository oder direkt an den Eigentümer.
