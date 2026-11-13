//! Detects DTS audio hidden in PCM ("DTS-CD", `.wav` with a DTS bit stream).
//!
//! Such a file is valid 16-bit PCM to every container parser, but played as PCM it is loud
//! noise. The bit stream is recognisable by its frame sync word, which repeats every frame.

/// How much audio is searched: DTS frames in PCM are at most 4096 bytes apart.
pub const DTS_SCAN_SAMPLES: usize = 16_384;

/// True if 16-bit PCM `samples` (as decoded to `-1.0..1.0`) carry a DTS bit stream.
///
/// Looks for two sync words of the same kind: one alone can occur in music by chance
/// (about 1 in 4 billion positions), two at a frame distance cannot.
pub fn is_dts_in_pcm(samples: &[f32]) -> bool {
    let bytes: Vec<u8> = samples
        .iter()
        .take(DTS_SCAN_SAMPLES)
        .flat_map(|s| ((s * 32_768.0).round().clamp(-32_768.0, 32_767.0) as i16).to_le_bytes())
        .collect();
    sync_positions(&bytes) >= 2
}

/// Number of DTS sync words: 14-bit and 16-bit streams, both byte orders.
fn sync_positions(bytes: &[u8]) -> usize {
    bytes
        .windows(6)
        .filter(|w| {
            matches!(
                w,
                // 14-bit, little endian (the DTS-CD layout) and big endian
                [0xFF, 0x1F, 0x00, 0xE8, 0xF0..=0xFF, 0x07]
                    | [0x1F, 0xFF, 0xE8, 0x00, 0x07, 0xF0..=0xFF]
                    // 16-bit, big and little endian
                    | [0x7F, 0xFE, 0x80, 0x01, _, _]
                    | [0xFE, 0x7F, 0x01, 0x80, _, _]
            )
        })
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pcm(bytes: &[u8]) -> Vec<f32> {
        let (pairs, _) = bytes.as_chunks::<2>();
        pairs.iter().map(|b| f32::from(i16::from_le_bytes(*b)) / 32_768.0).collect()
    }

    /// `frames` DTS-CD frames of `frame_len` bytes: sync word, then noise-like filler.
    fn dts_cd(frames: usize, frame_len: usize) -> Vec<u8> {
        let mut bytes = Vec::new();
        for f in 0..frames {
            bytes.extend_from_slice(&[0xFF, 0x1F, 0x00, 0xE8, 0xF1, 0x07]);
            bytes.extend((6..frame_len).map(|i| ((i * 31 + f * 7) % 251) as u8));
        }
        bytes
    }

    #[test]
    fn recognises_a_dts_cd_stream() {
        assert!(is_dts_in_pcm(&pcm(&dts_cd(4, 4096))));
    }

    #[test]
    fn recognises_a_stream_that_does_not_start_at_the_first_byte() {
        let mut bytes = vec![0u8; 1000];
        bytes.extend(dts_cd(3, 2048));
        assert!(is_dts_in_pcm(&pcm(&bytes)));
    }

    #[test]
    fn music_and_silence_are_not_dts() {
        assert!(!is_dts_in_pcm(&[]));
        assert!(!is_dts_in_pcm(&vec![0.0; 20_000]));
        let sine: Vec<f32> = (0..20_000).map(|i| (i as f32 * 0.05).sin() * 0.5).collect();
        assert!(!is_dts_in_pcm(&sine));
    }

    #[test]
    fn a_single_sync_word_is_not_enough() {
        let mut bytes = dts_cd(1, 4096);
        bytes.extend(vec![0u8; 8192]);
        assert!(!is_dts_in_pcm(&pcm(&bytes)));
    }

    #[test]
    fn the_round_trip_through_f32_keeps_every_bit() {
        let bytes = dts_cd(2, 512);
        let back: Vec<u8> = pcm(&bytes)
            .iter()
            .flat_map(|s| ((s * 32_768.0).round() as i16).to_le_bytes())
            .collect();
        assert_eq!(back, bytes);
    }
}
