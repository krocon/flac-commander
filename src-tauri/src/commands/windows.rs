//! Window commands: which of the app's windows are open.

use crate::windows::{self, WindowsState};
use fc_core::AppResult;
use tauri::AppHandle;

#[tauri::command]
pub async fn windows_state(app: AppHandle) -> AppResult<WindowsState> {
    Ok(windows::state(&app))
}

/// Opens or closes the window `label` (one of the app's own windows; anything else is refused).
/// Returns whether it is open now.
#[tauri::command]
pub async fn windows_toggle(app: AppHandle, label: String) -> AppResult<bool> {
    windows::toggle(&app, &label)
}
