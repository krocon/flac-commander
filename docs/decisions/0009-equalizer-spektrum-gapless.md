# 0009 – Equalizer im Callback, Spektrum als Abzweig, Gapless durch Vorladen in dieselbe Warteschlange

Status: angenommen (2026-11-13)

## Equalizer

**Entscheidung.** Zehn Peaking-Biquads (eine Oktave breit, 31 Hz – 16 kHz, ±12 dB) plus Vorverstärkung, gerechnet
**im Audio-Callback** nach dem Ringpuffer. Die Einstellungen kommen über Atomics; ändern sie sich, rechnet der
Callback zehn Koeffizientensätze neu.

**Warum nicht im Engine-Thread vor dem Ringpuffer** (wie ursprünglich skizziert): Dann läge zwischen Regler und Ohr
die Warteschlange von 300 ms. Im Callback wirkt der Regler sofort. Der Preis ist Arbeit im Echtzeit-Pfad – hier
unkritisch: feste Zustandsgröße, keine Allokation, keine Sperre, rund 20 Multiplikationen je Sample und Kanal.

**Folgen.** Anhebungen können übersteuern; die Ausgabe wird hart auf ±1 begrenzt. Die mitgelieferten
Voreinstellungen senken die Vorverstärkung entsprechend ab (Test). Ein Limiter fehlt.

## Spektrum

**Entscheidung.** Der Callback legt – nur solange ein Fenster ein Spektrum zeigt – eine Mono-Kopie des Gehörten in
einen zweiten lock-freien Ringpuffer. Der Engine-Thread rechnet daraus etwa 25-mal pro Sekunde eine FFT (2048
Samples, Hann-Fenster, `realfft`) und meldet 24 Pegel (40 Hz – 16 kHz, gleichmäßig in der Tonhöhe, 0…1). Nur diese
24 Zahlen gehen über IPC, nie Samples.

**Folgen.** Unter etwa 200 Hz sind die Bänder schmaler als die Frequenzauflösung: benachbarte tiefe Balken bewegen
sich gemeinsam. Der Abzweig liegt nach dem Equalizer und vor der Lautstärke: Das Bild folgt dem Klang, nicht dem
Lautstärkeregler. Nutzer mit „Bewegung reduzieren" bekommen keinen Visualizer, und die Analyse läuft dann nicht.

## Gapless

**Entscheidung.** Wer die Engine steuert, nennt ihr den Folgetitel (`set_next`). Ist der laufende Titel vollständig
eingereiht, öffnet die Engine den Folgetitel und füllt ihn **in dieselbe Warteschlange** dahinter. Sie merkt sich die
Grenze in gespielten Frames; hat der Callback sie erreicht, ist der Folgetitel der laufende (`track` wechselt,
`finished` zählt). Die Playlist zieht nur nach und lädt nichts.

**Folgen.**
- Zwischen zwei Titeln liegt kein stilles Frame (Tests: höchstens zwei Null-Frames, wie sie ein Sinus selbst hat),
  auch bei unterschiedlichen Formaten und Abtastraten und mit Zufall/Wiederholen.
- Verlustbehaftete Formate sind nur so lückenlos, wie Symphonia Vor- und Nachlauf des Encoders abschneidet
  (`AudioDecoderOptions::gapless`, Standard an). Mit eigenen Aufnahmen ist das nicht geprüft.
- Seek, Stop oder eine geänderte Playlist verwerfen den vorgeladenen Titel; er wird rechtzeitig neu geöffnet. Ändert
  sich der Folgetitel in den letzten 300 ms eines Titels, wird neu eingereiht – ein Aussetzer von wenigen
  Millisekunden ist dann möglich.
- Lässt sich der Folgetitel nicht öffnen, endet der laufende normal; die Playlist versucht den Titel selbst, markiert
  ihn und geht weiter.
