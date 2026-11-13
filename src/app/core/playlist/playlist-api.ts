import { call } from '../backend/call';
import { subscribe, Unsubscribe } from '../backend/events';
import { PlaylistState, RepeatMode } from './playlist.models';

/** Event names = `src-tauri/src/events.rs`; the drag events are Tauri's own. */
const EV_PLAYLIST_STATE = 'playlist://state';
const EV_DRAG_ENTER = 'tauri://drag-enter';
const EV_DRAG_LEAVE = 'tauri://drag-leave';
const EV_DRAG_DROP = 'tauri://drag-drop';

/** The playlist of the backend. Commands pass a request on; the result arrives as a state. */
export abstract class PlaylistApi {
  abstract state(): Promise<PlaylistState>;
  /** Shows the system's file dialog, adds the choice and plays its first file. */
  abstract open(dialogTitle: string): Promise<number>;
  abstract play(id: number): Promise<void>;
  abstract next(): Promise<void>;
  abstract previous(): Promise<void>;
  abstract remove(ids: readonly number[]): Promise<void>;
  abstract clear(): Promise<void>;
  abstract setRepeat(repeat: RepeatMode): Promise<void>;
  abstract setShuffle(shuffle: boolean): Promise<void>;
  abstract onState(handler: (state: PlaylistState) => void): Promise<Unsubscribe>;
  /**
   * Tells whether files are being dragged over the window. The drop itself is handled by the
   * backend: the window never sees a path.
   */
  abstract onDragOver(handler: (over: boolean) => void): Promise<Unsubscribe>;
}

export class TauriPlaylistApi extends PlaylistApi {
  override state(): Promise<PlaylistState> {
    return call<PlaylistState>('playlist_state');
  }

  override open(dialogTitle: string): Promise<number> {
    return call<number>('playlist_open', { title: dialogTitle });
  }

  override play(id: number): Promise<void> {
    return call<void>('playlist_play', { id });
  }

  override next(): Promise<void> {
    return call<void>('playlist_next');
  }

  override previous(): Promise<void> {
    return call<void>('playlist_previous');
  }

  override remove(ids: readonly number[]): Promise<void> {
    return call<void>('playlist_remove', { ids });
  }

  override clear(): Promise<void> {
    return call<void>('playlist_clear');
  }

  override setRepeat(repeat: RepeatMode): Promise<void> {
    return call<void>('playlist_set_repeat', { repeat });
  }

  override setShuffle(shuffle: boolean): Promise<void> {
    return call<void>('playlist_set_shuffle', { shuffle });
  }

  override onState(handler: (state: PlaylistState) => void): Promise<Unsubscribe> {
    return subscribe<PlaylistState>(EV_PLAYLIST_STATE, handler);
  }

  override async onDragOver(handler: (over: boolean) => void): Promise<Unsubscribe> {
    const offs = await Promise.all([
      subscribe<unknown>(EV_DRAG_ENTER, () => handler(true)),
      subscribe<unknown>(EV_DRAG_LEAVE, () => handler(false)),
      subscribe<unknown>(EV_DRAG_DROP, () => handler(false)),
    ]);
    return () => offs.forEach((off) => off());
  }
}
