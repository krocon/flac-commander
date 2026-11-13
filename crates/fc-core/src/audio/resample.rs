//! Sample rate conversion of a stream of interleaved `f32` frames (rubato, FFT based).
//!
//! The player resamples every track to the rate of the output device instead of switching the
//! device (which on macOS changes it for the whole system, `docs/RISKS.md` R2).

use crate::error::{AppError, AppResult};
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Indexing, Resampler};

/// Input frames per processing step.
const CHUNK_FRAMES: usize = 1024;

pub struct StreamResampler {
    inner: Fft<f32>,
    channels: usize,
    /// Input not yet processed (less than one chunk), interleaved.
    input: Vec<f32>,
    /// Reused output of one processing step.
    scratch: Vec<f32>,
    /// Leading output frames still to drop: the filter's start-up delay.
    skip_frames: usize,
    /// Frames taken and frames given since the start or the last reset.
    frames_in: u64,
    frames_out: u64,
}

impl StreamResampler {
    pub fn new(from_rate: u32, to_rate: u32, channels: u16) -> AppResult<Self> {
        let channels = usize::from(channels);
        let inner = Fft::<f32>::new(
            from_rate as usize,
            to_rate as usize,
            CHUNK_FRAMES,
            channels,
            FixedSync::Input,
        )
        .map_err(|e| {
            AppError::internal(format!("no resampler for {from_rate} Hz → {to_rate} Hz"))
                .with_details(e.to_string())
        })?;
        let scratch = vec![0.0; inner.output_frames_max() * channels];
        let skip_frames = inner.output_delay();
        Ok(Self {
            inner,
            channels,
            input: Vec::new(),
            scratch,
            skip_frames,
            frames_in: 0,
            frames_out: 0,
        })
    }

    /// Takes interleaved `input` frames and appends what is ready to `out`.
    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) -> AppResult<()> {
        self.input.extend_from_slice(input);
        self.frames_in += (input.len() / self.channels) as u64;
        let mut consumed = 0;
        loop {
            let needed = self.inner.input_frames_next() * self.channels;
            if self.input.len() - consumed < needed {
                break;
            }
            self.step(consumed, needed / self.channels, None, out)?;
            consumed += needed;
        }
        self.input.drain(..consumed);
        Ok(())
    }

    /// The end of the stream: processes the rest and what the filter still holds back, so that
    /// the stream comes out with exactly its length at the new rate.
    pub fn finish(&mut self, out: &mut Vec<f32>) -> AppResult<()> {
        let expected = (self.frames_in as f64 * self.inner.resample_ratio()).ceil() as u64;
        let mut partial = Some(self.input.len() / self.channels);
        // silence pushes the remaining frames out of the filter
        while self.frames_out < expected {
            let frames = self.inner.input_frames_next();
            self.input.resize(frames * self.channels, 0.0);
            self.step(0, frames, partial.take(), out)?;
            self.input.clear();
        }
        let surplus = (self.frames_out - expected) as usize * self.channels;
        out.truncate(out.len().saturating_sub(surplus));
        self.frames_out = expected;
        Ok(())
    }

    /// Forgets everything in flight (after a seek).
    pub fn reset(&mut self) {
        self.inner.reset();
        self.input.clear();
        self.skip_frames = self.inner.output_delay();
        self.frames_in = 0;
        self.frames_out = 0;
    }

    fn step(
        &mut self,
        offset: usize,
        frames: usize,
        partial_frames: Option<usize>,
        out: &mut Vec<f32>,
    ) -> AppResult<()> {
        let failed = |what: &str, details: String| {
            AppError::internal(format!("resampling failed: {what}")).with_details(details)
        };
        let input = &self.input[offset..offset + frames * self.channels];
        let input = InterleavedSlice::new(input, self.channels, frames)
            .map_err(|e| failed("input buffer", e.to_string()))?;
        let capacity = self.scratch.len() / self.channels;
        let mut output = InterleavedSlice::new_mut(&mut self.scratch, self.channels, capacity)
            .map_err(|e| failed("output buffer", e.to_string()))?;
        let indexing = partial_frames.map(|n| Indexing::new().partial_len(n));
        let (_, produced) = self
            .inner
            .process_into_buffer(&input, &mut output, indexing.as_ref())
            .map_err(|e| failed("process", e.to_string()))?;

        let skip = self.skip_frames.min(produced);
        self.skip_frames -= skip;
        self.frames_out += (produced - skip) as u64;
        out.extend_from_slice(&self.scratch[skip * self.channels..produced * self.channels]);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::TAU;

    fn sine(rate: u32, frames: usize, channels: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let s = (TAU * 440.0 * i as f32 / rate as f32).sin() * 0.5;
                std::iter::repeat_n(s, channels)
            })
            .collect()
    }

    /// Feeds `input` in blocks of `block` samples, like a decoder would.
    fn resample(from: u32, to: u32, channels: u16, input: &[f32], block: usize) -> Vec<f32> {
        let mut r = StreamResampler::new(from, to, channels).unwrap();
        let mut out = Vec::new();
        for chunk in input.chunks(block) {
            r.process(chunk, &mut out).unwrap();
        }
        r.finish(&mut out).unwrap();
        out
    }

    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    }

    /// Upward zero crossings of channel 0 = the frequency of a sine, per second of audio.
    fn frequency(samples: &[f32], channels: usize, rate: u32) -> f32 {
        let mono: Vec<f32> = samples.chunks(channels).map(|f| f[0]).collect();
        let crossings = mono.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count();
        crossings as f32 * rate as f32 / mono.len() as f32
    }

    #[test]
    fn keeps_length_level_and_pitch_from_44100_to_48000() {
        let out = resample(44_100, 48_000, 2, &sine(44_100, 44_100, 2), 4608);
        let frames = out.len() / 2;
        assert!((frames as i64 - 48_000).abs() <= 2, "{frames} frames");
        // without the first and last milliseconds (filter edges)
        let middle = &out[2_000..out.len() - 2_000];
        assert!((rms(middle) - 0.3536).abs() < 0.003, "rms {}", rms(middle));
        assert!((frequency(middle, 2, 48_000) - 440.0).abs() < 2.0);
    }

    #[test]
    fn downsamples_96000_mono_to_48000() {
        let out = resample(96_000, 48_000, 1, &sine(96_000, 96_000, 1), 4096);
        assert!((out.len() as i64 - 48_000).abs() <= 2, "{} frames", out.len());
        let middle = &out[1_000..out.len() - 1_000];
        assert!((rms(middle) - 0.3536).abs() < 0.003);
        assert!((frequency(middle, 1, 48_000) - 440.0).abs() < 2.0);
    }

    #[test]
    fn starts_without_the_filter_delay() {
        // a step: the output must rise at its very beginning, not after the filter's delay
        let input = vec![0.5f32; 44_100];
        let out = resample(44_100, 48_000, 1, &input, 1000);
        let first_loud = out.iter().position(|s| *s > 0.25).unwrap();
        assert!(first_loud < 8, "first loud sample at {first_loud}");
    }

    #[test]
    fn the_block_size_of_the_input_does_not_change_the_result() {
        let input = sine(44_100, 10_000, 2);
        let a = resample(44_100, 48_000, 2, &input, 2 * 37);
        let b = resample(44_100, 48_000, 2, &input, 2 * 5000);
        assert_eq!(a.len(), b.len());
        assert!(a.iter().zip(&b).all(|(x, y)| (x - y).abs() < 1e-6));
    }

    #[test]
    fn a_very_short_stream_still_comes_out() {
        let out = resample(44_100, 48_000, 2, &sine(44_100, 100, 2), 64);
        let frames = out.len() / 2;
        assert!((frames as i64 - 109).abs() <= 2, "{frames} frames");
    }

    #[test]
    fn reset_starts_a_new_stream() {
        let mut r = StreamResampler::new(44_100, 48_000, 1).unwrap();
        let mut out = Vec::new();
        r.process(&vec![0.9; 5000], &mut out).unwrap();
        r.reset();
        out.clear();
        r.process(&vec![0.0; 44_100], &mut out).unwrap();
        r.finish(&mut out).unwrap();
        // nothing of the loud audio before the reset leaks into the new stream
        assert!(out.iter().all(|s| s.abs() < 1e-4));
        assert!((out.len() as i64 - 48_000).abs() <= 2);
    }
}
