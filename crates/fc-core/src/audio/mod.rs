//! Audio: formats, decoding (Symphonia) and output (CPAL).
//!
//! Phase 0/1 holds the validated building blocks – format table, decoder, output stream and the
//! test tone. The playback engine with its command queue (Phase 2) is built from them
//! (`docs/AUDIO-ENGINE.md`).

pub mod decode;
pub mod formats;
pub mod output;
pub mod tone;
