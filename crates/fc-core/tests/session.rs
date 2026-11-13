//! Player and playlist together: track changes, unplayable files, saving and restoring.
//! The output device is simulated as in `player.rs`.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

mod common;

use common::{Device, FORMAT, assert_frames, fake_backend, fixture};
use fc_core::ErrorCode;
use fc_core::audio::player::PlaybackStatus;
use fc_core::playlist::{PlaylistState, RepeatMode};
use fc_core::session::{PlayAdded, Session, SessionConfig, collect_audio_files};
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

/// One second of 44.1 kHz audio on the 48 kHz device.
const TRACK_FRAMES: usize = 48_000;

struct Rig {
    session: Session,
    device: Device,
    playlists: Receiver<PlaylistState>,
}

impl Rig {
    fn new() -> Self {
        Self::with_state_file(None)
    }

    fn with_state_file(state_file: Option<PathBuf>) -> Self {
        let (backend, link) = fake_backend(FORMAT);
        let (states_tx, states) = mpsc::channel();
        let (playlists_tx, playlists) = mpsc::channel();
        let session = Session::start(
            backend,
            SessionConfig { state_file, shuffle_seed: 7 },
            move |state| {
                let _ = states_tx.send(state.clone());
            },
            move |playlist| {
                let _ = playlists_tx.send(playlist.clone());
            },
        )
        .unwrap();
        let device = Device::attach(session.player().clone(), link, states);
        Self { session, device, playlists }
    }

    fn add(&self, names: &[&str], play: PlayAdded) -> usize {
        let paths: Vec<PathBuf> = names.iter().map(|n| fixture(n)).collect();
        self.session.add_paths(&paths, play)
    }

    /// File names of the list, the current one in brackets.
    fn list(&self) -> Vec<String> {
        let state = self.session.playlist_state();
        state
            .entries
            .iter()
            .map(|e| {
                if Some(e.id) == state.current_id {
                    format!("[{}]", e.file_name)
                } else {
                    e.file_name.clone()
                }
            })
            .collect()
    }

    fn id_of(&self, name: &str) -> u64 {
        self.session.playlist_state().entries.iter().find(|e| e.file_name == name).unwrap().id
    }

    /// Runs the device until the playlist satisfies `done` (and the player is in `status`).
    fn run_until(
        &mut self,
        what: &str,
        status: PlaybackStatus,
        done: impl Fn(&PlaylistState) -> bool,
    ) -> PlaylistState {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let playlist = self.session.playlist_state();
            if done(&playlist) && self.session.player().state().status == status {
                return playlist;
            }
            assert!(
                Instant::now() < deadline,
                "timed out waiting for: {what}; list {:?}, player {:?}",
                self.list(),
                self.session.player().state()
            );
            self.device.render_block();
        }
    }

    /// Runs until the playlist has nothing more to play.
    fn run_to_the_end(&mut self) {
        self.device.run_until("playing", |s| s.status == PlaybackStatus::Playing);
        let deadline = Instant::now() + Duration::from_secs(20);
        let mut finished_at = None;
        // the end of the list: stopped, and it stays stopped (no next track is being loaded)
        loop {
            let state = self.session.player().state();
            if state.status == PlaybackStatus::Stopped {
                let since = *finished_at.get_or_insert((state.finished, Instant::now()));
                if since.0 == state.finished && since.1.elapsed() > Duration::from_millis(150) {
                    return;
                }
                if since.0 != state.finished {
                    finished_at = None;
                }
            } else {
                finished_at = None;
            }
            assert!(Instant::now() < deadline, "the list never ended: {:?}", self.list());
            self.device.render_block();
        }
    }

    /// Waits for a reported playlist that satisfies `done`.
    fn wait_for_playlist(
        &self,
        what: &str,
        done: impl Fn(&PlaylistState) -> bool,
    ) -> PlaylistState {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let state = self.session.playlist_state();
            if done(&state) {
                return state;
            }
            assert!(Instant::now() < deadline, "timed out waiting for: {what}; {state:?}");
            std::thread::yield_now();
        }
    }
}

fn temp(test: &str) -> PathBuf {
    let folder = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("session").join(test);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    folder
}

#[test]
fn plays_the_list_from_the_opened_track_to_the_end() {
    let mut rig = Rig::new();
    assert_eq!(rig.add(&["sine.flac", "sine.wav", "sine.aiff"], PlayAdded::Always), 3);
    assert_eq!(rig.list(), ["[sine.flac]", "sine.wav", "sine.aiff"]);

    rig.run_to_the_end();
    assert_frames(rig.device.heard.len(), 3 * TRACK_FRAMES, 200);
    // the last track stays current, ready to be played again
    assert_eq!(rig.list(), ["sine.flac", "sine.wav", "[sine.aiff]"]);
    assert_eq!(rig.session.player().state().finished, 3);
    assert_eq!(rig.session.player().state().error, None);
}

#[test]
fn the_playlist_is_reported_when_the_track_changes() {
    let mut rig = Rig::new();
    rig.add(&["sine.flac", "sine.wav"], PlayAdded::Always);
    rig.run_to_the_end();
    let currents: Vec<Option<String>> = rig
        .playlists
        .try_iter()
        .map(|p| {
            p.current_id
                .and_then(|c| p.entries.iter().find(|e| e.id == c))
                .map(|e| e.file_name.clone())
        })
        .collect();
    let mut order = currents.clone();
    order.dedup();
    assert_eq!(order, [Some("sine.flac".to_owned()), Some("sine.wav".to_owned())], "{currents:?}");
}

#[test]
fn repeat_all_starts_the_list_again() {
    let mut rig = Rig::new();
    rig.session.set_repeat(RepeatMode::All);
    rig.add(&["sine.flac", "sine.wav"], PlayAdded::Always);
    // two and a half rounds
    rig.device.play_frames(5 * TRACK_FRAMES);
    assert!(rig.session.player().state().finished >= 4);
    rig.session.player().stop().unwrap();
    rig.device.run_until("stopped", |s| s.status == PlaybackStatus::Stopped);
}

#[test]
fn repeat_one_plays_the_same_track_again() {
    let mut rig = Rig::new();
    rig.session.set_repeat(RepeatMode::One);
    rig.add(&["sine.flac", "sine.wav"], PlayAdded::Always);
    rig.device.play_frames(2 * TRACK_FRAMES + TRACK_FRAMES / 2);
    assert_eq!(rig.list(), ["[sine.flac]", "sine.wav"]);
}

#[test]
fn a_track_that_cannot_be_played_is_marked_and_passed_over() {
    let mut rig = Rig::new();
    rig.add(&["sine.flac", "garbage.mp3", "gone.flac", "sine.wav"], PlayAdded::Always);
    // `gone.flac` does not exist: it is not even added
    assert_eq!(rig.list(), ["[sine.flac]", "garbage.mp3", "sine.wav"]);

    rig.run_to_the_end();
    assert_frames(rig.device.heard.len(), 2 * TRACK_FRAMES, 200);
    let state = rig.session.playlist_state();
    assert_eq!(state.entries[1].error, Some(ErrorCode::UnsupportedFormat));
    assert_eq!(state.entries[0].error, None);
    assert_eq!(state.entries[2].error, None);
    assert_eq!(rig.list(), ["sine.flac", "garbage.mp3", "[sine.wav]"]);
}

#[test]
fn a_list_of_broken_files_stops_after_a_few_instead_of_spinning() {
    let mut rig = Rig::new();
    rig.session.set_repeat(RepeatMode::All);
    let folder = temp("broken");
    let broken: Vec<PathBuf> = (0..12)
        .map(|n| {
            let path = folder.join(format!("{n:02}.mp3"));
            fs::write(&path, "not audio").unwrap();
            path
        })
        .collect();
    assert_eq!(rig.session.add_paths(&broken, PlayAdded::Always), 12);

    // it gives up after six tries in a row – with "repeat all" it would never end otherwise
    let marked = |p: &PlaylistState| p.entries.iter().filter(|e| e.error.is_some()).count();
    rig.run_until("gave up", PlaybackStatus::Stopped, |p| marked(p) == 6);
    for _ in 0..2_000 {
        rig.device.render_block();
    }
    let state = rig.session.playlist_state();
    assert_eq!(marked(&state), 6, "it went on trying");
    assert!(state.entries[..6].iter().all(|e| e.error == Some(ErrorCode::UnsupportedFormat)));
    assert!(rig.device.heard.is_empty());
    assert!(rig.session.player().state().error.is_some(), "the last reason stays visible");
}

#[test]
fn asking_for_a_marked_track_tries_it_again() {
    let mut rig = Rig::new();
    let folder = temp("retry");
    let path = folder.join("later.flac");
    fs::write(&path, "not yet audio").unwrap();
    rig.session.add_paths(std::slice::from_ref(&path), PlayAdded::Always);
    rig.run_until("marked", PlaybackStatus::Stopped, |p| p.entries[0].error.is_some());

    // the file is repaired (here: replaced by a real one)
    fs::copy(fixture("sine.flac"), &path).unwrap();
    rig.session.play_entry(rig.id_of("later.flac"));
    rig.run_to_the_end();
    assert_frames(rig.device.heard.len(), TRACK_FRAMES, 100);
    assert_eq!(rig.session.playlist_state().entries[0].error, None);
}

#[test]
fn next_and_previous_move_through_the_list() {
    let mut rig = Rig::new();
    rig.add(&["sine.flac", "sine.wav", "sine.aiff"], PlayAdded::Always);
    rig.device.play_frames(4_800);

    rig.session.next();
    rig.run_until("second", PlaybackStatus::Playing, |p| p.current_id == Some(2));
    rig.session.next();
    rig.run_until("third", PlaybackStatus::Playing, |p| p.current_id == Some(3));
    // at the end "next" changes nothing
    rig.session.next();
    assert_eq!(rig.list(), ["sine.flac", "sine.wav", "[sine.aiff]"]);

    rig.session.previous().unwrap();
    rig.run_until("second again", PlaybackStatus::Playing, |p| p.current_id == Some(2));
}

#[test]
fn play_without_a_loaded_track_starts_the_list() {
    let mut rig = Rig::new();
    rig.add(&["sine.flac", "sine.wav"], PlayAdded::Never);
    assert_eq!(rig.list(), ["sine.flac", "sine.wav"]);
    assert_eq!(rig.session.player().state().track, None);

    rig.session.play().unwrap();
    rig.run_to_the_end();
    assert_frames(rig.device.heard.len(), 2 * TRACK_FRAMES, 200);
}

#[test]
fn dropping_files_while_music_plays_only_appends_them() {
    let mut rig = Rig::new();
    rig.add(&["sine.flac"], PlayAdded::Always);
    rig.device.play_frames(4_800);
    rig.add(&["sine.wav"], PlayAdded::IfIdle);
    assert_eq!(rig.list(), ["[sine.flac]", "sine.wav"]);
    rig.run_to_the_end();
    assert_frames(rig.device.heard.len(), 2 * TRACK_FRAMES, 200);

    // nothing plays now: a drop starts the dropped track
    rig.device.heard.clear();
    rig.add(&["sine.aiff"], PlayAdded::IfIdle);
    rig.run_to_the_end();
    assert_frames(rig.device.heard.len(), TRACK_FRAMES, 100);
    assert_eq!(rig.list(), ["sine.flac", "sine.wav", "[sine.aiff]"]);
}

#[test]
fn removing_the_playing_track_stops_it() {
    let mut rig = Rig::new();
    rig.add(&["sine.flac", "sine.wav"], PlayAdded::Always);
    rig.device.play_frames(4_800);

    rig.session.remove(&[rig.id_of("sine.flac")]).unwrap();
    rig.device.run_until("unloaded", |s| s.track.is_none());
    assert_eq!(rig.list(), ["sine.wav"]);
    assert_eq!(rig.session.player().state().status, PlaybackStatus::Stopped);

    // removing another track leaves the playing one alone
    rig.add(&["sine.aiff"], PlayAdded::Always);
    rig.device.run_until("playing", |s| s.status == PlaybackStatus::Playing);
    rig.session.remove(&[rig.id_of("sine.wav")]).unwrap();
    assert_eq!(rig.list(), ["[sine.aiff]"]);
    assert!(rig.session.player().state().track.is_some());

    rig.session.clear().unwrap();
    rig.device.run_until("unloaded", |s| s.track.is_none());
    assert!(rig.list().is_empty());
}

#[test]
fn tags_arrive_in_the_background() {
    let rig = Rig::new();
    rig.add(&["sine.flac", "sine.mp3", "garbage.mp3"], PlayAdded::Never);
    let state = rig.wait_for_playlist("tags", |p| p.entries.iter().all(|e| e.meta.is_some()));
    let titles: Vec<Option<&str>> =
        state.entries.iter().map(|e| e.meta.as_ref().unwrap().title.as_deref()).collect();
    assert_eq!(titles, [Some("Sine"), Some("Sine"), None]);
    assert_eq!(state.entries[0].meta.as_ref().unwrap().artist.as_deref(), Some("fc-core"));
    // a file without readable tags is not an error: only playing it can tell
    assert_eq!(state.entries[2].error, None);
}

#[test]
fn the_session_is_saved_and_restored() {
    let folder = temp("restore");
    let state_file = folder.join("state.json");
    let vanishing = folder.join("vanishing.flac");
    fs::copy(fixture("sine.flac"), &vanishing).unwrap();
    {
        let mut rig = Rig::with_state_file(Some(state_file.clone()));
        rig.add(&["sine.flac", "sine.wav"], PlayAdded::Never);
        rig.session.add_paths(std::slice::from_ref(&vanishing), PlayAdded::Never);
        rig.session.set_repeat(RepeatMode::All);
        rig.session.player().set_volume(0.3).unwrap();
        rig.session.play_entry(rig.id_of("sine.wav"));
        rig.device.play_frames(24_000);
        rig.session.player().pause().unwrap();
        rig.device.wait_for("paused at half", |s| {
            s.status == PlaybackStatus::Paused && s.position_ms >= 490 && s.volume == 0.3
        });
        rig.session.save_now();
    }
    fs::remove_file(&vanishing).unwrap();

    let mut rig = Rig::with_state_file(Some(state_file));
    assert_eq!(rig.list(), ["sine.flac", "[sine.wav]", "vanishing.flac"]);
    assert_eq!(rig.session.playlist_state().repeat, RepeatMode::All);
    // the track of last time is shown where it was – and is silent
    let restored = rig.device.run_until("restored", |s| {
        s.track.as_ref().is_some_and(|t| t.file_name == "sine.wav") && s.position_ms >= 490
    });
    assert_eq!(restored.status, PlaybackStatus::Stopped);
    assert_eq!(restored.volume, 0.3);
    assert!(rig.device.heard.is_empty());

    // the file that disappeared is marked once the tags were looked for
    let state = rig.wait_for_playlist("missing marked", |p| p.entries[2].error.is_some());
    assert_eq!(state.entries[2].error, Some(ErrorCode::NotFound));
    assert_eq!(state.entries[0].meta.as_ref().unwrap().title.as_deref(), Some("Sine"));

    // play continues from the restored position: the second half of the track
    rig.session.play().unwrap();
    rig.device.run_until("playing", |s| s.status == PlaybackStatus::Playing);
    rig.device.play_frames(20_000);
}

#[test]
fn a_state_file_of_a_newer_version_is_neither_used_nor_overwritten() {
    let state_file = temp("newer").join("state.json");
    let text = r#"{"version":99,"tracks":["x.flac"],"future":true}"#;
    fs::write(&state_file, text).unwrap();

    let rig = Rig::with_state_file(Some(state_file.clone()));
    assert!(rig.list().is_empty());
    rig.add(&["sine.flac"], PlayAdded::Never);
    rig.session.save_now();
    assert_eq!(fs::read_to_string(&state_file).unwrap(), text);
}

#[test]
fn folders_are_searched_for_audio_files_in_name_order() {
    let folder = temp("collect");
    for file in ["b/02.flac", "b/01.mp3", "a/deep/er/x.OGG", "a/cover.jpg", "a/notes.txt", "z.wav"]
    {
        let path = folder.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "x").unwrap();
    }
    let found = collect_audio_files(std::slice::from_ref(&folder), 100);
    let relative: Vec<String> = found
        .iter()
        .map(|p| p.strip_prefix(&folder).unwrap().to_string_lossy().replace('\\', "/"))
        .collect();
    assert_eq!(relative, ["a/deep/er/x.OGG", "b/01.mp3", "b/02.flac", "z.wav"]);

    // a file that is named explicitly, a missing path, a limit
    let single = collect_audio_files(&[folder.join("z.wav"), folder.join("a/cover.jpg")], 100);
    assert_eq!(single, [folder.join("z.wav")]);
    assert!(collect_audio_files(&[folder.join("nowhere")], 100).is_empty());
    assert_eq!(collect_audio_files(std::slice::from_ref(&folder), 2).len(), 2);
}

#[cfg(unix)]
#[test]
fn a_link_to_a_folder_is_not_followed() {
    let folder = temp("links");
    fs::create_dir_all(folder.join("music")).unwrap();
    fs::write(folder.join("music/a.flac"), "x").unwrap();
    // a loop: music/again → music
    std::os::unix::fs::symlink(folder.join("music"), folder.join("music/again")).unwrap();
    let found = collect_audio_files(std::slice::from_ref(&folder), 100);
    assert_eq!(found, [folder.join("music/a.flac")]);
}
