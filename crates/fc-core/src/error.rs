//! Structured errors: `AppError { code, message, details? }`.
//!
//! `code` is machine-readable (`snake_case`), the frontend maps it to its own texts
//! (`src/app/core/errors/app-error.ts` mirrors [`ErrorCode`] by hand; both sides have a test).
//! `message` is English and meant for logs, `details` carries what a library said.

use serde::Serialize;
use std::io;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    NotFound,
    PermissionDenied,
    /// Any other file system error.
    Io,
    /// The container or codec is not one this build can decode.
    UnsupportedFormat,
    /// The file claims a supported format but cannot be decoded (damaged, cut off).
    DecodeFailed,
    /// The system has no audio output device.
    NoOutputDevice,
    /// The audio output device refused to open or failed while running.
    AudioDevice,
    /// The output is in use by another operation of this app.
    OutputBusy,
    /// A skin package that breaks the rules of the format; `details` lists what is wrong.
    InvalidSkin,
    /// A bug or an unexpected state; the message says where.
    Internal,
}

impl ErrorCode {
    /// All codes, for the contract test with the frontend.
    pub const ALL: [ErrorCode; 10] = [
        ErrorCode::NotFound,
        ErrorCode::PermissionDenied,
        ErrorCode::Io,
        ErrorCode::UnsupportedFormat,
        ErrorCode::DecodeFailed,
        ErrorCode::NoOutputDevice,
        ErrorCode::AudioDevice,
        ErrorCode::OutputBusy,
        ErrorCode::InvalidSkin,
        ErrorCode::Internal,
    ];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, thiserror::Error)]
#[error("{message}")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), details: None }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Internal, message)
    }

    /// An I/O error on `path`, with the code the frontend can explain.
    pub fn from_io(e: &io::Error, path: &Path) -> Self {
        let code = match e.kind() {
            io::ErrorKind::NotFound => ErrorCode::NotFound,
            io::ErrorKind::PermissionDenied => ErrorCode::PermissionDenied,
            _ => ErrorCode::Io,
        };
        Self::new(code, format!("{}: {e}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_as_code_message_details() {
        let e = AppError::new(ErrorCode::UnsupportedFormat, "no decoder").with_details("opus");
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "code": "unsupported_format", "message": "no decoder", "details": "opus"
            })
        );
    }

    #[test]
    fn details_are_left_out_when_absent() {
        let json = serde_json::to_string(&AppError::internal("x")).unwrap();
        assert_eq!(json, r#"{"code":"internal","message":"x"}"#);
    }

    /// The list `ERROR_CODES` in `src/app/core/errors/app-error.ts` must be the same.
    #[test]
    fn codes_match_the_frontend_contract() {
        let codes: Vec<String> = ErrorCode::ALL
            .iter()
            .map(|c| serde_json::to_value(c).unwrap().as_str().unwrap().to_owned())
            .collect();
        assert_eq!(
            codes,
            [
                "not_found",
                "permission_denied",
                "io",
                "unsupported_format",
                "decode_failed",
                "no_output_device",
                "audio_device",
                "output_busy",
                "invalid_skin",
                "internal"
            ]
        );
    }

    #[test]
    fn io_errors_keep_their_kind() {
        let p = Path::new("a/b.flac");
        let nf = AppError::from_io(&io::Error::from(io::ErrorKind::NotFound), p);
        assert_eq!(nf.code, ErrorCode::NotFound);
        assert!(nf.message.contains("b.flac"));
        let denied = AppError::from_io(&io::Error::from(io::ErrorKind::PermissionDenied), p);
        assert_eq!(denied.code, ErrorCode::PermissionDenied);
        let other = AppError::from_io(&io::Error::from(io::ErrorKind::UnexpectedEof), p);
        assert_eq!(other.code, ErrorCode::Io);
    }
}
