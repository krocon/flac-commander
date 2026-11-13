//! Tags of audio files (Lofty): what a playlist shows about a track.

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Longest tag text kept; tags are foreign data and can be megabytes.
const MAX_TEXT_CHARS: usize = 500;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackMeta {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: Option<u64>,
}

/// Reads the tags of `path`. A file without tags, or one Lofty cannot read, gives empty
/// metadata: whether it can be played is the decoder's business, not that of its tags.
pub fn read_meta(path: &Path) -> TrackMeta {
    let file = match lofty::read_from_path(path) {
        Ok(file) => file,
        Err(e) => {
            log::debug!("{}: no metadata: {e}", path.display());
            return TrackMeta::default();
        }
    };
    let duration_ms =
        u64::try_from(file.properties().duration().as_millis()).ok().filter(|d| *d > 0);
    let tag = file.primary_tag().or_else(|| file.first_tag());
    TrackMeta {
        title: tag.and_then(|t| t.title()).and_then(|t| clean(&t)),
        artist: tag.and_then(|t| t.artist()).and_then(|t| clean(&t)),
        album: tag.and_then(|t| t.album()).and_then(|t| clean(&t)),
        duration_ms,
    }
}

/// Trims, drops control characters and limits the length; an empty text is no text.
fn clean(text: &str) -> Option<String> {
    let cleaned: String =
        text.trim().chars().filter(|c| !c.is_control()).take(MAX_TEXT_CHARS).collect();
    (!cleaned.is_empty()).then_some(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
    }

    #[test]
    fn reads_title_artist_and_duration_of_every_tag_format() {
        for name in [
            "sine.flac",
            "sine.mp3",
            "sine.ogg",
            "sine.opus",
            "sine.m4a",
            "sine-alac.m4a",
            "sine.aiff",
        ] {
            let meta = read_meta(&fixture(name));
            assert_eq!(meta.title.as_deref(), Some("Sine"), "{name}");
            // ffmpeg's AIFF writer stores the title only
            if name != "sine.aiff" {
                assert_eq!(meta.artist.as_deref(), Some("fc-core"), "{name}");
            }
            assert_eq!(meta.album, None, "{name}");
            let duration = meta.duration_ms.unwrap_or_else(|| panic!("{name}: no duration"));
            assert!((950..=1100).contains(&duration), "{name}: {duration} ms");
        }
    }

    #[test]
    fn broken_and_missing_files_have_no_metadata() {
        assert_eq!(read_meta(&fixture("garbage.mp3")), TrackMeta::default());
        assert_eq!(read_meta(&fixture("does-not-exist.flac")), TrackMeta::default());
        assert_eq!(read_meta(&PathBuf::from(env!("CARGO_MANIFEST_DIR"))), TrackMeta::default());
    }

    #[test]
    fn tag_text_is_trimmed_bounded_and_free_of_control_characters() {
        assert_eq!(clean("  People \n"), Some("People".to_owned()));
        assert_eq!(clean("a\u{0}b\tc"), Some("abc".to_owned()));
        assert_eq!(clean("   "), None);
        assert_eq!(clean(&"x".repeat(10_000)).map(|s| s.len()), Some(MAX_TEXT_CHARS));
        assert_eq!(clean("Ünïcödé ✓"), Some("Ünïcödé ✓".to_owned()));
    }
}
