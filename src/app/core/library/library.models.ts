/** DTOs of the library – mirror `fc_core::library` (by hand; the JSON form is tested there). */

/** A folder of the library, or one on the way from it to the folder shown. */
export interface LibraryCrumb {
  readonly name: string;
  readonly path: string;
}

/** A folder as a tile. */
export interface LibraryFolder {
  readonly name: string;
  readonly path: string;
  /** Album and artist as the tags of its first track give them. */
  readonly album: string | null;
  readonly artist: string | null;
  /** Audio files directly in the folder; 0: a folder of folders. */
  readonly tracks: number;
}

export interface LibraryTrack {
  /** The file name. */
  readonly name: string;
  readonly path: string;
  readonly title: string | null;
  readonly artist: string | null;
  readonly album: string | null;
  readonly durationMs: number | null;
}

/** Answer of `library_browse`. */
export interface LibraryListing {
  /** The folder shown; `null`: the folders of the library. */
  readonly folder: LibraryFolder | null;
  readonly crumbs: readonly LibraryCrumb[];
  readonly folders: readonly LibraryFolder[];
  readonly tracks: readonly LibraryTrack[];
}

/** Answer of `library_search`. */
export interface LibraryFound {
  readonly albums: readonly LibraryFolder[];
  readonly tracks: readonly LibraryTrack[];
  /** There was more than is returned. */
  readonly more: boolean;
}

export interface LibraryScan {
  readonly scanning: boolean;
  readonly folders: number;
  readonly tracks: number;
}

/** Payload of `library://state` and answer of `library_state`. */
export interface LibraryState {
  readonly roots: readonly LibraryCrumb[];
  readonly scan: LibraryScan;
}

export const EMPTY_LIBRARY_STATE: LibraryState = {
  roots: [],
  scan: { scanning: false, folders: 0, tracks: 0 },
};

export const EMPTY_LISTING: LibraryListing = { folder: null, crumbs: [], folders: [], tracks: [] };
