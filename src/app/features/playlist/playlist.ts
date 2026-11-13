import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { ERROR_TEXTS } from '../../core/errors/error-texts';
import { PlaylistEntry } from '../../core/playlist/playlist.models';
import { formatTime } from '../player/format-time';
import { PLAYLIST_TEXTS } from './playlist-texts';
import { entryLabel, PlaylistStore } from './playlist.store';

/** The list of tracks: a listbox with one selected entry, operated by mouse or keyboard. */
@Component({
  selector: 'app-playlist',
  templateUrl: './playlist.html',
  styleUrl: './playlist.css',
})
export class Playlist {
  protected readonly store = inject(PlaylistStore);
  protected readonly actions = inject(ActionService);
  protected readonly t = PLAYLIST_TEXTS;

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly summary = computed(() =>
    this.t.summary(this.store.entries().length, formatTime(this.store.totalMs())),
  );
  protected readonly activeOption = computed(() => {
    const id = this.store.selectedId();
    return id === null ? null : this.optionId(id);
  });
  protected readonly errorText = computed(() => {
    const error = this.store.commandError();
    return error ? describeError(error) : null;
  });

  constructor() {
    // keep the selected entry in view when the selection moves by keyboard
    effect(() => {
      const id = this.store.selectedId();
      const list = this.list()?.nativeElement;
      if (id !== null && list) {
        list.querySelector(`#${this.optionId(id)}`)?.scrollIntoView?.({ block: 'nearest' });
      }
    });
  }

  protected optionId(id: number): string {
    return `playlist-entry-${id}`;
  }

  protected label(entry: PlaylistEntry): string {
    return entryLabel(entry);
  }

  protected duration(entry: PlaylistEntry): string {
    return entry.meta?.durationMs ? formatTime(entry.meta.durationMs) : '';
  }

  protected errorHint(entry: PlaylistEntry): string | null {
    return entry.error ? this.t.notPlayable(ERROR_TEXTS[entry.error]) : null;
  }

  /** Keys of the list itself (the listbox pattern); everything else is left to the actions. */
  protected onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        this.store.moveSelection(1);
        break;
      case 'ArrowUp':
        this.store.moveSelection(-1);
        break;
      case 'PageDown':
        this.store.moveSelection(10);
        break;
      case 'PageUp':
        this.store.moveSelection(-10);
        break;
      case 'Home':
        this.store.selectEdge('first');
        break;
      case 'End':
        this.store.selectEdge('last');
        break;
      case 'Enter':
        void this.store.playSelected();
        break;
      case 'Delete':
      case 'Backspace':
        void this.store.removeSelected();
        break;
      default:
        return;
    }
    event.preventDefault();
  }
}
