//! The audio formats the product aims at and what this build really does with them.
//!
//! A format is only [`FormatSupport::Supported`] if `tests/formats.rs` decodes a fixture of it.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FormatSupport {
    /// Decoded by the built-in decoders, covered by a test.
    Supported,
    /// Recognised, but there is no decoder in this build.
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioFormat {
    /// Stable id, also the key of the frontend's texts.
    pub id: &'static str,
    pub name: &'static str,
    /// Lower-case file extensions without the dot.
    pub extensions: &'static [&'static str],
    pub support: FormatSupport,
}

pub const AUDIO_FORMATS: &[AudioFormat] = &[
    AudioFormat {
        id: "flac",
        name: "FLAC",
        extensions: &["flac"],
        support: FormatSupport::Supported,
    },
    AudioFormat { id: "mp3", name: "MP3", extensions: &["mp3"], support: FormatSupport::Supported },
    AudioFormat {
        id: "wav",
        name: "WAV",
        extensions: &["wav", "wave"],
        support: FormatSupport::Supported,
    },
    AudioFormat {
        id: "vorbis",
        name: "Ogg Vorbis",
        extensions: &["ogg", "oga"],
        support: FormatSupport::Supported,
    },
    AudioFormat {
        id: "aac",
        name: "AAC / M4A",
        extensions: &["m4a", "aac", "mp4"],
        support: FormatSupport::Supported,
    },
    AudioFormat {
        id: "alac",
        name: "ALAC",
        extensions: &["m4a"],
        support: FormatSupport::Supported,
    },
    AudioFormat {
        id: "aiff",
        name: "AIFF",
        extensions: &["aiff", "aif"],
        support: FormatSupport::Supported,
    },
    // Symphonia 0.6.1 reads the Ogg container but has no Opus decoder: libopus does the
    // decoding if the `opus` feature is built in (docs/decisions/0006).
    AudioFormat {
        id: "opus",
        name: "Opus",
        extensions: &["opus"],
        support: if cfg!(feature = "opus") {
            FormatSupport::Supported
        } else {
            FormatSupport::Unsupported
        },
    },
];

/// The lower-case extension of `path`, if it has one.
pub fn extension_of(path: &std::path::Path) -> Option<String> {
    path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase)
}

/// True if a file with this (lower-case) extension can be offered for playback.
pub fn is_playable_extension(extension: &str) -> bool {
    AUDIO_FORMATS
        .iter()
        .any(|f| f.support == FormatSupport::Supported && f.extensions.contains(&extension))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn extensions_are_lower_case_and_ids_unique() {
        let mut ids: Vec<_> = AUDIO_FORMATS.iter().map(|f| f.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), AUDIO_FORMATS.len());
        for f in AUDIO_FORMATS {
            assert!(!f.extensions.is_empty());
            for e in f.extensions {
                assert_eq!(*e, e.to_ascii_lowercase());
            }
        }
    }

    #[test]
    fn extension_is_read_case_insensitively() {
        assert_eq!(extension_of(Path::new("A/Track 01.FLAC")).as_deref(), Some("flac"));
        assert_eq!(extension_of(Path::new("Übung.Mp3")).as_deref(), Some("mp3"));
        assert_eq!(extension_of(Path::new("noext")), None);
    }

    #[test]
    fn only_what_can_be_decoded_is_offered() {
        assert!(is_playable_extension("flac"));
        assert!(is_playable_extension("m4a"));
        assert_eq!(is_playable_extension("opus"), cfg!(feature = "opus"));
        assert!(!is_playable_extension("txt"));
    }
}
