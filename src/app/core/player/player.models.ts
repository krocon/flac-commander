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

/** Mirrors `EqSettings` in fc-core: ten bands, one octave apart, and a preamp – all in dB. */
export interface EqualizerSettings {
  readonly enabled: boolean;
  readonly preampDb: number;
  readonly gainsDb: readonly number[];
}

/** Mirrors `EqPreset`. */
export interface EqualizerPreset {
  readonly id: string;
  readonly preampDb: number;
  readonly gainsDb: readonly number[];
}

/** Centre frequencies of the bands in Hz (`BAND_FREQUENCIES` in fc-core). */
export const EQUALIZER_BANDS: readonly number[] = [
  31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];
/** Largest boost or cut in dB (`MAX_GAIN_DB`). */
export const EQUALIZER_MAX_DB = 12;

export const FLAT_EQUALIZER: EqualizerSettings = {
  enabled: false,
  preampDb: 0,
  gainsDb: EQUALIZER_BANDS.map(() => 0),
};

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
  readonly equalizer: EqualizerSettings;
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
  equalizer: FLAT_EQUALIZER,
};
