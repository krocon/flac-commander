# 0007 – Skins sind geprüfte Daten: deklaratives Format, zwei Layout-Arten, eingebettete Standard-Skins

Status: angenommen (2026-11-13)

## Kontext

Skins sind das Unterscheidungsmerkmal des Produkts und kommen von Dritten. Sie sollen mehr ändern als Farben, dürfen
aber weder Code ausführen noch die App unbedienbar machen oder zum Absturz bringen.

## Entscheidung

- **Rein deklarativ.** `skin.json` plus Bilder (PNG, JPEG, WebP). Kein JavaScript, kein HTML, kein CSS-Text, kein SVG.
  Werte sind typisiert (Farbe als Hexwert, Zahl in Grenzen, Wert aus fester Liste) und werden einzeln gesetzt.
- **Bausteine und Aktionen gehören der App.** Ein Skin wählt aus einem festen Katalog und platziert; Verhalten,
  Namen, Tastatur und Vorlesen bleiben gleich. Tasten führen Aktionen des Aktionssystems aus.
- **Zwei Layout-Arten.** `flow`: die App legt an, der Skin färbt (moderne, veränderbare Fenster). `absolute`: der
  Skin platziert jeden Baustein in einem Fenster fester Größe (pixelgenaue Skins).
- **Prüfung vollständig in Rust**, vor der ersten Anzeige, mit allen Verstößen auf einmal. Unbekannte Schlüssel sind
  Fehler (`deny_unknown_fields`): Tippfehler fallen auf, und spätere Erweiterungen können nicht still ignoriert
  werden.
- **Skins leben im Speicher.** Nach der Prüfung hält die Bibliothek die Dateien; das Protokoll `skin://` liefert nur
  daraus. Zwischen Prüfung und Auslieferung kann keine Datei ausgetauscht werden.
- **Mitgelieferte Skins sind ins Programm eingebettet** (`include_bytes!`), nicht als Ressourcen im Bundle: gleicher
  Weg auf allen Plattformen, kein Pfad, der im Paket anders liegt. Ein Test hält die Liste mit `skins/` gleich.
- **Der Weg zurück ist Pflicht:** Taste „Skin wählen" in jedem `absolute`-Skin, dazu ⌘0 / Strg+0 außerhalb jedes
  Skins.
- **`zip` + `flate2` (reines Rust, nur Deflate)** für den Import, mit eigenen Grenzen, die beim Entpacken zählen.

## Alternativen

- **CSS-Dateien im Skin:** größte Freiheit, aber CSS kann Inhalte nachladen (`url()`), Bedienelemente verstecken und
  über Selektoren Daten abgreifen; eine sichere Teilmenge zu filtern ist ein eigenes Projekt.
- **Skins als Ressourcen im Bundle:** spart ein paar hundert Kilobyte im Programm, kostet plattformabhängige Pfade.
- **Winamp-Format als natives Format:** bindet das Produkt an feste Sprite-Positionen von 1998; es wird stattdessen
  ein Importer (Phase 7).

## Folgen

- Ein Skin kann nichts, was der Katalog nicht hergibt; neue Wünsche heißen neue Bausteine oder Felder in einer neuen
  Formatversion.
- Regler und Schriften zeichnet weiterhin die App (in den Farben des Skins): pixelgenaue Regler und Bitmap-Schriften
  fehlen noch.
- Die Fenstergröße eines `absolute`-Skins muss je Plattform stimmen; die App misst nach und korrigiert
  (`skins_fit_viewport`).
