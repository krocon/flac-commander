//! FLAC Commander – Tauri desktop shell.
//!
//! This crate is the thin layer between the Angular frontend and `fc-core`: commands
//! ([`commands`]) for requests with an answer, events ([`events`]) for state changes, logging and
//! the app lifecycle. Audio and application logic live in `fc-core`, which knows nothing of Tauri.

pub mod commands;
pub mod events;

use fc_core::audio::player::DefaultOutput;
use fc_core::session::{PlayAdded, Session, SessionConfig};
use fc_core::skins::SkinLibrary;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{DragDropEvent, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

/// State shared by the commands. It belongs to the process, not to a window: closing or
/// reloading a window does not touch it – the player keeps playing.
pub struct AppState {
    /// Player and playlist: the one playback session of the app.
    pub session: Session,
    /// Built-in and imported skins.
    pub skins: Arc<Mutex<SkinLibrary>>,
    /// True while a test tone plays.
    pub tone_busy: Arc<AtomicBool>,
}

const LOG_FILE: &str = "flac-commander";
/// Saved session (volume, playlist …) in the app's config folder.
const STATE_FILE: &str = "state.json";
const MAX_LOG_FILE_BYTES: u128 = 2_000_000;

fn log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let level =
        if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info };
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::LogDir { file_name: Some(LOG_FILE.to_owned()) }))
        .level(level)
        // the libraries report every probe and every estimated duration: only their problems
        .level_for("symphonia_core", log::LevelFilter::Warn)
        .level_for("symphonia_metadata", log::LevelFilter::Warn)
        .level_for("symphonia_bundle_mp3", log::LevelFilter::Warn)
        .level_for("symphonia_bundle_flac", log::LevelFilter::Warn)
        .level_for("symphonia_format_isomp4", log::LevelFilter::Warn)
        .level_for("symphonia_format_ogg", log::LevelFilter::Warn)
        .level_for("symphonia_format_riff", log::LevelFilter::Warn)
        .level_for("lofty", log::LevelFilter::Error)
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

/// What the command line asks for. Unknown options and paths that do not exist are ignored:
/// the app starts anyway.
#[derive(Debug, Default, PartialEq)]
struct StartOptions {
    /// Existing files and folders, in the order given.
    paths: Vec<std::path::PathBuf>,
    /// `--volume <0.0-1.0>`
    volume: Option<f32>,
}

impl StartOptions {
    fn parse(args: impl Iterator<Item = std::ffi::OsString>) -> Self {
        let mut options = Self::default();
        let mut args = args;
        while let Some(arg) = args.next() {
            if arg == "--volume" {
                options.volume = args
                    .next()
                    .and_then(|v| v.to_str().and_then(|v| v.parse::<f32>().ok()))
                    .filter(|v| v.is_finite());
            } else {
                let path = std::path::PathBuf::from(arg);
                if path.exists() {
                    options.paths.push(path);
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
        // pictures of validated skins; the handler knows nothing but those
        .register_uri_scheme_protocol("skin", |context, request| {
            match context.app_handle().try_state::<AppState>() {
                Some(state) => commands::skins::serve(&state.skins, &request),
                None => tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::SERVICE_UNAVAILABLE)
                    .body(Vec::new())
                    .unwrap_or_default(),
            }
        })
        .setup(|app| {
            log_panics();
            let player_events = app.handle().clone();
            let playlist_events = app.handle().clone();
            let state_file = match app.path().app_config_dir() {
                Ok(folder) => Some(folder.join(STATE_FILE)),
                Err(e) => {
                    log::warn!("no config folder, nothing will be saved: {e}");
                    None
                }
            };
            let shuffle_seed = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(1, |d| d.as_nanos() as u64);
            // every window hears every state: that keeps several windows in step
            let session = Session::start(
                DefaultOutput,
                SessionConfig { state_file, shuffle_seed },
                move |state| {
                    if let Err(e) = player_events.emit(events::PLAYER_STATE, state) {
                        log::error!("event {} could not be sent: {e}", events::PLAYER_STATE);
                    }
                },
                move |playlist| {
                    if let Err(e) = playlist_events.emit(events::PLAYLIST_STATE, playlist) {
                        log::error!("event {} could not be sent: {e}", events::PLAYLIST_STATE);
                    }
                },
            )?;
            // `flac-commander [--volume 0.0-1.0] <file or folder>…`: how a file manager opens files
            let start = StartOptions::parse(std::env::args_os().skip(1));
            if let Some(volume) = start.volume {
                session.player().set_volume(volume)?;
            }
            if !start.paths.is_empty() {
                let added = session.add_paths(&start.paths, PlayAdded::Always);
                log::info!("command line: {} path(s), {added} track(s) added", start.paths.len());
            }
            let skins_folder = match app.path().app_data_dir() {
                Ok(folder) => Some(folder.join("skins")),
                Err(e) => {
                    log::warn!("no data folder, skins cannot be imported: {e}");
                    None
                }
            };
            let version = app.package_info().version.to_string();
            let skins = Arc::new(Mutex::new(SkinLibrary::load(skins_folder, &version)));
            let state = AppState { session, skins, tone_busy: Arc::default() };
            // the window of a fixed-size skin has its size before it shows anything
            if let (Ok(skin), Some(window)) =
                (commands::skins::active_skin(&state), app.get_webview_window("main"))
            {
                commands::skins::fit_window(&window, &skin);
            }
            app.manage(state);
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
            commands::player::player_play,
            commands::player::player_pause,
            commands::player::player_stop,
            commands::player::player_seek,
            commands::player::player_set_volume,
            commands::playlist::playlist_state,
            commands::playlist::playlist_open,
            commands::playlist::playlist_play,
            commands::playlist::playlist_next,
            commands::playlist::playlist_previous,
            commands::playlist::playlist_remove,
            commands::playlist::playlist_clear,
            commands::playlist::playlist_set_repeat,
            commands::playlist::playlist_set_shuffle,
            commands::skins::skins_list,
            commands::skins::skins_active,
            commands::skins::skins_activate,
            commands::skins::skins_import,
            commands::skins::skins_remove,
            commands::skins::skins_fit_viewport,
        ])
        .on_window_event(|window, event| {
            // files and folders dropped onto a window: Rust takes the paths, not the webview
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                let Some(state) = window.try_state::<AppState>() else {
                    return;
                };
                let session = state.session.clone();
                let paths = paths.clone();
                // searching folders can take a while: not on the event loop
                let spawned =
                    std::thread::Builder::new().name("drop".to_owned()).spawn(move || {
                        let added = session.add_paths(&paths, PlayAdded::IfIdle);
                        log::info!("dropped {} path(s): {added} track(s) added", paths.len());
                    });
                if let Err(e) = spawned {
                    log::error!("drop not handled: {e}");
                }
            }
        })
        .build(tauri::generate_context!())
        .map(|app| {
            app.run(|handle, event| {
                if let RunEvent::Exit = event
                    && let Some(state) = handle.try_state::<AppState>()
                {
                    state.session.save_now();
                    log::info!("state saved, exiting");
                }
            });
        });
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
    fn existing_files_and_folders_on_the_command_line_are_opened_in_order() {
        let this_file = concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs");
        let folder = env!("CARGO_MANIFEST_DIR");
        let options = parse(&["--flag", "/no/such/file.flac", folder, this_file]);
        assert_eq!(options.paths, [std::path::PathBuf::from(folder), this_file.into()]);
        assert_eq!(options.volume, None);
        assert_eq!(parse(&[]), StartOptions::default());
        assert_eq!(parse(&["--help"]), StartOptions::default());
    }

    #[test]
    fn the_start_volume_is_read_and_nonsense_is_ignored() {
        let this_file = concat!(env!("CARGO_MANIFEST_DIR"), "/src/lib.rs");
        let options = parse(&["--volume", "0.25", this_file]);
        assert_eq!(options.volume, Some(0.25));
        assert_eq!(options.paths.len(), 1);
        assert_eq!(parse(&["--volume", "loud"]).volume, None);
        assert_eq!(parse(&["--volume", "NaN"]).volume, None);
        assert_eq!(parse(&["--volume"]).volume, None);
    }
}
