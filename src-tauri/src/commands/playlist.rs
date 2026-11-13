//! Playlist commands. Like the player commands they only pass the request on; the result is
//! the [`PlaylistState`] reported through the event `playlist://state`.

use super::blocking;
use crate::AppState;
use fc_core::audio::formats::{AUDIO_FORMATS, FormatSupport};
use fc_core::playlist::{PlaylistState, RepeatMode};
use fc_core::session::PlayAdded;
use fc_core::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Longest dialog title taken from the frontend.
const MAX_TITLE_CHARS: usize = 100;
/// Most ids taken in one `playlist_remove`.
const MAX_IDS: usize = 100_000;

/// The current list, for a window that starts or reloads.
#[tauri::command]
pub async fn playlist_state(state: State<'_, AppState>) -> AppResult<PlaylistState> {
    Ok(state.session.playlist_state())
}

/// Lets the user pick audio files, adds them and plays the first. Returns how many were added
/// (0: cancelled).
///
/// The dialog runs in Rust: the webview never gets a path it could read itself, and no path
/// from the webview is opened.
#[tauri::command]
pub async fn playlist_open(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    title: String,
) -> AppResult<usize> {
    let title: String = title.chars().filter(|c| !c.is_control()).take(MAX_TITLE_CHARS).collect();
    let session = state.session.clone();
    blocking("playlist_open", move || {
        let extensions = playable_extensions();
        let picked = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title(title)
            .add_filter("Audio", &extensions)
            .blocking_pick_files();
        let Some(files) = picked else {
            return Ok(0);
        };
        let paths = files
            .into_iter()
            .map(|file| {
                file.into_path().map_err(|e| {
                    AppError::internal("a chosen file has no path on this system")
                        .with_details(e.to_string())
                })
            })
            .collect::<AppResult<Vec<PathBuf>>>()?;
        log::info!("open {} file(s)", paths.len());
        Ok(session.add_paths(&paths, PlayAdded::Always))
    })
    .await
}

/// Plays the entry `id` of the list.
#[tauri::command]
pub async fn playlist_play(state: State<'_, AppState>, id: u64) -> AppResult<()> {
    state.session.play_entry(id);
    Ok(())
}

#[tauri::command]
pub async fn playlist_next(state: State<'_, AppState>) -> AppResult<()> {
    state.session.next();
    Ok(())
}

#[tauri::command]
pub async fn playlist_previous(state: State<'_, AppState>) -> AppResult<()> {
    state.session.previous()
}

#[tauri::command]
pub async fn playlist_remove(state: State<'_, AppState>, ids: Vec<u64>) -> AppResult<()> {
    if ids.len() > MAX_IDS {
        return Err(AppError::internal(format!("too many ids: {}", ids.len())));
    }
    state.session.remove(&ids)
}

#[tauri::command]
pub async fn playlist_clear(state: State<'_, AppState>) -> AppResult<()> {
    state.session.clear()
}

#[tauri::command]
pub async fn playlist_set_repeat(state: State<'_, AppState>, repeat: RepeatMode) -> AppResult<()> {
    state.session.set_repeat(repeat);
    Ok(())
}

#[tauri::command]
pub async fn playlist_set_shuffle(state: State<'_, AppState>, shuffle: bool) -> AppResult<()> {
    state.session.set_shuffle(shuffle);
    Ok(())
}

/// Extensions of the formats this build decodes, without duplicates.
fn playable_extensions() -> Vec<&'static str> {
    let mut extensions: Vec<&str> = AUDIO_FORMATS
        .iter()
        .filter(|f| f.support == FormatSupport::Supported)
        .flat_map(|f| f.extensions.iter().copied())
        .collect();
    extensions.sort_unstable();
    extensions.dedup();
    extensions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_dialog_offers_only_what_can_be_played() {
        let extensions = playable_extensions();
        assert!(extensions.contains(&"flac"));
        assert!(extensions.contains(&"mp3"));
        assert!(!extensions.contains(&"txt"));
        for extension in &extensions {
            assert!(fc_core::audio::formats::is_playable_extension(extension), "{extension}");
        }
        // m4a is listed for AAC and ALAC: once is enough
        assert_eq!(extensions.iter().filter(|e| **e == "m4a").count(), 1);
    }

    #[test]
    fn the_repeat_mode_comes_as_the_frontend_sends_it() {
        for (json, mode) in [
            ("\"off\"", RepeatMode::Off),
            ("\"one\"", RepeatMode::One),
            ("\"all\"", RepeatMode::All),
        ] {
            assert_eq!(serde_json::from_str::<RepeatMode>(json).unwrap(), mode);
        }
        assert!(serde_json::from_str::<RepeatMode>("\"sometimes\"").is_err());
    }
}
