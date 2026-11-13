# 0006 – Resampling mit rubato, Opus über libopus, Seek mit neu geöffnetem Strom

Status: angenommen (2026-11-13). Löst die offenen Punkte aus [0003](0003-audio-bibliotheken.md).

## Resampling: rubato

**Kontext.** Ein Ausgabestrom mit einer anderen Abtastrate als der des Geräts stellt unter macOS das Gerät für das
ganze System um. Die Engine muss also selbst wandeln.

**Entscheidung.** `rubato` 5.1 (MIT/Apache-2.0, reines Rust), FFT-Resampler mit fester Eingangsblockgröße. Bei
gleicher Rate wird nicht gewandelt. Gemessen: 44,1 → 48 kHz und 96 → 48 kHz behalten Länge (±2 Frames), Pegel und
Tonhöhe; ein Titel beginnt ohne die Filterverzögerung.

**Folgen.** Die Wiedergabe ist nicht „bit-perfect", sobald Datei- und Geräterate abweichen. Ein Modus, der das Gerät
umstellt und zurückstellt, bleibt eine spätere Einstellung.

## Opus: `symphonia-adapter-libopus`

**Kontext.** Symphonia 0.6.1 hat keinen Opus-Decoder. Auf crates.io gibt es (Stand 2026-11-13):

| Crate | Art | Lizenz | Verbreitung |
| --- | --- | --- | --- |
| `symphonia-adapter-libopus` 0.3.0 | Bindung an libopus (C), Quelltext gebündelt | MIT/Apache-2.0, libopus BSD-artig | ca. 795 000 Downloads, seit 2025 |
| `symphonia-adapter-opus-rs` 0.1.1 | reines Rust | MIT/Apache-2.0 | ca. 3 000 Downloads |
| `symphonia-adapter-oporus` 0.1.3 | reines Rust | LGPL-2.1 | ca. 2 300 Downloads |
| `symphonia-opus` 0.1.1 | reines Rust | MPL-2.0 | einen Tag alt |

**Entscheidung.** `symphonia-adapter-libopus` als optionales Cargo-Feature `opus` von `fc-core`, standardmäßig an.
libopus ist die Referenzimplementierung; die reinen Rust-Decoder sind zu jung, um ihnen die Wiedergabe anzuvertrauen.
Die Testdatei wird vollständig dekodiert (Pegel und Länge geprüft) und durch die Engine gespielt.

**Folgen.** Abweichung von „reines Rust ohne Systembibliotheken": Der Build braucht **cmake und einen C-Compiler**
(auf den CI-Runnern vorhanden). Wer das nicht will, baut mit `--no-default-features`; Opus-Dateien werden dann
abgelehnt, alle Tests laufen weiter. Sobald Symphonia Opus selbst kann oder ein Rust-Decoder gereift ist, wird neu
entschieden.

## Seek: Strom neu öffnen

**Kontext.** Der FLAC-Leser von Symphonia 0.6.1 setzt nach einem Rückwärts-Seek nach einem Paket an der alten Stelle
fort ([AUDIO-ENGINE.md](../AUDIO-ENGINE.md), „Bekannte Fehler der Bibliotheken"). Für einen Player, der FLAC im
Namen trägt, ist das nicht hinnehmbar.

**Entscheidung.** `Decoder::seek` öffnet die Datei neu und sucht von dort vorwärts – für alle Formate gleich, damit
es nur ein Verhalten gibt. Zusätzlich verwirft der Decoder die Frames zwischen der gelieferten und der verlangten
Position: Seek ist bei verlustfreien Formaten framegenau.

**Folgen.** Je Seek ein erneutes Öffnen der Datei. Der Test `seeking_back_and_forth_always_lands_where_asked` zeigt,
ob der Umweg nach einem Update entfallen kann. Der Fehler ist upstream noch nicht gemeldet.
