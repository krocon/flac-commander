//! The session: player and playlist together, and what is remembered of them.
//!
//! The player plays one track and knows nothing of a list; the playlist is pure data. The
//! session connects them: it starts the entry the user picks, goes on to the next one when a
//! track ends, passes over tracks that cannot be played, reads tags in the background and saves
//! the state.

use crate::audio::equalizer::EqSettings;
use crate::audio::formats::{extension_of, is_playable_extension};
use crate::audio::player::{OutputBackend, PlaybackStatus, Player, PlayerState, SpectrumSink};
use crate::error::{AppResult, ErrorCode};
use crate::metadata::read_meta;
use crate::playlist::{Advance, Playlist, PlaylistState, RepeatMode};
use crate::storage::{self, Loaded, SavedState, Saver, WindowPlace};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;

/// Tracks in a row that may fail before the session stops trying the next one.
const MAX_FAILURES_IN_A_ROW: u32 = 5;
/// "Previous" within this time goes to the previous track, later to the start of this one.
const RESTART_THRESHOLD_MS: u64 = 3000;
/// Limits for folders dropped onto the app.
const MAX_FOLDER_DEPTH: usize = 12;
pub const MAX_ADDED_TRACKS: usize = 20_000;
/// After how many tags read in the background the windows are told.
const META_BATCH: usize = 25;

pub struct SessionConfig {
    /// Where the state is saved; `None`: nothing is loaded or saved.
    pub state_file: Option<PathBuf>,
    /// Seed of the shuffle order.
    pub shuffle_seed: u64,
    /// Where the spectrum for visualizers goes; `None`: it is never computed.
    pub on_spectrum: Option<SpectrumSink>,
}

/// Whether tracks that were just added start playing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayAdded {
    /// The first added track plays (the user opened it).
    Always,
    /// Only if nothing is playing (the user dropped it onto the window).
    IfIdle,
    Never,
}

struct Inner {
    /// Set right after the player is started.
    player: Option<Player>,
    playlist: Playlist,
    on_playlist: Box<dyn Fn(&PlaylistState) + Send>,
    saver: Option<Saver>,
    /// The entry the player has loaded or is loading.
    active: Option<u64>,
    /// The active entry was started to be played (not only shown).
    active_autoplay: bool,
    finished_seen: u64,
    failures_in_a_row: u32,
    volume: f32,
    equalizer: EqSettings,
    position_ms: u64,
    /// Id of the active skin: kept here only to be saved with the rest.
    skin: Option<String>,
    /// Places of the windows: kept here only to be saved with the rest.
    windows: BTreeMap<String, WindowPlace>,
}

/// Cheap to clone: every clone is the same session.
#[derive(Clone)]
pub struct Session {
    player: Player,
    inner: Arc<Mutex<Inner>>,
}

fn lock(inner: &Mutex<Inner>) -> MutexGuard<'_, Inner> {
    inner.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Errors that say "this file cannot be played" (as opposed to "the device has a problem").
fn is_file_error(code: ErrorCode) -> bool {
    matches!(
        code,
        ErrorCode::NotFound
            | ErrorCode::PermissionDenied
            | ErrorCode::Io
            | ErrorCode::UnsupportedFormat
            | ErrorCode::DecodeFailed
    )
}

impl Inner {
    fn emit(&self) {
        (self.on_playlist)(&self.playlist.state());
    }

    fn saved_state(&self) -> SavedState {
        let entries = self.playlist.entries();
        let current = self
            .playlist
            .current()
            .and_then(|current| entries.iter().position(|e| e.id == current.id));
        SavedState {
            volume: self.volume,
            repeat: self.playlist.repeat(),
            shuffle: self.playlist.shuffle(),
            tracks: entries.iter().map(|e| e.path.clone()).collect(),
            current,
            position_ms: if current.is_some() { self.position_ms } else { 0 },
            skin: self.skin.clone(),
            equalizer: self.equalizer,
            windows: self.windows.clone(),
            ..SavedState::default()
        }
    }

    fn save(&self) {
        if let Some(saver) = &self.saver {
            saver.save(self.saved_state());
        }
    }

    fn changed(&self) {
        self.emit();
        self.save();
    }

    /// Makes `id` current and hands it to the player.
    fn start(&mut self, id: u64, autoplay: bool) {
        let Some(path) = self.playlist.entry(id).map(|e| e.path.clone()) else {
            return;
        };
        self.playlist.select(id);
        self.active = Some(id);
        self.active_autoplay = autoplay;
        self.position_ms = 0;
        if let Some(player) = &self.player
            && let Err(e) = player.load(path, autoplay)
        {
            log::error!("load not sent: {e}");
        }
    }

    fn go(&mut self, why: Advance) -> bool {
        match self.playlist.advance(why) {
            Some(id) => {
                self.start(id, true);
                true
            }
            None => false,
        }
    }

    /// Called on the engine thread with every state of the player.
    fn on_player_state(&mut self, state: &PlayerState) {
        self.position_ms = state.position_ms;
        let mut changed = false;

        if let Some(id) = self.active {
            let path = self.playlist.entry(id).map(|e| e.path.clone());
            // an error of this file: the engine names the path first in its message, so a
            // state that still carries the failure of another track is not taken for this one
            let shown = path.as_ref().map(|p| p.display().to_string()).unwrap_or_default();
            let file_error = state
                .error
                .as_ref()
                .filter(|e| is_file_error(e.code) && e.message.starts_with(&shown))
                .map(|e| e.code);
            if state.track.as_ref().map(|t| &t.path) == path.as_ref() {
                // loaded: whatever was wrong with it before is over
                if self.playlist.entry(id).is_some_and(|e| e.error.is_some()) {
                    self.playlist.set_error(id, None);
                    changed = true;
                }
                if state.status == PlaybackStatus::Playing {
                    self.failures_in_a_row = 0;
                }
            } else if let (None, Some(code)) = (&state.track, file_error) {
                // could not be loaded, or broke while playing: mark it and try the next one
                self.playlist.set_error(id, Some(code));
                self.active = None;
                self.failures_in_a_row += 1;
                changed = true;
                if self.active_autoplay && self.failures_in_a_row <= MAX_FAILURES_IN_A_ROW {
                    self.go(Advance::Auto);
                }
            }
        }

        if state.finished > self.finished_seen {
            self.finished_seen = state.finished;
            self.go(Advance::Auto);
            changed = true;
        }

        if state.volume != self.volume || state.equalizer != self.equalizer {
            self.volume = state.volume;
            self.equalizer = state.equalizer;
            self.save();
        }
        if changed {
            self.changed();
        }
    }
}

impl Session {
    /// Starts the player, restores the saved state and reads the tags of the restored tracks.
    pub fn start<B, P, L>(
        backend: B,
        config: SessionConfig,
        on_player: P,
        on_playlist: L,
    ) -> AppResult<Self>
    where
        B: OutputBackend,
        P: Fn(&PlayerState) + Send + 'static,
        L: Fn(&PlaylistState) + Send + 'static,
    {
        let (saved, saver) = match &config.state_file {
            None => (SavedState::default(), None),
            Some(path) => match storage::load(path) {
                Loaded::State(state) => (state, Some(Saver::start(path.clone())?)),
                // a newer app wrote the file: start empty and leave it alone
                Loaded::Newer(_) => (SavedState::default(), None),
            },
        };

        let mut playlist = Playlist::new(config.shuffle_seed);
        let ids = playlist.add(saved.tracks.iter().cloned());
        playlist.set_repeat(saved.repeat);
        let current = saved.current.and_then(|index| ids.get(index).copied());
        if let Some(id) = current {
            playlist.select(id);
        }
        playlist.set_shuffle(saved.shuffle);

        let inner = Arc::new(Mutex::new(Inner {
            player: None,
            playlist,
            on_playlist: Box::new(on_playlist),
            saver,
            active: None,
            active_autoplay: false,
            finished_seen: 0,
            failures_in_a_row: 0,
            volume: saved.volume,
            equalizer: saved.equalizer,
            position_ms: saved.position_ms,
            skin: saved.skin.clone(),
            windows: saved.windows.clone(),
        }));

        let hook = inner.clone();
        let player = Player::spawn_with_spectrum(
            backend,
            move |state| {
                on_player(state);
                lock(&hook).on_player_state(state);
            },
            config.on_spectrum,
        )?;
        player.set_volume(saved.volume)?;
        player.set_equalizer(saved.equalizer)?;
        {
            let mut inner = lock(&inner);
            inner.player = Some(player.clone());
            // show the track of last time, where it was – without playing it
            if let Some(id) = current {
                let position_ms = inner.position_ms;
                inner.start(id, false);
                inner.position_ms = position_ms;
                if position_ms > 0 {
                    player.seek(position_ms)?;
                }
            }
        }
        let session = Self { player, inner };
        session.read_meta_in_background(ids);
        Ok(session)
    }

    /// The player, for what concerns the playing track only: pause, seek, volume.
    pub fn player(&self) -> &Player {
        &self.player
    }

    /// The id of the skin that was active when the state was saved.
    pub fn skin(&self) -> Option<String> {
        lock(&self.inner).skin.clone()
    }

    /// Remembers the active skin.
    pub fn set_skin(&self, id: Option<String>) {
        let mut inner = lock(&self.inner);
        inner.skin = id;
        inner.save();
    }

    /// Where the window `label` was when the state was saved.
    pub fn window_place(&self, label: &str) -> Option<WindowPlace> {
        lock(&self.inner).windows.get(label).copied()
    }

    /// Remembers where a window is.
    pub fn set_window_place(&self, label: &str, place: WindowPlace) {
        let mut inner = lock(&self.inner);
        if inner.windows.get(label) != Some(&place) {
            inner.windows.insert(label.to_owned(), place);
            inner.save();
        }
    }

    pub fn playlist_state(&self) -> PlaylistState {
        lock(&self.inner).playlist.state()
    }

    /// Adds files; folders are searched for audio files. Returns how many tracks were added.
    pub fn add_paths(&self, paths: &[PathBuf], play: PlayAdded) -> usize {
        let files = collect_audio_files(paths, MAX_ADDED_TRACKS);
        if files.is_empty() {
            return 0;
        }
        let idle = self.player.state().status != PlaybackStatus::Playing;
        let ids = {
            let mut inner = lock(&self.inner);
            let ids = inner.playlist.add(files);
            let start = match play {
                PlayAdded::Always => true,
                PlayAdded::IfIdle => idle,
                PlayAdded::Never => false,
            };
            if let (true, Some(first)) = (start, ids.first()) {
                inner.failures_in_a_row = 0;
                inner.start(*first, true);
            }
            inner.changed();
            ids
        };
        let added = ids.len();
        self.read_meta_in_background(ids);
        added
    }

    /// Plays the entry `id`.
    pub fn play_entry(&self, id: u64) {
        let mut inner = lock(&self.inner);
        if inner.playlist.entry(id).is_some() {
            // the user asks for this one: try it even if it failed before
            inner.playlist.set_error(id, None);
            inner.failures_in_a_row = 0;
            inner.start(id, true);
            inner.changed();
        }
    }

    /// Play: continues the loaded track; without one, starts the current or the first entry.
    pub fn play(&self) -> AppResult<()> {
        if self.player.state().track.is_some() {
            return self.player.play();
        }
        let mut inner = lock(&self.inner);
        inner.failures_in_a_row = 0;
        let started = match inner.playlist.current().map(|e| e.id) {
            Some(id) => {
                inner.playlist.set_error(id, None);
                inner.start(id, true);
                true
            }
            None => inner.go(Advance::Next),
        };
        if started {
            inner.changed();
        }
        Ok(())
    }

    pub fn next(&self) {
        let mut inner = lock(&self.inner);
        inner.failures_in_a_row = 0;
        if inner.go(Advance::Next) {
            inner.changed();
        }
    }

    /// The previous track – or, a few seconds into a track, its start.
    pub fn previous(&self) -> AppResult<()> {
        let mut inner = lock(&self.inner);
        if inner.position_ms > RESTART_THRESHOLD_MS && inner.active.is_some() {
            return self.player.seek(0);
        }
        inner.failures_in_a_row = 0;
        if inner.go(Advance::Previous) {
            inner.changed();
        }
        Ok(())
    }

    pub fn remove(&self, ids: &[u64]) -> AppResult<()> {
        let mut inner = lock(&self.inner);
        if inner.playlist.remove(ids) {
            inner.active = None;
            self.player.unload()?;
        }
        inner.changed();
        Ok(())
    }

    pub fn clear(&self) -> AppResult<()> {
        let mut inner = lock(&self.inner);
        inner.playlist.clear();
        inner.active = None;
        self.player.unload()?;
        inner.changed();
        Ok(())
    }

    pub fn set_repeat(&self, repeat: RepeatMode) {
        let mut inner = lock(&self.inner);
        inner.playlist.set_repeat(repeat);
        inner.changed();
    }

    pub fn set_shuffle(&self, shuffle: bool) {
        let mut inner = lock(&self.inner);
        inner.playlist.set_shuffle(shuffle);
        inner.changed();
    }

    /// Writes the state, with the current position, and waits until it is on disk (at exit).
    pub fn save_now(&self) {
        let position_ms = self.player.state().position_ms;
        let mut inner = lock(&self.inner);
        inner.position_ms = position_ms;
        inner.save();
        if let Some(saver) = &inner.saver {
            saver.flush();
        }
    }

    /// Reads the tags of the entries `ids` on a thread of its own and marks files that are gone.
    fn read_meta_in_background(&self, ids: Vec<u64>) {
        if ids.is_empty() {
            return;
        }
        let inner = self.inner.clone();
        let spawned = thread::Builder::new().name("metadata".to_owned()).spawn(move || {
            for (done, id) in ids.iter().enumerate() {
                let Some(path) = lock(&inner).playlist.entry(*id).map(|e| e.path.clone()) else {
                    continue; // removed meanwhile
                };
                let exists = path.is_file();
                let meta = if exists { read_meta(&path) } else { Default::default() };
                let mut inner = lock(&inner);
                inner.playlist.set_meta(*id, meta);
                if !exists {
                    inner.playlist.set_error(*id, Some(ErrorCode::NotFound));
                }
                if (done + 1) % META_BATCH == 0 || done + 1 == ids.len() {
                    inner.emit();
                }
            }
        });
        if let Err(e) = spawned {
            log::error!("metadata thread could not be started: {e}");
        }
    }
}

/// The audio files in `paths`: files with a playable extension as given, folders searched
/// (sorted by name, bounded in depth and number). Everything else is left out.
pub fn collect_audio_files(paths: &[PathBuf], limit: usize) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for path in paths {
        collect(path, 0, limit, &mut files);
    }
    files
}

fn collect(path: &Path, depth: usize, limit: usize, files: &mut Vec<PathBuf>) {
    if files.len() >= limit {
        return;
    }
    // `symlink_metadata`: a link is not followed into folders (no loops, no surprises)
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return;
    };
    let is_playable = || extension_of(path).is_some_and(|e| is_playable_extension(&e));
    if meta.is_file() || (meta.is_symlink() && path.is_file()) {
        if is_playable() {
            files.push(path.to_owned());
        }
    } else if meta.is_dir() && depth < MAX_FOLDER_DEPTH {
        let Ok(entries) = std::fs::read_dir(path) else {
            return;
        };
        let mut children: Vec<PathBuf> = entries.filter_map(Result::ok).map(|e| e.path()).collect();
        children.sort();
        for child in children {
            collect(&child, depth + 1, limit, files);
        }
    }
}
