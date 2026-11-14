# 0011 – Bibliothek: Ordner statt Datenbank, Index im Speicher, Cover als kleine Bilder

Status: angenommen (2026-11-14)

## Kontext

Die App hatte nur eine Playlist, gefüllt über Dialog, Drag & Drop oder Kommandozeile. Gewünscht ist: durch Ordner
gehen, Alben als Raster von Covern sehen, suchen, abspielen. Die Roadmap sah dafür eine SQLite-Bibliothek vor.

## Entscheidung

**Die Bibliothek ist eine Sicht auf das Dateisystem, keine Datenbank.**

- Der Nutzer wählt Wurzelordner (Ordner-Dialog in Rust); sie stehen in `state.json`. Ein Ordner mit Audiodateien ist
  ein „Album", sein Name der Ordnername, Interpret und Album kommen aus den Tags des ersten Titels.
- **Durchsuchen** liest den gefragten Ordner direkt. **Suchen** nutzt einen Index im Arbeitsspeicher, den ein
  Hintergrund-Thread beim ersten Öffnen des Bibliotheksfensters aufbaut (alle Tags aller Titel, höchstens 200 000).
  Der Index wächst sichtbar; die Suche findet, was schon gelesen ist. Nichts davon wird gespeichert.
- **Pfade:** Das Fenster nennt Dateien und Ordner mit den Pfaden, die Rust ihm gegeben hat. Jeder Pfad wird vor
  jedem Zugriff kanonisch gemacht und muss in einem Wurzelordner liegen (`Library::resolve`); Links werden weder
  gelistet noch verfolgt. Das ist die eine Ausnahme von „die WebView nennt nie einen Pfad" ([SECURITY.md](../SECURITY.md)).
- **Cover** liefert ein eigenes Protokoll `libcover://` – nur für Pfade in der Bibliothek, sonst 404. Ausgeliefert
  wird nie das Original, sondern ein JPEG mit höchstens 360 px Kantenlänge, einmal erzeugt und im Cache-Ordner der
  App abgelegt (Name aus Pfad, Größe und Datum der Datei und des Ordners). Vier Threads erzeugen sie, nicht der
  Haupt-Thread.
- **Bildbibliothek:** Dafür kommt die Crate `image` in den Kern, beschränkt auf JPEG, PNG und WebP (reines Rust,
  acht neue Crates im Baum). ADR 0010 kam ohne aus, weil BMP lesen und PNG schreiben klein sind; JPEG dekodieren und
  skalieren ist es nicht. Cover sind fremde Daten: Die Decoder haben Grenzen (10 000 px je Seite, 256 MB), ein
  Fehler ergibt „kein Cover".
- **Aussehen:** Das Bibliotheksfenster trägt nicht den Skin. Es folgt dem System (hell/dunkel) und sieht bei jedem
  Skin gleich aus; erreichbar ist es über die Aktion `window.library` (⌘B / Strg+B), die auch Skins binden können.

## Folgen

- Keine Migrationen, keine Datei, die veralten oder kaputtgehen kann; ein umbenannter Ordner ist sofort richtig.
- Jeder Programmlauf liest die Tags neu, sobald das Bibliotheksfenster zum ersten Mal Daten braucht. Bei sehr großen
  Sammlungen oder Netzlaufwerken dauert das; gemessen ist es noch nicht. „Neu einlesen" ist ein Knopf, kein Wächter:
  Änderungen auf der Platte erscheinen im Index erst danach (beim Durchsuchen sofort).
- Kein Sortieren nach Jahr, kein „alle Alben eines Interpreten" über Ordnergrenzen hinweg – dafür bräuchte es ein
  Modell der Sammlung, also doch eine Datenbank. Diese Entscheidung verbaut sie nicht: `Library` ist die Schnittstelle.
- Der Cover-Cache wächst (etwa 15–30 kB je Album) und wird nicht aufgeräumt; er liegt im Cache-Ordner des Systems
  und darf jederzeit gelöscht werden.
- Windows: Wurzelpfade sind kanonisch (`\\?\C:\…`). Ungeprüft, wie das im Fenster aussieht.

## Alternative

SQLite mit inkrementellem Scan: schneller Start bei großen Sammlungen, echte Abfragen. Deutlich mehr Code
(Schema, Migration, Abgleich mit der Platte) und eine C-Bibliothek oder eine weitere große Crate – erst sinnvoll,
wenn der Scan im Speicher nachweislich zu langsam ist.
