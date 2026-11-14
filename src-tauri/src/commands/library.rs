//! Library commands and the `libcover://` protocol that serves small covers.
//!
//! The window names files and folders by the paths the backend gave it; every one of them is
//! checked against the folders of the library before anything is read (`Library::resolve`).

use super::blocking;
use super::skins::percent_decode;
use crate::AppState;
use crate::events::LIBRARY_STATE;
use fc_core::library::thumbnail::CoverCache;
use fc_core::library::{Found, Library, LibraryState, Listing, MAX_QUERY_CHARS};
use fc_core::session::PlayAdded;
use fc_core::{AppError, AppResult};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, State, UriSchemeResponder, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const MAX_TITLE_CHARS: usize = 100;
/// Longest path taken from the window.
const MAX_PATH_CHARS: usize = 4096;
/// Covers made at the same time: more would only fight for the disk.
const COVER_WORKERS: usize = 4;

type Job = Box<dyn FnOnce() + Send>;

/// A few threads that make covers: a grid asks for dozens at once, and each one means reading
/// a file and scaling a picture.
pub struct CoverPool {
    jobs: Sender<Job>,
}

impl CoverPool {
    pub fn start() -> Self {
        let (jobs, queue) = mpsc::channel::<Job>();
        let queue = Arc::new(Mutex::new(queue));
        for worker in 0..COVER_WORKERS {
            let queue = queue.clone();
            let spawned =
                std::thread::Builder::new().name(format!("cover-{worker}")).spawn(move || {
                    while let Some(job) = next(&queue) {
                        job();
                    }
                });
            if let Err(e) = spawned {
                log::error!("cover thread could not be started: {e}");
            }
        }
        Self { jobs }
    }

    /// Queues `job`. Without a thread to run it, it is dropped (and with it its responder:
    /// the request fails).
    pub fn run(&self, job: impl FnOnce() + Send + 'static) {
        if self.jobs.send(Box::new(job)).is_err() {
            log::error!("no cover thread is running");
        }
    }
}

fn next(queue: &Mutex<Receiver<Job>>) -> Option<Job> {
    queue.lock().unwrap_or_else(std::sync::PoisonError::into_inner).recv().ok()
}

fn checked(path: String) -> AppResult<String> {
    if path.chars().count() > MAX_PATH_CHARS {
        return Err(AppError::internal("path too long"));
    }
    Ok(path)
}

/// Reads the folders of the library again and tells every window how far that is.
fn scan(app: &AppHandle, state: &AppState) {
    // a cover that was missing may be there now
    state.covers.forget();
    let app = app.clone();
    state.library.rescan(move |library| {
        if let Err(e) = app.emit(LIBRARY_STATE, library) {
            log::error!("event {LIBRARY_STATE} could not be sent: {e}");
        }
    });
}

/// Folders and scan, for a window that starts. The first window that asks starts the scan:
/// an app that never shows the library never reads it.
#[tauri::command]
pub async fn library_state(app: AppHandle, state: State<'_, AppState>) -> AppResult<LibraryState> {
    if state.library.needs_scan() {
        scan(&app, &state);
    }
    Ok(state.library.state())
}

/// Lets the user pick folders and adds them to the library. Returns whether anything was
/// added (`false`: cancelled, or all of it is in the library already).
///
/// The dialog runs in Rust: this is the only way a folder gets into the library.
#[tauri::command]
pub async fn library_add_root(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    title: String,
) -> AppResult<bool> {
    let title: String = title.chars().filter(|c| !c.is_control()).take(MAX_TITLE_CHARS).collect();
    let library = state.library.clone();
    let dialog_app = app.clone();
    let added = blocking("library_add_root", move || {
        let picked =
            dialog_app.dialog().file().set_parent(&window).set_title(title).blocking_pick_folders();
        let mut added = false;
        for folder in picked.unwrap_or_default() {
            let path = folder.into_path().map_err(|e| {
                AppError::internal("a chosen folder has no path on this system")
                    .with_details(e.to_string())
            })?;
            added |= library.add_root(&path)?;
        }
        Ok(added)
    })
    .await?;
    if added {
        state.session.set_library_roots(state.library.roots());
        log::info!("library: {} folder(s)", state.library.roots().len());
        scan(&app, &state);
    }
    Ok(added)
}

/// Takes the folder `path` out of the library (nothing on disk is touched).
#[tauri::command]
pub async fn library_remove_root(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> AppResult<()> {
    if state.library.remove_root(&checked(path)?) {
        state.session.set_library_roots(state.library.roots());
        scan(&app, &state);
    }
    Ok(())
}

#[tauri::command]
pub async fn library_rescan(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    scan(&app, &state);
    Ok(())
}

/// What the folder `path` contains; without a path, the folders of the library.
#[tauri::command]
pub async fn library_browse(
    state: State<'_, AppState>,
    path: Option<String>,
) -> AppResult<Listing> {
    let path = path.map(checked).transpose()?;
    let library = state.library.clone();
    blocking("library_browse", move || library.browse(path.as_deref())).await
}

#[tauri::command]
pub async fn library_search(state: State<'_, AppState>, query: String) -> AppResult<Found> {
    let query: String = query.chars().take(MAX_QUERY_CHARS).collect();
    let library = state.library.clone();
    blocking("library_search", move || Ok(library.search(&query))).await
}

/// Plays the file or folder `path` instead of the playlist (`replace`), or appends it.
/// Returns how many tracks that were.
#[tauri::command]
pub async fn library_play(
    state: State<'_, AppState>,
    path: String,
    replace: bool,
) -> AppResult<usize> {
    let path = checked(path)?;
    let library = state.library.clone();
    let session = state.session.clone();
    blocking("library_play", move || {
        let files = library.playable(&path)?;
        log::info!("library: {} {} track(s)", if replace { "play" } else { "add" }, files.len());
        if replace {
            session.replace_with(files)
        } else {
            Ok(session.add_paths(&files, PlayAdded::Never))
        }
    })
    .await
}

/// `libcover://localhost/<path>` (Windows: `http://libcover.localhost/…`): the small cover of
/// a file or folder of the library. Answered from one of the cover threads.
pub fn serve_cover(state: &AppState, request: &Request<Vec<u8>>, responder: UriSchemeResponder) {
    let path = percent_decode(request.uri().path().trim_start_matches('/'));
    let library = state.library.clone();
    let covers = state.covers.clone();
    state.cover_pool.run(move || responder.respond(cover_response(&library, &covers, &path)));
}

/// The cover of `path` as a JPEG; 404 for what has none and for everything outside the library
/// (the answer does not tell which).
fn cover_response(library: &Library, covers: &CoverCache, path: &str) -> Response<Vec<u8>> {
    let cover = (path.chars().count() <= MAX_PATH_CHARS)
        .then(|| library.cover_track(path).ok().flatten())
        .flatten()
        .and_then(|track| covers.cover_of(&track));
    match cover {
        Some(jpeg) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "image/jpeg")
            .header("X-Content-Type-Options", "nosniff")
            .header("Cache-Control", "private, max-age=300")
            .body(jpeg.to_vec())
            .unwrap_or_default(),
        None => {
            Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap_or_default()
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const PNG: &[u8] = include_bytes!("../../icons/32x32.png");

    /// `<test>/music/Album/a.flac` with a cover beside it, and `<test>/other/b.flac` with one.
    fn sample(test: &str) -> (PathBuf, Library) {
        let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../target/test-tmp/library-commands")
            .join(test);
        let _ = std::fs::remove_dir_all(&base);
        let fixture =
            concat!(env!("CARGO_MANIFEST_DIR"), "/../crates/fc-core/tests/fixtures/sine.flac");
        for (folder, file) in [("music/Album", "a.flac"), ("other", "b.flac")] {
            let folder = base.join(folder);
            std::fs::create_dir_all(&folder).unwrap();
            std::fs::copy(fixture, folder.join(file)).unwrap();
            std::fs::write(folder.join("cover.png"), PNG).unwrap();
        }
        let base = std::fs::canonicalize(base).unwrap();
        let library = Library::new(&[base.join("music")]);
        (base, library)
    }

    #[test]
    fn covers_are_served_for_the_library_and_for_nothing_else() {
        let (base, library) = sample("covers");
        let covers = CoverCache::new(None);
        let get = |path: PathBuf| cover_response(&library, &covers, path.to_str().unwrap());

        for inside in ["music/Album/a.flac", "music/Album", "music"] {
            let ok = get(base.join(inside));
            assert_eq!(ok.status(), StatusCode::OK, "{inside}");
            assert_eq!(ok.headers()["Content-Type"], "image/jpeg");
            assert_eq!(ok.headers()["X-Content-Type-Options"], "nosniff");
            assert!(ok.body().starts_with(&[0xFF, 0xD8, 0xFF]), "{inside}");
        }
        for outside in ["other/b.flac", "other", "music/../other/b.flac", "music/missing.flac", ""]
        {
            let refused = get(base.join(outside));
            assert_eq!(refused.status(), StatusCode::NOT_FOUND, "{outside}");
            assert!(refused.body().is_empty());
        }
        assert_eq!(cover_response(&library, &covers, "").status(), StatusCode::NOT_FOUND);
        let long = "x".repeat(MAX_PATH_CHARS + 1);
        assert_eq!(cover_response(&library, &covers, &long).status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn the_address_of_a_cover_is_decoded_like_the_window_encodes_it() {
        // `convertFileSrc` escapes the whole path, slashes and umlauts included
        let request = Request::builder()
            .uri("libcover://localhost/%2Fmusic%2FBj%C3%B6rk%2FPost%20(1995)")
            .body(Vec::<u8>::new())
            .unwrap();
        let path = percent_decode(request.uri().path().trim_start_matches('/'));
        assert_eq!(path, "/music/Björk/Post (1995)");
    }

    #[test]
    fn the_cover_threads_run_what_is_queued() {
        let pool = CoverPool::start();
        let (done, results) = mpsc::channel();
        for job in 0..20 {
            let done = done.clone();
            pool.run(move || done.send(job).unwrap());
        }
        drop(done);
        let mut seen: Vec<i32> = (0..20)
            .map(|_| results.recv_timeout(std::time::Duration::from_secs(10)).unwrap())
            .collect();
        seen.sort_unstable();
        assert_eq!(seen, (0..20).collect::<Vec<_>>());
    }

    #[test]
    fn paths_from_the_window_have_a_limit() {
        assert!(checked("/music".to_owned()).is_ok());
        assert!(checked("x".repeat(MAX_PATH_CHARS + 1)).is_err());
    }
}
