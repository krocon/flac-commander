//! Plays a file through the playback engine, without the app.
//!
//! `cargo run -p fc-core --example play -- <file> [--seconds N] [--volume 0.0-1.0] [--seek MS]`
//!
//! The engine resamples to the rate of the default output device; the device is not switched.

use fc_core::audio::player::{DefaultOutput, PlaybackStatus, Player, PlayerState};
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::mpsc;
use std::time::{Duration, Instant};

struct Args {
    path: PathBuf,
    seconds: Option<u64>,
    volume: f32,
    seek_ms: Option<u64>,
}

fn parse_args() -> Option<Args> {
    let mut args = std::env::args().skip(1);
    let mut parsed = Args { path: PathBuf::new(), seconds: None, volume: 1.0, seek_ms: None };
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--seconds" => parsed.seconds = Some(args.next()?.parse().ok()?),
            "--volume" => parsed.volume = args.next()?.parse().ok()?,
            "--seek" => parsed.seek_ms = Some(args.next()?.parse().ok()?),
            _ => parsed.path = PathBuf::from(arg),
        }
    }
    (!parsed.path.as_os_str().is_empty()).then_some(parsed)
}

fn describe(state: &PlayerState) -> String {
    let track = state.track.as_ref().map_or_else(
        || "-".to_owned(),
        |t| {
            format!(
                "{} ({} / {}, {} Hz, {} ch)",
                t.file_name, t.info.container, t.info.codec, t.info.sample_rate, t.info.channels
            )
        },
    );
    format!(
        "{:?} {:>7} ms  underruns {}  {track}",
        state.status, state.position_ms, state.underruns
    )
}

fn main() -> ExitCode {
    let Some(args) = parse_args() else {
        eprintln!("usage: play <file> [--seconds N] [--volume 0.0-1.0] [--seek MS]");
        return ExitCode::from(2);
    };
    let (states_tx, states) = mpsc::channel::<PlayerState>();
    let player = match Player::spawn(DefaultOutput, move |state| {
        let _ = states_tx.send(state.clone());
    }) {
        Ok(player) => player,
        Err(e) => {
            eprintln!("ERROR {:?}: {}", e.code, e.message);
            return ExitCode::FAILURE;
        }
    };
    let commands = player
        .set_volume(args.volume)
        .and_then(|()| player.load(args.path.clone(), false))
        .and_then(|()| args.seek_ms.map_or(Ok(()), |ms| player.seek(ms)))
        .and_then(|()| player.play());
    if let Err(e) = commands {
        eprintln!("ERROR {:?}: {}", e.code, e.message);
        return ExitCode::FAILURE;
    }

    let started = Instant::now();
    let limit = args.seconds.map(Duration::from_secs);
    let mut was_playing = false;
    let mut last = PlayerState::default();
    loop {
        match states.recv_timeout(Duration::from_millis(100)) {
            Ok(state) => {
                println!("{}", describe(&state));
                if let Some(e) = &state.error {
                    eprintln!(
                        "ERROR {:?}: {} ({})",
                        e.code,
                        e.message,
                        e.details.clone().unwrap_or_default()
                    );
                    return ExitCode::FAILURE;
                }
                was_playing |= state.status == PlaybackStatus::Playing;
                if was_playing && state.status == PlaybackStatus::Stopped {
                    break;
                }
                last = state;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return ExitCode::FAILURE,
        }
        if limit.is_some_and(|l| started.elapsed() >= l) {
            break;
        }
    }
    println!(
        "played to {} ms in {:.2} s, underruns: {}",
        last.position_ms,
        started.elapsed().as_secs_f64(),
        last.underruns
    );
    ExitCode::SUCCESS
}
