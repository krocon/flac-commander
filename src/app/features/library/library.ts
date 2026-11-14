import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { LibraryApi } from '../../core/library/library-api';
import { LibraryFolder, LibraryTrack } from '../../core/library/library.models';
import { formatTime } from '../player/format-time';
import { LIBRARY_TEXTS } from './library-texts';
import { LibraryStore } from './library.store';

/**
 * The library window: the chosen folders, what is in them as a grid of covers, and a search.
 * It looks the same in every skin: its colours follow the system (light or dark), not the skin.
 */
@Component({
  selector: 'app-library',
  templateUrl: './library.html',
  styleUrl: './library.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Library {
  protected readonly store = inject(LibraryStore);
  private readonly api = inject(LibraryApi);
  protected readonly t = LIBRARY_TEXTS;

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('search');
  /** The tile or row picked with the mouse (a click picks, a double click plays). */
  protected readonly selected = signal<string | null>(null);
  /** Paths whose cover could not be loaded: they show the placeholder. */
  private readonly withoutCover = signal<ReadonlySet<string>>(new Set());

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    return error ? describeError(error) : null;
  });
  protected readonly status = computed(() => {
    const scan = this.store.scan();
    if (scan.scanning) {
      return this.t.scanning(scan.tracks);
    }
    return scan.tracks > 0 ? this.t.scanned(scan.tracks, scan.folders) : '';
  });
  /** The folders to show as tiles and the tracks to show as rows: of the folder or the search. */
  protected readonly folders = computed(() =>
    this.store.searching() ? (this.store.found()?.albums ?? []) : this.store.listing().folders,
  );
  protected readonly tracks = computed(() =>
    this.store.searching() ? (this.store.found()?.tracks ?? []) : this.store.listing().tracks,
  );
  /** The folder shown is an album: it has tracks of its own. */
  protected readonly album = computed(() => {
    const folder = this.store.listing().folder;
    return !this.store.searching() && folder && folder.tracks > 0 ? folder : null;
  });
  protected readonly nothingFound = computed(
    () =>
      this.store.searching() &&
      this.store.found() !== null &&
      this.folders().length === 0 &&
      this.tracks().length === 0,
  );

  constructor() {
    const unregister = inject(ActionService).register([
      {
        id: 'library.search',
        label: () => this.t.search,
        shortcut: { key: 'f', mod: true },
        run: () => this.searchField()?.nativeElement.focus(),
      },
    ]);
    inject(DestroyRef).onDestroy(unregister);
  }

  protected cover(path: string): string | null {
    return this.withoutCover().has(path) ? null : this.api.coverUrl(path) || null;
  }

  protected noCover(path: string): void {
    this.withoutCover.update((paths) => new Set(paths).add(path));
  }

  protected duration(track: LibraryTrack): string {
    return track.durationMs === null ? '' : formatTime(track.durationMs);
  }

  /** What stands under the name of a tile: the artist, or what kind of folder it is. */
  protected subtitle(folder: LibraryFolder): string {
    if (folder.tracks === 0) {
      return this.t.folder;
    }
    return folder.artist ?? this.t.trackCount(folder.tracks);
  }

  /** The tiles are the folders of the library themselves: they can be removed from it. */
  protected readonly atTop = computed(() => !this.store.searching() && this.store.path() === null);

  /**
   * A folder of folders opens at once. An album is picked by a click (the double click plays
   * it) and opened by Enter or Space – a click that comes from the keyboard has no `detail`.
   */
  protected folderClick(folder: LibraryFolder, event: MouseEvent): void {
    if (folder.tracks === 0 || event.detail === 0) {
      this.open(folder.path);
    } else {
      this.selected.set(folder.path);
    }
  }

  /** A click picks the track; Enter or Space plays it, like a double click. */
  protected trackClick(track: LibraryTrack, event: MouseEvent): void {
    if (event.detail === 0) {
      void this.store.play(track.path);
    } else {
      this.selected.set(track.path);
    }
  }

  protected open(path: string | null): void {
    this.selected.set(null);
    void this.store.goTo(path);
  }

  protected onSearch(event: Event): void {
    void this.store.setQuery((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    void this.store.setQuery('');
    this.searchField()?.nativeElement.focus();
  }
}
