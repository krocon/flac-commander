//! The music library: the folders the user chose, what is in them and a search over it.
//!
//! The library is a view of the file system, not a database: browsing reads the folder that is
//! asked for, and a scan in the background reads the tags of every track into an index in
//! memory that the search uses. Nothing is written but small cover pictures ([`thumbnail`]).
//!
//! Every path that comes from outside goes through [`Library::resolve`]: it is made canonical
//! (links followed) and must lie inside one of the roots. Links are not listed and not
//! followed while walking, so a link inside a root cannot lead out of it.

pub mod thumbnail;

use crate::audio::formats::{extension_of, is_playable_extension};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::metadata::{TrackMeta, read_meta};
use crate::session::{MAX_ADDED_TRACKS, collect_audio_files};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Most root folders kept.
pub const MAX_ROOTS: usize = 32;
/// How deep the scan goes below a root.
const MAX_DEPTH: usize = 12;
/// Most tracks in the index.
pub const MAX_INDEXED_TRACKS: usize = 200_000;
/// Most folders and most files shown of one folder.
const MAX_LISTED: usize = 5_000;
/// Most files of one folder whose tags are read while browsing (the rest shows its file name).
const MAX_TAGGED: usize = 500;
/// How far below a folder without tracks its cover is looked for.
const COVER_DEPTH: usize = 3;
/// Longest search text taken.
pub const MAX_QUERY_CHARS: usize = 200;
/// Most albums and most tracks one search returns.
pub const MAX_FOUND: usize = 200;
/// The windows hear of a running scan this often.
const PROGRESS_EVERY: Duration = Duration::from_millis(200);

/// A folder on the way from a root to the folder shown, or a root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Crumb {
    pub name: String,
    pub path: String,
}

/// A folder as a tile. Mirrored by `LibraryFolder` in `core/library/library.models.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderItem {
    pub name: String,
    pub path: String,
    /// Album and artist as the tags of its first track give them.
    pub album: Option<String>,
    pub artist: Option<String>,
    /// Audio files directly in the folder; 0: a folder of folders.
    pub tracks: usize,
}

/// An audio file. Mirrored by `LibraryTrack`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackItem {
    /// The file name.
    pub name: String,
    pub path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: Option<u64>,
}

/// What a folder contains. Mirrored by `LibraryListing`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    /// The folder shown; `None`: the list of roots.
    pub folder: Option<FolderItem>,
    /// From the root down to the folder shown.
    pub crumbs: Vec<Crumb>,
    pub folders: Vec<FolderItem>,
    pub tracks: Vec<TrackItem>,
}

/// What a search found. Mirrored by `LibraryFound`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub albums: Vec<FolderItem>,
    pub tracks: Vec<TrackItem>,
    /// There was more than is returned.
    pub more: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanState {
    pub scanning: bool,
    /// Folders with tracks and tracks in the index so far.
    pub folders: usize,
    pub tracks: usize,
}

/// Roots and scan. Mirrored by `LibraryState`; payload of the event `library://state`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryState {
    pub roots: Vec<Crumb>,
    pub scan: ScanState,
}

/// A track of the index with the lower-case texts the search looks into.
struct IndexedTrack {
    item: TrackItem,
    /// Title and file name.
    own: String,
    /// `own`, artist and album.
    all: String,
}

/// A folder with tracks, as the scan found it.
struct Album {
    item: FolderItem,
    tracks: Vec<IndexedTrack>,
    /// Folder name, album and artist in lower case.
    text: String,
}

#[derive(Default)]
struct Inner {
    /// Canonical, none inside another.
    roots: Vec<PathBuf>,
    albums: Vec<Arc<Album>>,
    by_path: HashMap<PathBuf, Arc<Album>>,
    scan: ScanState,
    /// Counts the scans: an older scan stops when it sees a newer number.
    generation: u64,
    /// A scan was started since the roots last changed.
    scanned: bool,
}

impl Inner {
    fn state(&self) -> LibraryState {
        LibraryState { roots: self.roots.iter().map(|r| root_crumb(r)).collect(), scan: self.scan }
    }
}

/// Cheap to clone: every clone is the same library.
#[derive(Clone, Default)]
pub struct Library {
    inner: Arc<Mutex<Inner>>,
}

fn shown(path: &Path) -> Option<String> {
    path.to_str().map(str::to_owned)
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map_or_else(|| path.to_string_lossy().into_owned(), |n| n.to_string_lossy().into_owned())
}

fn root_crumb(root: &Path) -> Crumb {
    Crumb { name: name_of(root), path: root.to_string_lossy().into_owned() }
}

fn outside(path: &Path) -> AppError {
    AppError::new(
        ErrorCode::PermissionDenied,
        format!("{}: not inside a folder of the library", path.display()),
    )
}

fn track_item(path: &Path, meta: TrackMeta) -> Option<TrackItem> {
    Some(TrackItem {
        name: name_of(path),
        path: shown(path)?,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration_ms: meta.duration_ms,
    })
}

/// Sub-folders and audio files of `folder`, each sorted by name without regard to case. Links,
/// hidden entries and names that are not text are left out.
fn children(folder: &Path) -> std::io::Result<(Vec<PathBuf>, Vec<PathBuf>)> {
    let mut folders = Vec::new();
    let mut files = Vec::new();
    for entry in std::fs::read_dir(folder)?.filter_map(Result::ok) {
        let Ok(kind) = entry.file_type() else { continue };
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        if name.starts_with('.') {
            continue;
        }
        if kind.is_dir() {
            folders.push(path);
        } else if kind.is_file() && extension_of(&path).is_some_and(|e| is_playable_extension(&e)) {
            files.push(path);
        }
    }
    let by_name = |a: &PathBuf, b: &PathBuf| {
        let key = |p: &Path| name_of(p).to_lowercase();
        key(a).cmp(&key(b)).then_with(|| a.cmp(b))
    };
    folders.sort_by(by_name);
    files.sort_by(by_name);
    Ok((folders, files))
}

/// The first track in `folder` or, if it has none, in its sub-folders down to `depth`.
fn first_track(folder: &Path, depth: usize) -> Option<PathBuf> {
    let (folders, files) = children(folder).ok()?;
    if let Some(first) = files.into_iter().next() {
        return Some(first);
    }
    if depth == 0 {
        return None;
    }
    folders.iter().take(50).find_map(|sub| first_track(sub, depth - 1))
}

fn lower(parts: &[Option<&str>]) -> String {
    parts.iter().flatten().map(|p| p.to_lowercase()).collect::<Vec<_>>().join("\n")
}

impl Library {
    /// A library with the roots of last time. A root that is not there right now (a drive that
    /// is not connected) is kept: it is shown, empty, and can be removed.
    pub fn new(roots: &[PathBuf]) -> Self {
        let library = Self::default();
        for root in roots.iter().take(MAX_ROOTS) {
            if let Err(e) = library.add_root(root)
                && root.is_absolute()
            {
                log::warn!("library folder not available: {e}");
                let mut inner = lock(&library.inner);
                if !inner.roots.contains(root) {
                    inner.roots.push(root.clone());
                }
            }
        }
        lock(&library.inner).scanned = false;
        library
    }

    pub fn state(&self) -> LibraryState {
        lock(&self.inner).state()
    }

    /// The roots, as they are saved.
    pub fn roots(&self) -> Vec<PathBuf> {
        lock(&self.inner).roots.clone()
    }

    /// Adds a root folder. A folder inside a root is not added again; roots inside the new one
    /// are replaced by it. Returns whether the roots changed.
    pub fn add_root(&self, path: &Path) -> AppResult<bool> {
        let root = std::fs::canonicalize(path).map_err(|e| AppError::from_io(&e, path))?;
        if !root.is_dir() {
            return Err(AppError::new(
                ErrorCode::NotFound,
                format!("{}: not a folder", path.display()),
            ));
        }
        let mut inner = lock(&self.inner);
        if inner.roots.iter().any(|r| root.starts_with(r)) {
            return Ok(false);
        }
        inner.roots.retain(|r| !r.starts_with(&root));
        if inner.roots.len() >= MAX_ROOTS {
            return Err(AppError::internal(format!("more than {MAX_ROOTS} library folders")));
        }
        inner.roots.push(root);
        inner.scanned = false;
        Ok(true)
    }

    /// Removes the root `path` (as it was reported). Returns whether there was one.
    pub fn remove_root(&self, path: &str) -> bool {
        let mut inner = lock(&self.inner);
        let before = inner.roots.len();
        inner.roots.retain(|r| r.to_string_lossy() != path);
        let removed = inner.roots.len() != before;
        if removed {
            inner.scanned = false;
        }
        removed
    }

    /// The canonical form of `path` if it lies inside a root; an error otherwise.
    pub fn resolve(&self, path: &str) -> AppResult<PathBuf> {
        let given = Path::new(path);
        let canonical = std::fs::canonicalize(given).map_err(|e| AppError::from_io(&e, given))?;
        let inside = lock(&self.inner).roots.iter().any(|root| canonical.starts_with(root));
        if inside { Ok(canonical) } else { Err(outside(given)) }
    }

    /// What `path` contains; without a path, the roots.
    pub fn browse(&self, path: Option<&str>) -> AppResult<Listing> {
        let Some(path) = path else {
            let roots = self.roots();
            let folders = roots.iter().filter_map(|root| self.describe(root)).collect();
            return Ok(Listing { folder: None, crumbs: Vec::new(), folders, tracks: Vec::new() });
        };
        let folder = self.resolve(path)?;
        let (folders, files) = children(&folder).map_err(|e| AppError::from_io(&e, &folder))?;
        let indexed = lock(&self.inner).by_path.get(&folder).cloned();
        let known = |file: &Path| {
            let album = indexed.as_ref()?;
            let path = file.to_str()?;
            album.tracks.iter().find(|t| t.item.path == path).map(|t| t.item.clone())
        };
        let tracks = files
            .iter()
            .take(MAX_LISTED)
            .enumerate()
            .filter_map(|(index, file)| {
                known(file).or_else(|| {
                    let meta =
                        if index < MAX_TAGGED { read_meta(file) } else { TrackMeta::default() };
                    track_item(file, meta)
                })
            })
            .collect();
        Ok(Listing {
            folder: self.describe(&folder),
            crumbs: self.crumbs(&folder),
            folders: folders.iter().take(MAX_LISTED).filter_map(|f| self.describe(f)).collect(),
            tracks,
        })
    }

    /// A folder as a tile: from the index if the scan has seen it, else from the disk.
    fn describe(&self, folder: &Path) -> Option<FolderItem> {
        if let Some(album) = lock(&self.inner).by_path.get(folder) {
            return Some(album.item.clone());
        }
        let files = children(folder).map(|(_, files)| files).unwrap_or_default();
        let meta = files.first().map(|first| read_meta(first)).unwrap_or_default();
        Some(FolderItem {
            name: name_of(folder),
            path: shown(folder)?,
            album: meta.album,
            artist: meta.artist,
            tracks: files.len(),
        })
    }

    fn crumbs(&self, folder: &Path) -> Vec<Crumb> {
        let Some(root) = lock(&self.inner).roots.iter().find(|r| folder.starts_with(r)).cloned()
        else {
            return Vec::new();
        };
        let mut crumbs = vec![root_crumb(&root)];
        let mut at = root.clone();
        for part in folder.strip_prefix(&root).into_iter().flat_map(Path::components) {
            at.push(part);
            crumbs.push(Crumb {
                name: part.as_os_str().to_string_lossy().into_owned(),
                path: at.to_string_lossy().into_owned(),
            });
        }
        crumbs
    }

    /// The files to play for `path`: the file itself, or every track in and below the folder.
    pub fn playable(&self, path: &str) -> AppResult<Vec<PathBuf>> {
        let target = self.resolve(path)?;
        Ok(collect_audio_files(&[target], MAX_ADDED_TRACKS))
    }

    /// The track whose cover stands for `path`: the file itself, or the first track of the
    /// folder (or of what is below it).
    pub fn cover_track(&self, path: &str) -> AppResult<Option<PathBuf>> {
        let target = self.resolve(path)?;
        Ok(if target.is_dir() { first_track(&target, COVER_DEPTH) } else { Some(target) })
    }

    /// True if a scan has to be started: there are roots and none ran since they changed.
    pub fn needs_scan(&self) -> bool {
        let inner = lock(&self.inner);
        !inner.scanned && !inner.roots.is_empty()
    }

    /// Reads all roots into a fresh index on a thread of its own. `on_state` hears of the
    /// progress and of the end. A scan that is still running stops.
    pub fn rescan<F>(&self, on_state: F)
    where
        F: Fn(&LibraryState) + Send + 'static,
    {
        let generation = self.begin_scan();
        on_state(&self.state());
        let library = self.clone();
        let spawned = std::thread::Builder::new()
            .name("library-scan".to_owned())
            .spawn(move || library.scan(generation, &on_state));
        if let Err(e) = spawned {
            log::error!("library scan thread could not be started: {e}");
            lock(&self.inner).scan.scanning = false;
        }
    }

    /// Like [`Library::rescan`], but returns when the scan is done.
    pub fn scan_now(&self) {
        let generation = self.begin_scan();
        self.scan(generation, &|_| {});
    }

    fn begin_scan(&self) -> u64 {
        let mut inner = lock(&self.inner);
        inner.generation += 1;
        inner.albums.clear();
        inner.by_path.clear();
        inner.scan = ScanState { scanning: true, folders: 0, tracks: 0 };
        inner.scanned = true;
        inner.generation
    }

    fn scan(&self, generation: u64, on_state: &dyn Fn(&LibraryState)) {
        let started = Instant::now();
        let mut told = Instant::now();
        // depth first, in the order of the names
        let mut pending: Vec<(PathBuf, usize)> =
            self.roots().into_iter().rev().map(|root| (root, 0)).collect();
        while let Some((folder, depth)) = pending.pop() {
            let Ok((folders, files)) = children(&folder) else { continue };
            if depth < MAX_DEPTH {
                pending.extend(folders.into_iter().rev().map(|sub| (sub, depth + 1)));
            }
            if files.is_empty() {
                continue;
            }
            let Some(album) = read_album(&folder, &files) else { continue };
            let mut inner = lock(&self.inner);
            if inner.generation != generation {
                return; // a newer scan took over
            }
            inner.scan.folders += 1;
            inner.scan.tracks += album.tracks.len();
            let album = Arc::new(album);
            inner.by_path.insert(folder, album.clone());
            inner.albums.push(album);
            let full = inner.scan.tracks >= MAX_INDEXED_TRACKS;
            let state = (told.elapsed() >= PROGRESS_EVERY).then(|| inner.state());
            drop(inner);
            if let Some(state) = state {
                told = Instant::now();
                on_state(&state);
            }
            if full {
                log::warn!("library: more than {MAX_INDEXED_TRACKS} tracks, the rest is left out");
                break;
            }
        }
        let state = {
            let mut inner = lock(&self.inner);
            if inner.generation != generation {
                return;
            }
            inner.scan.scanning = false;
            inner.state()
        };
        log::info!(
            "library: {} track(s) in {} folder(s) read in {} ms",
            state.scan.tracks,
            state.scan.folders,
            started.elapsed().as_millis()
        );
        on_state(&state);
    }

    /// Albums and tracks that contain every word of `query`, without regard to case. An album
    /// is found by its folder name, album and artist; a track by its title or file name, with
    /// artist and album for the remaining words.
    pub fn search(&self, query: &str) -> Found {
        let query: String = query.chars().take(MAX_QUERY_CHARS).collect::<String>().to_lowercase();
        let words: Vec<&str> = query.split_whitespace().collect();
        if words.is_empty() {
            return Found::default();
        }
        let albums = lock(&self.inner).albums.clone();
        let mut found = Found::default();
        for album in &albums {
            if words.iter().all(|w| album.text.contains(w)) {
                if found.albums.len() < MAX_FOUND {
                    found.albums.push(album.item.clone());
                } else {
                    found.more = true;
                }
            }
            for track in &album.tracks {
                let hit = words.iter().all(|w| track.all.contains(w))
                    && words.iter().any(|w| track.own.contains(w));
                if hit {
                    if found.tracks.len() < MAX_FOUND {
                        found.tracks.push(track.item.clone());
                    } else {
                        found.more = true;
                    }
                }
            }
        }
        found
    }
}

/// Reads the tags of the tracks of one folder.
fn read_album(folder: &Path, files: &[PathBuf]) -> Option<Album> {
    let tracks: Vec<IndexedTrack> = files
        .iter()
        .take(MAX_LISTED)
        .filter_map(|file| {
            let item = track_item(file, read_meta(file))?;
            let own = lower(&[item.title.as_deref(), Some(&item.name)]);
            let all = lower(&[Some(&own), item.artist.as_deref(), item.album.as_deref()]);
            Some(IndexedTrack { item, own, all })
        })
        .collect();
    let first = tracks.first()?;
    let item = FolderItem {
        name: name_of(folder),
        path: shown(folder)?,
        album: first.item.album.clone(),
        artist: first.item.artist.clone(),
        tracks: tracks.len(),
    };
    let text = lower(&[Some(&item.name), item.album.as_deref(), item.artist.as_deref()]);
    Some(Album { item, tracks, text })
}

fn lock(inner: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[cfg(test)]
mod tests;
