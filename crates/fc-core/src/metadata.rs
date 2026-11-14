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

/// Largest cover picture handed on; larger ones are treated as no cover.
const MAX_COVER_BYTES: usize = 20 * 1024 * 1024;

/// Names of a picture next to the audio file that is taken as the cover of its album.
const COVER_FILES: &[&str] = &["cover", "folder", "front", "album"];

/// The cover of the track at `path`: the picture in its tags (the front cover if there are
/// several), else a `cover.jpg`, `folder.png` … next to it. Only PNG, JPEG and WebP, told by
/// their content. Returns the bytes and their content type.
pub fn read_cover(path: &Path) -> Option<(Vec<u8>, &'static str)> {
    let embedded = lofty::read_from_path(path).ok().and_then(|file| {
        let tags = file.primary_tag().into_iter().chain(file.tags());
        let pictures: Vec<_> = tags.flat_map(|tag| tag.pictures()).collect();
        pictures
            .iter()
            .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
            .or_else(|| pictures.first())
            .map(|p| p.data().to_vec())
    });
    let beside = || {
        let folder = path.parent()?;
        let entries = std::fs::read_dir(folder).ok()?;
        let picture = entries.filter_map(Result::ok).map(|e| e.path()).find(|candidate| {
            let stem = candidate.file_stem().map(|s| s.to_string_lossy().to_lowercase());
            let extension = candidate.extension().map(|e| e.to_string_lossy().to_lowercase());
            stem.is_some_and(|s| COVER_FILES.contains(&s.as_str()))
                && extension.is_some_and(|e| ["jpg", "jpeg", "png", "webp"].contains(&e.as_str()))
        })?;
        let size = std::fs::metadata(&picture).ok()?.len();
        (usize::try_from(size).ok()? <= MAX_COVER_BYTES).then(|| std::fs::read(&picture).ok())?
    };
    let bytes = embedded.or_else(beside)?;
    let kind = picture_type(&bytes)?;
    (bytes.len() <= MAX_COVER_BYTES).then_some((bytes, kind))
}

/// The content type of a picture a webview may show, told by its first bytes.
fn picture_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
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

    #[test]
    fn the_cover_is_a_picture_beside_the_file_when_the_tags_have_none() {
        let folder = std::env::temp_dir().join(format!("fc-cover-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let track = folder.join("sine.flac");
        std::fs::copy(fixture("sine.flac"), &track).unwrap();
        assert_eq!(read_cover(&track), None);

        // told by its content, not by its name
        std::fs::write(folder.join("Cover.JPG"), b"not a picture").unwrap();
        assert_eq!(read_cover(&track), None);
        let png = b"\x89PNG\r\n\x1a\n-rest-of-a-picture".to_vec();
        std::fs::write(folder.join("Cover.JPG"), &png).unwrap();
        assert_eq!(read_cover(&track), Some((png, "image/png")));
        assert_eq!(read_cover(&folder.join("missing.flac")).map(|c| c.1), Some("image/png"));
        std::fs::remove_dir_all(&folder).unwrap();
    }

    #[test]
    fn only_pictures_a_webview_may_show_have_a_type() {
        assert_eq!(picture_type(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(picture_type(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(picture_type(b"<svg/>"), None);
        assert_eq!(picture_type(b"GIF89a"), None);
    }
}
