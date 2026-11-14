//! The media controls of the operating system: "Now Playing" in the macOS Control Center, the
//! System Media Transport Controls of Windows, MPRIS on Linux – and with them the media keys of
//! the keyboard. `souvlaki` speaks to all three (ADR 0012).
//!
//! The system is one more view of the player, like a window: it shows what the engine reported
//! and sends requests that go the same way as a click in the app. Nothing here is a second
//! source of state.
//!
//! ```text
//! engine thread ─ PlayerState ─▶ Feed ─▶ thread "media-controls" ─▶ main thread ─▶ system
//! system (main thread) ─ MediaControlEvent ─▶ same thread ─▶ Session
//! ```
//!
//! The callback of the engine only copies a few values into a channel. Tags and cover are read
//! on the thread of this module; the system itself is only touched on the main thread, where
//! macOS expects it.

use fc_core::audio::player::{PlaybackStatus, PlayerState};
use fc_core::session::Session;
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    SeekDirection,
};
use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Name shown by the system where it names the player (Linux).
const DISPLAY_NAME: &str = "FLAC Commander";
/// Last part of the MPRIS bus name `org.mpris.MediaPlayer2.<name>`.
const DBUS_NAME: &str = "flac_commander";
/// The system counts the position on by itself; it is told again when ours is further away
/// than this (a seek, a stall).
const MAX_DRIFT_MS: u64 = 1_500;
/// "Nothing plays" is shown only after it lasted this long: between two tracks the engine is
/// stopped for a moment, and the entry should not flicker.
const CLEAR_DELAY: Duration = Duration::from_millis(400);
/// What "seek forward/backward" without an amount means.
const SEEK_STEP_MS: u64 = 10_000;
/// Start of the names of the cover files this module writes into its cache folder.
const COVER_PREFIX: &str = "cover-";

thread_local! {
    /// The handle to the system. It lives on the main thread and never leaves it: on Windows
    /// it belongs to the window, on macOS the framework expects the main thread.
    static CONTROLS: RefCell<Option<MediaControls>> = const { RefCell::new(None) };
}

/// What this module needs of a [`PlayerState`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    pub status: PlaybackStatus,
    pub track: Option<SnapshotTrack>,
    pub position_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotTrack {
    pub path: PathBuf,
    pub file_name: String,
    pub duration_ms: Option<u64>,
}

impl From<&PlayerState> for Snapshot {
    fn from(state: &PlayerState) -> Self {
        Self {
            status: state.status,
            track: state.track.as_ref().map(|track| SnapshotTrack {
                path: track.path.clone(),
                file_name: track.file_name.clone(),
                duration_ms: track.info.duration_ms,
            }),
            position_ms: state.position_ms,
        }
    }
}

enum Message {
    Player(Snapshot),
    Control(MediaControlEvent),
}

/// The sending end: given to the state callback of the player.
#[derive(Clone)]
pub struct Feed(Sender<Message>);

impl Feed {
    /// Called on the engine thread with every state: copies and returns.
    pub fn player(&self, state: &PlayerState) {
        // without media controls nobody listens: that is fine
        let _ = self.0.send(Message::Player(state.into()));
    }
}

/// The receiving end, handed to [`start`] once the session exists.
pub struct Inbox {
    messages: Receiver<Message>,
    control: Sender<Message>,
}

/// Made before the session, because the session wants its callback when it starts.
pub fn feed() -> (Feed, Inbox) {
    let (sender, messages) = channel();
    (Feed(sender.clone()), Inbox { messages, control: sender })
}

/// What the system has to be told after a state of the player.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    /// It knows everything it needs.
    Nothing,
    /// Nothing plays any more: the entry goes away.
    Clear,
    /// Status and position; with `new_track` also title, cover and duration.
    Show { new_track: bool, playing: bool, position_ms: u64 },
}

#[derive(Debug)]
struct Shown {
    path: PathBuf,
    playing: bool,
    position_ms: u64,
    at: Instant,
}

impl Shown {
    /// Where the system believes the track to be at `now`.
    fn expected_ms(&self, now: Instant) -> u64 {
        if !self.playing {
            return self.position_ms;
        }
        let elapsed = now.saturating_duration_since(self.at).as_millis();
        self.position_ms.saturating_add(u64::try_from(elapsed).unwrap_or(u64::MAX))
    }
}

/// Decides when the system is told something. Pure: it gets the time from its caller.
#[derive(Debug, Default)]
pub struct Publisher {
    shown: Option<Shown>,
    clear_at: Option<Instant>,
}

impl Publisher {
    pub fn step(&mut self, snapshot: &Snapshot, now: Instant) -> Step {
        let track = match (&snapshot.track, snapshot.status) {
            (Some(track), PlaybackStatus::Playing | PlaybackStatus::Paused) => track,
            _ => return self.idle(now),
        };
        self.clear_at = None;
        let playing = snapshot.status == PlaybackStatus::Playing;
        let position_ms = snapshot.position_ms;
        let new_track = self.shown.as_ref().is_none_or(|shown| shown.path != track.path);
        let known = self.shown.as_ref().is_some_and(|shown| {
            !new_track
                && shown.playing == playing
                && shown.expected_ms(now).abs_diff(position_ms) <= MAX_DRIFT_MS
        });
        if known {
            return Step::Nothing;
        }
        self.shown = Some(Shown { path: track.path.clone(), playing, position_ms, at: now });
        Step::Show { new_track, playing, position_ms }
    }

    fn idle(&mut self, now: Instant) -> Step {
        if self.shown.is_none() {
            self.clear_at = None;
            return Step::Nothing;
        }
        match self.clear_at {
            Some(at) if now >= at => {
                self.shown = None;
                self.clear_at = None;
                Step::Clear
            }
            Some(_) => Step::Nothing,
            None => {
                self.clear_at = Some(now + CLEAR_DELAY);
                Step::Nothing
            }
        }
    }

    /// How long to wait for the next state before looking again by itself.
    pub fn wait(&self, now: Instant) -> Option<Duration> {
        self.clear_at.map(|at| at.saturating_duration_since(now))
    }
}

/// What a request of the system means for the session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Play,
    Pause,
    Next,
    Previous,
    Stop,
    Seek(u64),
}

/// Translates a request of the system; `None` for what the player does not do.
pub fn action(
    event: &MediaControlEvent,
    status: PlaybackStatus,
    position_ms: u64,
) -> Option<Action> {
    let moved = |direction: SeekDirection, by_ms: u64| match direction {
        SeekDirection::Forward => position_ms.saturating_add(by_ms),
        SeekDirection::Backward => position_ms.saturating_sub(by_ms),
    };
    match event {
        MediaControlEvent::Play => Some(Action::Play),
        MediaControlEvent::Pause => Some(Action::Pause),
        MediaControlEvent::Toggle if status == PlaybackStatus::Playing => Some(Action::Pause),
        MediaControlEvent::Toggle => Some(Action::Play),
        MediaControlEvent::Next => Some(Action::Next),
        MediaControlEvent::Previous => Some(Action::Previous),
        MediaControlEvent::Stop => Some(Action::Stop),
        MediaControlEvent::Seek(direction) => Some(Action::Seek(moved(*direction, SEEK_STEP_MS))),
        MediaControlEvent::SeekBy(direction, by) => {
            Some(Action::Seek(moved(*direction, millis(*by))))
        }
        MediaControlEvent::SetPosition(MediaPosition(position)) => {
            Some(Action::Seek(millis(*position)))
        }
        // volume, shuffle, open, raise, quit: the app has its own controls for those
        _ => None,
    }
}

fn millis(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

/// The same calls as the buttons of the app (`commands::player`, `commands::playlist`).
fn perform(session: &Session, action: Action) {
    let result = match action {
        Action::Play => session.play(),
        Action::Pause => session.player().pause(),
        Action::Next => {
            session.next();
            Ok(())
        }
        Action::Previous => session.previous(),
        Action::Stop => session.player().stop(),
        Action::Seek(position_ms) => session.player().seek(position_ms),
    };
    if let Err(e) = result {
        log::warn!("media controls: {action:?} failed: {e}");
    }
}

/// Title, artist … of a track as the system gets them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct Described {
    title: String,
    artist: Option<String>,
    album: Option<String>,
    duration_ms: Option<u64>,
    cover_url: Option<String>,
}

/// What the main thread passes on to the system.
#[derive(Debug)]
enum Push {
    Clear,
    Show { track: Option<Described>, playing: bool, position_ms: u64 },
}

/// Connects the system's media controls with the session. Call on the main thread, once.
/// Without media controls (no session bus on Linux, no window) the app runs as before.
pub fn start(app: &AppHandle, session: Session, inbox: Inbox, cache_folder: Option<PathBuf>) {
    let Some(mut controls) = create(app) else {
        return;
    };
    let Inbox { messages, control } = inbox;
    // called by the system on its own thread (macOS: the main thread): only hand it over
    let attached = controls.attach(move |event| {
        let _ = control.send(Message::Control(event));
    });
    if let Err(e) = attached {
        log::warn!("media controls not available: {e}");
        return;
    }
    CONTROLS.with_borrow_mut(|slot| *slot = Some(controls));

    let app = app.clone();
    let spawned = std::thread::Builder::new().name("media-controls".to_owned()).spawn(move || {
        Worker {
            app,
            session,
            covers: Covers::new(cache_folder),
            publisher: Publisher::default(),
            latest: None,
        }
        .run(&messages);
    });
    match spawned {
        Ok(_) => log::info!("media controls attached"),
        Err(e) => log::warn!("media controls not started: {e}"),
    }
}

fn create(app: &AppHandle) -> Option<MediaControls> {
    #[cfg(target_os = "windows")]
    let hwnd = {
        use tauri::Manager;
        // Windows ties the controls to a window; without one there are none
        let Some(hwnd) = app.get_webview_window("main").and_then(|window| window.hwnd().ok())
        else {
            log::warn!("media controls not available: no main window");
            return None;
        };
        let handle: *mut std::ffi::c_void = hwnd.0;
        Some(handle)
    };
    #[cfg(not(target_os = "windows"))]
    let hwnd = {
        let _ = app;
        None
    };
    match MediaControls::new(PlatformConfig {
        display_name: DISPLAY_NAME,
        dbus_name: DBUS_NAME,
        hwnd,
    }) {
        Ok(controls) => Some(controls),
        Err(e) => {
            log::warn!("media controls not available: {e}");
            None
        }
    }
}

struct Worker {
    app: AppHandle,
    session: Session,
    covers: Covers,
    publisher: Publisher,
    latest: Option<Snapshot>,
}

impl Worker {
    fn run(mut self, messages: &Receiver<Message>) {
        loop {
            let message = match self.publisher.wait(Instant::now()) {
                Some(wait) => match messages.recv_timeout(wait) {
                    Ok(message) => Some(message),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                },
                None => match messages.recv() {
                    Ok(message) => Some(message),
                    Err(_) => return,
                },
            };
            match message {
                Some(Message::Player(snapshot)) => {
                    self.publish(&snapshot);
                    self.latest = Some(snapshot);
                }
                Some(Message::Control(event)) => self.control(&event),
                // "nothing plays" has lasted long enough
                None => {
                    if let Some(snapshot) = self.latest.take() {
                        self.publish(&snapshot);
                        self.latest = Some(snapshot);
                    }
                }
            }
        }
    }

    fn control(&self, event: &MediaControlEvent) {
        let state = self.session.player().state();
        match action(event, state.status, state.position_ms) {
            Some(action) => {
                log::debug!("media controls: {action:?}");
                perform(&self.session, action);
            }
            None => log::debug!("media controls: {event:?} ignored"),
        }
    }

    fn publish(&mut self, snapshot: &Snapshot) {
        let push = match self.publisher.step(snapshot, Instant::now()) {
            Step::Nothing => return,
            Step::Clear => {
                self.covers.forget();
                Push::Clear
            }
            Step::Show { new_track, playing, position_ms } => {
                let track = match &snapshot.track {
                    Some(track) if new_track => Some(self.describe(track)),
                    _ => None,
                };
                Push::Show { track, playing, position_ms }
            }
        };
        // the system is only touched on the main thread
        if let Err(e) = self.app.run_on_main_thread(move || apply(push)) {
            log::warn!("media controls not updated: {e}");
        }
    }

    /// Reads tags and cover of the file: on this thread, once per track.
    fn describe(&mut self, track: &SnapshotTrack) -> Described {
        let meta = fc_core::metadata::read_meta(&track.path);
        Described {
            title: meta.title.unwrap_or_else(|| track.file_name.clone()),
            artist: meta.artist,
            album: meta.album,
            duration_ms: track.duration_ms.or(meta.duration_ms),
            cover_url: self.covers.publish(&track.path),
        }
    }
}

/// Runs on the main thread.
fn apply(push: Push) {
    CONTROLS.with_borrow_mut(|slot| {
        let Some(controls) = slot.as_mut() else {
            return;
        };
        let result = match push {
            Push::Clear => controls
                .set_metadata(MediaMetadata::default())
                .and_then(|()| controls.set_playback(MediaPlayback::Stopped)),
            Push::Show { track, playing, position_ms } => {
                let described = match &track {
                    Some(track) => controls.set_metadata(MediaMetadata {
                        title: Some(&track.title),
                        artist: track.artist.as_deref(),
                        album: track.album.as_deref(),
                        cover_url: track.cover_url.as_deref(),
                        duration: track.duration_ms.map(Duration::from_millis),
                    }),
                    None => Ok(()),
                };
                let progress = Some(MediaPosition(Duration::from_millis(position_ms)));
                described.and_then(|()| {
                    controls.set_playback(if playing {
                        MediaPlayback::Playing { progress }
                    } else {
                        MediaPlayback::Paused { progress }
                    })
                })
            }
        };
        if let Err(e) = result {
            log::warn!("media controls not updated: {e}");
        }
    });
}

/// The system takes a cover as a URL, not as bytes: the cover of the current track lies as one
/// file in the cache folder of the app, and only that one.
struct Covers {
    folder: Option<PathBuf>,
    current: Option<PathBuf>,
    count: u64,
}

impl Covers {
    fn new(folder: Option<PathBuf>) -> Self {
        // what a previous run left behind
        if let Some(entries) = folder.as_deref().and_then(|folder| std::fs::read_dir(folder).ok()) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with(COVER_PREFIX) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        Self { folder, current: None, count: 0 }
    }

    /// Writes the cover of `track` and returns its `file://` URL; `None` without a cover.
    fn publish(&mut self, track: &Path) -> Option<String> {
        self.forget();
        let folder = self.folder.as_deref()?;
        let (bytes, kind) = fc_core::metadata::read_cover(track)?;
        self.count += 1;
        // a new name per track: the system may still be reading the previous file
        let file = folder.join(format!("{COVER_PREFIX}{}.{}", self.count, extension(kind)));
        let written = std::fs::create_dir_all(folder).and_then(|()| std::fs::write(&file, bytes));
        if let Err(e) = written {
            log::warn!("cover for the media controls not written: {e}");
            return None;
        }
        let url = tauri::Url::from_file_path(&file).ok().map(String::from);
        self.current = Some(file);
        url
    }

    fn forget(&mut self) {
        if let Some(file) = self.current.take() {
            let _ = std::fs::remove_file(file);
        }
    }
}

/// File extension for the content types `metadata::read_cover` knows.
fn extension(content_type: &str) -> &'static str {
    match content_type {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(status: PlaybackStatus, path: Option<&str>, position_ms: u64) -> Snapshot {
        Snapshot {
            status,
            track: path.map(|path| SnapshotTrack {
                path: PathBuf::from(path),
                file_name: path.to_owned(),
                duration_ms: Some(200_000),
            }),
            position_ms,
        }
    }

    fn after(start: Instant, ms: u64) -> Instant {
        start + Duration::from_millis(ms)
    }

    #[test]
    fn a_track_is_described_once_and_the_position_only_when_it_jumps() {
        let start = Instant::now();
        let mut publisher = Publisher::default();
        let playing = |ms| snapshot(PlaybackStatus::Playing, Some("a.flac"), ms);

        assert_eq!(
            publisher.step(&playing(0), start),
            Step::Show { new_track: true, playing: true, position_ms: 0 }
        );
        // the engine reports five times a second: the system counts on by itself
        for ms in [200, 400, 600, 5_000, 60_000] {
            assert_eq!(publisher.step(&playing(ms), after(start, ms)), Step::Nothing, "{ms}");
        }
        // a seek forward, then one back
        assert_eq!(
            publisher.step(&playing(120_000), after(start, 60_200)),
            Step::Show { new_track: false, playing: true, position_ms: 120_000 }
        );
        assert_eq!(
            publisher.step(&playing(10_000), after(start, 60_400)),
            Step::Show { new_track: false, playing: true, position_ms: 10_000 }
        );
    }

    #[test]
    fn pause_and_resume_are_told_with_the_position() {
        let start = Instant::now();
        let mut publisher = Publisher::default();
        publisher.step(&snapshot(PlaybackStatus::Playing, Some("a.flac"), 0), start);

        let paused = snapshot(PlaybackStatus::Paused, Some("a.flac"), 3_000);
        assert_eq!(
            publisher.step(&paused, after(start, 3_000)),
            Step::Show { new_track: false, playing: false, position_ms: 3_000 }
        );
        // paused for a minute: the system does not count on, nothing to say
        assert_eq!(publisher.step(&paused, after(start, 63_000)), Step::Nothing);
        assert_eq!(
            publisher.step(
                &snapshot(PlaybackStatus::Playing, Some("a.flac"), 3_000),
                after(start, 63_200)
            ),
            Step::Show { new_track: false, playing: true, position_ms: 3_000 }
        );
    }

    #[test]
    fn the_next_track_is_described_without_the_entry_going_away_in_between() {
        let start = Instant::now();
        let mut publisher = Publisher::default();
        publisher.step(&snapshot(PlaybackStatus::Playing, Some("a.flac"), 0), start);

        // between two tracks the engine is stopped and has no track for a moment
        assert_eq!(
            publisher.step(&snapshot(PlaybackStatus::Stopped, None, 0), after(start, 1_000)),
            Step::Nothing
        );
        assert!(publisher.wait(after(start, 1_000)).is_some());
        assert_eq!(
            publisher
                .step(&snapshot(PlaybackStatus::Playing, Some("b.flac"), 0), after(start, 1_050)),
            Step::Show { new_track: true, playing: true, position_ms: 0 }
        );
        assert_eq!(publisher.wait(after(start, 1_050)), None);
    }

    #[test]
    fn after_stop_the_entry_goes_away_and_comes_back_with_play() {
        let start = Instant::now();
        let mut publisher = Publisher::default();
        publisher.step(&snapshot(PlaybackStatus::Playing, Some("a.flac"), 0), start);

        // stop keeps the track loaded, but nothing plays
        let stopped = snapshot(PlaybackStatus::Stopped, Some("a.flac"), 0);
        assert_eq!(publisher.step(&stopped, after(start, 1_000)), Step::Nothing);
        assert_eq!(
            publisher.wait(after(start, 1_100)),
            Some(CLEAR_DELAY - Duration::from_millis(100))
        );
        assert_eq!(publisher.step(&stopped, after(start, 1_400)), Step::Clear);
        // told once
        assert_eq!(publisher.step(&stopped, after(start, 5_000)), Step::Nothing);
        assert_eq!(publisher.wait(after(start, 5_000)), None);

        // the same track again: the system has forgotten it
        assert_eq!(
            publisher
                .step(&snapshot(PlaybackStatus::Playing, Some("a.flac"), 0), after(start, 6_000)),
            Step::Show { new_track: true, playing: true, position_ms: 0 }
        );
    }

    #[test]
    fn an_idle_player_tells_the_system_nothing() {
        let mut publisher = Publisher::default();
        let now = Instant::now();
        assert_eq!(publisher.step(&snapshot(PlaybackStatus::Stopped, None, 0), now), Step::Nothing);
        assert_eq!(publisher.wait(now), None);
    }

    #[test]
    fn requests_of_the_system_become_the_actions_of_the_buttons() {
        use MediaControlEvent as E;
        use PlaybackStatus::{Paused, Playing, Stopped};
        let seconds = Duration::from_secs;

        assert_eq!(action(&E::Play, Paused, 0), Some(Action::Play));
        assert_eq!(action(&E::Pause, Playing, 0), Some(Action::Pause));
        assert_eq!(action(&E::Toggle, Playing, 0), Some(Action::Pause));
        assert_eq!(action(&E::Toggle, Paused, 0), Some(Action::Play));
        assert_eq!(action(&E::Toggle, Stopped, 0), Some(Action::Play));
        assert_eq!(action(&E::Next, Playing, 0), Some(Action::Next));
        assert_eq!(action(&E::Previous, Playing, 0), Some(Action::Previous));
        assert_eq!(action(&E::Stop, Playing, 0), Some(Action::Stop));
        assert_eq!(
            action(&E::SetPosition(MediaPosition(seconds(42))), Playing, 5_000),
            Some(Action::Seek(42_000))
        );
        assert_eq!(
            action(&E::SeekBy(SeekDirection::Forward, seconds(5)), Playing, 5_000),
            Some(Action::Seek(10_000))
        );
        // never before the start
        assert_eq!(
            action(&E::SeekBy(SeekDirection::Backward, seconds(30)), Playing, 5_000),
            Some(Action::Seek(0))
        );
        assert_eq!(
            action(&E::Seek(SeekDirection::Forward), Playing, 5_000),
            Some(Action::Seek(5_000 + SEEK_STEP_MS))
        );
        // the app has its own controls for these
        assert_eq!(action(&E::SetVolume(0.5), Playing, 0), None);
        assert_eq!(action(&E::Quit, Playing, 0), None);
    }

    #[test]
    fn the_cover_of_the_current_track_is_the_only_file_kept() {
        let folder = std::env::temp_dir().join(format!("fc-media-covers-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("cover-9.jpg"), b"left over").unwrap();
        std::fs::write(folder.join("other.txt"), b"not ours").unwrap();

        let mut covers = Covers::new(Some(folder.clone()));
        assert!(!folder.join("cover-9.jpg").exists(), "left-overs are removed");
        assert!(folder.join("other.txt").exists(), "only our own files are removed");
        // a file without a cover: nothing is written
        assert_eq!(covers.publish(&folder.join("other.txt")), None);
        covers.forget();
        std::fs::remove_dir_all(&folder).unwrap();

        assert_eq!(extension("image/png"), "png");
        assert_eq!(extension("image/webp"), "webp");
        assert_eq!(extension("image/jpeg"), "jpg");
    }
}
