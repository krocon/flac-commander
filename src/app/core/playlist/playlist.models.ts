import { ErrorCode } from '../errors/app-error';

/** DTOs of the playlist – mirror `fc_core::playlist` and `metadata::TrackMeta` (by hand). */

export type RepeatMode = 'off' | 'one' | 'all';

export interface TrackMeta {
  readonly title: string | null;
  readonly artist: string | null;
  readonly album: string | null;
  readonly durationMs: number | null;
}

export interface PlaylistEntry {
  /** Stable while the app runs. */
  readonly id: number;
  readonly path: string;
  readonly fileName: string;
  /** `null` until the tags have been read. */
  readonly meta: TrackMeta | null;
  /** Why the track could not be played when it was last tried. */
  readonly error: ErrorCode | null;
}

/** Payload of `playlist://state` and answer of `playlist_state`. */
export interface PlaylistState {
  readonly entries: readonly PlaylistEntry[];
  readonly currentId: number | null;
  readonly repeat: RepeatMode;
  readonly shuffle: boolean;
}

export const EMPTY_PLAYLIST_STATE: PlaylistState = {
  entries: [],
  currentId: null,
  repeat: 'off',
  shuffle: false,
};
