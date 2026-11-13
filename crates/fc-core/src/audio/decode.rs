//! Decoding audio files to interleaved `f32` samples with Symphonia.
//!
//! A [`Decoder`] is used from a worker thread, never from the audio callback: it reads files and
//! allocates. The buffer it hands out is reused between calls.

use crate::audio::formats::extension_of;
use crate::error::{AppError, AppResult, ErrorCode};
use serde::Serialize;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use symphonia::core::codecs::audio::{AudioDecoder, AudioDecoderOptions};
use symphonia::core::errors::{Error as SymphoniaError, SeekErrorKind};
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::units::{Time, TimeBase};

/// Technical properties of the audio track of a file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    /// Short name of the container (`flac`, `ogg`, `isomp4` …).
    pub container: String,
    /// Short name of the codec (`flac`, `mp3`, `aac` …).
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u16,
    /// Bit depth of the source, where the format has one (lossless formats).
    pub bits_per_sample: Option<u32>,
    /// Length as declared by the container; `None` if it does not say.
    pub duration_ms: Option<u64>,
}

pub struct Decoder {
    path: PathBuf,
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    time_base: Option<TimeBase>,
    info: TrackInfo,
    buf: Vec<f32>,
    skipped_packets: u64,
    /// Set by a seek behind the end; cleared by the next seek.
    at_end: bool,
    /// Frames still to drop after a seek that landed before the requested position.
    skip_frames: u64,
}

impl Decoder {
    /// Opens `path` and prepares its default audio track.
    pub fn open(path: &Path) -> AppResult<Self> {
        let file = File::open(path).map_err(|e| AppError::from_io(&e, path))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if let Some(ext) = extension_of(path) {
            hint.with_extension(&ext);
        }
        let format = symphonia::default::get_probe()
            .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
            .map_err(|e| open_error(&e, path, "no known audio container"))?;

        let track = format.default_track(TrackType::Audio).ok_or_else(|| {
            AppError::new(
                ErrorCode::UnsupportedFormat,
                format!("{}: no audio track", path.display()),
            )
        })?;
        let params = track.codec_params.as_ref().and_then(|p| p.audio()).ok_or_else(|| {
            AppError::new(
                ErrorCode::UnsupportedFormat,
                format!("{}: audio track without codec parameters", path.display()),
            )
        })?;
        let decoder = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
            .map_err(|e| open_error(&e, path, "no decoder for the codec of this file"))?;

        let sample_rate = params.sample_rate.filter(|r| *r > 0);
        let channels = params.channels.as_ref().map(|c| c.count()).filter(|c| *c > 0);
        let (Some(sample_rate), Some(channels)) = (sample_rate, channels) else {
            return Err(AppError::new(
                ErrorCode::DecodeFailed,
                format!("{}: sample rate or channel layout not declared", path.display()),
            ));
        };
        let channels = u16::try_from(channels).map_err(|_| {
            AppError::new(
                ErrorCode::UnsupportedFormat,
                format!("{}: {channels} channels", path.display()),
            )
        })?;

        let duration_ms = track
            .time_base
            .zip(track.duration)
            .and_then(|(tb, d)| tb.calc_duration(d))
            .and_then(|t| u64::try_from(t.as_millis()).ok())
            .or_else(|| track.num_frames.map(|n| n.saturating_mul(1000) / u64::from(sample_rate)));

        let info = TrackInfo {
            container: format.format_info().short_name.to_owned(),
            codec: decoder.codec_info().short_name.to_owned(),
            sample_rate,
            channels,
            bits_per_sample: params.bits_per_sample,
            duration_ms,
        };
        let track_id = track.id;
        let time_base = track.time_base;
        Ok(Self {
            path: path.to_owned(),
            format,
            decoder,
            track_id,
            time_base,
            info,
            buf: Vec::new(),
            skipped_packets: 0,
            at_end: false,
            skip_frames: 0,
        })
    }

    pub fn info(&self) -> &TrackInfo {
        &self.info
    }

    /// Packets that could not be decoded and were left out so far.
    pub fn skipped_packets(&self) -> u64 {
        self.skipped_packets
    }

    /// Decodes the next packet: interleaved samples (`frames × channels`), or `None` at the end.
    ///
    /// A single damaged packet is skipped (a click instead of an aborted track); a file that ends
    /// in the middle or cannot be read is an error.
    pub fn next_chunk(&mut self) -> AppResult<Option<&[f32]>> {
        if self.at_end {
            return Ok(None);
        }
        loop {
            let packet = match self.format.next_packet() {
                Ok(Some(packet)) => packet,
                Ok(None) => return Ok(None),
                Err(e) => return Err(self.stream_error(&e)),
            };
            if packet.track_id != self.track_id {
                continue;
            }
            match self.decoder.decode(&packet) {
                Ok(audio) => {
                    let frames = audio.frames() as u64;
                    let skip = self.skip_frames.min(frames);
                    self.skip_frames -= skip;
                    if skip == frames {
                        continue;
                    }
                    audio.copy_to_vec_interleaved(&mut self.buf);
                    let start = skip as usize * usize::from(self.info.channels);
                    return Ok(Some(&self.buf[start..]));
                }
                Err(SymphoniaError::DecodeError(reason)) => {
                    self.skipped_packets += 1;
                    log::warn!("{}: skipped a damaged packet: {reason}", self.path.display());
                }
                Err(e) => return Err(self.stream_error(&e)),
            }
        }
    }

    /// Continues decoding at `position_ms`, exact to the frame: formats that can only address
    /// packets are positioned before it and the frames in between are dropped.
    ///
    /// A position at or behind the end is not an error: the next [`Self::next_chunk`] reports
    /// the end of the track.
    pub fn seek(&mut self, position_ms: u64) -> AppResult<()> {
        self.at_end = false;
        self.skip_frames = 0;
        if self.info.duration_ms.is_some_and(|d| position_ms >= d) {
            self.at_end = true;
            return Ok(());
        }
        // Always from a freshly opened stream, and only forwards: after a seek backwards the
        // FLAC reader of Symphonia 0.6.1 delivers one packet from the new position and then
        // continues at the old one (docs/RISKS.md R15; `seeking_is_exact…` in tests/formats.rs).
        let fresh = Self::open(&self.path)?;
        self.format = fresh.format;
        self.decoder = fresh.decoder;
        self.track_id = fresh.track_id;
        self.time_base = fresh.time_base;
        if position_ms == 0 {
            return Ok(());
        }
        let rate = i128::from(self.info.sample_rate);
        let target_frame = i128::from(position_ms) * rate / 1000;
        let time = Time::try_from_secs_f64(position_ms as f64 / 1000.0).ok_or_else(|| {
            AppError::internal(format!("seek position {position_ms} ms is out of range"))
        })?;
        let to = SeekTo::Time { time, track_id: Some(self.track_id) };
        match self.format.seek(SeekMode::Accurate, to) {
            Ok(seeked) => {
                self.decoder.reset();
                // where decoding really continues, in frames (negative inside an encoder delay)
                let actual_frame = self
                    .time_base
                    .and_then(|tb| tb.calc_time(seeked.actual_ts))
                    .map(|t| (t.as_nanos() * rate + 500_000_000).div_euclid(1_000_000_000));
                self.skip_frames = actual_frame
                    .map_or(0, |f| u64::try_from((target_frame - f).max(0)).unwrap_or(0));
                Ok(())
            }
            Err(SymphoniaError::SeekError(SeekErrorKind::OutOfRange)) => {
                self.at_end = true;
                Ok(())
            }
            Err(SymphoniaError::IoError(io)) if io.kind() == io::ErrorKind::UnexpectedEof => {
                self.at_end = true;
                Ok(())
            }
            Err(SymphoniaError::SeekError(kind)) => Err(AppError::new(
                ErrorCode::DecodeFailed,
                format!("{}: cannot seek", self.path.display()),
            )
            .with_details(format!("{kind:?}"))),
            Err(e) => Err(self.stream_error(&e)),
        }
    }

    fn stream_error(&self, e: &SymphoniaError) -> AppError {
        let path = self.path.display();
        match e {
            SymphoniaError::IoError(io) if io.kind() == io::ErrorKind::UnexpectedEof => {
                AppError::new(ErrorCode::DecodeFailed, format!("{path}: file ends unexpectedly"))
            }
            SymphoniaError::IoError(io) => AppError::from_io(io, &self.path),
            other => AppError::new(ErrorCode::DecodeFailed, format!("{path}: cannot be decoded"))
                .with_details(other.to_string()),
        }
    }
}

/// Reads the technical properties of `path` without decoding it.
pub fn probe_file(path: &Path) -> AppResult<TrackInfo> {
    Decoder::open(path).map(|d| d.info)
}

fn open_error(e: &SymphoniaError, path: &Path, unsupported: &str) -> AppError {
    let shown = path.display();
    match e {
        SymphoniaError::Unsupported(_) => {
            AppError::new(ErrorCode::UnsupportedFormat, format!("{shown}: {unsupported}"))
                .with_details(e.to_string())
        }
        SymphoniaError::IoError(io) if io.kind() != io::ErrorKind::UnexpectedEof => {
            AppError::from_io(io, path)
        }
        _ => AppError::new(ErrorCode::DecodeFailed, format!("{shown}: cannot be opened as audio"))
            .with_details(e.to_string()),
    }
}
