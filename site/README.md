# Produktseite FLAC Commander

Statische Seite auf Englisch: eine HTML-Datei, ein Stylesheet, ein Skript.
**Keine Webfonts, keine Tracker, keine Anfragen an fremde Server, keine Cookies.** Ohne JavaScript bleibt alles
lesbar; das Skript liefert nur Bewegung, die Skin-Auswahl im Kopf, die Suche in der Galerie und den Equalizer.

| Datei | Inhalt |
|---|---|
| `index.html` | Kopf mit Skin-Stapel (der gewählte Skin färbt die ganze Seite), Formate, Engine mit Diagramm, Galerie aller Skins mit Suche, Skin-Format, Fenster und Equalizer, Tastatur, Plattformen, Download |
| `site.css`, `site.js` | Farben des Standard-Skins „Vinyl" (dunkel) bzw. „Reel" (hell, nach System), Bewegung, Demos |
| `img/skins/` | die Vorschaubilder der Skins, kopiert aus `skins/<id>/preview.*` |
| `build.mjs` | kopiert Bilder und Icon, schreibt Galerie und Skin-Anzahl in `index.html` |

## Bauen

```bash
node site/build.mjs
```

Kopiert `skins/*/preview.*` nach `img/skins/` (PNG-Vorschauen gehen durch `cwebp`, falls vorhanden), das App-Icon nach
`favicon.png` und `img/icon.png`, und schreibt die Galerie zwischen `<!-- skins:start -->` und `<!-- skins:end -->`
sowie die Anzahl der Skins in jedes Element mit `data-skins`. Mit `--no-images` nur die Galerie.
Nach neuen oder geänderten Skins erneut ausführen.

## Ansehen und hochladen

Lokal `site/index.html` im Browser öffnen (geht auch über `file://`). Zum Veröffentlichen den **Inhalt** von `site/`
ohne `build.mjs` und `README.md` auf den Webspace kopieren; alle Pfade sind relativ. `og:image` ist ebenfalls relativ
und sollte nach dem Hochladen auf die absolute Adresse gesetzt werden.

## Hinweise

- **Aussagen wie in der README des Projekts:** Formate, Plattformen („Klang unter Windows und Linux an echter Hardware
  ungeprüft"), „nicht signiert", was fehlt, Tastatur. Ändert sich die README, die Seite mitziehen. Von Hand gepflegt
  sind außerdem: die Versionsnummer auf den Download-Knöpfen, „forty" in der Überschrift, die Equalizer-Presets
  (`data-gains`, aus `crates/fc-core/src/audio/equalizer.rs`) und die Tastaturtabellen.
- **Skin-Stapel im Kopf:** acht Skins, von Hand gewählt (`figure.skin` und die Knöpfe darunter). `data-accent` ist die
  Farbe, die die Seite annimmt – eine helle Fassung der Akzentfarbe des Skins, damit sie auf dunklem Grund trägt; im
  hellen Schema dunkelt `site.css` sie ab.
- **Retro fehlt in der Galerie:** Seine Vorschau (`skins/retro/preview.png`) ist ein kleiner Platzhalter. Er zählt mit,
  wird aber nicht gezeigt (`unpictured` in `build.mjs`). Mit einer echten Vorschau dort austragen.
- **Motion:** Jede Bewegung hat eine Fassung für `prefers-reduced-motion` (kein Skin-Wechsel von selbst, das Spektrum
  steht).
- **Die Seite als Platte:** Jeder Abschnitt hat `data-title` und eine `id`; daraus baut `site.js` die Leiste am rechten
  Rand (ein Strich je Abschnitt, der Knopf zeigt die Leseposition).
