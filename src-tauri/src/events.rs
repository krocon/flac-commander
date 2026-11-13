//! Event names and payloads sent to the frontend (`subscribe()` in `core/backend/events.ts`).
//! Events report state changes; requests with an answer are commands.

use fc_core::AppError;
use serde::Serialize;

/// The state of the player changed (or, while playing, its position moved on). The payload is
/// `fc_core::audio::player::PlayerState`, mirrored by `PlayerState` in
/// `core/player/player.models.ts`; its JSON form is tested in `fc-core/tests/player.rs`.
pub const PLAYER_STATE: &str = "player://state";

/// The playlist changed: entries, tags read in the background, current track, repeat, shuffle.
/// The payload is `fc_core::playlist::PlaylistState`, mirrored in
/// `core/playlist/playlist.models.ts`; its JSON form is tested in `fc-core/src/playlist.rs`.
pub const PLAYLIST_STATE: &str = "playlist://state";

/// Another skin is active. Payload: `commands::skins::ActiveSkin`, mirrored in
/// `core/skins/skin.models.ts`.
pub const SKIN_ACTIVE: &str = "skins://active";

/// The test tone ended. Mirrored by `TestToneFinished` in `core/system/system.models.ts`.
pub const TEST_TONE_FINISHED: &str = "audio://test-tone-finished";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestToneFinished {
    /// `None`: played to the end.
    pub error: Option<AppError>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use fc_core::ErrorCode;

    #[test]
    fn payload_matches_the_frontend_contract() {
        let ok = serde_json::to_value(TestToneFinished { error: None }).unwrap();
        assert_eq!(ok, serde_json::json!({ "error": null }));

        let failed = serde_json::to_value(TestToneFinished {
            error: Some(AppError::new(ErrorCode::AudioDevice, "output stream failed")),
        })
        .unwrap();
        assert_eq!(
            failed,
            serde_json::json!({
                "error": { "code": "audio_device", "message": "output stream failed" }
            })
        );
    }
}
