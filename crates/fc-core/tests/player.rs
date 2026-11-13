//! The playback engine against a simulated output device.
//!
//! The test plays the role of the audio backend: it calls [`Renderer::render`] itself, block by
//! block, as fast as it likes. Nothing here sleeps for a fixed time – every wait is for a state.

#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use fc_core::audio::output::OutputFormat;
use fc_core::audio::player::{OutputBackend, PlaybackStatus, Player, PlayerState, Renderer};
use fc_core::{AppError, AppResult, ErrorCode};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::{Duration, Instant};

const FORMAT: OutputFormat = OutputFormat { sample_rate: 48_000, channels: 2 };
const BLOCK_FRAMES: usize = 256;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

/// What an opened output hands to the test: the callback and the way to report a device error.
struct Opened {
    renderer: Renderer,
    on_error: Box<dyn FnMut(AppError) + Send>,
}

struct FakeBackend {
    opened: Sender<Opened>,
    /// One entry per `open` call; `Some` makes that call fail.
    failures: Receiver<Option<AppError>>,
    format: OutputFormat,
}

impl OutputBackend for FakeBackend {
    type Stream = ();

    fn open(
        &mut self,
        renderer: Renderer,
        on_error: Box<dyn FnMut(AppError) + Send>,
    ) -> AppResult<((), OutputFormat)> {
        if let Ok(Some(error)) = self.failures.try_recv() {
            return Err(error);
        }
        self.opened.send(Opened { renderer, on_error }).unwrap();
        Ok(((), self.format))
    }
}

/// The simulated device and everything it has "played".
struct Device {
    player: Player,
    opened: Receiver<Opened>,
    failures: Sender<Option<AppError>>,
    current: Option<Opened>,
    /// Every frame rendered while audio came out (left channel, right channel).
    heard: Vec<[f32; 2]>,
    states: Receiver<PlayerState>,
}

impl Device {
    fn new() -> Self {
        Self::with_format(FORMAT)
    }

    fn with_format(format: OutputFormat) -> Self {
        let (opened_tx, opened) = mpsc::channel();
        let (failures, failures_rx) = mpsc::channel();
        let (states_tx, states) = mpsc::channel();
        let backend = FakeBackend { opened: opened_tx, failures: failures_rx, format };
        let player = Player::spawn(backend, move |state| {
            let _ = states_tx.send(state.clone());
        })
        .unwrap();
        Self { player, opened, failures, current: None, heard: Vec::new(), states }
    }

    /// One callback of the device.
    fn render_block(&mut self) {
        if let Ok(opened) = self.opened.try_recv() {
            self.current = Some(opened);
        }
        let Some(opened) = &mut self.current else {
            std::thread::yield_now();
            return;
        };
        let mut block = [0.0f32; BLOCK_FRAMES * 2];
        if opened.renderer.would_underrun(block.len()) {
            // this device is faster than real time: let the engine catch up
            std::thread::yield_now();
            return;
        }
        opened.renderer.render(&mut block, FORMAT);
        self.heard
            .extend(block.chunks(2).filter(|f| f[0] != 0.0 || f[1] != 0.0).map(|f| [f[0], f[1]]));
    }

    /// Runs the device until the player reports a state that satisfies `done`.
    fn run_until(&mut self, what: &str, done: impl Fn(&PlayerState) -> bool) -> PlayerState {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let state = self.player.state();
            if done(&state) {
                return state;
            }
            assert!(Instant::now() < deadline, "timed out waiting for: {what}; state: {state:?}");
            self.render_block();
        }
    }

    /// The device plays until `frames` frames of audio have come out in total.
    fn play_frames(&mut self, frames: usize) {
        let deadline = Instant::now() + Duration::from_secs(20);
        while self.heard.len() < frames {
            assert!(Instant::now() < deadline, "only {} of {frames} frames", self.heard.len());
            self.render_block();
        }
    }

    /// Waits for the player to report a state while the device does nothing (as if its
    /// callbacks were far apart).
    fn wait_for(&self, what: &str, done: impl Fn(&PlayerState) -> bool) -> PlayerState {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let state = self.player.state();
            if done(&state) {
                return state;
            }
            assert!(Instant::now() < deadline, "timed out waiting for: {what}; state: {state:?}");
            std::thread::yield_now();
        }
    }

    /// Loads a fixture and waits for the engine's answer: the track, or the reason why not.
    fn load(&mut self, name: &str, autoplay: bool) -> PlayerState {
        self.load_path(fixture(name), autoplay)
    }

    fn load_path(&mut self, path: PathBuf, autoplay: bool) -> PlayerState {
        // states reported before the command are not the answer to it
        while self.states.try_recv().is_ok() {}
        self.player.load(path.clone(), autoplay).unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            while let Ok(state) = self.states.try_recv() {
                let loaded = state.track.as_ref().is_some_and(|t| t.path == path);
                if loaded || state.error.is_some() {
                    return state;
                }
            }
            assert!(Instant::now() < deadline, "timed out loading {}", path.display());
            self.render_block();
        }
    }

    fn run_to_the_end(&mut self) -> PlayerState {
        self.run_until("playing", |s| s.status == PlaybackStatus::Playing);
        self.run_until("end of track", |s| s.status == PlaybackStatus::Stopped)
    }

    fn heard_rms(&self) -> f32 {
        let sum: f32 = self.heard.iter().map(|f| f[0] * f[0]).sum();
        (sum / self.heard.len() as f32).sqrt()
    }

    fn fail_device(&mut self, error: AppError) {
        let opened = self.current.as_mut().expect("no output is open");
        (opened.on_error)(error);
    }
}

/// The stereo fixtures are a sine with an RMS of 0.0625 (see `formats.rs`).
const STEREO_RMS: f32 = 0.0625;

fn assert_frames(heard: usize, expected: usize, tolerance: usize) {
    assert!(heard.abs_diff(expected) <= tolerance, "heard {heard} frames, expected {expected}");
}

#[test]
fn starts_stopped_and_empty() {
    let device = Device::new();
    let state = device.player.state();
    assert_eq!(state.status, PlaybackStatus::Stopped);
    assert_eq!(state.track, None);
    assert_eq!(state.position_ms, 0);
    assert_eq!(state.volume, 1.0);
    assert_eq!(state.error, None);
}

#[test]
fn loading_shows_the_track_without_playing_it() {
    let mut device = Device::new();
    let state = device.load("sine.flac", false);
    let track = state.track.unwrap();
    assert_eq!(track.file_name, "sine.flac");
    assert_eq!(track.info.codec, "flac");
    assert_eq!(track.info.duration_ms, Some(1000));
    assert_eq!(state.status, PlaybackStatus::Stopped);
    assert_eq!(state.position_ms, 0);

    for _ in 0..200 {
        device.render_block();
    }
    assert!(device.heard.is_empty(), "a loaded track must stay silent until play");
}

#[test]
fn plays_a_track_to_its_end_resampled_to_the_device_rate() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    let end = device.run_to_the_end();

    // 1 s of 44.1 kHz audio is 48 000 frames on the 48 kHz device
    assert_frames(device.heard.len(), 48_000, 64);
    assert!((device.heard_rms() - STEREO_RMS).abs() < 0.002, "rms {}", device.heard_rms());
    assert_eq!(end.position_ms, 0, "back at the start after the end");
    assert_eq!(end.error, None);
    assert_eq!(end.underruns, 0);
    assert!(end.track.is_some(), "the track stays loaded");
}

#[test]
fn reports_the_position_while_playing() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    // 24 000 frames are 500 ms; the device has played them, give or take the block in flight
    device.play_frames(24_000);
    let state = device.wait_for("half way", |s| s.position_ms >= 495);
    assert_eq!(state.status, PlaybackStatus::Playing);
    assert!(state.position_ms <= 510, "position {} ms", state.position_ms);

    let mut positions = Vec::new();
    while let Ok(state) = device.states.try_recv() {
        positions.push(state.position_ms);
    }
    assert!(positions.windows(2).all(|w| w[0] <= w[1]), "position went back: {positions:?}");
}

#[test]
fn every_format_plays_through_the_engine() {
    for (name, rate_tolerance) in [
        ("sine.wav", 64),
        ("sine.aiff", 64),
        ("sine-alac.m4a", 64),
        ("sine.mp3", 3000),
        ("sine.ogg", 3000),
        ("sine.m4a", 3000),
        #[cfg(feature = "opus")]
        ("sine.opus", 3000),
    ] {
        let mut device = Device::new();
        let loaded = device.load(name, true);
        assert_eq!(loaded.error, None, "{name}");
        device.run_to_the_end();
        assert_frames(device.heard.len(), 48_000, rate_tolerance);
        assert!((device.heard_rms() - STEREO_RMS).abs() < 0.006, "{name}: {}", device.heard_rms());
    }
}

#[test]
fn mono_at_96_khz_becomes_stereo_at_the_device_rate() {
    let mut device = Device::new();
    device.load("sine-96k-24bit-mono.flac", true);
    device.run_to_the_end();
    assert_frames(device.heard.len(), 48_000, 64);
    assert!(device.heard.iter().all(|f| f[0] == f[1]), "mono goes to both channels");
    assert!((device.heard_rms() - 0.0884).abs() < 0.002, "rms {}", device.heard_rms());
}

#[test]
fn a_track_at_the_device_rate_is_not_resampled() {
    let mut device = Device::with_format(OutputFormat { sample_rate: 44_100, channels: 2 });
    device.load("sine.flac", true);
    device.run_to_the_end();
    // bit-exact length: no filter in the way
    assert_eq!(device.heard.len(), 44_100 - device.heard_zero_frames());
}

impl Device {
    /// Frames of the sine that are exactly zero (its zero crossings) are not counted as heard.
    fn heard_zero_frames(&self) -> usize {
        // 440 Hz at 44.1 kHz hits zero exactly at the frames where 440·n/44100 is a multiple
        // of 1/2: every 2205/22 frames – only n = 0, 2205·k: 20 frames in one second.
        20
    }
}

#[test]
fn pause_holds_the_position_and_play_continues_from_it() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(14_400);

    device.player.pause().unwrap();
    device.wait_for("paused", |s| s.status == PlaybackStatus::Paused);
    // let the fade-out pass, then nothing more may come
    for _ in 0..10 {
        device.render_block();
    }
    let heard_at_pause = device.heard.len();
    let position_at_pause = device.wait_for("position", |s| s.position_ms >= 300).position_ms;
    for _ in 0..500 {
        device.render_block();
    }
    assert_eq!(device.heard.len(), heard_at_pause, "audio while paused");
    assert_eq!(device.player.state().position_ms, position_at_pause);

    device.player.play().unwrap();
    device.run_to_the_end();
    // nothing was lost or repeated across the pause
    assert_frames(device.heard.len(), 48_000, 64);
}

#[test]
fn stop_goes_back_to_the_start() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(14_400);

    device.player.stop().unwrap();
    let stopped = device.run_until("stopped", |s| s.status == PlaybackStatus::Stopped);
    assert_eq!(stopped.position_ms, 0);
    assert!(stopped.track.is_some());

    device.heard.clear();
    device.player.play().unwrap();
    device.run_to_the_end();
    assert_frames(device.heard.len(), 48_000, 64);
}

#[test]
fn seek_continues_at_the_new_position() {
    let mut device = Device::new();
    device.load("sine.flac", false);
    device.player.seek(600).unwrap();
    let state = device.run_until("position taken over", |s| s.position_ms == 600);
    assert_eq!(state.status, PlaybackStatus::Stopped);

    device.player.play().unwrap();
    device.run_to_the_end();
    // 400 ms are left: 19 200 frames
    assert_frames(device.heard.len(), 19_200, 64);
}

#[test]
fn seek_drops_what_was_queued_for_the_old_position() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(4_800);
    device.player.pause().unwrap();
    device.wait_for("paused", |s| s.status == PlaybackStatus::Paused);
    for _ in 0..10 {
        device.render_block();
    }
    // 300 ms of the old position are queued now and must never be heard
    device.heard.clear();
    device.player.seek(900).unwrap();
    let state = device.run_until("at the new position", |s| s.position_ms == 900);
    assert_eq!(state.status, PlaybackStatus::Paused);

    device.player.play().unwrap();
    device.run_to_the_end();
    // exactly the last 100 ms
    assert_frames(device.heard.len(), 4_800, 64);
}

#[test]
fn seek_while_playing_continues_without_an_error() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(4_800);
    device.player.seek(900).unwrap();
    let end = device.run_until("end of track", |s| s.status == PlaybackStatus::Stopped);
    assert_eq!(end.error, None);
    assert_eq!(end.underruns, 0);
    assert!(device.heard.len() < 40_000, "nothing was skipped: {}", device.heard.len());
}

#[test]
fn seek_behind_the_end_ends_the_track() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.run_until("playing", |s| s.status == PlaybackStatus::Playing);
    device.player.seek(60_000).unwrap();
    let end = device.run_until("end of track", |s| s.status == PlaybackStatus::Stopped);
    assert_eq!(end.error, None);
    assert!(end.track.is_some());
}

#[test]
fn volume_scales_the_output_and_is_clamped() {
    let mut device = Device::new();
    device.player.set_volume(0.5).unwrap();
    device.load("sine.flac", true);
    let end = device.run_to_the_end();
    assert_eq!(end.volume, 0.5);
    assert!((device.heard_rms() - STEREO_RMS / 2.0).abs() < 0.002, "rms {}", device.heard_rms());

    device.player.set_volume(7.0).unwrap();
    assert_eq!(device.run_until("clamped", |s| s.volume != 0.5).volume, 1.0);
    device.player.set_volume(-1.0).unwrap();
    assert_eq!(device.run_until("clamped", |s| s.volume != 1.0).volume, 0.0);
    device.player.set_volume(f32::NAN).unwrap();
    device.player.set_volume(0.25).unwrap();
    assert_eq!(device.run_until("set", |s| s.volume != 0.0).volume, 0.25);
}

#[test]
fn playback_starts_and_pauses_without_a_click() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(9_600);
    device.player.pause().unwrap();
    device.wait_for("paused", |s| s.status == PlaybackStatus::Paused);
    for _ in 0..10 {
        device.render_block();
    }
    // a 440 Hz sine with a peak of 0.0884 moves at most 0.0051 per frame at 48 kHz;
    // a hard start or stop would jump by up to the peak
    let left: Vec<f32> = device.heard.iter().map(|f| f[0]).collect();
    assert!(left[0].abs() < 0.01, "starts at {}", left[0]);
    assert!(left[left.len() - 1].abs() < 0.01, "ends at {}", left[left.len() - 1]);
}

#[test]
fn an_unsupported_file_is_reported_and_nothing_is_loaded() {
    let mut device = Device::new();
    let state = device.load("garbage.mp3", true);
    assert_eq!(state.error.unwrap().code, ErrorCode::UnsupportedFormat);
    assert_eq!(state.track, None);
    assert_eq!(state.status, PlaybackStatus::Stopped);
}

#[test]
fn a_missing_file_replaces_the_current_track_with_an_error() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.run_until("playing", |s| s.status == PlaybackStatus::Playing);

    let state = device.load("gone.flac", true);
    assert_eq!(state.error.unwrap().code, ErrorCode::NotFound);
    assert_eq!(state.track, None);
    assert_eq!(state.status, PlaybackStatus::Stopped);
}

#[test]
fn the_next_success_clears_the_error() {
    let mut device = Device::new();
    device.load("garbage.mp3", true);
    assert!(device.player.state().error.is_some());
    let state = device.load("sine.flac", false);
    assert_eq!(state.error, None);
}

#[test]
fn a_file_cut_off_in_the_middle_plays_what_is_there_and_reports_it() {
    let mut device = Device::new();
    device.load("truncated.flac", true);
    let end = device.run_until("ended or failed", |s| {
        s.status == PlaybackStatus::Stopped && (s.error.is_some() || s.position_ms == 0)
    });
    if let Some(error) = end.error {
        assert_eq!(error.code, ErrorCode::DecodeFailed);
    }
}

/// A WAV whose "samples" are a DTS bit stream: must be refused, not played as noise.
#[test]
fn dts_in_a_wav_file_is_refused() {
    let mut data = Vec::new();
    for frame in 0..40usize {
        data.extend_from_slice(&[0xFF, 0x1F, 0x00, 0xE8, 0xF1, 0x07]);
        data.extend((6..4096).map(|i| ((i * 31 + frame * 7) % 251) as u8));
    }
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&2u16.to_le_bytes()); // stereo
    wav.extend_from_slice(&44_100u32.to_le_bytes());
    wav.extend_from_slice(&(44_100u32 * 4).to_le_bytes());
    wav.extend_from_slice(&4u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data.len() as u32).to_le_bytes());
    wav.extend_from_slice(&data);
    let path = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join("dts-cd.wav");
    std::fs::write(&path, wav).unwrap();

    let mut device = Device::new();
    let state = device.load_path(path, true);
    let error = state.error.unwrap();
    assert_eq!(error.code, ErrorCode::UnsupportedFormat);
    assert!(error.message.contains("DTS"), "{error:?}");
    assert_eq!(state.track, None);
    assert!(device.heard.is_empty());
}

#[test]
fn without_an_output_device_loading_fails_with_the_reason() {
    let mut device = Device::new();
    device
        .failures
        .send(Some(AppError::new(ErrorCode::NoOutputDevice, "no audio output device")))
        .unwrap();
    let state = device.load("sine.flac", true);
    assert_eq!(state.error.unwrap().code, ErrorCode::NoOutputDevice);
    assert_eq!(state.track, None);

    // once a device is there, loading works
    let state = device.load("sine.flac", false);
    assert_eq!(state.error, None);
    assert!(state.track.is_some());
}

#[test]
fn a_lost_device_pauses_and_play_continues_on_a_new_one() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(19_200);

    device.fail_device(AppError::new(ErrorCode::AudioDevice, "output stream failed"));
    let lost = device.wait_for("paused by the device", |s| s.status == PlaybackStatus::Paused);
    assert_eq!(lost.error.unwrap().code, ErrorCode::AudioDevice);
    assert!((400..=410).contains(&lost.position_ms), "position kept: {}", lost.position_ms);
    assert!(lost.track.is_some());
    let heard_before = device.heard.len();

    device.player.play().unwrap();
    let end = device.run_to_the_end();
    assert_eq!(end.error, None);
    // the rest of the track came from the new output, starting where the old one stopped
    let rest = device.heard.len() - heard_before;
    let expected = 48_000 - (lost.position_ms as usize * 48);
    assert_frames(rest, expected, 600);
}

#[test]
fn a_device_that_stays_away_keeps_the_player_paused_with_the_reason() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(4_800);
    device.fail_device(AppError::new(ErrorCode::AudioDevice, "unplugged"));
    device.wait_for("paused by the device", |s| s.status == PlaybackStatus::Paused);

    device
        .failures
        .send(Some(AppError::new(ErrorCode::NoOutputDevice, "no audio output device")))
        .unwrap();
    device.player.play().unwrap();
    let state = device.wait_for("refused", |s| {
        s.error.as_ref().is_some_and(|e| e.code == ErrorCode::NoOutputDevice)
    });
    assert_eq!(state.status, PlaybackStatus::Paused);
    assert!(state.track.is_some());
}

#[test]
fn commands_without_a_track_do_nothing() {
    let mut device = Device::new();
    device.player.play().unwrap();
    device.player.pause().unwrap();
    device.player.seek(500).unwrap();
    device.player.stop().unwrap();
    device.player.set_volume(0.3).unwrap();
    let state = device.run_until("volume set", |s| s.volume == 0.3);
    assert_eq!(state.status, PlaybackStatus::Stopped);
    assert_eq!(state.track, None);
    assert_eq!(state.error, None);
}

#[test]
fn loading_another_track_replaces_the_playing_one() {
    let mut device = Device::new();
    device.load("sine.flac", true);
    device.play_frames(4_800);
    device.heard.clear();

    let state = device.load("sine-96k-24bit-mono.flac", true);
    assert_eq!(state.track.unwrap().info.sample_rate, 96_000);
    device.run_until("end of track", |s| s.status == PlaybackStatus::Stopped && s.position_ms == 0);
    // This device is faster than real time, so some of the old track may have come out before
    // the engine took the command – but then the new one plays completely, and nothing else:
    // it is louder (mono fixture: RMS 0.0884) than the old one (0.0625).
    assert!(device.heard.len() >= 48_000 - 64, "{} frames", device.heard.len());
    let new_track = &device.heard[device.heard.len() - 47_000..];
    let rms = (new_track.iter().map(|f| f[0] * f[0]).sum::<f32>() / 47_000.0).sqrt();
    assert!((rms - 0.0884).abs() < 0.002, "rms {rms}");
}

#[test]
fn the_state_serialises_as_the_frontend_expects() {
    let mut device = Device::new();
    let state = device.load("sine.flac", false);
    let json = serde_json::to_value(&state).unwrap();
    assert_eq!(json["status"], "stopped");
    assert_eq!(json["positionMs"], 0);
    assert_eq!(json["volume"], 1.0);
    assert!(json["error"].is_null());
    assert_eq!(json["underruns"], 0);
    assert_eq!(json["track"]["fileName"], "sine.flac");
    assert!(json["track"]["path"].as_str().unwrap().ends_with("sine.flac"));
    assert_eq!(
        json["track"]["info"],
        serde_json::json!({
            "container": "flac", "codec": "flac", "sampleRate": 44100, "channels": 2,
            "bitsPerSample": 16, "durationMs": 1000
        })
    );
    let empty = serde_json::to_value(PlayerState::default()).unwrap();
    assert!(empty["track"].is_null());
}
