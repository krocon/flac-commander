//! Skin commands and the `skin://` protocol that serves the pictures of validated skins.

use super::blocking;
use crate::AppState;
use crate::events::SKIN_ACTIVE;
use fc_core::skins::manifest::{PlayerWindow, Theme};
use fc_core::skins::{DEFAULT_SKIN, Skin, SkinInfo, SkinLibrary};
use fc_core::{AppError, AppResult};
use serde::Serialize;
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Largest skin archive read from disk (the unpacked limits are checked while unpacking).
const MAX_ARCHIVE_BYTES: u64 = 40 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 100;
/// The standard window of a skin that lets the app lay out the player.
const FLOW_SIZE: (f64, f64) = (560.0, 720.0);
const FLOW_MIN_SIZE: (f64, f64) = (380.0, 420.0);

/// The skin a window shows: what it needs of the manifest, nothing of the files.
/// Mirrored by `ActiveSkin` in `core/skins/skin.models.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSkin {
    pub info: SkinInfo,
    pub theme: Theme,
    pub player: Option<PlayerWindow>,
}

impl ActiveSkin {
    pub fn of(skin: &Skin) -> Self {
        Self {
            info: skin.info(),
            theme: skin.manifest.theme.clone(),
            player: skin.manifest.windows.player.clone(),
        }
    }
}

pub fn library(state: &AppState) -> MutexGuard<'_, SkinLibrary> {
    state.skins.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The active skin – the saved one, or the default if that is gone.
pub fn active_skin(state: &AppState) -> AppResult<Arc<Skin>> {
    library(state)
        .get_or_default(state.session.skin().as_deref())
        .ok_or_else(|| AppError::internal("the default skin is missing"))
}

/// Gives the main window the size the skin asks for.
pub fn fit_window(window: &WebviewWindow, skin: &Skin) {
    let hidden = list_hidden(window);
    let fixed = fixed_size(skin, hidden);
    let no_limit = None::<LogicalSize<f64>>;
    let result = match fixed {
        // a skin with rules for resizing: between its own size and the largest it allows
        Some((width, height)) if largest_size(skin, hidden) != Some((width, height)) => {
            let (max_width, max_height) = largest_size(skin, hidden).unwrap_or((width, height));
            window
                .set_resizable(true)
                .and_then(|()| window.set_min_size(Some(LogicalSize::new(width, height))))
                .and_then(|()| window.set_max_size(Some(LogicalSize::new(max_width, max_height))))
                .and_then(|()| window.set_size(LogicalSize::new(width, height)))
        }
        Some((width, height)) => window
            .set_min_size(no_limit)
            .and_then(|()| window.set_max_size(no_limit))
            .and_then(|()| window.set_resizable(false))
            .and_then(|()| window.set_size(LogicalSize::new(width, height))),
        None => {
            // coming from a fixed-size skin the window is not resizable: then give it the
            // standard size back; a window the user has sized keeps its size
            let was_fixed = !window.is_resizable().unwrap_or(true);
            window
                .set_max_size(no_limit)
                .and_then(|()| window.set_resizable(true))
                .and_then(|()| {
                    window.set_min_size(Some(LogicalSize::new(FLOW_MIN_SIZE.0, FLOW_MIN_SIZE.1)))
                })
                .and_then(|()| {
                    if was_fixed {
                        window.set_size(LogicalSize::new(FLOW_SIZE.0, FLOW_SIZE.1))
                    } else {
                        Ok(())
                    }
                })
        }
    };
    if let Err(e) = result {
        log::warn!("window not fitted to the skin {}: {e}", skin.id());
    }
    // the title bar is see-through where the system allows it (macOS): it takes this colour
    if let Err(e) = window.set_background_color(title_bar_colour(skin)) {
        log::warn!("title bar not coloured for the skin {}: {e}", skin.id());
    }
}

/// The colour a skin wants its title bar in; `None` leaves it to the system.
fn title_bar_colour(skin: &Skin) -> Option<tauri::window::Color> {
    let colour = skin.manifest.windows.player.as_ref()?.title_bar.as_deref()?;
    let part = |at: usize| u8::from_str_radix(colour.get(at..at + 2)?, 16).ok();
    Some(tauri::window::Color(part(1)?, part(3)?, part(5)?, 255))
}

/// The largest size the skin lets its window grow to; its own size where a side is fixed.
fn largest_size(skin: &Skin, list_hidden: bool) -> Option<(f64, f64)> {
    let (_, (width, height)) =
        skin.manifest.windows.player.as_ref()?.size_range_with(list_hidden)?;
    Some((f64::from(width), f64::from(height)))
}

/// Whether the track list is hidden in the main window (or has a window of its own).
fn list_hidden(window: &WebviewWindow) -> bool {
    window
        .try_state::<AppState>()
        .is_some_and(|state| state.list_hidden.load(std::sync::atomic::Ordering::Relaxed))
}

/// The main window hides or shows its track list: a skin that has a height for that is
/// given it.
#[tauri::command]
pub async fn skins_set_list_hidden(
    app: AppHandle,
    state: State<'_, AppState>,
    hidden: bool,
) -> AppResult<()> {
    let was = state.list_hidden.swap(hidden, std::sync::atomic::Ordering::Relaxed);
    if was != hidden
        && let Some(window) = app.get_webview_window("main")
    {
        fit_window(&window, &*active_skin(&state)?);
    }
    Ok(())
}

/// Largest correction `skins_fit_viewport` makes: title bars and frames are far smaller.
const MAX_FIT_CORRECTION: f64 = 200.0;

/// The size of the skin's fixed window content, if it has one.
fn fixed_size(skin: &Skin, list_hidden: bool) -> Option<(f64, f64)> {
    let ((width, height), _) =
        skin.manifest.windows.player.as_ref()?.size_range_with(list_hidden)?;
    Some((f64::from(width), f64::from(height)))
}

/// How much to add to a window so that a viewport of `viewport` becomes `wanted`. `None`: it
/// fits already, or the numbers make no sense.
fn fit_correction(wanted: (f64, f64), viewport: (f64, f64)) -> Option<(f64, f64)> {
    let delta = (wanted.0 - viewport.0, wanted.1 - viewport.1);
    let sane = |d: f64| d.is_finite() && d.abs() <= MAX_FIT_CORRECTION;
    (sane(delta.0) && sane(delta.1) && (delta.0.abs() >= 1.0 || delta.1.abs() >= 1.0))
        .then_some(delta)
}

/// The window tells how large its content really is: whether `set_size` counts title bar and
/// frame differs between platforms, so the window of a fixed-size skin is corrected by what is
/// missing. The wanted size comes from the active skin, never from the window.
#[tauri::command]
pub async fn skins_fit_viewport(
    window: WebviewWindow,
    state: State<'_, AppState>,
    viewport_width: f64,
    viewport_height: f64,
) -> AppResult<()> {
    let skin = active_skin(&state)?;
    let hidden = state.list_hidden.load(std::sync::atomic::Ordering::Relaxed);
    let Some(mut wanted) = fixed_size(&skin, hidden) else {
        return Ok(());
    };
    // a window the user has made larger, as far as the skin allows, is as it should be
    if let Some(largest) = largest_size(&skin, hidden) {
        let within = |least: f64, most: f64, now: f64| {
            if now.is_finite() && most > least { now.clamp(least, most) } else { least }
        };
        wanted = (
            within(wanted.0, largest.0, viewport_width),
            within(wanted.1, largest.1, viewport_height),
        );
    }
    let Some((add_width, add_height)) = fit_correction(wanted, (viewport_width, viewport_height))
    else {
        return Ok(());
    };
    let resized = window.scale_factor().and_then(|scale| {
        let current = window.inner_size()?.to_logical::<f64>(scale);
        window.set_size(LogicalSize::new(current.width + add_width, current.height + add_height))
    });
    match resized {
        Ok(()) => log::debug!("window corrected by {add_width} × {add_height} for {}", skin.id()),
        Err(e) => log::warn!("window not corrected for the skin {}: {e}", skin.id()),
    }
    Ok(())
}

#[tauri::command]
pub async fn skins_list(state: State<'_, AppState>) -> AppResult<Vec<SkinInfo>> {
    Ok(library(&state).list())
}

#[tauri::command]
pub async fn skins_active(state: State<'_, AppState>) -> AppResult<ActiveSkin> {
    active_skin(&state).map(|skin| ActiveSkin::of(&skin))
}

/// Makes `id` the active skin for every window and remembers it.
#[tauri::command]
pub async fn skins_activate(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let skin = library(&state)
        .get(&id)
        .ok_or_else(|| AppError::internal(format!("there is no skin \"{id}\"")))?;
    apply(&app, &state, &skin);
    Ok(())
}

fn apply(app: &AppHandle, state: &AppState, skin: &Skin) {
    let id = skin.id();
    state.session.set_skin((id != DEFAULT_SKIN).then(|| id.to_owned()));
    if let Some(window) = app.get_webview_window("main") {
        fit_window(&window, skin);
    }
    if let Err(e) = app.emit(SKIN_ACTIVE, ActiveSkin::of(skin)) {
        log::error!("event {SKIN_ACTIVE} could not be sent: {e}");
    }
    log::info!("skin {id} active");
}

/// Lets the user pick a skin archive, validates and installs it. Returns the installed skin,
/// or `None` if the dialog was cancelled. A refused archive is an `invalid_skin` error whose
/// details list every problem.
#[tauri::command]
pub async fn skins_import(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    title: String,
) -> AppResult<Option<SkinInfo>> {
    let title: String = title.chars().filter(|c| !c.is_control()).take(MAX_TITLE_CHARS).collect();
    let skins = state.skins.clone();
    blocking("skins_import", move || {
        let picked = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title(title)
            .add_filter("Skin", &["fcskin", "zip", "wsz"])
            .blocking_pick_file();
        let Some(file) = picked else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| {
            AppError::internal("the chosen file has no path on this system")
                .with_details(e.to_string())
        })?;
        let size = std::fs::metadata(&path).map_err(|e| AppError::from_io(&e, &path))?.len();
        if size > MAX_ARCHIVE_BYTES {
            return Err(fc_core::skins::invalid_skin(&[fc_core::skins::manifest::Diagnostic {
                at: "archive".to_owned(),
                message: format!("is larger than {} MB", MAX_ARCHIVE_BYTES / 1024 / 1024),
            }]));
        }
        let archive = std::fs::read(&path).map_err(|e| AppError::from_io(&e, &path))?;
        let mut library = skins.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned());
        library.import_zip(&archive, file_name.as_deref().unwrap_or("skin")).map(Some)
    })
    .await
}

/// Lets the user choose where to save the skin `id` as an archive. Returns `false` if the
/// dialog was cancelled.
#[tauri::command]
pub async fn skins_export(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> AppResult<bool> {
    let title: String = title.chars().filter(|c| !c.is_control()).take(MAX_TITLE_CHARS).collect();
    let archive = library(&state).export_zip(&id)?;
    blocking("skins_export", move || {
        // the id was validated when the skin was loaded: safe as a file name
        let picked = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title(title)
            .set_file_name(format!("{id}.fcskin"))
            .add_filter("Skin", &["fcskin"])
            .blocking_save_file();
        let Some(file) = picked else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|e| {
            AppError::internal("the chosen place has no path on this system")
                .with_details(e.to_string())
        })?;
        std::fs::write(&path, archive).map_err(|e| AppError::from_io(&e, &path))?;
        log::info!("skin {id} exported");
        Ok(true)
    })
    .await
}

/// Removes an imported skin. If it is the active one, the default skin takes over.
#[tauri::command]
pub async fn skins_remove(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let was_active = active_skin(&state)?.id() == id;
    library(&state).remove(&id)?;
    if was_active {
        let default = active_skin(&state)?;
        apply(&app, &state, &default);
    }
    Ok(())
}

/// `skin://localhost/<id>/<path>` (Windows: `http://skin.localhost/…`): a picture of an
/// installed skin. Only files that passed the validation exist here; anything else is 404.
pub fn serve(skins: &Mutex<SkinLibrary>, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let not_found =
        || Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap_or_default();
    let path = percent_decode(request.uri().path().trim_start_matches('/'));
    let Some((id, file)) = path.split_once('/') else {
        return not_found();
    };
    let library = skins.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(skin) = library.get(id) else {
        return not_found();
    };
    let Some(bytes) = skin.file(file).filter(|_| file != "skin.json") else {
        return not_found();
    };
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type(bytes))
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "no-cache")
        .body(bytes.to_vec())
        .unwrap_or_default()
}

fn content_type(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else {
        "image/webp"
    }
}

/// `%2F` → `/` and so on; the frontend builds the address with `convertFileSrc`.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = (bytes[i] == b'%')
            .then(|| text.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok()))
            .flatten();
        match hex {
            Some(byte) => {
                out.push(byte);
                i += 3;
            }
            None => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(skins: &Mutex<SkinLibrary>, uri: &str) -> Response<Vec<u8>> {
        serve(skins, &Request::builder().uri(uri).body(Vec::new()).unwrap())
    }

    #[test]
    fn serves_pictures_of_known_skins_and_nothing_else() {
        let skins = Mutex::new(SkinLibrary::load(None, "0.1.0"));
        let ok = get(&skins, "skin://localhost/io.github.krocon.retro%2Fassets%2Fplay.png");
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.headers()["Content-Type"], "image/png");
        assert!(ok.body().starts_with(b"\x89PNG"));
        // the same with real slashes
        assert_eq!(
            get(&skins, "skin://localhost/io.github.krocon.retro/assets/play.png").status(),
            StatusCode::OK
        );

        for uri in [
            "skin://localhost/io.github.krocon.retro%2Fskin.json",
            "skin://localhost/io.github.krocon.retro%2F..%2F..%2Fetc%2Fpasswd",
            "skin://localhost/io.github.krocon.retro%2Fassets%2Fmissing.png",
            "skin://localhost/no.such.skin%2Fassets%2Fplay.png",
            "skin://localhost/io.github.krocon.retro",
            "skin://localhost/",
        ] {
            assert_eq!(get(&skins, uri).status(), StatusCode::NOT_FOUND, "{uri}");
        }
    }

    #[test]
    fn a_window_is_corrected_by_what_its_content_lacks() {
        // a title bar of 28 took its share of the height
        assert_eq!(fit_correction((320.0, 440.0), (320.0, 412.0)), Some((0.0, 28.0)));
        assert_eq!(fit_correction((320.0, 440.0), (326.0, 440.0)), Some((-6.0, 0.0)));
        // fits (rounding aside): nothing to do
        assert_eq!(fit_correction((320.0, 440.0), (320.0, 440.0)), None);
        assert_eq!(fit_correction((320.0, 440.0), (320.4, 439.6)), None);
        // not a decoration but a window of another size, or nonsense: hands off
        assert_eq!(fit_correction((320.0, 440.0), (1200.0, 800.0)), None);
        assert_eq!(fit_correction((320.0, 440.0), (f64::NAN, 440.0)), None);
        assert_eq!(fit_correction((320.0, 440.0), (320.0, f64::INFINITY)), None);
    }

    #[test]
    fn only_an_absolute_layout_fixes_the_window_size() {
        let library = SkinLibrary::load(None, "0.1.0");
        assert_eq!(
            fixed_size(&library.get("io.github.krocon.retro").unwrap(), false),
            Some((320.0, 440.0))
        );
        // a skin that only brings colours leaves the window to the user
        let flow = Skin::from_files(
            [(
                "skin.json".to_owned(),
                br#"{"formatVersion":1,"id":"org.example.flow","name":"Flow","version":"1.0.0"}"#
                    .to_vec(),
            )]
            .into(),
            false,
            "0.1.0",
        )
        .unwrap();
        assert_eq!(fixed_size(&flow, false), None);
        assert!(fixed_size(&library.get(DEFAULT_SKIN).unwrap(), false).is_some());
    }

    #[test]
    fn a_skin_may_colour_its_title_bar() {
        let library = SkinLibrary::load(None, "0.1.0");
        let walk = library.get("io.github.krocon.walk").unwrap();
        assert_eq!(title_bar_colour(&walk), Some(tauri::window::Color(0xe9, 0x62, 0x1a, 255)));
        assert_eq!(title_bar_colour(&library.get("io.github.krocon.retro").unwrap()), None);
    }

    #[test]
    fn decodes_percent_escapes_and_leaves_the_rest() {
        assert_eq!(percent_decode("a%2Fb%20c"), "a/b c");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz%2"), "%zz%2");
        assert_eq!(percent_decode("%C3%A4"), "ä");
    }

    #[test]
    fn the_active_skin_goes_to_the_window_as_the_frontend_expects() {
        let library = SkinLibrary::load(None, "0.1.0");
        let retro = library.get("io.github.krocon.retro").unwrap();
        let json = serde_json::to_value(ActiveSkin::of(&retro)).unwrap();
        assert_eq!(json["info"]["id"], "io.github.krocon.retro");
        assert_eq!(json["info"]["builtIn"], true);
        assert_eq!(json["info"]["preview"], "preview.png");
        assert_eq!(json["theme"]["accentContrast"], "#0b120b");
        assert_eq!(json["theme"]["radius"], 0);
        assert_eq!(json["player"]["layout"], "absolute");
        assert_eq!(json["player"]["width"], 320);
        assert_eq!(json["player"]["pixelated"], true);
        let components = json["player"]["components"].as_array().unwrap();
        let play = components.iter().find(|c| c["action"] == "player.togglePlay").unwrap();
        assert_eq!(play["type"], "button");
        assert!(components.iter().any(|c| c["type"] == "spectrum"));
        assert_eq!(play["states"]["active"], "assets/play-active.png");
        assert_eq!(json["player"]["components"][0]["fontSize"], 14);

        // the default skin has a tonearm: its fields arrive under their camelCase names
        let vinyl = library.get(DEFAULT_SKIN).unwrap();
        let json = serde_json::to_value(ActiveSkin::of(&vinyl)).unwrap();
        let components = json["player"]["components"].as_array().unwrap();
        let arm = components.iter().find(|c| c["type"] == "needle").unwrap();
        assert_eq!((arm["pivotX"].as_u64(), arm["from"].as_i64()), (Some(15), Some(8)));
        let label = components.iter().find(|c| c["type"] == "spinner").unwrap();
        assert_eq!(label["period"], 1800);
    }
}
