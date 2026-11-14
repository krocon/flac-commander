import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { call } from '../backend/call';
import { subscribe, Unsubscribe } from '../backend/events';
import { LibraryFound, LibraryListing, LibraryState } from './library.models';

/** Event names = `src-tauri/src/events.rs`. */
const EV_LIBRARY_STATE = 'library://state';

/**
 * The music library of the backend. The window names files and folders by the paths the
 * backend gave it; the backend answers only for what lies inside the chosen folders.
 */
export abstract class LibraryApi {
  /** Folders and scan; the first call starts reading the library. */
  abstract state(): Promise<LibraryState>;
  /** Shows the system's folder dialog; `false` if nothing was added. */
  abstract addRoot(dialogTitle: string): Promise<boolean>;
  abstract removeRoot(path: string): Promise<void>;
  abstract rescan(): Promise<void>;
  /** What a folder contains; `null`: the folders of the library. */
  abstract browse(path: string | null): Promise<LibraryListing>;
  abstract search(query: string): Promise<LibraryFound>;
  /** Plays a file or folder instead of the playlist (`replace`) or appends it; the number of tracks. */
  abstract play(path: string, replace: boolean): Promise<number>;
  abstract onState(handler: (state: LibraryState) => void): Promise<Unsubscribe>;
  /** Address of the small cover of a file or folder (served by the `libcover://` protocol). */
  abstract coverUrl(path: string): string;
}

export class TauriLibraryApi extends LibraryApi {
  override state(): Promise<LibraryState> {
    return call<LibraryState>('library_state');
  }

  override addRoot(dialogTitle: string): Promise<boolean> {
    return call<boolean>('library_add_root', { title: dialogTitle });
  }

  override removeRoot(path: string): Promise<void> {
    return call<void>('library_remove_root', { path });
  }

  override rescan(): Promise<void> {
    return call<void>('library_rescan');
  }

  override browse(path: string | null): Promise<LibraryListing> {
    return call<LibraryListing>('library_browse', { path });
  }

  override search(query: string): Promise<LibraryFound> {
    return call<LibraryFound>('library_search', { query });
  }

  override play(path: string, replace: boolean): Promise<number> {
    return call<number>('library_play', { path, replace });
  }

  override onState(handler: (state: LibraryState) => void): Promise<Unsubscribe> {
    return subscribe<LibraryState>(EV_LIBRARY_STATE, handler);
  }

  override coverUrl(path: string): string {
    // the only place that knows how the protocol is addressed on each platform
    return isTauri() ? convertFileSrc(path, 'libcover') : '';
  }
}
