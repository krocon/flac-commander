//! Audio output with CPAL: device list, default format and an output stream that pulls `f32`.
//!
//! The render callback runs on the real-time thread of the audio backend. It must not block,
//! lock, allocate or do I/O (`docs/AUDIO-ENGINE.md`).

use crate::error::{AppError, AppResult, ErrorCode};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{
    FromSample, SampleFormat, SizedSample, StreamConfig, SupportedStreamConfig,
    SupportedStreamConfigRange,
};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevice {
    /// Stable id of the device on this host (CPAL `DeviceId`).
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// The format a stream runs with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

/// What the system offers for output right now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputStatus {
    /// Audio backend in use (`CoreAudio`, `WASAPI`, `ALSA` …).
    pub host: String,
    pub devices: Vec<OutputDevice>,
    /// Format of the default device; `None` if there is no usable device.
    pub default_format: Option<OutputFormat>,
}

/// Lists the output devices. A system without any device gives an empty list, not an error.
pub fn output_status() -> AppResult<OutputStatus> {
    let host = cpal::default_host();
    let default = host.default_output_device();
    let default_id = default.as_ref().and_then(|d| d.id().ok()).map(|id| id.to_string());
    let devices = match host.output_devices() {
        Ok(devices) => devices
            .filter_map(|d| {
                let id = d.id().ok()?.to_string();
                let name = d
                    .description()
                    .map(|desc| desc.name().to_owned())
                    .unwrap_or_else(|_| id.clone());
                let is_default = default_id.as_deref() == Some(id.as_str());
                Some(OutputDevice { id, name, is_default })
            })
            .collect(),
        Err(e) => {
            log::warn!("output devices cannot be listed: {e}");
            Vec::new()
        }
    };
    let default_format = default
        .and_then(|d| d.default_output_config().ok())
        .map(|c| OutputFormat { sample_rate: c.sample_rate(), channels: c.channels() });
    Ok(OutputStatus { host: host.id().name().to_owned(), devices, default_format })
}

/// A running output stream. Dropping it stops the output. Not `Send` on every platform:
/// it lives on the thread that opened it.
pub struct OutputStream {
    _stream: cpal::Stream,
    format: OutputFormat,
}

impl OutputStream {
    pub fn format(&self) -> OutputFormat {
        self.format
    }
}

/// Opens the default output device and starts pulling audio from `render`.
///
/// `render(out, format)` fills `out` with interleaved samples (`frames × format.channels`) in
/// `-1.0..=1.0`. `preferred_rate` is used if the device offers it, else its default rate – the
/// caller reads the result from [`OutputStream::format`].
pub fn open_default_output<R, E>(
    preferred_rate: Option<u32>,
    render: R,
    mut on_error: E,
) -> AppResult<OutputStream>
where
    R: FnMut(&mut [f32], OutputFormat) + Send + 'static,
    E: FnMut(AppError) + Send + 'static,
{
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| AppError::new(ErrorCode::NoOutputDevice, "no audio output device"))?;
    let default = device.default_output_config().map_err(|e| device_error("output format", &e))?;
    let ranges: Vec<_> = match device.supported_output_configs() {
        Ok(ranges) => ranges.collect(),
        Err(e) => {
            log::warn!("supported output formats unknown, using the default: {e}");
            Vec::new()
        }
    };
    let chosen = choose_config(default, &ranges, preferred_rate);
    let format = OutputFormat { sample_rate: chosen.sample_rate(), channels: chosen.channels() };
    let sample_format = chosen.sample_format();
    let config = chosen.config();
    let on_error = move |e: cpal::Error| on_error(device_error("output stream", &e));

    let stream = match sample_format {
        SampleFormat::F32 => build::<f32, _, _>(&device, config, format, render, on_error),
        SampleFormat::F64 => build::<f64, _, _>(&device, config, format, render, on_error),
        SampleFormat::I16 => build::<i16, _, _>(&device, config, format, render, on_error),
        SampleFormat::I32 => build::<i32, _, _>(&device, config, format, render, on_error),
        SampleFormat::I8 => build::<i8, _, _>(&device, config, format, render, on_error),
        SampleFormat::U16 => build::<u16, _, _>(&device, config, format, render, on_error),
        SampleFormat::U8 => build::<u8, _, _>(&device, config, format, render, on_error),
        other => {
            return Err(AppError::new(
                ErrorCode::AudioDevice,
                format!("output sample format {other} is not supported"),
            ));
        }
    }
    .map_err(|e| device_error("open output", &e))?;
    stream.play().map_err(|e| device_error("start output", &e))?;
    log::info!(
        "output open: {} Hz, {} channels, {sample_format}",
        format.sample_rate,
        format.channels
    );
    Ok(OutputStream { _stream: stream, format })
}

/// The device's default format, at `preferred_rate` if a range with the same channel count
/// (and, if possible, the same sample format) offers it.
fn choose_config(
    default: SupportedStreamConfig,
    ranges: &[SupportedStreamConfigRange],
    preferred_rate: Option<u32>,
) -> SupportedStreamConfig {
    let Some(rate) = preferred_rate.filter(|r| *r != default.sample_rate()) else {
        return default;
    };
    let mut candidates: Vec<_> = ranges
        .iter()
        .filter(|r| r.channels() == default.channels())
        .filter_map(|r| r.try_with_sample_rate(rate))
        .collect();
    // same sample format as the default first
    candidates.sort_by_key(|c| c.sample_format() != default.sample_format());
    candidates.into_iter().next().unwrap_or(default)
}

fn build<T, R, E>(
    device: &cpal::Device,
    config: StreamConfig,
    format: OutputFormat,
    mut render: R,
    on_error: E,
) -> Result<cpal::Stream, cpal::Error>
where
    T: SizedSample + FromSample<f32>,
    R: FnMut(&mut [f32], OutputFormat) + Send + 'static,
    E: FnMut(cpal::Error) + Send + 'static,
{
    // Allocated here, outside the callback. Backends ask for far less than one second per call;
    // should one ever ask for more, the buffer grows once.
    let mut scratch = vec![0.0f32; format.sample_rate as usize * usize::from(format.channels)];
    device.build_output_stream(
        config,
        move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
            if scratch.len() < data.len() {
                scratch.resize(data.len(), 0.0);
            }
            let block = &mut scratch[..data.len()];
            render(block, format);
            for (out, sample) in data.iter_mut().zip(block.iter()) {
                *out = T::from_sample(sample.clamp(-1.0, 1.0));
            }
        },
        on_error,
        None,
    )
}

fn device_error(what: &str, e: &cpal::Error) -> AppError {
    let code = match e.kind() {
        cpal::ErrorKind::DeviceNotAvailable => ErrorCode::NoOutputDevice,
        _ => ErrorCode::AudioDevice,
    };
    AppError::new(code, format!("{what} failed")).with_details(e.to_string())
}

/// Maps interleaved `src` frames to `dst_channels`: mono is copied to every channel, otherwise
/// channels are matched by index and missing ones stay silent. Appends to `dst`.
pub fn remap_channels(src: &[f32], src_channels: usize, dst_channels: usize, dst: &mut Vec<f32>) {
    if src_channels == 0 || dst_channels == 0 {
        return;
    }
    if src_channels == dst_channels {
        dst.extend_from_slice(src);
        return;
    }
    for frame in src.chunks_exact(src_channels) {
        if src_channels == 1 {
            dst.extend(std::iter::repeat_n(frame[0], dst_channels));
        } else {
            dst.extend((0..dst_channels).map(|c| frame.get(c).copied().unwrap_or(0.0)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpal::SupportedBufferSize;

    fn range(
        channels: u16,
        min: u32,
        max: u32,
        format: SampleFormat,
    ) -> SupportedStreamConfigRange {
        SupportedStreamConfigRange::new(channels, min, max, SupportedBufferSize::Unknown, format)
    }

    fn default_config() -> SupportedStreamConfig {
        range(2, 48_000, 48_000, SampleFormat::F32).with_sample_rate(48_000)
    }

    #[test]
    fn keeps_the_default_without_a_preference_or_a_match() {
        let ranges = [range(2, 48_000, 48_000, SampleFormat::F32)];
        assert_eq!(choose_config(default_config(), &ranges, None).sample_rate(), 48_000);
        assert_eq!(choose_config(default_config(), &ranges, Some(48_000)).sample_rate(), 48_000);
        assert_eq!(choose_config(default_config(), &ranges, Some(44_100)).sample_rate(), 48_000);
        assert_eq!(choose_config(default_config(), &[], Some(44_100)).sample_rate(), 48_000);
    }

    #[test]
    fn takes_the_preferred_rate_with_the_default_channels_and_format() {
        let ranges = [
            range(6, 44_100, 96_000, SampleFormat::F32),
            range(2, 44_100, 96_000, SampleFormat::I16),
            range(2, 44_100, 96_000, SampleFormat::F32),
        ];
        let chosen = choose_config(default_config(), &ranges, Some(44_100));
        assert_eq!(chosen.sample_rate(), 44_100);
        assert_eq!(chosen.channels(), 2);
        assert_eq!(chosen.sample_format(), SampleFormat::F32);
    }

    #[test]
    fn another_sample_format_is_better_than_the_wrong_rate() {
        let ranges = [range(2, 44_100, 44_100, SampleFormat::I16)];
        let chosen = choose_config(default_config(), &ranges, Some(44_100));
        assert_eq!(chosen.sample_rate(), 44_100);
        assert_eq!(chosen.sample_format(), SampleFormat::I16);
    }

    #[test]
    fn remaps_mono_stereo_and_surround() {
        let mut out = Vec::new();
        remap_channels(&[0.1, 0.2], 1, 2, &mut out);
        assert_eq!(out, [0.1, 0.1, 0.2, 0.2]);

        out.clear();
        remap_channels(&[0.1, 0.2, 0.3, 0.4], 2, 2, &mut out);
        assert_eq!(out, [0.1, 0.2, 0.3, 0.4]);

        out.clear();
        remap_channels(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0], 6, 2, &mut out);
        assert_eq!(out, [1.0, 2.0]);

        out.clear();
        remap_channels(&[0.5, -0.5], 2, 4, &mut out);
        assert_eq!(out, [0.5, -0.5, 0.0, 0.0]);

        out.clear();
        remap_channels(&[0.5], 0, 2, &mut out);
        remap_channels(&[0.5], 1, 0, &mut out);
        assert!(out.is_empty());
    }
}
