//! The playback engine.
//!
//! One thread owns everything that may block: decoder, resampler, the output stream and the
//! state machine. It is driven by a command queue and feeds the real-time callback through a
//! lock-free ring buffer. The callback ([`Renderer`]) only copies, applies the gain and counts.
//!
//! ```text
//! Player (any thread) ──commands──▶ engine thread ──ring buffer──▶ Renderer (audio callback)
//!        ◀── PlayerState (snapshot + callback on every change) ◀── atomics ──┘
//! ```
//!
//! The engine never switches the sample rate of the device: tracks are resampled to it.

use crate::audio::decode::{Decoder, TrackInfo};
use crate::audio::dts::{DTS_SCAN_SAMPLES, is_dts_in_pcm};
use crate::audio::output::{self, OutputFormat, remap_channels};
use crate::audio::resample::StreamResampler;
use crate::error::{AppError, AppResult, ErrorCode};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackStatus {
    Stopped,
    Playing,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedTrack {
    pub path: PathBuf,
    pub file_name: String,
    pub info: TrackInfo,
}

/// Everything a window needs to show the player. Sent on every change and a few times per
/// second while playing; a new window asks for it once.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub status: PlaybackStatus,
    pub track: Option<LoadedTrack>,
    /// What has been played, counted by the audio callback.
    pub position_ms: u64,
    /// `0.0..=1.0`
    pub volume: f32,
    /// Why the last command failed or playback was interrupted; cleared by the next success.
    pub error: Option<AppError>,
    /// Callbacks that ran out of audio in the middle of a track since the output was opened.
    pub underruns: u64,
    /// Tracks played to their end since the start: a change tells the playlist to go on.
    pub finished: u64,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            status: PlaybackStatus::Stopped,
            track: None,
            position_ms: 0,
            volume: 1.0,
            error: None,
            underruns: 0,
            finished: 0,
        }
    }
}

/// What engine thread and audio callback share. Atomics only: the callback never waits.
#[derive(Debug, Default)]
struct Shared {
    playing: AtomicBool,
    /// `f32` bits of the volume.
    volume: AtomicU32,
    /// Incremented by the engine to have the callback drop everything queued …
    flush_requested: AtomicU64,
    /// … and set to the same value by the callback once it has.
    flush_done: AtomicU64,
    /// Frames played since the last flush.
    played_frames: AtomicU64,
    /// The engine has queued the whole track: an empty buffer is the end, not an underrun.
    input_done: AtomicBool,
    /// The queue was emptied on purpose (seek, stop) and is being filled again: silence until
    /// then is expected.
    refilling: AtomicBool,
    underruns: AtomicU64,
}

/// Length of the fade when playback starts, pauses or the volume changes (against clicks).
const GAIN_RAMP_MS: f32 = 8.0;

/// The real-time side: fills output buffers from the ring buffer. No allocation, no locks.
pub struct Renderer {
    consumer: rtrb::Consumer<f32>,
    shared: Arc<Shared>,
    gain: f32,
}

impl Renderer {
    /// True if a callback for `samples` would find too little queued although more of the track
    /// is still to come. A real device calls [`Self::render`] at its own pace regardless; a
    /// simulated one that runs faster than real time uses this to wait for the engine.
    pub fn would_underrun(&self, samples: usize) -> bool {
        let shared = &self.shared;
        shared.flush_requested.load(Ordering::Acquire) == shared.flush_done.load(Ordering::Relaxed)
            && shared.playing.load(Ordering::Relaxed)
            && !shared.input_done.load(Ordering::Relaxed)
            && self.consumer.slots() < samples
    }

    /// Fills `out` (interleaved, `format.channels` per frame). Called by the audio backend.
    pub fn render(&mut self, out: &mut [f32], format: OutputFormat) {
        let requested = self.shared.flush_requested.load(Ordering::Acquire);
        if requested != self.shared.flush_done.load(Ordering::Relaxed) {
            let queued = self.consumer.slots();
            if let Ok(chunk) = self.consumer.read_chunk(queued) {
                chunk.commit_all();
            }
            self.shared.played_frames.store(0, Ordering::Release);
            self.shared.flush_done.store(requested, Ordering::Release);
        }

        let target = if self.shared.playing.load(Ordering::Relaxed) {
            f32::from_bits(self.shared.volume.load(Ordering::Relaxed))
        } else {
            0.0
        };
        if target == 0.0 && self.gain == 0.0 {
            out.fill(0.0);
            return;
        }

        let channels = usize::from(format.channels.max(1));
        let step = 1000.0 / (GAIN_RAMP_MS * format.sample_rate.max(1) as f32);
        // fading out: take only the frames the fade needs, the rest stays queued for `play`
        let wanted = if target == 0.0 {
            let fade_frames = (self.gain / step).ceil() as usize;
            (fade_frames * channels).min(out.len())
        } else {
            out.len()
        };
        let (audio, silence) = out.split_at_mut(wanted);
        silence.fill(0.0);
        let (filled, missing) = self.consumer.pop_partial_slice(audio);
        for frame in filled.chunks_mut(channels) {
            if self.gain != target {
                self.gain = if self.gain < target {
                    (self.gain + step).min(target)
                } else {
                    (self.gain - step).max(target)
                };
            }
            for sample in frame {
                *sample *= self.gain;
            }
        }
        let frames = (filled.len() / channels) as u64;
        self.shared.played_frames.fetch_add(frames, Ordering::Release);
        if target == 0.0 && self.gain <= step / 2.0 {
            self.gain = 0.0;
        }
        if !missing.is_empty() {
            missing.fill(0.0);
            // the next audio starts from silence again
            self.gain = 0.0;
            let expected = self.shared.input_done.load(Ordering::Relaxed)
                || self.shared.refilling.load(Ordering::Relaxed);
            if !expected {
                self.shared.underruns.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
}

/// Where the audio goes. The player uses [`DefaultOutput`]; tests drive a [`Renderer`] themselves.
pub trait OutputBackend: Send + 'static {
    /// Keeps the output running; dropped to close it. Lives on the engine thread only.
    type Stream;

    /// Opens the output and starts calling `renderer`. `on_error` reports a device that fails
    /// later.
    fn open(
        &mut self,
        renderer: Renderer,
        on_error: Box<dyn FnMut(AppError) + Send>,
    ) -> AppResult<(Self::Stream, OutputFormat)>;
}

/// The default output device of the system, at its own sample rate.
pub struct DefaultOutput;

impl OutputBackend for DefaultOutput {
    type Stream = output::OutputStream;

    fn open(
        &mut self,
        mut renderer: Renderer,
        on_error: Box<dyn FnMut(AppError) + Send>,
    ) -> AppResult<(Self::Stream, OutputFormat)> {
        let stream = output::open_default_output(
            None,
            move |out, format| renderer.render(out, format),
            on_error,
        )?;
        let format = stream.format();
        Ok((stream, format))
    }
}

enum Msg {
    Load {
        path: PathBuf,
        autoplay: bool,
    },
    Play,
    Pause,
    Stop,
    Unload,
    Seek(u64),
    SetVolume(f32),
    /// From the error callback of output number `output_id`.
    DeviceError {
        output_id: u64,
        error: AppError,
    },
}

/// Handle to the engine. Cheap to clone; every method returns at once – the effect shows in
/// [`PlayerState`].
#[derive(Clone)]
pub struct Player {
    tx: Sender<Msg>,
    state: Arc<Mutex<PlayerState>>,
}

impl Player {
    /// Starts the engine thread. `on_state` is called on that thread with every new state.
    pub fn spawn<B, F>(backend: B, on_state: F) -> AppResult<Self>
    where
        B: OutputBackend,
        F: Fn(&PlayerState) + Send + 'static,
    {
        let (tx, rx) = mpsc::channel();
        let state = Arc::new(Mutex::new(PlayerState::default()));
        let engine_tx = tx.clone();
        let engine_state = state.clone();
        thread::Builder::new()
            .name("audio-engine".to_owned())
            .spawn(move || {
                Engine::new(backend, rx, engine_tx, engine_state, Box::new(on_state)).run();
            })
            .map_err(|e| {
                AppError::internal("audio engine thread could not be started")
                    .with_details(e.to_string())
            })?;
        Ok(Self { tx, state })
    }

    /// The latest state. While playing it is at most a fraction of a second old.
    pub fn state(&self) -> PlayerState {
        lock(&self.state).clone()
    }

    /// Loads `path`, replacing the current track. Failures show as [`PlayerState::error`].
    pub fn load(&self, path: PathBuf, autoplay: bool) -> AppResult<()> {
        self.send(Msg::Load { path, autoplay })
    }

    pub fn play(&self) -> AppResult<()> {
        self.send(Msg::Play)
    }

    pub fn pause(&self) -> AppResult<()> {
        self.send(Msg::Pause)
    }

    /// Stops and goes back to the start of the track.
    pub fn stop(&self) -> AppResult<()> {
        self.send(Msg::Stop)
    }

    /// Stops and forgets the track.
    pub fn unload(&self) -> AppResult<()> {
        self.send(Msg::Unload)
    }

    pub fn seek(&self, position_ms: u64) -> AppResult<()> {
        self.send(Msg::Seek(position_ms))
    }

    /// `volume` is clamped to `0.0..=1.0`; anything that is not a number is ignored.
    pub fn set_volume(&self, volume: f32) -> AppResult<()> {
        self.send(Msg::SetVolume(volume))
    }

    fn send(&self, msg: Msg) -> AppResult<()> {
        self.tx.send(msg).map_err(|_| AppError::internal("the audio engine is not running"))
    }
}

/// A poisoned lock only means another thread panicked while holding it; the state is still the
/// last one written.
fn lock(state: &Mutex<PlayerState>) -> std::sync::MutexGuard<'_, PlayerState> {
    state.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Ring buffer size in samples: 2.7 s of 48 kHz stereo, 170 ms of 192 kHz with 8 channels.
const RING_SAMPLES: usize = 1 << 18;
/// How much audio the engine keeps queued. Short, so that little is decoded in vain on a seek.
const QUEUE_MS: u64 = 300;
/// Longest pause between two states while playing.
const PUBLISH_INTERVAL: Duration = Duration::from_millis(200);
/// How long the engine sleeps when the queue is full or nothing plays.
const FILL_INTERVAL: Duration = Duration::from_millis(20);
const IDLE_INTERVAL: Duration = Duration::from_millis(500);
/// A callback that does not answer a flush for this long counts as a dead device.
const FLUSH_TIMEOUT: Duration = Duration::from_millis(1000);

struct Output<S> {
    _stream: S,
    id: u64,
    format: OutputFormat,
    producer: rtrb::Producer<f32>,
    /// Samples to keep queued (whole frames).
    target: usize,
}

impl<S> Output<S> {
    fn queued(&self) -> usize {
        RING_SAMPLES - self.producer.slots()
    }
}

struct Track {
    loaded: LoadedTrack,
    decoder: Decoder,
    resampler: Option<StreamResampler>,
    /// Decoded, resampled and mapped to the device's channels, waiting for room in the queue.
    pending: Vec<f32>,
    pending_pos: usize,
    resampled: Vec<f32>,
    /// Everything of the track is in `pending` or queued.
    input_done: bool,
    /// Position of the first frame queued after the last flush.
    base_ms: u64,
    /// Set while nothing of the track is queued: where the next `play` starts.
    restart_at: Option<u64>,
}

impl Track {
    fn duration_ms(&self) -> Option<u64> {
        self.loaded.info.duration_ms
    }

    fn pending_left(&self) -> usize {
        self.pending.len() - self.pending_pos
    }

    /// Decodes the next packet into `pending`. Returns `false` at the end of the track.
    fn decode_next(&mut self, format: OutputFormat) -> AppResult<bool> {
        self.pending.clear();
        self.pending_pos = 0;
        let src_channels = usize::from(self.loaded.info.channels);
        let dst_channels = usize::from(format.channels);
        let Some(chunk) = self.decoder.next_chunk()? else {
            if let Some(resampler) = &mut self.resampler {
                self.resampled.clear();
                resampler.finish(&mut self.resampled)?;
                remap_channels(&self.resampled, src_channels, dst_channels, &mut self.pending);
            }
            return Ok(false);
        };
        match &mut self.resampler {
            Some(resampler) => {
                self.resampled.clear();
                resampler.process(chunk, &mut self.resampled)?;
                remap_channels(&self.resampled, src_channels, dst_channels, &mut self.pending);
            }
            None => remap_channels(chunk, src_channels, dst_channels, &mut self.pending),
        }
        Ok(true)
    }
}

struct Engine<B: OutputBackend> {
    backend: B,
    rx: Receiver<Msg>,
    tx: Sender<Msg>,
    shared: Arc<Shared>,
    output: Option<Output<B::Stream>>,
    outputs_opened: u64,
    track: Option<Track>,
    status: PlaybackStatus,
    volume: f32,
    error: Option<AppError>,
    finished: u64,
    state: Arc<Mutex<PlayerState>>,
    on_state: Box<dyn Fn(&PlayerState) + Send>,
    published: Option<(PlayerState, Instant)>,
}

impl<B: OutputBackend> Engine<B> {
    fn new(
        backend: B,
        rx: Receiver<Msg>,
        tx: Sender<Msg>,
        state: Arc<Mutex<PlayerState>>,
        on_state: Box<dyn Fn(&PlayerState) + Send>,
    ) -> Self {
        let shared = Arc::new(Shared::default());
        shared.volume.store(1.0f32.to_bits(), Ordering::Relaxed);
        Self {
            backend,
            rx,
            tx,
            shared,
            output: None,
            outputs_opened: 0,
            track: None,
            status: PlaybackStatus::Stopped,
            volume: 1.0,
            error: None,
            finished: 0,
            state,
            on_state,
            published: None,
        }
    }

    fn run(mut self) {
        loop {
            let filled = self.fill();
            let wait = if filled {
                Duration::ZERO
            } else if self.status == PlaybackStatus::Playing {
                FILL_INTERVAL
            } else {
                IDLE_INTERVAL
            };
            match self.rx.recv_timeout(wait) {
                Ok(msg) => self.handle(msg),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
            self.finish_track_if_played();
            self.publish();
        }
    }

    fn handle(&mut self, msg: Msg) {
        match msg {
            Msg::Load { path, autoplay } => self.load(&path, autoplay),
            Msg::Play => self.play(),
            Msg::Pause => {
                if self.status == PlaybackStatus::Playing {
                    self.set_playing(false);
                    self.status = PlaybackStatus::Paused;
                }
            }
            Msg::Stop => self.stop(),
            Msg::Unload => {
                self.set_playing(false);
                self.status = PlaybackStatus::Stopped;
                self.track = None;
                self.flush();
            }
            Msg::Seek(position_ms) => self.seek(position_ms),
            Msg::SetVolume(volume) => {
                if volume.is_finite() {
                    self.volume = volume.clamp(0.0, 1.0);
                    self.shared.volume.store(self.volume.to_bits(), Ordering::Relaxed);
                }
            }
            Msg::DeviceError { output_id, error } => {
                if self.output.as_ref().is_some_and(|o| o.id == output_id) {
                    self.lose_output(error);
                }
            }
        }
    }

    fn set_playing(&self, playing: bool) {
        self.shared.playing.store(playing, Ordering::Relaxed);
    }

    fn load(&mut self, path: &Path, autoplay: bool) {
        self.set_playing(false);
        self.status = PlaybackStatus::Stopped;
        self.track = None;
        self.flush();
        self.error = None;
        match self.open_track(path) {
            Ok(track) => {
                log::info!(
                    "loaded {}: {} / {}, {} Hz, {} ch{}",
                    path.display(),
                    track.loaded.info.container,
                    track.loaded.info.codec,
                    track.loaded.info.sample_rate,
                    track.loaded.info.channels,
                    if track.resampler.is_some() { ", resampled" } else { "" },
                );
                self.track = Some(track);
                if autoplay {
                    self.play();
                }
            }
            Err(e) => {
                log::warn!("cannot load {}: {e} ({:?})", path.display(), e.details);
                self.error = Some(e);
            }
        }
    }

    fn open_track(&mut self, path: &Path) -> AppResult<Track> {
        let decoder = Decoder::open(path)?;
        let info = decoder.info().clone();
        if info.codec.starts_with("pcm_s16") && pcm_carries_dts(path)? {
            return Err(AppError::new(
                ErrorCode::UnsupportedFormat,
                format!("{}: DTS audio in a PCM file", path.display()),
            ));
        }
        let format = self.ensure_output()?;
        let file_name = path
            .file_name()
            .map_or_else(|| path.display().to_string(), |n| n.to_string_lossy().into_owned());
        let mut track = Track {
            loaded: LoadedTrack { path: path.to_owned(), file_name, info },
            decoder,
            resampler: None,
            pending: Vec::new(),
            pending_pos: 0,
            resampled: Vec::new(),
            input_done: false,
            base_ms: 0,
            restart_at: None,
        };
        track.resampler = resampler_for(&track.loaded.info, format)?;
        self.shared.input_done.store(false, Ordering::Relaxed);
        Ok(track)
    }

    /// Opens the output if it is not open and returns its format.
    fn ensure_output(&mut self) -> AppResult<OutputFormat> {
        if let Some(output) = &self.output {
            return Ok(output.format);
        }
        let (producer, consumer) = rtrb::RingBuffer::<f32>::new(RING_SAMPLES);
        self.shared
            .flush_done
            .store(self.shared.flush_requested.load(Ordering::Relaxed), Ordering::Relaxed);
        self.shared.played_frames.store(0, Ordering::Relaxed);
        self.shared.underruns.store(0, Ordering::Relaxed);
        let renderer = Renderer { consumer, shared: self.shared.clone(), gain: 0.0 };
        self.outputs_opened += 1;
        let id = self.outputs_opened;
        let tx = self.tx.clone();
        let on_error = Box::new(move |error: AppError| {
            let _ = tx.send(Msg::DeviceError { output_id: id, error });
        });
        let (stream, format) = self.backend.open(renderer, on_error)?;
        if format.sample_rate == 0 || format.channels == 0 {
            return Err(AppError::new(
                ErrorCode::AudioDevice,
                format!("unusable output format: {format:?}"),
            ));
        }
        let channels = usize::from(format.channels);
        let wanted = (u64::from(format.sample_rate) * QUEUE_MS / 1000) as usize * channels;
        let target = wanted.min(RING_SAMPLES) / channels * channels;
        self.output = Some(Output { _stream: stream, id, format, producer, target });
        Ok(format)
    }

    fn play(&mut self) {
        let Some(position) = self.track.as_ref().map(|t| t.restart_at) else {
            return;
        };
        if self.output.is_none() {
            // the device was lost: open the (new) default device and adapt the track to it
            let reopened = self.ensure_output().and_then(|format| {
                if let Some(track) = &mut self.track {
                    track.resampler = resampler_for(&track.loaded.info, format)?;
                }
                Ok(())
            });
            if let Err(e) = reopened {
                log::warn!("output cannot be opened: {e} ({:?})", e.details);
                self.error = Some(e);
                return;
            }
        }
        if let Some(position_ms) = position {
            self.reposition(position_ms);
        }
        if self.track.is_some() {
            self.error = None;
            self.set_playing(true);
            self.status = PlaybackStatus::Playing;
        }
    }

    fn stop(&mut self) {
        self.set_playing(false);
        self.status = PlaybackStatus::Stopped;
        self.flush();
        if let Some(track) = &mut self.track {
            track.restart_at = Some(0);
        }
    }

    fn seek(&mut self, position_ms: u64) {
        let Some(track) = &mut self.track else {
            return;
        };
        let position_ms = track.duration_ms().map_or(position_ms, |d| position_ms.min(d));
        if track.restart_at.is_some() {
            // nothing is queued: only remember where to start
            track.restart_at = Some(position_ms);
        } else {
            self.reposition(position_ms);
        }
    }

    /// Drops what is queued and continues decoding at `position_ms`.
    fn reposition(&mut self, position_ms: u64) {
        self.flush();
        let Some(track) = &mut self.track else {
            return;
        };
        match track.decoder.seek(position_ms) {
            Ok(()) => {
                if let Some(resampler) = &mut track.resampler {
                    resampler.reset();
                }
                track.pending.clear();
                track.pending_pos = 0;
                track.input_done = false;
                track.base_ms = position_ms;
                track.restart_at = None;
                self.shared.input_done.store(false, Ordering::Relaxed);
            }
            Err(e) => self.fail_track(e),
        }
    }

    /// Has the callback drop everything queued and waits until it did.
    fn flush(&mut self) {
        if self.output.is_none() {
            return;
        }
        self.shared.refilling.store(true, Ordering::Relaxed);
        let request = self.shared.flush_requested.fetch_add(1, Ordering::AcqRel) + 1;
        let deadline = Instant::now() + FLUSH_TIMEOUT;
        while self.shared.flush_done.load(Ordering::Acquire) != request {
            if Instant::now() > deadline {
                self.lose_output(AppError::new(
                    ErrorCode::AudioDevice,
                    "the output device stopped requesting audio",
                ));
                return;
            }
            // the callback runs every few milliseconds
            thread::sleep(Duration::from_millis(1));
        }
    }

    /// The device is gone or broken: close it and keep the position for the next `play`.
    fn lose_output(&mut self, error: AppError) {
        log::error!("output lost: {error} ({:?})", error.details);
        let position = self.position_ms();
        self.set_playing(false);
        self.output = None;
        if let Some(track) = &mut self.track {
            track.restart_at.get_or_insert(position);
        }
        if self.status == PlaybackStatus::Playing {
            self.status = PlaybackStatus::Paused;
        }
        self.error = Some(error);
    }

    /// The track cannot be played any further.
    fn fail_track(&mut self, error: AppError) {
        log::error!("playback failed: {error} ({:?})", error.details);
        self.set_playing(false);
        self.status = PlaybackStatus::Stopped;
        self.track = None;
        self.flush();
        // a device lost during the flush is the less useful message
        self.error = Some(error);
    }

    /// Moves audio from the decoder to the queue. Returns `true` if there may be more to do
    /// right away.
    fn fill(&mut self) -> bool {
        let (Some(output), Some(track)) = (&mut self.output, &mut self.track) else {
            return false;
        };
        if track.restart_at.is_some() {
            return false;
        }
        match fill_queue(output, track) {
            Ok(Progress::Busy) => {
                self.shared.refilling.store(false, Ordering::Relaxed);
                true
            }
            Ok(Progress::QueueFull) => false,
            Ok(Progress::TrackQueued) => {
                self.shared.input_done.store(true, Ordering::Relaxed);
                false
            }
            Err(e) => {
                self.fail_track(e);
                false
            }
        }
    }

    /// At the end of the track: back to the start, stopped.
    fn finish_track_if_played(&mut self) {
        let (Some(output), Some(track)) = (&self.output, &mut self.track) else {
            return;
        };
        let played = self.status == PlaybackStatus::Playing
            && track.input_done
            && track.pending_left() == 0
            && output.queued() == 0;
        if played {
            log::info!("finished {}", track.loaded.path.display());
            track.restart_at = Some(0);
            self.set_playing(false);
            self.status = PlaybackStatus::Stopped;
            self.finished += 1;
        }
    }

    fn position_ms(&self) -> u64 {
        let (Some(track), Some(output)) = (&self.track, &self.output) else {
            return self.track.as_ref().and_then(|t| t.restart_at).unwrap_or(0);
        };
        if let Some(position) = track.restart_at {
            return position;
        }
        let played = self.shared.played_frames.load(Ordering::Acquire);
        let position = track.base_ms + played * 1000 / u64::from(output.format.sample_rate);
        track.duration_ms().map_or(position, |d| position.min(d))
    }

    /// Stores and reports the state if it changed; while playing at most every
    /// [`PUBLISH_INTERVAL`] for the position alone.
    fn publish(&mut self) {
        let state = PlayerState {
            status: self.status,
            track: self.track.as_ref().map(|t| t.loaded.clone()),
            position_ms: self.position_ms(),
            volume: self.volume,
            error: self.error.clone(),
            underruns: self.shared.underruns.load(Ordering::Relaxed),
            finished: self.finished,
        };
        if let Some((last, at)) = &self.published {
            if *last == state {
                return;
            }
            let only_position = PlayerState { position_ms: last.position_ms, ..state.clone() };
            if only_position == *last && at.elapsed() < PUBLISH_INTERVAL {
                return;
            }
        }
        *lock(&self.state) = state.clone();
        (self.on_state)(&state);
        self.published = Some((state, Instant::now()));
    }
}

enum Progress {
    /// Something was queued and there is room for more.
    Busy,
    QueueFull,
    /// The whole track is queued.
    TrackQueued,
}

fn fill_queue<S>(output: &mut Output<S>, track: &mut Track) -> AppResult<Progress> {
    let channels = usize::from(output.format.channels);
    loop {
        if track.pending_left() > 0 {
            let room = output.target.saturating_sub(output.queued()) / channels * channels;
            if room == 0 {
                return Ok(Progress::QueueFull);
            }
            let end = track.pending_pos + room.min(track.pending_left());
            let (_, rest) =
                output.producer.push_partial_slice(&track.pending[track.pending_pos..end]);
            track.pending_pos = end - rest.len();
            return Ok(Progress::Busy);
        }
        if track.input_done {
            return Ok(Progress::TrackQueued);
        }
        if !track.decode_next(output.format)? {
            track.input_done = true;
        }
    }
}

fn resampler_for(info: &TrackInfo, format: OutputFormat) -> AppResult<Option<StreamResampler>> {
    if info.sample_rate == format.sample_rate {
        return Ok(None);
    }
    StreamResampler::new(info.sample_rate, format.sample_rate, info.channels).map(Some)
}

/// Reads the start of a PCM file with a decoder of its own and looks for a DTS bit stream.
fn pcm_carries_dts(path: &Path) -> AppResult<bool> {
    let mut decoder = Decoder::open(path)?;
    let mut start = Vec::with_capacity(DTS_SCAN_SAMPLES);
    while start.len() < DTS_SCAN_SAMPLES {
        match decoder.next_chunk()? {
            Some(chunk) => start.extend_from_slice(chunk),
            None => break,
        }
    }
    Ok(is_dts_in_pcm(&start))
}
