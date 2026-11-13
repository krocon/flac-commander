//! Phase 0 spike: plays a file through the default output device.
//!
//! `cargo run -p fc-core --example play -- <file> [--seconds N] [--gain 0.0-1.0]`
//!
//! It proves the chain the playback engine (Phase 2) is built on: a decoder thread (here: main)
//! fills a lock-free ring buffer, the real-time callback only copies from it. Deliberately
//! missing: resampling, seeking, pause, a command queue (`docs/AUDIO-ENGINE.md`).

use fc_core::audio::decode::Decoder;
use fc_core::audio::output::{open_default_output, remap_channels};
use fc_core::{AppError, AppResult, ErrorCode};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

struct Args {
    path: PathBuf,
    seconds: Option<u64>,
    gain: f32,
}

fn parse_args() -> Option<Args> {
    let mut args = std::env::args().skip(1);
    let mut parsed = Args { path: PathBuf::new(), seconds: None, gain: 1.0 };
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--seconds" => parsed.seconds = Some(args.next()?.parse().ok()?),
            "--gain" => parsed.gain = args.next()?.parse::<f32>().ok()?.clamp(0.0, 1.0),
            _ => parsed.path = PathBuf::from(arg),
        }
    }
    (!parsed.path.as_os_str().is_empty()).then_some(parsed)
}

#[derive(Default)]
struct Counters {
    played_frames: AtomicU64,
    underrun_callbacks: AtomicU64,
    /// Set by the decoder side once everything is in the ring buffer.
    input_done: AtomicBool,
}

fn play(args: &Args) -> AppResult<()> {
    let mut decoder = Decoder::open(&args.path)?;
    let info = decoder.info().clone();
    println!(
        "{}: {} / {}, {} Hz, {} ch, {} ms",
        args.path.display(),
        info.container,
        info.codec,
        info.sample_rate,
        info.channels,
        info.duration_ms.map_or_else(|| "?".to_owned(), |d| d.to_string()),
    );

    // Half a second of headroom for the largest format we expect (8 channels, 192 kHz).
    let (mut producer, mut consumer) = rtrb::RingBuffer::<f32>::new(192_000 * 8 / 2);
    let counters = Arc::new(Counters::default());
    let (error_tx, error_rx) = mpsc::sync_channel::<AppError>(4);
    let gain = args.gain;

    let callback_counters = counters.clone();
    let stream = open_default_output(
        Some(info.sample_rate),
        move |out, format| {
            let (filled, missing) = consumer.pop_partial_slice(out);
            for sample in filled.iter_mut() {
                *sample *= gain;
            }
            let frames = filled.len() / usize::from(format.channels);
            callback_counters.played_frames.fetch_add(frames as u64, Ordering::Relaxed);
            if !missing.is_empty() {
                missing.fill(0.0);
                if !callback_counters.input_done.load(Ordering::Relaxed) {
                    callback_counters.underrun_callbacks.fetch_add(1, Ordering::Relaxed);
                }
            }
        },
        move |e| {
            let _ = error_tx.try_send(e);
        },
    )?;
    let out = stream.format();
    println!("output: {} Hz, {} ch", out.sample_rate, out.channels);
    if out.sample_rate != info.sample_rate {
        return Err(AppError::new(
            ErrorCode::AudioDevice,
            format!(
                "the device runs at {} Hz and does not offer {} Hz; resampling comes with Phase 2",
                out.sample_rate, info.sample_rate
            ),
        ));
    }

    let started = Instant::now();
    let limit_frames = args.seconds.map(|s| s * u64::from(info.sample_rate));
    let mut queued_frames = 0u64;
    let mut mapped = Vec::new();
    'decode: while let Some(chunk) = decoder.next_chunk()? {
        mapped.clear();
        remap_channels(chunk, usize::from(info.channels), usize::from(out.channels), &mut mapped);
        let mut rest = mapped.as_slice();
        while !rest.is_empty() {
            if let Ok(e) = error_rx.try_recv() {
                return Err(e);
            }
            let (_, remaining) = producer.push_partial_slice(rest);
            if remaining.len() == rest.len() {
                // ring buffer full: the callback is the clock, wait for it to make room
                std::thread::sleep(Duration::from_millis(5));
            }
            rest = remaining;
        }
        queued_frames += (mapped.len() / usize::from(out.channels)) as u64;
        if limit_frames.is_some_and(|limit| queued_frames >= limit) {
            break 'decode;
        }
    }
    counters.input_done.store(true, Ordering::Relaxed);

    // Wait for the callback to play what is queued; give up if the device stops asking.
    let mut last = (counters.played_frames.load(Ordering::Relaxed), Instant::now());
    loop {
        let played = counters.played_frames.load(Ordering::Relaxed);
        if played >= queued_frames {
            break;
        }
        if let Ok(e) = error_rx.try_recv() {
            return Err(e);
        }
        if played != last.0 {
            last = (played, Instant::now());
        } else if last.1.elapsed() > Duration::from_secs(3) {
            return Err(AppError::new(
                ErrorCode::AudioDevice,
                "the device stopped requesting audio",
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    // let the device play its own buffer before the stream closes
    std::thread::sleep(Duration::from_millis(300));

    println!(
        "played {} frames ({:.2} s of audio) in {:.2} s, underrun callbacks: {}, skipped packets: {}",
        queued_frames,
        queued_frames as f64 / f64::from(info.sample_rate),
        started.elapsed().as_secs_f64(),
        counters.underrun_callbacks.load(Ordering::Relaxed),
        decoder.skipped_packets(),
    );
    Ok(())
}

fn main() -> ExitCode {
    let Some(args) = parse_args() else {
        eprintln!("usage: play <file> [--seconds N] [--gain 0.0-1.0]");
        return ExitCode::from(2);
    };
    match play(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("ERROR {:?}: {} ({})", e.code, e.message, e.details.unwrap_or_default());
            ExitCode::FAILURE
        }
    }
}
