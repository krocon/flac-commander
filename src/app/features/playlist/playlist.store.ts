import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { untilDestroyed } from '../../core/backend/events';
import { AppError, toAppError } from '../../core/errors/app-error';
import { LogApi } from '../../core/log/log-api';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import {
  EMPTY_PLAYLIST_STATE,
  PlaylistEntry,
  PlaylistState,
  RepeatMode,
} from '../../core/playlist/playlist.models';
import { PLAYLIST_TEXTS } from './playlist-texts';

const NEXT_REPEAT: Readonly<Record<RepeatMode, RepeatMode>> = {
  off: 'all',
  all: 'one',
  one: 'off',
};

/** `Artist – Title`, or what there is of it, or the file name. */
export function entryLabel(entry: PlaylistEntry): string {
  const title = entry.meta?.title;
  const artist = entry.meta?.artist;
  if (title && artist) {
    return `${artist} – ${title}`;
  }
  return title ?? entry.fileName;
}

/**
 * The playlist as this window sees it: what the backend reported, plus the selection – which
 * belongs to the window alone.
 */
@Injectable({ providedIn: 'root' })
export class PlaylistStore {
  private readonly api = inject(PlaylistApi);
  private readonly log = inject(LogApi);

  private readonly backend = signal<PlaylistState>(EMPTY_PLAYLIST_STATE);
  private readonly selected = signal<number | null>(null);
  private readonly commandErrorState = signal<AppError | null>(null);
  private readonly dragOverState = signal(false);
  private stateReceived = false;

  readonly state = this.backend.asReadonly();
  readonly entries = computed(() => this.backend().entries);
  readonly isEmpty = computed(() => this.backend().entries.length === 0);
  readonly currentId = computed(() => this.backend().currentId);
  readonly current = computed(() => {
    const { entries, currentId } = this.backend();
    return entries.find((e) => e.id === currentId) ?? null;
  });
  readonly repeat = computed(() => this.backend().repeat);
  readonly shuffle = computed(() => this.backend().shuffle);
  /** The selected entry, if it is still in the list. */
  readonly selectedId = computed(() => {
    const id = this.selected();
    return this.backend().entries.some((e) => e.id === id) ? id : null;
  });
  /** Sum of the known durations. */
  readonly totalMs = computed(() =>
    this.backend().entries.reduce((sum, e) => sum + (e.meta?.durationMs ?? 0), 0),
  );
  /** A command the backend did not accept. */
  readonly commandError = this.commandErrorState.asReadonly();
  /** Files are being dragged over the window. */
  readonly dragOver = this.dragOverState.asReadonly();

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
      await untilDestroyed(
        this.api.onDragOver((over) => this.dragOverState.set(over)),
        destroyRef,
      );
      const snapshot = await this.api.state();
      if (!this.stateReceived) {
        this.apply(snapshot);
      }
    } catch (e) {
      this.fail('playlist_state', e);
    }
  }

  open(): Promise<void> {
    return this.send('playlist_open', () => this.api.open(PLAYLIST_TEXTS.add));
  }

  play(id: number): Promise<void> {
    return this.send('playlist_play', () => this.api.play(id));
  }

  playSelected(): Promise<void> {
    const id = this.selectedId();
    return id === null ? Promise.resolve() : this.play(id);
  }

  next(): Promise<void> {
    return this.send('playlist_next', () => this.api.next());
  }

  previous(): Promise<void> {
    return this.send('playlist_previous', () => this.api.previous());
  }

  /** Removes the selected entry; the selection moves to its neighbour. */
  removeSelected(): Promise<void> {
    const id = this.selectedId();
    if (id === null) {
      return Promise.resolve();
    }
    const entries = this.backend().entries;
    const index = entries.findIndex((e) => e.id === id);
    const neighbour = entries[index + 1] ?? entries[index - 1] ?? null;
    this.selected.set(neighbour?.id ?? null);
    return this.send('playlist_remove', () => this.api.remove([id]));
  }

  clear(): Promise<void> {
    return this.send('playlist_clear', () => this.api.clear());
  }

  /** off → playlist → track → off */
  cycleRepeat(): Promise<void> {
    const next = NEXT_REPEAT[this.repeat()];
    return this.send('playlist_set_repeat', () => this.api.setRepeat(next));
  }

  toggleShuffle(): Promise<void> {
    const next = !this.shuffle();
    return this.send('playlist_set_shuffle', () => this.api.setShuffle(next));
  }

  select(id: number | null): void {
    this.selected.set(id);
  }

  /** Moves the selection by `delta` entries; without a selection it starts at the current track. */
  moveSelection(delta: number): void {
    const entries = this.backend().entries;
    if (entries.length === 0) {
      return;
    }
    const from = this.selectedId() ?? this.currentId();
    const index = entries.findIndex((e) => e.id === from);
    const target =
      index < 0
        ? delta > 0
          ? 0
          : entries.length - 1
        : Math.min(Math.max(0, index + delta), entries.length - 1);
    this.selected.set(entries[target].id);
  }

  selectEdge(end: 'first' | 'last'): void {
    const entries = this.backend().entries;
    const entry = end === 'first' ? entries[0] : entries.at(-1);
    this.selected.set(entry?.id ?? null);
  }

  private apply(state: PlaylistState): void {
    this.stateReceived = true;
    this.backend.set(state);
  }

  private async send(command: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
      this.commandErrorState.set(null);
    } catch (e) {
      this.fail(command, e);
    }
  }

  private fail(command: string, e: unknown): void {
    const error = toAppError(e);
    this.log.error(`${command} failed: ${error.code}: ${error.message}`);
    this.commandErrorState.set(error);
  }
}
