import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { untilDestroyed } from '../../core/backend/events';
import { AppError, toAppError } from '../../core/errors/app-error';
import { LibraryApi } from '../../core/library/library-api';
import {
  EMPTY_LIBRARY_STATE,
  EMPTY_LISTING,
  LibraryFound,
  LibraryListing,
  LibraryState,
} from '../../core/library/library.models';
import { LogApi } from '../../core/log/log-api';
import { LIBRARY_TEXTS } from './library-texts';

/**
 * The library as this window sees it: the folders and the scan as the backend reports them,
 * and where this window is in them – the folder shown and the search belong to the window.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly api = inject(LibraryApi);
  private readonly log = inject(LogApi);

  private readonly backend = signal<LibraryState>(EMPTY_LIBRARY_STATE);
  private readonly listingState = signal<LibraryListing>(EMPTY_LISTING);
  private readonly queryState = signal('');
  private readonly foundState = signal<LibraryFound | null>(null);
  private readonly loadedState = signal(false);
  private readonly errorState = signal<AppError | null>(null);
  private readonly noticeState = signal<string | null>(null);
  private stateReceived = false;
  /** Counts the requests: an answer that is not the latest is dropped. */
  private browseRequest = 0;
  private searchRequest = 0;

  readonly roots = computed(() => this.backend().roots);
  readonly scan = computed(() => this.backend().scan);
  /** No folder was chosen yet. */
  readonly isEmpty = computed(() => this.loadedState() && this.backend().roots.length === 0);
  /** The folder shown, its sub-folders and tracks. */
  readonly listing = this.listingState.asReadonly();
  /** The path of the folder shown; `null`: the folders of the library. */
  readonly path = computed(() => this.listingState().folder?.path ?? null);
  /** The search text as typed. */
  readonly query = this.queryState.asReadonly();
  /** True while a search is shown instead of a folder. */
  readonly searching = computed(() => this.queryState().trim() !== '');
  /** What the search found; `null` until the first answer. */
  readonly found = this.foundState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** A success worth telling (tracks were added). */
  readonly notice = this.noticeState.asReadonly();

  /** Resolves when the store follows the backend (or has reported why it cannot). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.connect(inject(DestroyRef));
  }

  private async connect(destroyRef: DestroyRef): Promise<void> {
    try {
      await untilDestroyed(
        this.api.onState((state) => this.apply(state)),
        destroyRef,
      );
      const snapshot = await this.api.state();
      if (!this.stateReceived) {
        this.backend.set(snapshot);
      }
      await this.open(null);
    } catch (e) {
      this.fail('library_state', e);
    } finally {
      this.loadedState.set(true);
    }
  }

  /** Shows the folder `path`; `null`: the folders of the library. */
  async open(path: string | null): Promise<void> {
    const request = ++this.browseRequest;
    try {
      const listing = await this.api.browse(path);
      if (request === this.browseRequest) {
        this.listingState.set(listing);
        this.errorState.set(null);
      }
    } catch (e) {
      if (request === this.browseRequest) {
        this.fail('library_browse', e);
      }
    }
  }

  /** Leaves the search and shows the folder `path`. */
  goTo(path: string | null): Promise<void> {
    this.setQuery('');
    return this.open(path);
  }

  /** One folder up; from a folder of the library to their list. */
  up(): Promise<void> {
    const crumbs = this.listingState().crumbs;
    return this.goTo(crumbs.at(-2)?.path ?? null);
  }

  /** Searches for `text`; an empty text shows the folder again. */
  async setQuery(text: string): Promise<void> {
    this.queryState.set(text);
    const request = ++this.searchRequest;
    if (text.trim() === '') {
      this.foundState.set(null);
      return;
    }
    try {
      const found = await this.api.search(text);
      if (request === this.searchRequest) {
        this.foundState.set(found);
        this.errorState.set(null);
      }
    } catch (e) {
      if (request === this.searchRequest) {
        this.fail('library_search', e);
      }
    }
  }

  /** Plays the file or folder now, instead of the playlist. */
  play(path: string): Promise<void> {
    return this.send('library_play', async () => {
      const tracks = await this.api.play(path, true);
      this.noticeState.set(tracks === 0 ? LIBRARY_TEXTS.nothingToPlay : null);
    });
  }

  /** Appends the file or folder to the playlist. */
  add(path: string): Promise<void> {
    return this.send('library_play', async () => {
      const tracks = await this.api.play(path, false);
      this.noticeState.set(
        tracks === 0 ? LIBRARY_TEXTS.nothingToPlay : LIBRARY_TEXTS.added(tracks),
      );
    });
  }

  addRoot(): Promise<void> {
    return this.send('library_add_root', () => this.api.addRoot(LIBRARY_TEXTS.addFolderTitle));
  }

  removeRoot(path: string): Promise<void> {
    return this.send('library_remove_root', () => this.api.removeRoot(path));
  }

  rescan(): Promise<void> {
    return this.send('library_rescan', () => this.api.rescan());
  }

  private apply(state: LibraryState): void {
    const before = this.backend();
    this.stateReceived = true;
    this.backend.set(state);
    const paths = (s: LibraryState) => s.roots.map((r) => r.path).join('\n');
    if (paths(before) !== paths(state)) {
      // the folder shown may be gone with its root: back to the list of folders
      void this.open(null);
    } else if (before.scan.scanning && !state.scan.scanning) {
      // read to the end: tags and counts of the folder shown are complete now
      void this.open(this.path());
    }
    if (this.searching() && (state.scan.scanning || before.scan.scanning)) {
      // the index grows: so may the results
      void this.setQuery(this.queryState());
    }
  }

  private async send(command: string, run: () => Promise<unknown>): Promise<void> {
    try {
      this.noticeState.set(null);
      await run();
      this.errorState.set(null);
    } catch (e) {
      this.fail(command, e);
    }
  }

  private fail(command: string, e: unknown): void {
    const error = toAppError(e);
    this.log.error(`${command} failed: ${error.code}: ${error.message}`);
    this.errorState.set(error);
  }
}
