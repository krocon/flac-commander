# 0003 – Symphonia, CPAL, Lofty; Ringpuffer mit rtrb

Status: angenommen (2026-11-13). Opus und Resampler sind offen (siehe unten).

## Kontext

Gesucht: Dekodieren, Ausgabe und Tags für Windows, macOS und Linux, möglichst in reinem Rust ohne
Systembibliotheken. Die Vorgabe nennt Symphonia, CPAL und Lofty als Kandidaten, die zu prüfen sind.

## Geprüft

| Bibliothek | Version (Stand 2026-11) | Lizenz | Befund |
| --- | --- | --- | --- |
| Symphonia | 0.6.1 | MPL-2.0 | Reines Rust. FLAC, MP3, WAV, AIFF, Ogg Vorbis, AAC-LC, ALAC an eigenen Testdateien vollständig dekodiert (Frame-Zahl und Pegel geprüft). **Kein Opus-Decoder.** Die API hat sich gegenüber 0.5 geändert (`next_packet()` liefert `Option`, eigene `AudioDecoder`-Schnittstelle, `Track.delay`/`padding` für Gapless). |
| CPAL | 0.18.2 | Apache-2.0 | CoreAudio, WASAPI, ALSA; optional JACK, PipeWire, PulseAudio. Unter macOS geprüft (Testton, Spike ohne Unterläufe). Strom ist nicht auf jeder Plattform `Send` → lebt auf einem eigenen Thread. Eine abweichende Abtastrate stellt unter macOS das Gerät systemweit um. |
| Lofty | 0.25.5 | MIT/Apache-2.0 | An Dateien aus `samples/` geprüft: Vorbis-Kommentare (FLAC), ID3v2 (MP3), MP4-Atome; Titel, Interpret, Album, Cover-Anzahl, Dauer stimmen mit Symphonia überein (MP3: 12 ms bzw. 0,9 s Abweichung bei VBR). Liest auch Tags von Dateien, die nicht dekodierbar sind (Opus). |
| rtrb | 0.4.1 | MIT/Apache-2.0 | Lock-freier SPSC-Ringpuffer mit Slice-Operationen; im Spike eingesetzt. |

## Entscheidung

- **Symphonia** für Container und Decoder, Features ausdrücklich gewählt: jedes eingeschaltete Format hat einen
  Dekodiertest. Ein Format gilt nur dann als unterstützt.
- **CPAL** für die Ausgabe, nur die Standard-Backends.
- **Lofty** für Tags ab Phase 3 (statt der Metadaten von Symphonia: einheitlicher Zugriff über alle Tag-Formate,
  Cover, später Schreiben).
- **rtrb** zwischen Engine-Thread und Audio-Callback ab Phase 2.

## Alternativen

- **rodio** (baut auf CPAL und Symphonia): schneller zum ersten Ton, aber Seek, Gapless, eigener DSP-Pfad und die
  Kontrolle über den Echtzeit-Pfad wären eingeschränkt – für eine Engine als Kernprodukt zu wenig.
- **GStreamer / FFmpeg-Bindungen**: alle Formate inklusive Opus, aber große Systemabhängigkeiten, aufwendige
  Paketierung auf drei Plattformen und Lizenzfragen (LGPL/GPL-Teile).
- **Web Audio in der WebView**: widerspricht dem Leitprinzip, dass Audio unabhängig von der Oberfläche läuft.

## Offen

- **Opus:** Kandidaten auf crates.io (`symphonia-opus`, `symphonia-adapter-libopus` u. a.) sind ungeprüft. Entscheidung
  in Phase 2 nach Dekodiertest, Pflegezustand und Lizenz.
- **Resampler:** `rubato` ist der Kandidat, Messung in Phase 2.
- **MPL-2.0** von Symphonia geht in die Lizenzentscheidung des Projekts ein ([RISKS.md](../RISKS.md), E1).
