# Audio-Engine

Stand: Phase 2. Die Engine spielt eine Datei: Laden, Play, Pause, Stop, Seek, Lautstärke, Resampling auf die
Geräterate, Wiederaufnahme nach Geräteverlust. Playlist, Titelwechsel, Equalizer und Gapless folgen
([ROADMAP.md](ROADMAP.md)).

## Bausteine (`crates/fc-core/src/audio/`)

| Datei | Aufgabe |
| --- | --- |
| `formats.rs` | Zielformate und Endungen; „unterstützt" nur mit Dekodiertest |
| `decode.rs` | Datei → verschachtelte `f32`-Samples, `TrackInfo`, framegenaues Seek |
| `resample.rs` | Abtastratenwandlung eines Stroms (rubato, FFT) |
| `dts.rs` | Erkennung von DTS-Bitströmen in PCM-Dateien |
| `output.rs` | Geräteliste, Ausgabestrom (CPAL), Kanal-Mapping |
| `player.rs` | **die Engine**: Thread, Befehlsqueue, Zustand, Echtzeit-Renderer |
| `tone.rs` | Testton |

## Threading

```text
Player (beliebiger Thread: Tauri-Commands)
      │  Load, Play, Pause, Stop, Seek, SetVolume          – kehren sofort zurück
      ▼  std::sync::mpsc
┌─────────────────────────── Engine-Thread „audio-engine" ─────────────────────────┐
│ besitzt Decoder, Resampler, Zustandsmaschine, den Ausgabestrom (nicht überall     │
│ Send) und das schreibende Ende des Ringpuffers                                    │
│ Schleife: Befehl abarbeiten → dekodieren → resamplen → Kanäle abbilden → Ring     │
│ füllen (hält ~300 ms vor) → Ende erkennen → Zustand melden                        │
│ darf blockieren, Dateien lesen, allokieren, loggen                                │
└──────────────┬──────────────────────────────────────────▲─────────────────────────┘
   rtrb SPSC   │ f32, lock-frei                 Atomics   │ gespielte Frames, Flush-Quittung,
               ▼                                          │ Unterläufe
┌──────────────────────── Renderer (Audio-Callback, Echtzeit) ──────────────────────┐
│ kopiert aus dem Ring, wendet Lautstärke mit 8-ms-Rampe an, zählt Frames,          │
│ füllt bei leerem Ring mit Stille                                                  │
│ keine Sperre, keine Allokation, kein I/O, kein Log                                │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Der Zustand (`PlayerState`: Status, Titel, Position, Lautstärke, Fehler, Unterläufe) wird bei jeder Änderung
gemeldet und während der Wiedergabe höchstens alle 200 ms für die Position allein. Die Tauri-Schicht sendet ihn als
Event `player://state` an alle Fenster; ein neues oder neu geladenes Fenster holt ihn einmal mit `player_state`.

Befehle haben keine Antwort mit Ergebnis: Ob ein `Load` geklappt hat, steht im nächsten Zustand (`track` oder
`error`). So gibt es genau eine Quelle für das, was das Fenster zeigt.

### Zustände

```text
Stopped ──Load──▶ Stopped (Titel geladen) ──Play──▶ Playing ⇄ Paused
   ▲                      ▲                            │
   │                      └──── Stop / Ende des Titels ┘   (Position zurück auf 0)
   └── Load schlägt fehl / Titel nicht weiter dekodierbar: kein Titel, `error` gesetzt
Gerät fällt aus: Playing → Paused, `error` gesetzt, Position bleibt; Play öffnet das (neue) Gerät
```

### Position

Die Position ist das, was der Callback wirklich ausgegeben hat (`played_frames` seit dem letzten Flush plus
Startposition), nicht das, was dekodiert wurde. Sie läuft deshalb nicht voraus und bleibt in der Pause stehen.

### Seek, Stop, Titelwechsel: Flush

Der Engine-Thread kann den Ring nicht selbst leeren (das lesende Ende gehört dem Callback). Er erhöht einen Zähler,
der Callback verwirft beim nächsten Aufruf alles Eingereihte, setzt die Frame-Zählung zurück und quittiert. Erst dann
füllt die Engine neu. Bleibt die Quittung eine Sekunde aus, gilt das Gerät als ausgefallen.

Seek im Decoder ist **framegenau**: Formate, die nur Pakete adressieren, werden davor positioniert, die Frames
dazwischen verworfen (`seeking_is_exact_to_the_frame_in_lossless_formats`). Dabei wird der Strom **neu geöffnet und
nur vorwärts gesucht** – siehe „Bekannte Fehler der Bibliotheken".

### Lautstärke, Start und Pause ohne Knacken

Die Lautstärke ist ein Atomic, das der Callback liest; sie wirkt sofort, unabhängig vom Füllstand. Jede Änderung der
Verstärkung (Start, Pause, Lautstärke) läuft über eine 8-ms-Rampe. Beim Pausieren nimmt der Callback nur noch die
Frames für die Ausblendung aus dem Ring; der Rest bleibt für das Fortsetzen liegen – es geht kein Frame verloren
(`pause_holds_the_position_and_play_continues_from_it`).

### Abtastrate

Die Engine stellt das Gerät **nie** um. Jeder Titel wird auf die Rate des Standardgeräts gewandelt (rubato 5.1,
FFT-Resampler, synchron); bei gleicher Rate entfällt die Wandlung vollständig. Die Einschwingverzögerung des Filters
wird am Anfang abgeschnitten und am Ende nachgeschoben, sodass ein Titel exakt seine Länge behält.

Grund: Ein Strom mit abweichender Rate stellt unter macOS das Gerät systemweit um, und es bleibt so (in Phase 0
beobachtet). Ein „Bit-perfect"-Modus mit Umschalten und Zurückstellen ist eine spätere, ausdrückliche Einstellung.

### Gerätefehler

- Meldet CPAL einen Stromfehler, schließt die Engine die Ausgabe, pausiert, behält die Position und setzt `error`.
  Das nächste `Play` öffnet das dann aktuelle Standardgerät, passt den Resampler an dessen Rate an und setzt an der
  gemerkten Position fort (`a_lost_device_pauses_and_play_continues_on_a_new_one`).
- Gibt es kein Gerät, schlägt `Load` bzw. `Play` mit `no_output_device` fehl; der Titel bleibt geladen.
- Ein bloßer Wechsel des Standardgeräts ohne Fehler wird nicht erkannt: Die Wiedergabe bleibt auf dem alten Gerät.
  Offen, siehe [RISKS.md](RISKS.md) R5.

### Dateifehler

- Nicht dekodierbare oder fehlende Datei: kein Titel, `error` mit Code.
- Einzelne beschädigte Pakete werden übersprungen (ein Knacken statt eines Abbruchs) und protokolliert.
- Datei endet mitten im Audio: Was da ist, wird gespielt, dann `decode_failed`.
- **DTS in WAV** („DTS-CD"): wird am Syncwort erkannt und als `unsupported_format` abgelehnt statt als Rauschen
  abgespielt. Geprüft mit einer künstlichen Datei im Test und mit `samples/…/Der Mix (DTS).wav`.

## Formate (gemessen, nicht behauptet)

Jede Zeile ist durch `tests/formats.rs` (vollständig dekodiert, Frame-Zahl und Pegel geprüft, Seek) und
`tests/player.rs` (durch die Engine gespielt) belegt.

| Format | Container / Codec | Dekodieren | Seek |
| --- | --- | --- | --- |
| FLAC | flac / flac, 16 Bit 44,1 kHz und 24 Bit 96 kHz mono | ✅ exakt | ✅ framegenau |
| WAV | wave / pcm_s16le | ✅ exakt | ✅ framegenau |
| AIFF | aiff / pcm_s16be | ✅ exakt | ✅ framegenau |
| ALAC | isomp4 / alac | ✅ exakt | ✅ framegenau |
| MP3 | mp3 / mp3 | ✅ | ✅ auf wenige ms |
| Ogg Vorbis | ogg / vorbis | ✅ | ✅ auf wenige ms |
| AAC | isomp4 / aac (LC) | ✅ – HE-AAC ungeprüft | ✅ auf wenige ms |
| Opus | ogg / opus | ✅ über libopus (Cargo-Feature `opus`, Standard an) | ✅ auf wenige ms |

Ohne das Feature `opus` (kein cmake/C-Compiler nötig) werden Opus-Dateien als `unsupported_format` abgelehnt; die
Tests laufen in beiden Varianten.

Nicht automatisiert geprüft: sehr lange Dateien, mehr als zwei Kanäle am Gerät, verkettete Ogg-Streams, geschützte
M4A-Dateien.

## Bekannte Fehler der Bibliotheken

**Symphonia 0.6.1, FLAC: Rückwärts-Seek.** Nach `seek()` auf eine frühere Position liefert der FLAC-Leser ein Paket
von der neuen Stelle und setzt dann an der alten fort (nachgestellt: nach drei Paketen Seek auf 0 → Pakete mit
Zeitstempel 0, 13824, 18432 … statt 0, 4608, 9216 …). Vorwärts-Seeks sind korrekt. `Decoder::seek` öffnet deshalb
den Strom jedes Mal neu und sucht von dort vorwärts; `seeking_back_and_forth_always_lands_where_asked` hält das fest
und zeigt, wenn der Umweg nach einem Symphonia-Update entfallen kann. Kosten: ein erneutes Öffnen und Sondieren der
Datei je Seek – lokal nicht messbar, bei Netzlaufwerken zu beobachten.

## Messungen (macOS 27, Apple Silicon, CoreAudio, eingebaute Lautsprecher, Gerät auf 48 kHz)

- `examples/play.rs`: FLAC 16/44,1 ab Minute 1 und MP3, je 2–3 s, resampelt auf 48 kHz: 0 Unterläufe.
- Gebündelte App: Datei per Kommandozeile geöffnet, Anzeige läuft mit, Seek per Klick auf die Leiste, Pause,
  Pfeiltaste (+5 s) – geprüft; siehe [MANUAL-TESTS.md](MANUAL-TESTS.md).

## Tests ohne Hardware

`tests/player.rs` ersetzt das Ausgabegerät (`OutputBackend`) und ruft den `Renderer` selbst auf, Block für Block.
Der Test ist damit das Gerät: Er bestimmt, wie viele Frames „gespielt" werden, und prüft, was herauskam (Anzahl,
Pegel, Stille). Es gibt keine festen Wartezeiten; gewartet wird auf einen gemeldeten Zustand. Weil dieses Gerät
schneller als Echtzeit läuft, wartet es über `Renderer::would_underrun()` auf die Engine.

## Plattformen

| Plattform | Backend (CPAL) | Stand |
| --- | --- | --- |
| macOS | CoreAudio | geprüft (Engine und App) |
| Windows | WASAPI (Shared Mode) | baut und testet in der CI; **Ausgabe an Hardware ungeprüft** |
| Linux | ALSA (PipeWire/PulseAudio über deren ALSA-Schicht) | baut und testet in der CI; **Ausgabe an Hardware ungeprüft** |

## Noch nicht enthalten

- Die Engine spielt weiterhin genau einen Titel und zählt beendete Titel (`finished`); den Wechsel zum nächsten
  macht die Sitzung (`session.rs`). Zwischen zwei Titeln entsteht dadurch eine kurze Lücke – Gapless ist Phase 6.
- Gapless (Phase 6): Symphonia liefert Delay und Padding (`Track.delay`, `Track.padding`); der nächste Titel würde in
  denselben Ring gefüllt.
- Equalizer/DSP und Analysewerte für Visualisierungen (Phase 6): gehören in den Engine-Thread vor den Ring.
- Auswahl des Ausgabegeräts; Erkennen eines gewechselten Standardgeräts.
