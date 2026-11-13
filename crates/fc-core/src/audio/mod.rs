//! Audio: formats, decoding (Symphonia) and output (CPAL).
//!
//! [`player`] is the playback engine: a thread with a command queue that decodes, resamples and
//! feeds the real-time callback through a lock-free ring buffer (`docs/AUDIO-ENGINE.md`).

pub mod decode;
pub mod dts;
pub mod formats;
pub mod output;
pub mod player;
pub mod resample;
pub mod tone;
