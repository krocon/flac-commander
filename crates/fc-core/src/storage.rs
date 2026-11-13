//! What the app remembers between runs: volume, repeat, shuffle and the playlist.
//!
//! One small, versioned JSON file. It is written to a temporary file first and renamed, so a
//! crash never leaves half a file; a file that cannot be read is put aside and the app starts
//! empty.

use crate::error::{AppError, AppResult};
use crate::playlist::RepeatMode;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread;
use std::time::Duration;

/// Version of the file format. A newer file is not touched: an older app must not destroy it.
pub const SAVED_VERSION: u32 = 1;
/// More tracks than this are not restored (a damaged or hostile file must not exhaust memory).
pub const MAX_SAVED_TRACKS: usize = 50_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SavedState {
    pub version: u32,
    pub volume: f32,
    pub repeat: RepeatMode,
    pub shuffle: bool,
    pub tracks: Vec<PathBuf>,
    /// Index into `tracks` of the track that was current.
    pub current: Option<usize>,
    /// Where it was, to continue there.
    pub position_ms: u64,
    /// Id of the active skin; `None`: the default skin.
    pub skin: Option<String>,
}

impl Default for SavedState {
    fn default() -> Self {
        Self {
            version: SAVED_VERSION,
            volume: 1.0,
            repeat: RepeatMode::Off,
            shuffle: false,
            tracks: Vec::new(),
            current: None,
            position_ms: 0,
            skin: None,
        }
    }
}

impl SavedState {
    /// Brings values from a file into their ranges.
    fn sanitised(mut self) -> Self {
        self.volume = if self.volume.is_finite() { self.volume.clamp(0.0, 1.0) } else { 1.0 };
        self.tracks.truncate(MAX_SAVED_TRACKS);
        self.current = self.current.filter(|c| *c < self.tracks.len());
        if self.current.is_none() {
            self.position_ms = 0;
        }
        // an id is used as a folder name: only what a skin id may look like
        self.skin = self.skin.filter(|id| crate::skins::manifest::is_valid_id(id));
        self
    }
}

/// What reading the file gave.
#[derive(Debug, PartialEq)]
pub enum Loaded {
    /// The saved state (or the defaults if there is no file yet).
    State(SavedState),
    /// The file is from a newer version of the app: start with defaults and never overwrite it.
    Newer(u32),
}

/// Reads the saved state. Unreadable content is moved to `<file>.broken` and gives defaults.
pub fn load(path: &Path) -> Loaded {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Loaded::State(SavedState::default());
        }
        Err(e) => {
            log::warn!("{}: saved state cannot be read: {e}", path.display());
            return Loaded::State(SavedState::default());
        }
    };
    match serde_json::from_str::<SavedState>(&text) {
        Ok(state) if state.version > SAVED_VERSION => {
            log::warn!("{}: written by a newer version ({})", path.display(), state.version);
            Loaded::Newer(state.version)
        }
        Ok(state) => Loaded::State(state.sanitised()),
        Err(e) => {
            let aside = path.with_extension("json.broken");
            log::warn!("{}: not a saved state ({e}); kept as {}", path.display(), aside.display());
            if let Err(e) = fs::rename(path, &aside) {
                log::warn!("{}: could not be put aside: {e}", path.display());
            }
            Loaded::State(SavedState::default())
        }
    }
}

/// Writes the state: to a temporary file in the same folder, then renamed over the old one.
pub fn save(path: &Path, state: &SavedState) -> AppResult<()> {
    let failed = |what: &str, e: std::io::Error| {
        AppError::from_io(&e, path).with_details(format!("saving the state: {what}"))
    };
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder).map_err(|e| failed("create folder", e))?;
    }
    let json = serde_json::to_string_pretty(state).map_err(|e| {
        AppError::internal("state cannot be serialised").with_details(e.to_string())
    })?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, json).map_err(|e| failed("write", e))?;
    fs::rename(&temporary, path).map_err(|e| failed("rename", e))
}

/// Saves in the background, at most once per [`Saver::QUIET`]: a volume slider being dragged
/// produces many states and only the last one matters.
pub struct Saver {
    tx: Sender<SaverMsg>,
}

enum SaverMsg {
    Save(SavedState),
    /// Write what is pending now and answer when it is on disk.
    Flush(Sender<()>),
}

impl Saver {
    /// A state is written once nothing newer arrived for this long.
    pub const QUIET: Duration = Duration::from_millis(400);

    pub fn start(path: PathBuf) -> AppResult<Self> {
        let (tx, rx) = mpsc::channel::<SaverMsg>();
        thread::Builder::new()
            .name("state-saver".to_owned())
            .spawn(move || {
                let mut pending: Option<SavedState> = None;
                let write = |pending: &mut Option<SavedState>| {
                    if let Some(state) = pending.take()
                        && let Err(e) = save(&path, &state)
                    {
                        log::error!("state not saved: {e} ({:?})", e.details);
                    }
                };
                loop {
                    let msg = if pending.is_some() {
                        match rx.recv_timeout(Self::QUIET) {
                            Ok(msg) => Some(msg),
                            Err(RecvTimeoutError::Timeout) => None,
                            Err(RecvTimeoutError::Disconnected) => {
                                write(&mut pending);
                                return;
                            }
                        }
                    } else {
                        match rx.recv() {
                            Ok(msg) => Some(msg),
                            Err(_) => return,
                        }
                    };
                    match msg {
                        Some(SaverMsg::Save(state)) => pending = Some(state),
                        Some(SaverMsg::Flush(done)) => {
                            write(&mut pending);
                            let _ = done.send(());
                        }
                        None => write(&mut pending),
                    }
                }
            })
            .map_err(|e| {
                AppError::internal("state saver thread could not be started")
                    .with_details(e.to_string())
            })?;
        Ok(Self { tx })
    }

    /// Queues `state`; it replaces a state that is still waiting.
    pub fn save(&self, state: SavedState) {
        let _ = self.tx.send(SaverMsg::Save(state));
    }

    /// Blocks until everything queued is written (at exit).
    pub fn flush(&self) {
        let (done_tx, done) = mpsc::channel();
        if self.tx.send(SaverMsg::Flush(done_tx)).is_ok() {
            let _ = done.recv_timeout(Duration::from_secs(5));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh folder per test under the target directory.
    fn folder(test: &str) -> PathBuf {
        let folder = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/test-tmp/storage")
            .join(test);
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn sample() -> SavedState {
        SavedState {
            volume: 0.35,
            repeat: RepeatMode::All,
            shuffle: true,
            tracks: vec![PathBuf::from("/music/Ä/01 – Öl.flac"), PathBuf::from("b.mp3")],
            current: Some(1),
            position_ms: 61_500,
            skin: Some("io.github.krocon.retro".to_owned()),
            ..SavedState::default()
        }
    }

    #[test]
    fn what_is_saved_is_loaded_again() {
        let path = folder("round-trip").join("deep/er/state.json");
        save(&path, &sample()).unwrap();
        assert_eq!(load(&path), Loaded::State(sample()));
        assert!(!path.with_extension("json.tmp").exists(), "temporary file left behind");
    }

    #[test]
    fn no_file_means_defaults() {
        let path = folder("none").join("state.json");
        assert_eq!(load(&path), Loaded::State(SavedState::default()));
    }

    #[test]
    fn a_broken_file_is_put_aside_and_gives_defaults() {
        let path = folder("broken").join("state.json");
        fs::write(&path, "{ \"volume\": 0.5, \"tracks\": [").unwrap();
        assert_eq!(load(&path), Loaded::State(SavedState::default()));
        assert!(!path.exists());
        assert!(path.with_extension("json.broken").exists());
    }

    #[test]
    fn values_out_of_range_are_corrected() {
        let path = folder("range").join("state.json");
        fs::write(
            &path,
            r#"{"version":1,"volume":7.5,"tracks":["a.flac"],"current":9,"positionMs":500}"#,
        )
        .unwrap();
        let Loaded::State(state) = load(&path) else { panic!("not loaded") };
        assert_eq!(state.volume, 1.0);
        assert_eq!(state.current, None);
        assert_eq!(state.position_ms, 0);
        assert_eq!(state.tracks.len(), 1);
    }

    #[test]
    fn a_skin_id_that_could_be_a_path_is_dropped() {
        let path = folder("skin-id").join("state.json");
        fs::write(&path, r#"{"version":1,"skin":"../../etc"}"#).unwrap();
        let Loaded::State(state) = load(&path) else { panic!("not loaded") };
        assert_eq!(state.skin, None);
    }

    #[test]
    fn missing_fields_take_their_defaults() {
        let path = folder("partial").join("state.json");
        fs::write(&path, r#"{"version":1,"volume":0.2}"#).unwrap();
        let Loaded::State(state) = load(&path) else { panic!("not loaded") };
        assert_eq!(state.volume, 0.2);
        assert_eq!(state.repeat, RepeatMode::Off);
        assert!(state.tracks.is_empty());
    }

    #[test]
    fn a_file_of_a_newer_version_is_left_alone() {
        let path = folder("newer").join("state.json");
        let text = r#"{"version":99,"volume":0.2,"somethingNew":true}"#;
        fs::write(&path, text).unwrap();
        assert_eq!(load(&path), Loaded::Newer(99));
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
    }

    #[test]
    fn the_file_is_readable_json_with_camel_case_keys() {
        let path = folder("format").join("state.json");
        save(&path, &sample()).unwrap();
        let json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(json["version"], 1);
        assert_eq!(json["positionMs"], 61_500);
        assert_eq!(json["repeat"], "all");
        assert_eq!(json["tracks"][0], "/music/Ä/01 – Öl.flac");
    }

    #[test]
    fn the_saver_writes_the_last_of_many_states() {
        let path = folder("saver").join("state.json");
        let saver = Saver::start(path.clone()).unwrap();
        for step in 0..50u8 {
            saver.save(SavedState { volume: f32::from(step) / 100.0, ..SavedState::default() });
        }
        saver.save(sample());
        saver.flush();
        assert_eq!(load(&path), Loaded::State(sample()));
    }

    #[test]
    fn the_saver_writes_on_its_own_after_a_quiet_moment() {
        let path = folder("saver-quiet").join("state.json");
        let saver = Saver::start(path.clone()).unwrap();
        saver.save(sample());
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        while !path.exists() {
            assert!(std::time::Instant::now() < deadline, "never written");
            thread::yield_now();
        }
        assert_eq!(load(&path), Loaded::State(sample()));
    }
}
