# 0010 – Klassische Skins werden konvertiert, nicht nativ dargestellt; keine Plugin-API

Status: angenommen (2026-11-13)

## Klassische Skins

**Kontext.** Winamp-2-Skins (`.wsz`) sind ZIP-Archive mit Bitmaps, in denen jede Bedienfläche ein festes Rechteck
ist ([WINAMP-SKINS.md](../WINAMP-SKINS.md)). Kompatibilität ist erwünscht, darf aber weder die eigene
Skin-Architektur bestimmen noch ein unkontrolliertes Nebenprojekt werden.

**Entscheidung.** Ein **Importer**: Er schneidet aus den Bitmaps aus, was unser Format heute zeigen kann, und
schreibt ein gewöhnliches Paket unseres Formats, das durch dieselbe Prüfung geht wie jeder andere Skin. Die App kennt
zur Laufzeit nur ihr eigenes Format.

- Der erste Schritt deckt das Hauptfenster ab: Gesicht, Transport-Tasten, Zufall/Wiederholen, EQ-/PL-Tasten, Farben
  aus `pledit.txt`; Titel, Zeit, Regler und Visualizer sitzen an der klassischen Stelle, gezeichnet von der App.
- Was fehlt oder sich nicht ausschneiden lässt, kostet nur dieses Element. Wiedergabe und „Skin wählen" fehlen nie.
- Bitmaps liest ein eigener, kleiner BMP-Leser (unkomprimiert, 1–32 Bit); PNG schreibt ein eigener Schreiber über
  das ohnehin vorhandene `flate2`. Keine Bildbibliothek.
- Kein Code und keine Grafik aus Winamp oder Webamp; kein fremder Skin im Repository. Getestet wird mit einem im
  Test gezeichneten Skin.

**Folgen.** Ein importierter Skin sieht dem Original ähnlich, ist aber nicht pixelgleich (Schrift, Regler,
Titelzeile). Jede Verbesserung ist ein neuer Baustein im eigenen Format und kommt damit auch eigenen Skins zugute.
Die Sprite-Koordinaten sind noch nicht an echten Skins nachgemessen – das ist der erste Schritt vor jedem Ausbau.

**Alternative.** Klassische Skins nativ rendern (wie Webamp): bessere Treue, aber ein zweites Rendering neben dem
eigenen, mit festem Fenster von 275 × 116 und allen Eigenheiten des Formats als dauerhafte Verpflichtung.

## Plugin-API

**Entscheidung.** Vorerst keine. Erweiterbar ist die App heute über Daten: Skins. Eine Plugin-API hieße fremden Code
im Prozess oder in der WebView – das verlangt ein eigenes Sicherheitsmodell (Sandbox, Rechte, Signaturen) und einen
stabilen Vertrag, den es vor einer ersten Veröffentlichung nicht gibt.

**Wann neu entscheiden.** Wenn es einen konkreten Bedarf gibt, den Daten nicht decken (Visualisierungen als
Programme, Anbindung fremder Dienste). Naheliegend wäre dann WebAssembly mit eng geschnittener Schnittstelle, nicht
JavaScript in der WebView.
