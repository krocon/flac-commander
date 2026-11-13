# Audio-Engine

Stand: Phase 1. **Implementiert und getestet** sind die Bausteine (Formattabelle, Decoder, Ausgabestrom, Testton) und
ein Abspiel-Spike auf der Kommandozeile. **Die Engine selbst (Befehlsqueue, Zustandsmaschine, Seek, Lautstärke) ist
Phase 2** und unten als Entwurf beschrieben.

## Was es gibt

| Baustein | Datei | Aufgabe |
| --- | --- | --- |
| Formattabelle | `audio/formats.rs` | Zielformate, Endungen, „unterstützt" nur mit Test |
| Decoder | `audio/decode.rs` | Datei → verschachtelte `f32`-Samples, `TrackInfo` (Codec, Rate, Kanäle, Dauer) |
| Ausgabe | `audio/output.rs` | Geräteliste, Standardformat, Ausgabestrom mit Render-Callback, Kanal-Mapping |
| Testton | `audio/tone.rs` | 440 Hz, 0,7 s, leise, mit Ein-/Ausblenden; ein Ton zur Zeit |
| Spike | `examples/play.rs` | Decoder → Ringpuffer → Callback, Datei real abspielen |

### Formatunterstützung (gemessen, nicht behauptet)

Jede Zeile ist durch `crates/fc-core/tests/formats.rs` belegt: Die Datei wird vollständig dekodiert, Frame-Zahl und
Effektivwert des Sinus müssen stimmen.

| Format | Container / Codec | Ergebnis |
| --- | --- | --- |
| FLAC | flac / flac, 16 Bit 44,1 kHz und 24 Bit 96 kHz mono | ✅ verlustfrei, exakte Frame-Zahl |
| WAV | wave / pcm_s16le | ✅ |
| AIFF | aiff / pcm_s16be | ✅ |
| ALAC | isomp4 / alac | ✅ |
| MP3 | mp3 / mp3 | ✅ |
| Ogg Vorbis | ogg / vorbis | ✅ |
| AAC | isomp4 / aac (LC) | ✅ – nur AAC-LC geprüft; HE-AAC ist ungeprüft |
| Opus | ogg / opus | ❌ kein Decoder in Symphonia 0.6.1 → `unsupported_format` |

Fehlerfälle mit Test: fehlende Datei (`not_found`), Text mit Audio-Endung (`unsupported_format`/`decode_failed`),
mitten im Audio abgeschnittene Datei (liefert die vorhandenen Frames, dann Ende oder `decode_failed`), Ordner statt
Datei. Einzelne beschädigte Pakete werden übersprungen und gezählt statt den Titel abzubrechen.

Nicht automatisiert geprüft: sehr lange Dateien, Mehrkanal > 2, verkettete Ogg-Streams, DRM-geschützte M4A (werden
voraussichtlich als nicht unterstützt abgelehnt).

**Bekannte Falle: DTS in WAV.** `samples/…/Der Mix (DTS).wav` ist ein DTS-Bitstrom in einem WAV-Container. Symphonia
erkennt korrekt „PCM 16 Bit" – abgespielt wäre das lautes Rauschen. Die Engine muss solche Dateien am DTS-Syncwort in
den ersten Frames erkennen und ablehnen (Phase 2, eigener Test).

### Der Spike

```bash
cargo run -p fc-core --example play -- "datei.flac" --seconds 10 --gain 0.3
```

Gemessen auf macOS 27 / Apple Silicon / CoreAudio mit Dateien aus `samples/` (FLAC 16/44,1, MP3) und der
24/96-Testdatei: Wiedergabe in Echtzeit, **0 Unterläufe**, 0 übersprungene Pakete. Dem Spike fehlen bewusst
Resampling, Seek, Pause und die Befehlsqueue.

## Threading (Entwurf Phase 2)

```text
Tauri-Commands (beliebiger Thread)
      │  Befehle: Load, Play, Pause, Stop, Seek, SetVolume, Next, Previous
      ▼  std::sync::mpsc (unbeschränkt; Senden blockiert nie)
┌─────────────────────────── Engine-Thread ───────────────────────────┐
│ besitzt: Zustandsmaschine, Decoder, Resampler, Produzent des        │
│ Ringpuffers, den Ausgabestrom (nicht Send auf jeder Plattform)      │
│ Schleife: Befehle abarbeiten → dekodieren → resamplen → Ring füllen │
│ darf: Dateien lesen, allokieren, blockieren, loggen                 │
└──────────────┬──────────────────────────────────────▲───────────────┘
   rtrb SPSC   │ f32-Samples             Atomics      │ Position, Unterläufe,
   (lock-frei) ▼                                      │ „Puffer leer"
┌──────────────────────── Audio-Callback (Echtzeit) ──┴───────────────┐
│ kopiert aus dem Ring, multipliziert mit der Lautstärke (Atomic),    │
│ füllt bei Unterlauf mit Stille                                      │
│ darf NICHT: blockieren, sperren, allokieren, Dateien lesen, loggen  │
└─────────────────────────────────────────────────────────────────────┘
```

Regeln für den Callback, heute schon eingehalten (`output.rs`, `tone.rs`, `play.rs`):

- Keine Allokation: der Zwischenpuffer wird vor dem Start angelegt (eine Sekunde Audio; wächst nur, falls ein Backend
  je mehr auf einmal verlangt).
- Keine Sperren, kein I/O. Rückmeldungen laufen über Atomics oder einen beschränkten Kanal mit `try_send`.
- Fehler des Geräts kommen über den Fehler-Callback von CPAL und werden als `AppError` weitergereicht.

### Zustandsmaschine (Entwurf)

```text
Stopped ──Load──▶ Loading ──ok──▶ Paused ⇄ Playing ──Ende──▶ (nächster Titel | Stopped)
                     └──Fehler──▶ Stopped + Fehler-Event; die Playlist geht zum nächsten Titel
```

Die Zustandsmaschine wird als reiner Typ ohne Audio-Hardware gebaut und vollständig mit Unit-Tests abgedeckt; nur der
dünne Rand (Strom öffnen) braucht ein Gerät.

### Seek

Befehl an den Engine-Thread: Ring leeren (Generation hochzählen, der Callback verwirft alte Samples), `format.seek()`,
Decoder zurücksetzen, weiterfüllen. Die gemeldete Position ist die vom Callback gezählte, nicht die dekodierte.

### Abtastrate und Resampling

Beobachtung aus Phase 0: Öffnet man unter macOS einen Strom mit einer anderen Rate als der des Geräts, **stellt
CoreAudio das Gerät systemweit um, und es bleibt nach dem Schließen so**. Der Spike hat die eingebauten Lautsprecher
dadurch auf 96 kHz gestellt.

Entscheidung für Phase 2: Standard ist **Resampling auf die Geräterate** (Kandidat: `rubato` 5.x, wird in Phase 2
evaluiert). Das Umschalten des Geräts („bit-perfect") wird eine ausdrückliche Einstellung und stellt die
ursprüngliche Rate beim Beenden wieder her.

### Gerätewechsel und Wiederherstellung (Entwurf)

- Stromfehler (`DeviceNotAvailable`, Gerät abgezogen): Engine pausiert, merkt sich die Position, meldet ein Event und
  versucht den Strom auf dem neuen Standardgerät zu öffnen. Gelingt das, läuft die Wiedergabe weiter.
- Wechsel des Standardgeräts ohne Fehler erkennt CPAL nicht auf jeder Plattform zuverlässig – zu prüfen je Plattform
  ([MANUAL-TESTS.md](MANUAL-TESTS.md)).
- Nicht dekodierbare Datei: Fehler-Event mit Pfad, die Playlist springt weiter; nach mehreren Fehlern in Folge stoppt
  sie, statt die ganze Liste durchzurasen.

### Gapless (Phase 6)

Symphonia liefert Encoder-Delay und -Padding (`Track.delay`, `Track.padding`) und kann sie abschneiden
(`AudioDecoderOptions::gapless`). Der Engine-Thread öffnet den nächsten Titel, bevor der aktuelle endet, und füllt
denselben Ring ohne Lücke weiter (bei anderer Rate über den Resampler).

## Plattformen

| Plattform | Backend (CPAL) | Stand |
| --- | --- | --- |
| macOS | CoreAudio | geprüft (Testton in der App, Spike mit FLAC/MP3) |
| Windows | WASAPI (Shared Mode) | baut in der CI; **Ausgabe ungeprüft** |
| Linux | ALSA (PipeWire/PulseAudio über deren ALSA-Schicht) | baut in der CI; **Ausgabe ungeprüft**; braucht `libasound2-dev` |

CPAL hat optionale Backends für JACK, PipeWire und PulseAudio (Features). Sie bleiben aus, bis ein Bedarf belegt ist.
