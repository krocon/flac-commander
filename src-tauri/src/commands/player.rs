//! Player commands: what concerns the playing track. They only pass the request to the engine
//! and return; what happened shows in the [`PlayerState`] reported through `player://state`.

use crate::AppState;
use fc_core::AppResult;
use fc_core::audio::player::PlayerState;
use tauri::State;

/// The current state, for a window that starts or reloads while the engine is running.
#[tauri::command]
pub async fn player_state(state: State<'_, AppState>) -> AppResult<PlayerState> {
    Ok(state.session.player().state())
}

/// Continues the loaded track; without one, starts the playlist.
#[tauri::command]
pub async fn player_play(state: State<'_, AppState>) -> AppResult<()> {
    state.session.play()
}

#[tauri::command]
pub async fn player_pause(state: State<'_, AppState>) -> AppResult<()> {
    state.session.player().pause()
}

#[tauri::command]
pub async fn player_stop(state: State<'_, AppState>) -> AppResult<()> {
    state.session.player().stop()
}

#[tauri::command]
pub async fn player_seek(state: State<'_, AppState>, position_ms: u64) -> AppResult<()> {
    state.session.player().seek(position_ms)
}

/// `volume` in `0.0..=1.0`; the engine clamps it.
#[tauri::command]
pub async fn player_set_volume(state: State<'_, AppState>, volume: f32) -> AppResult<()> {
    state.session.player().set_volume(volume)
}
