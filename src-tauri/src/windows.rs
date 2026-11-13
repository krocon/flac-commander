//! The windows of the app: the main (player) window and the ones that can be opened beside it.
//!
//! Every window is a webview of its own that shows the same frontend; which part it shows is
//! decided there by the window's label. Windows share nothing in the webview – they stay in
//! step because all of them hear the same events from Rust.

use crate::AppState;
use crate::events::WINDOWS_STATE;
use fc_core::storage::WindowPlace;
use fc_core::{AppError, AppResult};
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window,
};

pub const MAIN: &str = "main";

/// A window that can be opened beside the main window.
pub struct Secondary {
    pub label: &'static str,
    pub title: &'static str,
    pub size: (f64, f64),
    pub min_size: (f64, f64),
}

/// The complete list: a label that is not here is no window of this app.
pub const SECONDARY: &[Secondary] = &[
    Secondary {
        label: "playlist",
        title: "Playlist – FLAC Commander",
        size: (420.0, 520.0),
        min_size: (260.0, 200.0),
    },
    Secondary {
        label: "equalizer",
        title: "Equalizer – FLAC Commander",
        size: (520.0, 330.0),
        min_size: (440.0, 280.0),
    },
];

fn secondary(label: &str) -> Option<&'static Secondary> {
    SECONDARY.iter().find(|s| s.label == label)
}

/// Which secondary windows are open. Mirrored by `WindowsState` in
/// `core/windows/windows.models.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsState {
    pub open: Vec<String>,
}

pub fn state(app: &AppHandle) -> WindowsState {
    let open = SECONDARY
        .iter()
        .filter(|s| {
            app.get_webview_window(s.label).is_some_and(|w| w.is_visible().unwrap_or(false))
        })
        .map(|s| s.label.to_owned())
        .collect();
    WindowsState { open }
}

fn announce(app: &AppHandle) {
    if let Err(e) = app.emit(WINDOWS_STATE, state(app)) {
        log::error!("event {WINDOWS_STATE} could not be sent: {e}");
    }
}

/// Opens the window `label` if it is closed and closes it if it is open. Returns whether it is
/// open afterwards.
pub fn toggle(app: &AppHandle, label: &str) -> AppResult<bool> {
    let spec = secondary(label)
        .ok_or_else(|| AppError::internal(format!("there is no window \"{label}\"")))?;
    let failed =
        |e: tauri::Error| AppError::internal(format!("window {label}")).with_details(e.to_string());
    let open = match app.get_webview_window(label) {
        Some(window) if window.is_visible().unwrap_or(false) => {
            window.hide().map_err(failed)?;
            false
        }
        Some(window) => {
            window.show().and_then(|()| window.set_focus()).map_err(failed)?;
            true
        }
        None => {
            create(app, spec, true).map_err(failed)?;
            true
        }
    };
    remember(app, label);
    announce(app);
    log::info!("window {label} {}", if open { "opened" } else { "closed" });
    Ok(open)
}

fn create(app: &AppHandle, spec: &Secondary, visible: bool) -> tauri::Result<WebviewWindow> {
    let mut builder =
        WebviewWindowBuilder::new(app, spec.label, WebviewUrl::App("index.html".into()))
            .title(spec.title)
            .inner_size(spec.size.0, spec.size.1)
            .min_inner_size(spec.min_size.0, spec.min_size.1)
            .visible(visible);
    let saved = app.try_state::<AppState>().and_then(|s| s.session.window_place(spec.label));
    if let Some(place) = saved {
        builder =
            builder.inner_size(place.width.max(spec.min_size.0), place.height.max(spec.min_size.1));
        // only where a screen is: the monitor of last time may be gone
        if is_on_a_screen(app, &place) {
            builder = builder.position(place.x, place.y);
        }
    }
    builder.build()
}

/// True if the top-left part of `place` (where the title bar is) lies on a connected screen.
fn is_on_a_screen(app: &AppHandle, place: &WindowPlace) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        return false;
    };
    monitors.iter().any(|monitor| {
        let scale = monitor.scale_factor();
        let origin = monitor.position().to_logical::<f64>(scale);
        let size = monitor.size().to_logical::<f64>(scale);
        on_screen((place.x, place.y), (origin.x, origin.y), (size.width, size.height))
    })
}

/// A window at `window` is reachable on a screen at `origin` with `size` if its top-left
/// corner is on it with some room to grab the title bar.
fn on_screen(window: (f64, f64), origin: (f64, f64), size: (f64, f64)) -> bool {
    const GRIP: f64 = 60.0;
    window.0 >= origin.0 - GRIP
        && window.0 <= origin.0 + size.0 - GRIP
        && window.1 >= origin.1
        && window.1 <= origin.1 + size.1 - GRIP
}

/// Opens the secondary windows that were open when the app was closed.
pub fn restore(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    for spec in SECONDARY {
        if state.session.window_place(spec.label).is_some_and(|p| p.visible)
            && let Err(e) = create(app, spec, true)
        {
            log::warn!("window {} not restored: {e}", spec.label);
        }
    }
    // the main window: back to where it was, if that place still exists
    if let (Some(place), Some(main)) =
        (state.session.window_place(MAIN), app.get_webview_window(MAIN))
        && is_on_a_screen(app, &place)
    {
        // a resizable window (standard layout) also gets its size back; the window of a
        // fixed-size skin was sized by the skin already
        let fits_standard_layout = place.width >= 380.0 && place.height >= 420.0;
        let sized = if main.is_resizable().unwrap_or(false) && fits_standard_layout {
            main.set_size(LogicalSize::new(place.width, place.height))
        } else {
            Ok(())
        };
        if let Err(e) =
            sized.and_then(|()| main.set_position(LogicalPosition::new(place.x, place.y)))
        {
            log::warn!("main window not moved to its place: {e}");
        }
    }
}

/// Stores place, size and visibility of the window `label`.
pub fn remember(app: &AppHandle, label: &str) {
    let (Some(window), Some(state)) = (app.get_webview_window(label), app.try_state::<AppState>())
    else {
        return;
    };
    let place = (|| {
        let scale = window.scale_factor().ok()?;
        let position = window.outer_position().ok()?.to_logical::<f64>(scale);
        let size = window.inner_size().ok()?.to_logical::<f64>(scale);
        Some(WindowPlace {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            visible: window.is_visible().unwrap_or(false),
        })
    })();
    if let Some(place) = place {
        state.session.set_window_place(label, place);
    }
}

/// A secondary window is not destroyed by its close button, only hidden: opening it again is
/// instant and it keeps its place. Returns `true` if the close was taken over.
pub fn hide_instead_of_closing(window: &Window) -> bool {
    if secondary(window.label()).is_none() {
        return false;
    }
    if let Err(e) = window.hide() {
        log::warn!("window {} not hidden: {e}", window.label());
    }
    let app = window.app_handle();
    remember(app, window.label());
    announce(app);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_is_restored_only_where_its_title_bar_can_be_reached() {
        let screen = ((0.0, 0.0), (1440.0, 900.0));
        assert!(on_screen((100.0, 100.0), screen.0, screen.1));
        assert!(on_screen((0.0, 0.0), screen.0, screen.1));
        // partly off to the left is fine, as long as some of the title bar is left
        assert!(on_screen((-40.0, 300.0), screen.0, screen.1));
        assert!(!on_screen((-400.0, 300.0), screen.0, screen.1));
        // below or right of the screen, or above it
        assert!(!on_screen((100.0, 880.0), screen.0, screen.1));
        assert!(!on_screen((1430.0, 100.0), screen.0, screen.1));
        assert!(!on_screen((100.0, -50.0), screen.0, screen.1));
        // a second screen to the left
        let left = ((-1920.0, 0.0), (1920.0, 1080.0));
        assert!(on_screen((-1500.0, 200.0), left.0, left.1));
        assert!(!on_screen((-1500.0, 200.0), screen.0, screen.1));
    }

    #[test]
    fn only_known_windows_exist() {
        assert!(secondary("playlist").is_some());
        assert!(secondary("equalizer").is_some());
        assert!(secondary("main").is_none());
        assert!(secondary("../etc").is_none());
        for spec in SECONDARY {
            assert!(spec.label.chars().all(|c| c.is_ascii_lowercase()), "{}", spec.label);
            assert!(spec.size.0 >= spec.min_size.0 && spec.size.1 >= spec.min_size.1);
        }
    }

    #[test]
    fn the_state_goes_to_the_frontend_as_a_list_of_labels() {
        let json = serde_json::to_value(WindowsState { open: vec!["playlist".into()] }).unwrap();
        assert_eq!(json, serde_json::json!({ "open": ["playlist"] }));
    }
}
