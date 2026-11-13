import { call } from '../backend/call';
import { subscribe, Unsubscribe } from '../backend/events';
import { toAppError } from '../errors/app-error';
import { EqualizerPreset, EqualizerSettings, PlayerState } from './player.models';

/** Event names = `src-tauri/src/events.rs`. */
const EV_PLAYER_STATE = 'player://state';

/**
 * The playback engine of the backend. Commands only pass a request on; what really happened
 * arrives as a state through {@link onState}.
 */
export abstract class PlayerApi {
  abstract state(): Promise<PlayerState>;
  /** Continues the loaded track; without one, starts the playlist. */
  abstract play(): Promise<void>;
  abstract pause(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract seek(positionMs: number): Promise<void>;
  /** `volume`: 0 … 1 */
  abstract setVolume(volume: number): Promise<void>;
  abstract setEqualizer(settings: EqualizerSettings): Promise<void>;
  abstract equalizerPresets(): Promise<readonly EqualizerPreset[]>;
  abstract onState(handler: (state: PlayerState) => void): Promise<Unsubscribe>;
}

/** The error of a state comes over the wire like a rejection: unknown codes become `unknown`. */
function checked(state: PlayerState): PlayerState {
  return state.error ? { ...state, error: toAppError(state.error) } : state;
}

export class TauriPlayerApi extends PlayerApi {
  override async state(): Promise<PlayerState> {
    return checked(await call<PlayerState>('player_state'));
  }

  override play(): Promise<void> {
    return call<void>('player_play');
  }

  override pause(): Promise<void> {
    return call<void>('player_pause');
  }

  override stop(): Promise<void> {
    return call<void>('player_stop');
  }

  override seek(positionMs: number): Promise<void> {
    return call<void>('player_seek', { positionMs: Math.max(0, Math.round(positionMs)) });
  }

  override setVolume(volume: number): Promise<void> {
    return call<void>('player_set_volume', { volume });
  }

  override setEqualizer(settings: EqualizerSettings): Promise<void> {
    return call<void>('player_set_equalizer', { settings });
  }

  override equalizerPresets(): Promise<readonly EqualizerPreset[]> {
    return call<readonly EqualizerPreset[]>('equalizer_presets');
  }

  override onState(handler: (state: PlayerState) => void): Promise<Unsubscribe> {
    return subscribe<PlayerState>(EV_PLAYER_STATE, (state) => handler(checked(state)));
  }
}
