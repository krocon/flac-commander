import { AppError } from '../errors/app-error';

/** DTOs of the player – mirror `fc_core::audio::player` and `decode::TrackInfo` (by hand). */

export type PlaybackStatus = 'stopped' | 'playing' | 'paused';

export interface TrackInfo {
  readonly container: string;
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number | null;
  readonly durationMs: number | null;
}

export interface LoadedTrack {
  readonly path: string;
  readonly fileName: string;
  readonly info: TrackInfo;
}

/** Payload of `player://state` and answer of `player_state`. */
export interface PlayerState {
  readonly status: PlaybackStatus;
  readonly track: LoadedTrack | null;
  readonly positionMs: number;
  /** 0 … 1 */
  readonly volume: number;
  readonly error: AppError | null;
  readonly underruns: number;
  /** Tracks played to their end since the app started. */
  readonly finished: number;
}

/** The player before the backend has said anything. */
export const EMPTY_PLAYER_STATE: PlayerState = {
  status: 'stopped',
  track: null,
  positionMs: 0,
  volume: 1,
  error: null,
  underruns: 0,
  finished: 0,
};
