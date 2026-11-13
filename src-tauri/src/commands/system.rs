//! System commands: what the app runs on and whether the way to the loudspeaker works.

use super::blocking;
use crate::AppState;
use crate::events::{TEST_TONE_FINISHED, TestToneFinished};
use fc_core::AppResult;
use fc_core::audio::formats::{AUDIO_FORMATS, AudioFormat};
use fc_core::audio::output::{OutputStatus, output_status};
use fc_core::audio::tone::spawn_test_tone;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

/// Mirrored by `AppInfo` in `core/system/system.models.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub os: &'static str,
    pub arch: &'static str,
    pub log_dir: Option<PathBuf>,
}

impl AppInfo {
    pub fn new(name: String, version: String, log_dir: Option<PathBuf>) -> Self {
        Self { name, version, os: std::env::consts::OS, arch: std::env::consts::ARCH, log_dir }
    }
}

/// Mirrored by `SystemInfo` in `core/system/system.models.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub app: AppInfo,
    pub output: OutputStatus,
    pub formats: &'static [AudioFormat],
}

#[tauri::command]
pub async fn system_info(app: AppHandle) -> AppResult<SystemInfo> {
    let package = app.package_info();
    let info = AppInfo::new(
        package.name.clone(),
        package.version.to_string(),
        app.path().app_log_dir().ok(),
    );
    // listing devices talks to the audio system and may take a moment
    let output = blocking("system_info", || Ok(output_status())).await?;
    Ok(SystemInfo { app: info, output, formats: AUDIO_FORMATS })
}

/// Starts the test tone. Returns when it plays; its end is the event [`TEST_TONE_FINISHED`].
#[tauri::command]
pub async fn start_test_tone(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let busy = state.tone_busy.clone();
    let started = blocking("start_test_tone", move || {
        spawn_test_tone(busy, move |result| {
            match &result {
                Ok(()) => log::info!("test tone finished"),
                Err(e) => log::error!("test tone failed: {e} ({:?})", e.details),
            }
            let payload = TestToneFinished { error: result.err() };
            if let Err(e) = app.emit(TEST_TONE_FINISHED, payload) {
                log::error!("event {TEST_TONE_FINISHED} could not be sent: {e}");
            }
        })
    })
    .await;
    match &started {
        Ok(()) => log::info!("test tone started"),
        Err(e) => log::warn!("test tone not started: {e} ({:?})", e.details),
    }
    started
}

#[cfg(test)]
mod tests {
    use super::*;
    use fc_core::audio::output::{OutputDevice, OutputFormat};

    /// The shape `core/system/system.models.ts` declares and `src/testing/fake-apis.ts` uses.
    #[test]
    fn system_info_matches_the_frontend_contract() {
        let info = SystemInfo {
            app: AppInfo {
                name: "FLAC Commander".into(),
                version: "0.1.0".into(),
                os: "macos",
                arch: "aarch64",
                log_dir: Some(PathBuf::from("/logs")),
            },
            output: OutputStatus {
                host: "CoreAudio".into(),
                devices: vec![OutputDevice {
                    id: "coreaudio:speakers".into(),
                    name: "Speakers".into(),
                    is_default: true,
                }],
                default_format: Some(OutputFormat { sample_rate: 48_000, channels: 2 }),
            },
            formats: &AUDIO_FORMATS[..1],
        };
        assert_eq!(
            serde_json::to_value(&info).unwrap(),
            serde_json::json!({
                "app": {
                    "name": "FLAC Commander", "version": "0.1.0",
                    "os": "macos", "arch": "aarch64", "logDir": "/logs"
                },
                "output": {
                    "host": "CoreAudio",
                    "devices": [
                        { "id": "coreaudio:speakers", "name": "Speakers", "isDefault": true }
                    ],
                    "defaultFormat": { "sampleRate": 48000, "channels": 2 }
                },
                "formats": [
                    { "id": "flac", "name": "FLAC", "extensions": ["flac"], "support": "supported" }
                ]
            })
        );
    }

    #[test]
    fn a_system_without_output_or_log_folder_serialises_as_null() {
        let info = SystemInfo {
            app: AppInfo::new("x".into(), "0.0.0".into(), None),
            output: OutputStatus { host: "ALSA".into(), devices: vec![], default_format: None },
            formats: &[],
        };
        let json = serde_json::to_value(&info).unwrap();
        assert!(json["app"]["logDir"].is_null());
        assert!(json["output"]["defaultFormat"].is_null());
        assert_eq!(json["output"]["devices"], serde_json::json!([]));
    }
}
