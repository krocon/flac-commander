//! A simulated output device for the engine tests (shared by `player.rs` and `session.rs`).
#![allow(dead_code, clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use fc_core::audio::output::OutputFormat;
use fc_core::audio::player::{OutputBackend, PlaybackStatus, Player, PlayerState, Renderer};
use fc_core::{AppError, AppResult};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::{Duration, Instant};

pub const FORMAT: OutputFormat = OutputFormat { sample_rate: 48_000, channels: 2 };
pub const BLOCK_FRAMES: usize = 256;

pub fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

/// What an opened output hands to the test: the callback and the way to report a device error.
pub struct Opened {
    pub renderer: Renderer,
    pub on_error: Box<dyn FnMut(AppError) + Send>,
}

pub struct FakeBackend {
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
pub struct Device {
    pub player: Player,
    pub opened: Receiver<Opened>,
    pub failures: Sender<Option<AppError>>,
    pub current: Option<Opened>,
    /// Every frame rendered while audio came out (left channel, right channel).
    pub heard: Vec<[f32; 2]>,
    /// Longest run of silent frames between two frames of audio (a gap in the music).
    pub longest_gap: usize,
    silent_run: usize,
    pub states: Receiver<PlayerState>,
}

impl Device {
    pub fn new() -> Self {
        Self::with_format(FORMAT)
    }

    pub fn with_format(format: OutputFormat) -> Self {
        let (backend, link) = fake_backend(format);
        let (states_tx, states) = mpsc::channel();
        let player = Player::spawn(backend, move |state| {
            let _ = states_tx.send(state.clone());
        })
        .unwrap();
        Self::attach(player, link, states)
    }

    /// A device for a player someone else started with [`fake_backend`].
    pub fn attach(player: Player, link: DeviceLink, states: Receiver<PlayerState>) -> Self {
        let DeviceLink { opened, failures } = link;
        Self {
            player,
            opened,
            failures,
            current: None,
            heard: Vec::new(),
            longest_gap: 0,
            silent_run: 0,
            states,
        }
    }

    /// One callback of the device.
    pub fn render_block(&mut self) {
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
        for frame in block.chunks(2) {
            if frame[0] == 0.0 && frame[1] == 0.0 {
                self.silent_run += 1;
            } else {
                if !self.heard.is_empty() {
                    self.longest_gap = self.longest_gap.max(self.silent_run);
                }
                self.silent_run = 0;
                self.heard.push([frame[0], frame[1]]);
            }
        }
    }

    /// Runs the device until the player reports a state that satisfies `done`.
    pub fn run_until(&mut self, what: &str, done: impl Fn(&PlayerState) -> bool) -> PlayerState {
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
    pub fn play_frames(&mut self, frames: usize) {
        let deadline = Instant::now() + Duration::from_secs(20);
        while self.heard.len() < frames {
            assert!(Instant::now() < deadline, "only {} of {frames} frames", self.heard.len());
            self.render_block();
        }
    }

    /// Waits for the player to report a state while the device does nothing (as if its
    /// callbacks were far apart).
    pub fn wait_for(&self, what: &str, done: impl Fn(&PlayerState) -> bool) -> PlayerState {
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
    pub fn load(&mut self, name: &str, autoplay: bool) -> PlayerState {
        self.load_path(fixture(name), autoplay)
    }

    pub fn load_path(&mut self, path: PathBuf, autoplay: bool) -> PlayerState {
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

    pub fn run_to_the_end(&mut self) -> PlayerState {
        self.run_until("playing", |s| s.status == PlaybackStatus::Playing);
        self.run_until("end of track", |s| s.status == PlaybackStatus::Stopped)
    }

    pub fn heard_rms(&self) -> f32 {
        let sum: f32 = self.heard.iter().map(|f| f[0] * f[0]).sum();
        (sum / self.heard.len() as f32).sqrt()
    }

    pub fn fail_device(&mut self, error: AppError) {
        let opened = self.current.as_mut().expect("no output is open");
        (opened.on_error)(error);
    }
}

/// The test's side of a [`FakeBackend`].
pub struct DeviceLink {
    pub opened: Receiver<Opened>,
    pub failures: Sender<Option<AppError>>,
}

pub fn fake_backend(format: OutputFormat) -> (FakeBackend, DeviceLink) {
    let (opened_tx, opened) = mpsc::channel();
    let (failures, failures_rx) = mpsc::channel();
    (
        FakeBackend { opened: opened_tx, failures: failures_rx, format },
        DeviceLink { opened, failures },
    )
}

/// The stereo fixtures are a sine with an RMS of 0.0625 (see `formats.rs`).
pub const STEREO_RMS: f32 = 0.0625;

pub fn assert_frames(heard: usize, expected: usize, tolerance: usize) {
    assert!(heard.abs_diff(expected) <= tolerance, "heard {heard} frames, expected {expected}");
}
