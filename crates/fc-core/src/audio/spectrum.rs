//! The spectrum a visualizer shows: a handful of levels per frequency band, a few times per
//! second. This is all the audio that ever crosses to a window – never samples.

use realfft::num_complex::Complex;
use realfft::{RealFftPlanner, RealToComplex};
use std::f32::consts::TAU;
use std::sync::Arc;

/// Samples per analysis: 43 ms at 48 kHz, 23 Hz per bin. Below about 200 Hz that is coarser
/// than the bands: neighbouring low bands move together.
pub const WINDOW: usize = 2048;
/// Bands of the result, spaced evenly in pitch.
pub const BANDS: usize = 24;
const LOWEST_HZ: f32 = 40.0;
const HIGHEST_HZ: f32 = 16_000.0;
/// A band at this level or below shows as 0, one at full scale as 1.
const FLOOR_DB: f32 = -70.0;

pub struct SpectrumAnalyzer {
    fft: Arc<dyn RealToComplex<f32>>,
    /// Hann window, against the smearing of a cut-off block.
    window: Vec<f32>,
    input: Vec<f32>,
    output: Vec<Complex<f32>>,
}

impl Default for SpectrumAnalyzer {
    fn default() -> Self {
        let fft = RealFftPlanner::<f32>::new().plan_fft_forward(WINDOW);
        let window =
            (0..WINDOW).map(|i| 0.5 - 0.5 * (TAU * i as f32 / WINDOW as f32).cos()).collect();
        Self { input: fft.make_input_vec(), output: fft.make_output_vec(), fft, window }
    }
}

impl SpectrumAnalyzer {
    /// The levels of [`BANDS`] bands in `0.0..=1.0` for the last [`WINDOW`] mono `samples` at
    /// `sample_rate`. Fewer samples, or a rate that makes no sense, give silence.
    pub fn bands(&mut self, samples: &[f32], sample_rate: u32) -> [f32; BANDS] {
        let mut bands = [0.0; BANDS];
        if samples.len() < WINDOW || sample_rate == 0 {
            return bands;
        }
        let recent = &samples[samples.len() - WINDOW..];
        for ((slot, sample), weight) in self.input.iter_mut().zip(recent).zip(&self.window) {
            *slot = sample * weight;
        }
        if self.fft.process(&mut self.input, &mut self.output).is_err() {
            return bands;
        }
        // a full-scale sine gives a magnitude of WINDOW / 4 through the Hann window
        let full_scale = WINDOW as f32 / 4.0;
        let bin_hz = sample_rate as f32 / WINDOW as f32;
        let last_bin = self.output.len() - 1;
        for (index, band) in bands.iter_mut().enumerate() {
            let (from, to) = band_range(index);
            // the bins whose centre lies in the band; a band narrower than a bin (the lowest
            // ones) takes the bin nearest to it
            let first = ((from / bin_hz).round() as usize).clamp(1, last_bin);
            let last = ((to / bin_hz).round() as usize).saturating_sub(1).clamp(first, last_bin);
            let peak = self.output[first..=last].iter().map(|c| c.norm()).fold(0.0f32, f32::max);
            let db = 20.0 * (peak / full_scale).max(1e-9).log10();
            *band = ((db - FLOOR_DB) / -FLOOR_DB).clamp(0.0, 1.0);
        }
        bands
    }
}

/// Lower and upper edge of band `index` in Hz.
pub fn band_range(index: usize) -> (f32, f32) {
    let octaves = (HIGHEST_HZ / LOWEST_HZ).log2();
    let edge = |i: usize| LOWEST_HZ * 2f32.powf(octaves * i as f32 / BANDS as f32);
    (edge(index), edge(index + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn sine(frequency: f32, amplitude: f32, samples: usize) -> Vec<f32> {
        (0..samples).map(|i| (TAU * frequency * i as f32 / RATE as f32).sin() * amplitude).collect()
    }

    fn band_of(frequency: f32) -> usize {
        (0..BANDS).find(|i| band_range(*i).1 > frequency).unwrap()
    }

    fn loudest(bands: &[f32; BANDS]) -> usize {
        (0..BANDS).max_by(|a, b| bands[*a].total_cmp(&bands[*b])).unwrap()
    }

    #[test]
    fn bands_cover_40_hz_to_16_khz_without_gaps() {
        assert!((band_range(0).0 - 40.0).abs() < 0.01);
        assert!((band_range(BANDS - 1).1 - 16_000.0).abs() < 1.0);
        for i in 1..BANDS {
            assert_eq!(band_range(i).0, band_range(i - 1).1);
        }
    }

    #[test]
    fn a_tone_shows_in_its_band() {
        let mut analyzer = SpectrumAnalyzer::default();
        for frequency in [60.0, 440.0, 1000.0, 5000.0, 12_000.0] {
            let bands = analyzer.bands(&sine(frequency, 0.5, WINDOW), RATE);
            // at the low end a band is narrower than what 43 ms of audio can tell apart
            let tolerance = if frequency < 200.0 { 2 } else { 0 };
            let distance = loudest(&bands).abs_diff(band_of(frequency));
            assert!(distance <= tolerance, "{frequency} Hz: {bands:?}");
            // far from the tone there is (almost) nothing
            let far = (band_of(frequency) + BANDS / 2) % BANDS;
            assert!(bands[far] < 0.2, "{frequency} Hz leaks into band {far}: {}", bands[far]);
        }
    }

    #[test]
    fn the_level_follows_the_loudness() {
        let mut analyzer = SpectrumAnalyzer::default();
        let band = band_of(1000.0);
        let full = analyzer.bands(&sine(1000.0, 1.0, WINDOW), RATE)[band];
        let quiet = analyzer.bands(&sine(1000.0, 0.01, WINDOW), RATE)[band];
        assert!(full > 0.95, "full scale shows as {full}");
        // −40 dB of 70 dB range: 3/7 of the way up
        assert!((quiet - 0.43).abs() < 0.05, "−40 dB shows as {quiet}");
    }

    #[test]
    fn silence_and_too_little_audio_show_nothing() {
        let mut analyzer = SpectrumAnalyzer::default();
        assert_eq!(analyzer.bands(&vec![0.0; WINDOW], RATE), [0.0; BANDS]);
        assert_eq!(analyzer.bands(&sine(1000.0, 1.0, WINDOW - 1), RATE), [0.0; BANDS]);
        assert_eq!(analyzer.bands(&[], RATE), [0.0; BANDS]);
        assert_eq!(analyzer.bands(&sine(1000.0, 1.0, WINDOW), 0), [0.0; BANDS]);
    }

    #[test]
    fn only_the_most_recent_samples_count() {
        let mut analyzer = SpectrumAnalyzer::default();
        let mut samples = sine(200.0, 1.0, WINDOW);
        samples.extend(sine(4000.0, 0.5, WINDOW));
        assert_eq!(loudest(&analyzer.bands(&samples, RATE)), band_of(4000.0));
    }

    #[test]
    fn values_stay_in_range_for_anything() {
        let mut analyzer = SpectrumAnalyzer::default();
        let loud: Vec<f32> = (0..WINDOW).map(|i| if i % 2 == 0 { 40.0 } else { -40.0 }).collect();
        for rate in [8_000, 44_100, 192_000] {
            let bands = analyzer.bands(&loud, rate);
            assert!(bands.iter().all(|b| (0.0..=1.0).contains(b)), "{rate}: {bands:?}");
        }
    }
}
