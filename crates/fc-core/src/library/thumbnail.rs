//! Small cover pictures for the album grid.
//!
//! A cover in the tags is often a few megabytes; a grid of two hundred of them would make the
//! window slow. So each cover is scaled down once to a JPEG of at most [`THUMBNAIL_SIDE`]
//! pixels, kept in memory and – if there is a cache folder – on disk, under a name made of the
//! track's path, size and dates. A changed file gets a new name; old pictures stay until the
//! cache folder is emptied.

use crate::metadata::read_cover;
use image::codecs::jpeg::JpegEncoder;
use image::{ImageReader, Limits};
use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

/// Longest side of a thumbnail: a tile of 180 px on a screen with double density.
pub const THUMBNAIL_SIDE: u32 = 360;
const JPEG_QUALITY: u8 = 82;
/// Covers larger than this (in pixels per side) are not decoded.
const MAX_COVER_SIDE: u32 = 10_000;
/// Memory the decoder may take for one cover.
const MAX_DECODE_BYTES: u64 = 256 * 1024 * 1024;
/// Pictures kept in memory; when there are more, the memory is emptied (the disk still has them).
const MAX_IN_MEMORY: usize = 2_000;

/// Scales a PNG, JPEG or WebP down to a JPEG of at most `side` pixels. `None`: not a picture
/// this build reads, or one that is too large.
pub fn thumbnail(picture: &[u8], side: u32) -> Option<Vec<u8>> {
    let mut reader = ImageReader::new(Cursor::new(picture)).with_guessed_format().ok()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_COVER_SIDE);
    limits.max_image_height = Some(MAX_COVER_SIDE);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    reader.limits(limits);
    let decoded = reader.decode().ok()?;
    // a picture that is small already is not blown up; JPEG has no transparency: `to_rgb8`
    // drops it
    let fits = decoded.width() <= side && decoded.height() <= side;
    let small = if fits { decoded.to_rgb8() } else { decoded.thumbnail(side, side).to_rgb8() };
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY).encode_image(&small).ok()?;
    Some(jpeg)
}

/// The thumbnails made so far. `None` in memory: the track is known to have no cover.
pub struct CoverCache {
    folder: Option<PathBuf>,
    memory: Mutex<HashMap<String, Option<Arc<Vec<u8>>>>>,
}

impl CoverCache {
    /// `folder`: where the pictures are kept between runs; `None`: in memory only.
    pub fn new(folder: Option<PathBuf>) -> Self {
        Self { folder, memory: Mutex::default() }
    }

    /// The thumbnail (JPEG) of the cover of `track`, made now if it is not there yet.
    pub fn cover_of(&self, track: &Path) -> Option<Arc<Vec<u8>>> {
        let key = key_of(track)?;
        if let Some(known) = self.lock().get(&key) {
            return known.clone();
        }
        let file = self.folder.as_ref().map(|folder| folder.join(format!("{key}.jpg")));
        let picture = file
            .as_ref()
            .and_then(|file| std::fs::read(file).ok())
            .or_else(|| {
                let (cover, _) = read_cover(track)?;
                let small = thumbnail(&cover, THUMBNAIL_SIDE)?;
                if let Some(file) = &file {
                    store(file, &small);
                }
                Some(small)
            })
            .map(Arc::new);
        let mut memory = self.lock();
        if memory.len() >= MAX_IN_MEMORY {
            memory.clear();
        }
        memory.insert(key, picture.clone());
        picture
    }

    /// Forgets what is in memory: covers that were missing are looked for again.
    pub fn forget(&self) {
        self.lock().clear();
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Option<Arc<Vec<u8>>>>> {
        self.memory.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

/// Written beside its place first and renamed: a crash leaves no half picture.
fn store(file: &Path, picture: &[u8]) {
    let written = (|| {
        if let Some(folder) = file.parent() {
            std::fs::create_dir_all(folder)?;
        }
        let temporary = file.with_extension("tmp");
        std::fs::write(&temporary, picture)?;
        std::fs::rename(&temporary, file)
    })();
    if let Err(e) = written {
        log::debug!("{}: thumbnail not kept: {e}", file.display());
    }
}

/// A name for the cover of `track` that changes when the file changes or when something is
/// added to or taken from its folder (a `cover.jpg`, say).
fn key_of(track: &Path) -> Option<String> {
    let seconds = |meta: &std::fs::Metadata| {
        meta.modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_secs())
    };
    let meta = std::fs::metadata(track).ok()?;
    let folder = track.parent().and_then(|f| std::fs::metadata(f).ok());
    let mut hash = Fnv::default();
    hash.write(track.to_string_lossy().as_bytes());
    hash.write(&meta.len().to_le_bytes());
    hash.write(&seconds(&meta).to_le_bytes());
    hash.write(&folder.as_ref().map_or(0, seconds).to_le_bytes());
    Some(format!("{:016x}", hash.0))
}

/// FNV-1a, 64 bit: the same on every platform and in every version, unlike `DefaultHasher`.
struct Fnv(u64);

impl Default for Fnv {
    fn default() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }
}

impl Fnv {
    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 = (self.0 ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use image::{ImageFormat, Rgb, RgbImage};

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
    }

    fn folder(test: &str) -> PathBuf {
        let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/test-tmp/thumbnail")
            .join(test);
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn png(width: u32, height: u32) -> Vec<u8> {
        let picture = RgbImage::from_pixel(width, height, Rgb([200, 40, 40]));
        let mut bytes = Vec::new();
        picture.write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png).unwrap();
        bytes
    }

    fn size_of(jpeg: &[u8]) -> (u32, u32) {
        assert!(jpeg.starts_with(&[0xFF, 0xD8, 0xFF]), "not a JPEG");
        let picture = image::load_from_memory(jpeg).unwrap();
        (picture.width(), picture.height())
    }

    #[test]
    fn a_cover_is_scaled_down_to_a_small_jpeg_that_keeps_its_shape() {
        assert_eq!(size_of(&thumbnail(&png(1200, 1200), 360).unwrap()), (360, 360));
        assert_eq!(size_of(&thumbnail(&png(1000, 500), 360).unwrap()), (360, 180));
        // a small picture is not blown up
        assert_eq!(size_of(&thumbnail(&png(100, 80), 360).unwrap()), (100, 80));
    }

    #[test]
    fn what_is_no_picture_gives_no_thumbnail() {
        assert_eq!(thumbnail(b"not a picture", 360), None);
        assert_eq!(thumbnail(b"", 360), None);
        assert_eq!(thumbnail(b"\x89PNG\r\n\x1a\ncut off", 360), None);
        let mut cut = png(64, 64);
        cut.truncate(40);
        assert_eq!(thumbnail(&cut, 360), None);
    }

    #[test]
    fn a_thumbnail_is_made_once_and_kept_on_disk() {
        let music = folder("kept/music");
        let cache_folder = folder("kept/cache");
        let track = music.join("sine.flac");
        std::fs::copy(fixture("sine.flac"), &track).unwrap();

        // no cover: remembered, nothing written
        let cache = CoverCache::new(Some(cache_folder.clone()));
        assert_eq!(cache.cover_of(&track), None);
        assert_eq!(std::fs::read_dir(&cache_folder).unwrap().count(), 0);

        // a cover appears beside the track: the folder changed, so the name does too
        std::fs::write(music.join("cover.png"), png(800, 800)).unwrap();
        let cache = CoverCache::new(Some(cache_folder.clone()));
        let made = cache.cover_of(&track).unwrap();
        assert_eq!(size_of(&made), (360, 360));
        let files: Vec<_> =
            std::fs::read_dir(&cache_folder).unwrap().map(|e| e.unwrap().path()).collect();
        assert_eq!(files.len(), 1);
        assert_eq!(std::fs::read(&files[0]).unwrap(), *made);

        // the next run takes the file: it is not made again
        std::fs::write(&files[0], b"from the disk").unwrap();
        assert_eq!(*cache.cover_of(&track).unwrap(), *made, "memory first");
        let next_run = CoverCache::new(Some(cache_folder));
        assert_eq!(*next_run.cover_of(&track).unwrap(), b"from the disk");
    }

    #[test]
    fn without_a_cache_folder_pictures_live_in_memory_and_missing_files_have_none() {
        let music = folder("memory");
        let track = music.join("sine.flac");
        std::fs::copy(fixture("sine.flac"), &track).unwrap();
        std::fs::write(music.join("folder.png"), png(64, 64)).unwrap();
        let cache = CoverCache::new(None);
        assert_eq!(size_of(&cache.cover_of(&track).unwrap()), (64, 64));
        assert_eq!(cache.cover_of(&music.join("missing.flac")), None);
        cache.forget();
        assert!(cache.cover_of(&track).is_some());
    }
}
