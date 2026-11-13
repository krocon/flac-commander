//! Player commands: what concerns the playing track. They only pass the request to the engine
//! and return; what happened shows in the [`PlayerState`] reported through `player://state`.

use crate::AppState;
use fc_core::AppResult;
use fc_core::audio::equalizer::{EqPreset, EqSettings, PRESETS};
use fc_core::audio::player::PlayerState;
use tauri::{State, WebviewWindow};

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

/// Sets the equalizer; the engine clamps every value to its range.
#[tauri::command]
pub async fn player_set_equalizer(
    state: State<'_, AppState>,
    settings: EqSettings,
) -> AppResult<()> {
    state.session.player().set_equalizer(settings)
}

/// The equalizer settings the app offers to start from.
#[tauri::command]
pub async fn equalizer_presets() -> AppResult<&'static [EqPreset]> {
    Ok(PRESETS)
}

/// A window starts or stops showing a spectrum. The engine analyses while any window shows one.
#[tauri::command]
pub async fn player_set_spectrum(
    window: WebviewWindow,
    state: State<'_, AppState>,
    enabled: bool,
) -> AppResult<()> {
    let wanted = {
        let mut windows =
            state.spectrum_windows.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if enabled {
            windows.insert(window.label().to_owned());
        } else {
            windows.remove(window.label());
        }
        !windows.is_empty()
    };
    state.session.player().set_spectrum(wanted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equalizer_settings_come_as_the_frontend_sends_them() {
        let json = r#"{"enabled":true,"preampDb":-3,"gainsDb":[1,2,3,4,5,6,7,8,9,10]}"#;
        let settings: EqSettings = serde_json::from_str(json).unwrap();
        assert!(settings.enabled);
        assert_eq!(settings.preamp_db, -3.0);
        assert_eq!(settings.gains_db[9], 10.0);
        // the wrong number of bands is refused instead of guessed
        assert!(serde_json::from_str::<EqSettings>(r#"{"gainsDb":[1,2,3]}"#).is_err());
    }

    #[test]
    fn presets_go_to_the_frontend_with_their_id() {
        let json = serde_json::to_value(PRESETS).unwrap();
        assert_eq!(
            json[0],
            serde_json::json!({
                "id": "flat", "preampDb": 0.0,
                "gainsDb": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
            })
        );
    }
}
