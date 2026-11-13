//! FLAC Commander – Tauri desktop shell.
//!
//! This crate is the thin layer between the Angular frontend and `fc-core`: commands
//! ([`commands`]) for requests with an answer, events ([`events`]) for state changes, logging and
//! the app lifecycle. Audio and application logic live in `fc-core`, which knows nothing of Tauri.

pub mod commands;
pub mod events;

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// State shared by the commands. It belongs to the process, not to a window: closing or
/// reloading a window does not touch it.
#[derive(Default)]
pub struct AppState {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(log_plugin())
        .manage(AppState::default())
        .setup(|app| {
            log_panics();
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
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("FLAC Commander could not start: {e}");
        std::process::exit(1);
    }
}
