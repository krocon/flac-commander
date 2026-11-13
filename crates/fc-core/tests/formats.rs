//! Format support, proven on real files: every fixture is a 1 s, 440 Hz sine at 1/8 amplitude
//! (`scripts/make-fixtures.sh`). A format counts as supported only if it passes here.

// test helpers outside `#[test]` functions may panic as well
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use fc_core::ErrorCode;
use fc_core::audio::decode::{Decoder, probe_file};
use fc_core::audio::formats::{AUDIO_FORMATS, FormatSupport};
use std::path::PathBuf;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

struct Decoded {
    frames: usize,
    rms: f32,
    peak: f32,
}

fn decode_all(name: &str) -> Decoded {
    let mut decoder = Decoder::open(&fixture(name)).unwrap();
    let channels = usize::from(decoder.info().channels);
    let (mut samples, mut sum, mut peak) = (0usize, 0.0f64, 0.0f32);
    while let Some(chunk) = decoder.next_chunk().unwrap() {
        assert_eq!(chunk.len() % channels, 0, "{name}: chunk is not whole frames");
        samples += chunk.len();
        for s in chunk {
            sum += f64::from(*s) * f64::from(*s);
            peak = peak.max(s.abs());
        }
    }
    assert_eq!(decoder.skipped_packets(), 0, "{name}");
    Decoded { frames: samples / channels, rms: (sum / samples as f64).sqrt() as f32, peak }
}

/// Sine at 1/8 amplitude: RMS = 0.125 / √2. ffmpeg's mono → stereo upmix lowers each channel
/// by 3 dB, so the stereo fixtures are at 0.0625.
fn sine_rms(channels: u16) -> f32 {
    if channels == 1 { 0.0884 } else { 0.0625 }
}

fn assert_sine(name: &str, codec: &str, rate: u32, channels: u16, lossless: bool) {
    let info = probe_file(&fixture(name)).unwrap();
    assert_eq!(info.codec, codec, "{name}");
    assert_eq!(info.sample_rate, rate, "{name}");
    assert_eq!(info.channels, channels, "{name}");
    let duration = info.duration_ms.unwrap_or_else(|| panic!("{name}: no duration"));
    assert!((950..=1100).contains(&duration), "{name}: duration {duration} ms");

    let decoded = decode_all(name);
    let rate = rate as usize;
    if lossless {
        assert_eq!(decoded.frames, rate, "{name}");
    } else {
        // lossy codecs add encoder delay and padding
        let frames = decoded.frames;
        assert!(frames >= rate && frames < rate + rate / 8, "{name}: {frames}");
    }
    let tolerance = if lossless { 0.001 } else { 0.006 };
    assert!((decoded.rms - sine_rms(channels)).abs() < tolerance, "{name}: rms {}", decoded.rms);
    assert!(decoded.peak < 0.2, "{name}: peak {}", decoded.peak);
}

#[test]
fn flac() {
    assert_sine("sine.flac", "flac", 44_100, 2, true);
    assert_eq!(probe_file(&fixture("sine.flac")).unwrap().bits_per_sample, Some(16));
}

#[test]
fn flac_24_bit_96_khz_mono() {
    assert_sine("sine-96k-24bit-mono.flac", "flac", 96_000, 1, true);
    assert_eq!(probe_file(&fixture("sine-96k-24bit-mono.flac")).unwrap().bits_per_sample, Some(24));
}

#[test]
fn wav() {
    assert_sine("sine.wav", "pcm_s16le", 44_100, 2, true);
}

#[test]
fn aiff() {
    assert_sine("sine.aiff", "pcm_s16be", 44_100, 2, true);
}

#[test]
fn alac_in_m4a() {
    assert_sine("sine-alac.m4a", "alac", 44_100, 2, true);
}

#[test]
fn mp3() {
    assert_sine("sine.mp3", "mp3", 44_100, 2, false);
}

#[test]
fn ogg_vorbis() {
    assert_sine("sine.ogg", "vorbis", 44_100, 2, false);
}

#[test]
fn aac_in_m4a() {
    assert_sine("sine.m4a", "aac", 44_100, 2, false);
}

/// Frames from `position_ms` to the end, after a seek from the middle of the track.
fn frames_after_seek(name: &str, position_ms: u64) -> usize {
    let mut decoder = Decoder::open(&fixture(name)).unwrap();
    let channels = usize::from(decoder.info().channels);
    for _ in 0..3 {
        decoder.next_chunk().unwrap();
    }
    decoder.seek(position_ms).unwrap();
    let mut frames = 0;
    while let Some(chunk) = decoder.next_chunk().unwrap() {
        frames += chunk.len() / channels;
    }
    frames
}

#[test]
fn seeking_is_exact_to_the_frame_in_lossless_formats() {
    for name in ["sine.flac", "sine.wav", "sine.aiff", "sine-alac.m4a"] {
        assert_eq!(frames_after_seek(name, 0), 44_100, "{name}: back to the start");
        assert_eq!(frames_after_seek(name, 250), 33_075, "{name}: 250 ms");
        assert_eq!(frames_after_seek(name, 999), 45, "{name}: 999 ms");
    }
}

#[test]
fn seeking_lossy_formats_lands_within_a_few_milliseconds() {
    for name in ["sine.mp3", "sine.ogg", "sine.m4a"] {
        let all = frames_after_seek(name, 0);
        assert!((44_100..44_100 + 5_513).contains(&all), "{name}: {all} frames from the start");
        let rest = frames_after_seek(name, 500);
        let expected = all - 22_050;
        assert!(
            rest.abs_diff(expected) <= 2_400,
            "{name}: {rest} frames after 500 ms, expected {expected}"
        );
    }
}

#[test]
fn seeking_to_or_behind_the_end_ends_the_track() {
    for name in ["sine.flac", "sine.mp3", "sine.ogg", "sine.m4a", "sine.wav"] {
        let duration = probe_file(&fixture(name)).unwrap().duration_ms.unwrap();
        assert_eq!(frames_after_seek(name, duration), 0, "{name}: at the end");
        assert_eq!(frames_after_seek(name, 60_000), 0, "{name}: far behind the end");
    }
}

/// The reason `Decoder::seek` reopens the stream: seeking backwards and forwards, in any order,
/// must give the same audio as seeking from a fresh decoder.
#[test]
fn seeking_back_and_forth_always_lands_where_asked() {
    for name in ["sine.flac", "sine.wav", "sine.aiff", "sine-alac.m4a"] {
        let mut decoder = Decoder::open(&fixture(name)).unwrap();
        for position_ms in [900u64, 100, 500, 0, 990, 10] {
            decoder.seek(position_ms).unwrap();
            let mut frames = 0;
            while let Some(chunk) = decoder.next_chunk().unwrap() {
                frames += chunk.len() / 2;
            }
            let expected = 44_100 - (position_ms * 441 / 10) as usize;
            assert_eq!(frames, expected, "{name}: after seeking to {position_ms} ms");
        }
    }
}

/// Symphonia 0.6.1 has no Opus decoder: the file is recognised and refused with a clear code.
/// When this test fails because Opus decodes, move the format to `Supported`.
#[test]
fn opus_is_refused_as_unsupported() {
    let err = probe_file(&fixture("sine.opus")).unwrap_err();
    assert_eq!(err.code, ErrorCode::UnsupportedFormat, "{err:?}");
    let opus = AUDIO_FORMATS.iter().find(|f| f.id == "opus").unwrap();
    assert_eq!(opus.support, FormatSupport::Unsupported);
}

#[test]
fn every_supported_format_has_a_fixture_that_opens() {
    for format in AUDIO_FORMATS.iter().filter(|f| f.support == FormatSupport::Supported) {
        let name = match format.id {
            "alac" => "sine-alac.m4a".to_owned(),
            "vorbis" => "sine.ogg".to_owned(),
            "aac" => "sine.m4a".to_owned(),
            id => format!("sine.{id}"),
        };
        probe_file(&fixture(&name)).unwrap_or_else(|e| panic!("{}: {e:?}", format.id));
    }
}

#[test]
fn missing_file_is_not_found() {
    let err = probe_file(&fixture("does-not-exist.flac")).unwrap_err();
    assert_eq!(err.code, ErrorCode::NotFound);
}

#[test]
fn text_named_like_audio_is_refused_without_a_panic() {
    let err = probe_file(&fixture("garbage.mp3")).unwrap_err();
    assert!(matches!(err.code, ErrorCode::UnsupportedFormat | ErrorCode::DecodeFailed), "{err:?}");
}

/// Cut off inside the audio frames: what is there is decoded, then the track ends – with an
/// error or silently, but never with a panic or with invented audio.
#[test]
fn a_file_cut_off_in_the_middle_gives_its_audio_and_stops() {
    let mut decoder = Decoder::open(&fixture("truncated.flac")).unwrap();
    let mut frames = 0usize;
    let end = loop {
        match decoder.next_chunk() {
            Ok(Some(chunk)) => frames += chunk.len() / 2,
            Ok(None) => break None,
            Err(e) => break Some(e),
        }
    };
    assert!(frames > 0 && frames < 44_100, "decoded {frames} frames of a truncated file");
    if let Some(e) = end {
        assert_eq!(e.code, ErrorCode::DecodeFailed, "{e:?}");
    }
}

#[test]
fn a_folder_is_an_error_not_a_panic() {
    let err = probe_file(&PathBuf::from(env!("CARGO_MANIFEST_DIR"))).unwrap_err();
    assert!(!err.message.is_empty());
}
