//! The test tone: a short sine on the default output, to check the way to the loudspeaker
//! without any file (settings, diagnostics, manual tests on a new platform).

use crate::audio::output::{self, OutputStream};
use crate::error::{AppError, AppResult, ErrorCode};
use std::f32::consts::TAU;
use std::sync::mpsc::{Receiver, RecvTimeoutError, sync_channel};
use std::time::Duration;

pub const TONE_FREQUENCY_HZ: f32 = 440.0;
pub const TONE_DURATION_MS: u32 = 700;
/// Quiet on purpose: the user did not choose the volume.
const AMPLITUDE: f32 = 0.2;
const FADE_MS: u32 = 15;
/// Silence rendered after the tone so the device has played its buffer before the stream closes.
const TAIL_MS: u32 = 250;

/// Renders a faded sine followed by silence. No allocation, usable in the audio callback.
#[derive(Debug, Clone)]
pub struct Tone {
    channels: usize,
    phase: f32,
    step: f32,
    frame: u64,
    tone_frames: u64,
    fade_frames: u64,
    total_frames: u64,
}

impl Tone {
    pub fn new(frequency_hz: f32, duration_ms: u32, sample_rate: u32, channels: u16) -> Self {
        let frames = |ms: u32| u64::from(ms) * u64::from(sample_rate) / 1000;
        let tone_frames = frames(duration_ms);
        Self {
            channels: usize::from(channels.max(1)),
            phase: 0.0,
            step: TAU * frequency_hz / sample_rate.max(1) as f32,
            frame: 0,
            tone_frames,
            fade_frames: frames(FADE_MS).min(tone_frames / 2),
            total_frames: tone_frames + frames(TAIL_MS),
        }
    }

    /// Fills `out` (interleaved); returns `true` once tone and tail are completely rendered.
    pub fn render(&mut self, out: &mut [f32]) -> bool {
        for frame in out.chunks_mut(self.channels) {
            let sample = if self.frame < self.tone_frames {
                let value = self.phase.sin() * AMPLITUDE * self.gain();
                self.phase = (self.phase + self.step) % TAU;
                value
            } else {
                0.0
            };
            frame.fill(sample);
            self.frame = self.frame.saturating_add(1);
        }
        self.frame >= self.total_frames
    }

    /// Linear fade in and out against clicks.
    fn gain(&self) -> f32 {
        if self.fade_frames == 0 {
            return 1.0;
        }
        let from_end = self.tone_frames - self.frame;
        let edge = self.frame.min(from_end).min(self.fade_frames);
        edge as f32 / self.fade_frames as f32
    }
}

/// A test tone that is playing. The stream is bound to the thread that started it.
pub struct TestTone {
    _stream: OutputStream,
    done: Receiver<AppResult<()>>,
}

/// Opens the default output and starts the tone. Returns as soon as the stream runs.
pub fn start_test_tone() -> AppResult<TestTone> {
    let (tx, done) = sync_channel::<AppResult<()>>(2);
    let err_tx = tx.clone();
    let mut tone: Option<Tone> = None;
    let mut reported = false;
    let stream = output::open_default_output(
        None,
        move |out, format| {
            let tone = tone.get_or_insert_with(|| {
                Tone::new(TONE_FREQUENCY_HZ, TONE_DURATION_MS, format.sample_rate, format.channels)
            });
            if tone.render(out) && !reported {
                reported = true;
                // bounded channel: no allocation here; a full channel means an error came first
                let _ = tx.try_send(Ok(()));
            }
        },
        move |e| {
            let _ = err_tx.try_send(Err(e));
        },
    )?;
    Ok(TestTone { _stream: stream, done })
}

impl TestTone {
    /// Blocks until the tone has been played, the device failed, or nothing happened for too long.
    pub fn wait(self) -> AppResult<()> {
        let limit = Duration::from_millis(u64::from(TONE_DURATION_MS + TAIL_MS) + 5_000);
        match self.done.recv_timeout(limit) {
            Ok(result) => result,
            Err(RecvTimeoutError::Timeout) => Err(AppError::new(
                ErrorCode::AudioDevice,
                "the output device did not request audio in time",
            )),
            Err(RecvTimeoutError::Disconnected) => {
                Err(AppError::internal("test tone stream ended without a result"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render_all(mut tone: Tone, channels: usize, block: usize) -> Vec<f32> {
        let mut all = Vec::new();
        let mut buf = vec![0.0; block * channels];
        for _ in 0..10_000 {
            let done = tone.render(&mut buf);
            all.extend_from_slice(&buf);
            if done {
                return all;
            }
        }
        panic!("tone never finished");
    }

    #[test]
    fn renders_tone_then_silence_and_finishes() {
        let samples = render_all(Tone::new(440.0, 100, 48_000, 2), 2, 256);
        let tone_samples = 4_800 * 2;
        let peak = samples[..tone_samples].iter().fold(0.0f32, |m, s| m.max(s.abs()));
        assert!((peak - AMPLITUDE).abs() < 0.01, "peak {peak}");
        // after the tone: silence only, at least the tail
        let tail = &samples[tone_samples..];
        assert!(tail.len() >= 12_000 * 2);
        assert!(tail.iter().all(|s| *s == 0.0));
    }

    #[test]
    fn starts_and_ends_at_zero_without_a_click() {
        let samples = render_all(Tone::new(440.0, 100, 48_000, 1), 1, 512);
        assert_eq!(samples[0], 0.0);
        assert!(samples[1].abs() < 0.001);
        assert!(samples[4_799].abs() < 0.001);
        let max_step = samples.windows(2).map(|w| (w[1] - w[0]).abs()).fold(0.0f32, f32::max);
        // a 440 Hz sine at 0.2 moves at most 2π·440/48000·0.2 ≈ 0.0115 per sample
        assert!(max_step < 0.015, "step {max_step}");
    }

    #[test]
    fn all_channels_carry_the_same_signal() {
        let samples = render_all(Tone::new(440.0, 50, 44_100, 6), 6, 100);
        for frame in samples.chunks(6) {
            assert!(frame.iter().all(|s| *s == frame[0]));
        }
    }

    #[test]
    fn degenerate_parameters_do_not_panic() {
        assert!(Tone::new(440.0, 0, 44_100, 0).render(&mut [0.0; 3]) || true);
        let mut zero_rate = Tone::new(440.0, 10, 0, 2);
        assert!(zero_rate.render(&mut [0.0; 8]));
    }
}
