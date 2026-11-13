//! The command layer: thin, async, one file per area. Logic lives in `fc-core`.
//!
//! Every command is `async` (a synchronous command would run on the main thread and freeze the
//! window); blocking work goes to `spawn_blocking`.

pub mod player;
pub mod playlist;
pub mod system;

use fc_core::{AppError, AppResult};

/// Runs blocking work off the async runtime threads.
pub(crate) async fn blocking<T, F>(what: &'static str, work: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| {
        AppError::internal(format!("{what}: background task failed")).with_details(e.to_string())
    })?
}
