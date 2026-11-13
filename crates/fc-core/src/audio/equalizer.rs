//! A ten-band graphic equalizer with a preamp, made of peaking biquad filters.
//!
//! It runs in the audio callback: no allocation, no locks, fixed-size state. The settings come
//! through atomics ([`EqControl`]); when they change, the callback recomputes its coefficients
//! (ten small formulas) and goes on.

use serde::{Deserialize, Serialize};
use std::f32::consts::TAU;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

pub const BANDS: usize = 10;
/// Centre frequencies in Hz: one band per octave, as on hi-fi equalizers.
pub const BAND_FREQUENCIES: [f32; BANDS] =
    [31.25, 62.5, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0];
/// Largest boost or cut of a band and of the preamp, in dB.
pub const MAX_GAIN_DB: f32 = 12.0;
/// One octave wide.
const Q: f32 = 1.414;
/// Channels the equalizer has state for; more are passed through unchanged.
const MAX_CHANNELS: usize = 8;

/// What the user sets. Mirrored by `EqualizerSettings` in `core/player/player.models.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EqSettings {
    pub enabled: bool,
    pub preamp_db: f32,
    pub gains_db: [f32; BANDS],
}

impl Default for EqSettings {
    fn default() -> Self {
        Self { enabled: false, preamp_db: 0.0, gains_db: [0.0; BANDS] }
    }
}

impl EqSettings {
    /// Brings every value into its range; anything that is not a number becomes 0 dB.
    pub fn sanitised(self) -> Self {
        let clamp =
            |db: f32| if db.is_finite() { db.clamp(-MAX_GAIN_DB, MAX_GAIN_DB) } else { 0.0 };
        Self {
            enabled: self.enabled,
            preamp_db: clamp(self.preamp_db),
            gains_db: self.gains_db.map(clamp),
        }
    }
}

/// A named setting to start from.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EqPreset {
    /// Stable id, also the key of the frontend's texts.
    pub id: &'static str,
    pub preamp_db: f32,
    pub gains_db: [f32; BANDS],
}

/// Our own presets; the preamp is lowered where bands are boosted, against clipping.
pub const PRESETS: &[EqPreset] = &[
    EqPreset { id: "flat", preamp_db: 0.0, gains_db: [0.0; BANDS] },
    EqPreset {
        id: "bass",
        preamp_db: -4.0,
        gains_db: [6.0, 5.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    },
    EqPreset {
        id: "treble",
        preamp_db: -4.0,
        gains_db: [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.0, 4.0, 5.0, 6.0],
    },
    EqPreset {
        id: "loudness",
        preamp_db: -5.0,
        gains_db: [6.0, 4.0, 2.0, 0.0, -1.0, -1.0, 0.0, 2.0, 4.0, 5.0],
    },
    EqPreset {
        id: "voice",
        preamp_db: -3.0,
        gains_db: [-4.0, -3.0, -1.0, 1.0, 3.0, 4.0, 3.0, 1.0, -1.0, -2.0],
    },
];

/// The settings as the audio callback reads them.
#[derive(Debug)]
pub struct EqControl {
    enabled: AtomicBool,
    preamp_db: AtomicU32,
    gains_db: [AtomicU32; BANDS],
    /// Incremented with every change.
    version: AtomicU64,
}

impl Default for EqControl {
    fn default() -> Self {
        let zero = || AtomicU32::new(0.0f32.to_bits());
        Self {
            enabled: AtomicBool::new(false),
            preamp_db: zero(),
            gains_db: std::array::from_fn(|_| zero()),
            version: AtomicU64::new(1),
        }
    }
}

impl EqControl {
    pub fn set(&self, settings: EqSettings) {
        let settings = settings.sanitised();
        self.enabled.store(settings.enabled, Ordering::Relaxed);
        self.preamp_db.store(settings.preamp_db.to_bits(), Ordering::Relaxed);
        for (slot, gain) in self.gains_db.iter().zip(settings.gains_db) {
            slot.store(gain.to_bits(), Ordering::Relaxed);
        }
        self.version.fetch_add(1, Ordering::Release);
    }

    fn read(&self) -> EqSettings {
        EqSettings {
            enabled: self.enabled.load(Ordering::Relaxed),
            preamp_db: f32::from_bits(self.preamp_db.load(Ordering::Relaxed)),
            gains_db: std::array::from_fn(|i| {
                f32::from_bits(self.gains_db[i].load(Ordering::Relaxed))
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Biquad {
    /// A peaking filter (Audio EQ Cookbook, R. Bristow-Johnson).
    fn peaking(frequency: f32, gain_db: f32, sample_rate: f32) -> Self {
        let a = 10f32.powf(gain_db / 40.0);
        let w0 = TAU * frequency / sample_rate;
        let alpha = w0.sin() / (2.0 * Q);
        let cos = w0.cos();
        let a0 = 1.0 + alpha / a;
        Self {
            b0: (1.0 + alpha * a) / a0,
            b1: -2.0 * cos / a0,
            b2: (1.0 - alpha * a) / a0,
            a1: -2.0 * cos / a0,
            a2: (1.0 - alpha / a) / a0,
        }
    }
}

/// The filter itself, owned by the audio callback.
#[derive(Debug)]
pub struct Equalizer {
    /// Version of the settings and sample rate the coefficients were computed for.
    version: u64,
    sample_rate: u32,
    enabled: bool,
    preamp: f32,
    /// The bands that do something, packed at the front.
    filters: [Biquad; BANDS],
    active: usize,
    /// Two delayed values per channel and band (transposed direct form II).
    state: [[[f32; 2]; BANDS]; MAX_CHANNELS],
}

impl Default for Equalizer {
    fn default() -> Self {
        Self {
            version: 0,
            sample_rate: 0,
            enabled: false,
            preamp: 1.0,
            filters: [Biquad::default(); BANDS],
            active: 0,
            state: [[[0.0; 2]; BANDS]; MAX_CHANNELS],
        }
    }
}

impl Equalizer {
    /// Filters interleaved `samples` in place.
    pub fn process(
        &mut self,
        samples: &mut [f32],
        channels: usize,
        sample_rate: u32,
        control: &EqControl,
    ) {
        let version = control.version.load(Ordering::Acquire);
        if version != self.version || sample_rate != self.sample_rate {
            self.configure(control.read(), sample_rate);
            self.version = version;
        }
        if !self.enabled || channels == 0 || channels > MAX_CHANNELS {
            return;
        }
        let filters = &self.filters[..self.active];
        for frame in samples.chunks_exact_mut(channels) {
            for (sample, state) in frame.iter_mut().zip(self.state.iter_mut()) {
                let mut x = *sample * self.preamp;
                for (f, z) in filters.iter().zip(state.iter_mut()) {
                    let y = f.b0 * x + z[0];
                    z[0] = f.b1 * x - f.a1 * y + z[1];
                    z[1] = f.b2 * x - f.a2 * y;
                    x = y;
                }
                *sample = x;
            }
        }
    }

    fn configure(&mut self, settings: EqSettings, sample_rate: u32) {
        let was_enabled = self.enabled;
        self.sample_rate = sample_rate;
        self.enabled = settings.enabled && sample_rate > 0;
        self.preamp = 10f32.powf(settings.preamp_db / 20.0);
        self.active = 0;
        let rate = sample_rate as f32;
        for (frequency, gain) in BAND_FREQUENCIES.iter().zip(settings.gains_db) {
            // a band at 0 dB does nothing; one near or above half the sample rate cannot exist
            if gain.abs() >= 0.05 && *frequency < rate * 0.45 {
                self.filters[self.active] = Biquad::peaking(*frequency, gain, rate);
                self.active += 1;
            }
        }
        if !was_enabled {
            // switched on: start from silence inside the filters, not from old audio
            self.state = [[[0.0; 2]; BANDS]; MAX_CHANNELS];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn sine(frequency: f32, frames: usize, channels: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let s = (TAU * frequency * i as f32 / RATE as f32).sin() * 0.25;
                std::iter::repeat_n(s, channels)
            })
            .collect()
    }

    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    }

    /// Level change in dB of a sine of `frequency` through the equalizer set to `settings`.
    fn response_db(settings: EqSettings, frequency: f32) -> f32 {
        let control = EqControl::default();
        control.set(settings);
        let mut eq = Equalizer::default();
        let input = sine(frequency, 48_000, 2);
        let mut output = input.clone();
        // in blocks, as a device asks for them
        for block in output.chunks_mut(512) {
            eq.process(block, 2, RATE, &control);
        }
        // skip the first tenth: the filters settle
        20.0 * (rms(&output[9_600..]) / rms(&input[9_600..])).log10()
    }

    fn with_band(band: usize, gain_db: f32) -> EqSettings {
        let mut settings = EqSettings { enabled: true, ..EqSettings::default() };
        settings.gains_db[band] = gain_db;
        settings
    }

    #[test]
    fn flat_or_switched_off_changes_nothing() {
        let control = EqControl::default();
        let mut eq = Equalizer::default();
        let input = sine(1000.0, 4800, 2);

        let mut output = input.clone();
        eq.process(&mut output, 2, RATE, &control);
        assert_eq!(output, input, "switched off");

        control.set(EqSettings { enabled: true, ..EqSettings::default() });
        eq.process(&mut output, 2, RATE, &control);
        assert_eq!(output, input, "enabled but flat");

        // settings without effect while it is off
        control.set(EqSettings { enabled: false, ..with_band(5, 12.0) });
        eq.process(&mut output, 2, RATE, &control);
        assert_eq!(output, input, "boost set, switched off");
    }

    #[test]
    fn a_band_raises_and_lowers_its_frequency_by_its_gain() {
        for (band, frequency) in BAND_FREQUENCIES.iter().enumerate().skip(1) {
            let boost = response_db(with_band(band, 9.0), *frequency);
            assert!((boost - 9.0).abs() < 0.3, "{frequency} Hz: +9 dB gives {boost:.2}");
            let cut = response_db(with_band(band, -9.0), *frequency);
            assert!((cut + 9.0).abs() < 0.3, "{frequency} Hz: −9 dB gives {cut:.2}");
        }
    }

    #[test]
    fn a_band_leaves_distant_frequencies_alone() {
        // 1 kHz boosted by 12 dB: three octaves away almost nothing happens
        let at_125 = response_db(with_band(5, 12.0), 125.0);
        let at_8k = response_db(with_band(5, 12.0), 8000.0);
        assert!(at_125.abs() < 0.6, "125 Hz moved by {at_125:.2} dB");
        assert!(at_8k.abs() < 0.6, "8 kHz moved by {at_8k:.2} dB");
        // one octave away: clearly less than at the centre
        let at_2k = response_db(with_band(5, 12.0), 2000.0);
        assert!((1.0..6.0).contains(&at_2k), "2 kHz moved by {at_2k:.2} dB");
    }

    #[test]
    fn the_preamp_scales_everything() {
        let settings = EqSettings { enabled: true, preamp_db: -6.0, ..EqSettings::default() };
        for frequency in [100.0, 1000.0, 10_000.0] {
            let change = response_db(settings, frequency);
            assert!((change + 6.0).abs() < 0.05, "{frequency} Hz: {change:.2} dB");
        }
    }

    #[test]
    fn channels_are_filtered_independently() {
        let control = EqControl::default();
        control.set(with_band(5, 12.0));
        let mut eq = Equalizer::default();
        // left: 1 kHz, right: silence
        let mut samples: Vec<f32> =
            sine(1000.0, 4800, 1).into_iter().flat_map(|s| [s, 0.0]).collect();
        eq.process(&mut samples, 2, RATE, &control);
        assert!(samples.chunks(2).all(|f| f[1] == 0.0), "the silent channel got sound");
        assert!(samples.chunks(2).any(|f| f[0].abs() > 0.3), "the boost is missing");
    }

    #[test]
    fn extreme_settings_stay_stable_and_finite() {
        let settings =
            EqSettings { enabled: true, preamp_db: 12.0, gains_db: [12.0; BANDS] }.sanitised();
        let control = EqControl::default();
        control.set(settings);
        let mut eq = Equalizer::default();
        let mut samples = sine(60.0, 96_000, 2);
        eq.process(&mut samples, 2, RATE, &control);
        assert!(samples.iter().all(|s| s.is_finite()));
        // after the input ends the filters ring out instead of oscillating
        let mut silence = vec![0.0f32; 96_000];
        eq.process(&mut silence, 2, RATE, &control);
        assert!(silence[90_000..].iter().all(|s| s.abs() < 1e-4));
    }

    #[test]
    fn bands_above_the_reach_of_a_low_sample_rate_are_left_out() {
        let control = EqControl::default();
        control.set(with_band(9, 12.0)); // 16 kHz
        let mut eq = Equalizer::default();
        let input: Vec<f32> = (0..2000).map(|i| ((i * 37) % 100) as f32 / 400.0 - 0.125).collect();
        let mut output = input.clone();
        eq.process(&mut output, 1, 22_050, &control);
        assert_eq!(output, input);
    }

    #[test]
    fn more_channels_than_it_has_state_for_pass_unchanged() {
        let control = EqControl::default();
        control.set(with_band(5, 12.0));
        let mut eq = Equalizer::default();
        let input = sine(1000.0, 100, 10);
        let mut output = input.clone();
        eq.process(&mut output, 10, RATE, &control);
        assert_eq!(output, input);
    }

    #[test]
    fn settings_are_clamped_and_cleaned() {
        let wild = EqSettings {
            enabled: true,
            preamp_db: 40.0,
            gains_db: [f32::NAN, -99.0, 99.0, 3.5, 0.0, 0.0, 0.0, 0.0, f32::INFINITY, -12.0],
        }
        .sanitised();
        assert_eq!(wild.preamp_db, 12.0);
        assert_eq!(wild.gains_db, [0.0, -12.0, 12.0, 3.5, 0.0, 0.0, 0.0, 0.0, 0.0, -12.0]);
    }

    #[test]
    fn presets_are_within_range_and_boosts_are_compensated() {
        let mut ids: Vec<&str> = PRESETS.iter().map(|p| p.id).collect();
        ids.dedup();
        assert_eq!(ids.len(), PRESETS.len());
        assert_eq!(PRESETS[0].id, "flat");
        for preset in PRESETS {
            let settings = EqSettings {
                enabled: true,
                preamp_db: preset.preamp_db,
                gains_db: preset.gains_db,
            };
            assert_eq!(settings.sanitised(), settings, "{}", preset.id);
            let highest = preset.gains_db.iter().fold(0.0f32, |m, g| m.max(*g));
            assert!(preset.preamp_db + highest <= 2.0, "{} can clip", preset.id);
        }
    }

    #[test]
    fn settings_serialise_as_the_frontend_expects() {
        let json = serde_json::to_value(with_band(0, 3.0)).unwrap();
        assert_eq!(json["enabled"], true);
        assert_eq!(json["preampDb"], 0.0);
        assert_eq!(json["gainsDb"][0], 3.0);
        assert_eq!(json["gainsDb"].as_array().unwrap().len(), BANDS);
        let partial: EqSettings = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert_eq!(partial, EqSettings { enabled: true, ..EqSettings::default() });
    }
}
