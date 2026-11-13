# 0004 – Signal-Stores je Feature, Laufzeit-i18n, CSS-Variablen als Skin-Schnittstelle

Status: angenommen (2026-11-13)

## Kontext

Angular 22 ist zoneless und Signals sind der Standard für Zustand. Die App wird mehrere Fenster, wechselbare Skins und
zwei Sprachen haben. Die Vorgängerprojekte haben erprobte Muster für Fassaden, Texte und Tokens.

## Entscheidung

- **Zoneless, Signals, kein `zone.js`.** Zustand liegt in Signals; `computed` für Abgeleitetes, `effect` nur für
  Seiteneffekte nach außen.
- **Ein Store je Feature** (`@Injectable`, Signals nach außen nur lesbar), kein globaler Store. Ein Store spiegelt
  Backend-Zustand und simuliert ihn nicht. Antworten überholter Anfragen werden verworfen.
- **RxJS nur, wo ein Strom wirklich ein Strom ist.** Bisher kommt eigener Code ohne RxJS aus.
- **Texte in typisierten Katalogen** (`*-texts.ts` Englisch, `*-texts.de.ts`), Sprachwechsel zur Laufzeit über ein
  Signal (`core/i18n/i18n.ts`, aus files-and-folders-tauri übernommen). Fehler zeigt das Fenster über den Code, nicht
  über die englische `message`.
- **Alle skinrelevanten Werte sind CSS-Variablen `--player-*`** mit semantischen Namen. Komponenten enthalten keine
  festen Farben. Ein Skin ersetzt später genau diese Variablen.
- **Kein UI-Framework.** HTML und CSS mit nativem Nesting.

## Folgen

- Skin-Wechsel und Sprachwechsel brauchen keinen Neustart.
- Kein Router: Fenster sind eigene WebViews oder Bereiche, „Lazy Loading" heißt `@defer`.
- Die Token-Liste muss wachsen, bevor Skins sie überschreiben; neue Tokens werden zentral in `styles.css` eingeführt.
