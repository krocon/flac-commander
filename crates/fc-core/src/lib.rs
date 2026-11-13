//! FLAC Commander core: audio engine and application logic.
//!
//! This crate has no Tauri, WebView or UI dependency (architecture rule, `docs/ARCHITECTURE.md`):
//! it can be driven from tests, examples and a command line, and the desktop shell in `src-tauri`
//! is only one of its users.

pub mod audio;
pub mod error;
pub mod metadata;
pub mod playlist;
pub mod session;
pub mod skins;
pub mod storage;

pub use error::{AppError, AppResult, ErrorCode};
