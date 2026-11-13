//! FLAC Commander – Tauri desktop shell.
//!
//! This crate is the thin layer between the Angular frontend and `fc-core`: commands
//! ([`commands`]) for requests with an answer, events ([`events`]) for state changes, logging and
//! the app lifecycle. Audio and application logic live in `fc-core`, which knows nothing of Tauri.

pub mod commands;
pub mod events;

use fc_core::audio::player::{DefaultOutput, Player};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tauri::{Emitter, Manager};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// State shared by the commands. It belongs to the process, not to a window: closing or
/// reloading a window does not touch it – the player keeps playing.
pub struct AppState {
    /// The one playback engine of the app.
    pub player: Player,
    /// True while a test tone plays.
    pub tone_busy: Arc<AtomicBool>,
}

const LOG_FILE: &str = "flac-commander";
const MAX_LOG_FILE_BYTES: u128 = 2_000_000;

fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let level =
        if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info };
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::LogDir { file_name: Some(LOG_FILE.to_owned()) }))
        .level(level)
        .max_file_size(MAX_LOG_FILE_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(3))
        .build()
}

/// A panic on any thread ends up in the log file, not only on a console nobody sees.
fn log_panics() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        default_hook(info);
    }));
}

/// What the command line asks for. Unknown options and files that do not exist are ignored:
/// the app starts anyway.
#[derive(Debug, Default, PartialEq)]
struct StartOptions {
    /// The first argument that names an existing file.
    file: Option<std::path::PathBuf>,
    /// `--volume <0.0-1.0>`
    volume: Option<f32>,
}

impl StartOptions {
    fn parse(args: impl Iterator<Item = std::ffi::OsString>) -> Self {
        let mut options = Self::default();
        let mut args = args.peekable();
        while let Some(arg) = args.next() {
            if arg == "--volume" {
                options.volume = args
                    .next()
                    .and_then(|v| v.to_str().and_then(|v| v.parse::<f32>().ok()))
                    .filter(|v| v.is_finite());
            } else if options.file.is_none() {
                let path = std::path::PathBuf::from(arg);
                if path.is_file() {
                    options.file = Some(path);
                }
            }
        }
        options
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(log_plugin())
        // used from Rust only: the webview gets no dialog permission
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            log_panics();
            let handle = app.handle().clone();
            // every window hears every state: that keeps several windows in step
            let player = Player::spawn(DefaultOutput, move |state| {
                if let Err(e) = handle.emit(events::PLAYER_STATE, state) {
                    log::error!("event {} could not be sent: {e}", events::PLAYER_STATE);
                }
            })?;
            // `flac-commander [--volume 0.0-1.0] <file>`: how a file manager opens a file
            let start = StartOptions::parse(std::env::args_os().skip(1));
            if let Some(volume) = start.volume {
                player.set_volume(volume)?;
            }
            if let Some(path) = start.file {
                log::info!("open {} (command line)", path.display());
                player.load(path, true)?;
            }
            app.manage(AppState { player, tone_busy: Arc::default() });
            let package = app.package_info();
            log::info!(
                "{} {} started on {} {}",
                package.name,
                package.version,
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::system_info,
            commands::system::start_test_tone,
            commands::player::player_state,
            commands::player::player_open,
            commands::player::player_play,
            commands::player::player_pause,
            commands::player::player_stop,
            commands::player::player_seek,
            commands::player::player_set_volume,
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("FLAC Commander could not start: {e}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn parse(args: &[&str]) -> StartOptions {
        StartOptions::parse(args.iter().map(OsString::from))
    }

    #[test]
    fn the_first_existing_file_on_the_command_line_is_opened() {
        let this_file = concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs");
        let options =
            parse(&["--flag", "/no/such/file.flac", env!("CARGO_MANIFEST_DIR"), this_file]);
        assert_eq!(options.file, Some(std::path::PathBuf::from(this_file)));
        assert_eq!(options.volume, None);
        assert_eq!(parse(&[]), StartOptions::default());
        assert_eq!(parse(&["--help"]), StartOptions::default());
    }

    #[test]
    fn the_start_volume_is_read_and_nonsense_is_ignored() {
        let this_file = concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs");
        let options = parse(&["--volume", "0.25", this_file]);
        assert_eq!(options.volume, Some(0.25));
        assert!(options.file.is_some());
        assert_eq!(parse(&["--volume", "loud"]).volume, None);
        assert_eq!(parse(&["--volume", "NaN"]).volume, None);
        assert_eq!(parse(&["--volume"]).volume, None);
    }
}
