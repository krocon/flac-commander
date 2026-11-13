//! Player commands. They only pass the request to the engine and return; what happened shows in
//! the [`PlayerState`] the engine reports through the event `player://state`.

use super::blocking;
use crate::AppState;
use fc_core::audio::formats::{AUDIO_FORMATS, FormatSupport};
use fc_core::audio::player::PlayerState;
use fc_core::{AppError, AppResult};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Longest dialog title taken from the frontend.
const MAX_TITLE_CHARS: usize = 100;

/// The current state, for a window that starts or reloads while the engine is running.
#[tauri::command]
pub async fn player_state(state: State<'_, AppState>) -> AppResult<PlayerState> {
    Ok(state.player.state())
}

/// Lets the user pick an audio file and plays it. Returns `false` if the dialog was cancelled.
///
/// The dialog runs in Rust: the webview never gets a path it could read itself, and no path
/// from the webview is opened.
#[tauri::command]
pub async fn player_open(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    title: String,
) -> AppResult<bool> {
    let title: String = title.chars().filter(|c| !c.is_control()).take(MAX_TITLE_CHARS).collect();
    let picked = blocking("player_open", move || {
        let extensions = playable_extensions();
        Ok(app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title(title)
            .add_filter("Audio", &extensions)
            .blocking_pick_file())
    })
    .await?;
    let Some(file) = picked else {
        return Ok(false);
    };
    let path = file.into_path().map_err(|e| {
        AppError::internal("the chosen file has no path on this system").with_details(e.to_string())
    })?;
    log::info!("open {}", path.display());
    state.player.load(path, true)?;
    Ok(true)
}

#[tauri::command]
pub async fn player_play(state: State<'_, AppState>) -> AppResult<()> {
    state.player.play()
}

#[tauri::command]
pub async fn player_pause(state: State<'_, AppState>) -> AppResult<()> {
    state.player.pause()
}

#[tauri::command]
pub async fn player_stop(state: State<'_, AppState>) -> AppResult<()> {
    state.player.stop()
}

#[tauri::command]
pub async fn player_seek(state: State<'_, AppState>, position_ms: u64) -> AppResult<()> {
    state.player.seek(position_ms)
}

/// `volume` in `0.0..=1.0`; the engine clamps it.
#[tauri::command]
pub async fn player_set_volume(state: State<'_, AppState>, volume: f32) -> AppResult<()> {
    state.player.set_volume(volume)
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
        assert!(!extensions.contains(&"opus"));
        // m4a is listed for AAC and ALAC: once is enough
        assert_eq!(extensions.iter().filter(|e| **e == "m4a").count(), 1);
    }
}
