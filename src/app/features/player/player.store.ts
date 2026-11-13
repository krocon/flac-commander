import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { untilDestroyed } from '../../core/backend/events';
import { AppError, toAppError } from '../../core/errors/app-error';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { EMPTY_PLAYER_STATE, PlayerState } from '../../core/player/player.models';
import { PlaylistStore } from '../playlist/playlist.store';

const SEEK_STEP_MS = 5000;
const VOLUME_STEP = 0.05;

/**
 * The player as this window sees it. Everything about playback is what the backend reported;
 * the store adds only what belongs to the window: the value of a slider while it is dragged.
 */
@Injectable({ providedIn: 'root' })
export class PlayerStore {
  private readonly api = inject(PlayerApi);
  private readonly log = inject(LogApi);
  private readonly playlist = inject(PlaylistStore);

  private readonly backend = signal<PlayerState>(EMPTY_PLAYER_STATE);
  /** A command the backend did not even accept (no backend, engine gone). */
  private readonly commandError = signal<AppError | null>(null);
  /** Slider values while the user drags; `null`: show the backend's value. */
  private readonly seekPreview = signal<number | null>(null);
  private readonly volumePreview = signal<number | null>(null);
  /** The drag is over: the next state of the backend replaces the preview. */
  private seekCommitted = false;
  private volumeCommitted = false;
  private stateReceived = false;

  readonly state = this.backend.asReadonly();
  readonly track = computed(() => this.backend().track);
  readonly status = computed(() => this.backend().status);
  readonly hasTrack = computed(() => this.backend().track !== null);
  readonly isPlaying = computed(() => this.backend().status === 'playing');
  readonly durationMs = computed(() => this.backend().track?.info.durationMs ?? null);
  readonly positionMs = computed(() => this.seekPreview() ?? this.backend().positionMs);
  readonly volume = computed(() => this.volumePreview() ?? this.backend().volume);
  readonly error = computed(() => this.commandError() ?? this.backend().error);

  /** Resolves when the store follows the backend (or has reported why it cannot). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.connect(inject(DestroyRef));
  }

  /** Subscribes first, then asks for the state: nothing in between can be missed. */
  private async connect(destroyRef: DestroyRef): Promise<void> {
    try {
      await untilDestroyed(
        this.api.onState((state) => this.apply(state)),
        destroyRef,
      );
      const snapshot = await this.api.state();
      // an event that arrived meanwhile is newer than the snapshot
      if (!this.stateReceived) {
        this.apply(snapshot);
      }
    } catch (e) {
      this.fail('player_state', e);
    }
  }

  /** Play or pause; without a track: start the playlist, and if that is empty, choose files. */
  togglePlay(): Promise<void> {
    if (!this.hasTrack() && this.playlist.isEmpty()) {
      return this.playlist.open();
    }
    return this.isPlaying()
      ? this.send('player_pause', () => this.api.pause())
      : this.send('player_play', () => this.api.play());
  }

  /** Play; without anything to play: choose files. */
  play(): Promise<void> {
    if (!this.hasTrack() && this.playlist.isEmpty()) {
      return this.playlist.open();
    }
    return this.send('player_play', () => this.api.play());
  }

  pause(): Promise<void> {
    return this.send('player_pause', () => this.api.pause());
  }

  stop(): Promise<void> {
    return this.send('player_stop', () => this.api.stop());
  }

  seekTo(positionMs: number): Promise<void> {
    if (!this.hasTrack() || !Number.isFinite(positionMs)) {
      return Promise.resolve();
    }
    const end = this.durationMs() ?? Number.MAX_SAFE_INTEGER;
    const target = Math.min(Math.max(0, Math.round(positionMs)), end);
    return this.send('player_seek', () => this.api.seek(target));
  }

  seekBy(deltaMs: number): Promise<void> {
    return this.seekTo(this.backend().positionMs + deltaMs);
  }

  back(): Promise<void> {
    return this.seekBy(-SEEK_STEP_MS);
  }

  forward(): Promise<void> {
    return this.seekBy(SEEK_STEP_MS);
  }

  setVolume(volume: number): Promise<void> {
    if (!Number.isFinite(volume)) {
      return Promise.resolve();
    }
    const clamped = Math.min(Math.max(0, volume), 1);
    return this.send('player_set_volume', () => this.api.setVolume(clamped));
  }

  louder(): Promise<void> {
    return this.setVolume(this.backend().volume + VOLUME_STEP);
  }

  quieter(): Promise<void> {
    return this.setVolume(this.backend().volume - VOLUME_STEP);
  }

  /** The seek slider is being dragged: show the value, do not seek yet. */
  previewSeek(positionMs: number): void {
    this.seekCommitted = false;
    this.seekPreview.set(positionMs);
  }

  /** The seek slider was released. */
  async commitSeek(positionMs: number): Promise<void> {
    this.seekPreview.set(positionMs);
    await this.seekTo(positionMs);
    this.seekCommitted = true;
  }

  /** The volume slider moves: the volume follows at once. */
  previewVolume(volume: number): Promise<void> {
    this.volumeCommitted = false;
    this.volumePreview.set(volume);
    return this.setVolume(volume);
  }

  /** The volume slider was released. */
  commitVolume(): void {
    this.volumeCommitted = true;
  }

  private apply(state: PlayerState): void {
    this.stateReceived = true;
    if (this.seekCommitted) {
      this.seekCommitted = false;
      this.seekPreview.set(null);
    }
    if (this.volumeCommitted) {
      this.volumeCommitted = false;
      this.volumePreview.set(null);
    }
    this.backend.set(state);
  }

  private async send(command: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
      this.commandError.set(null);
    } catch (e) {
      this.fail(command, e);
    }
  }

  private fail(command: string, e: unknown): void {
    const error = toAppError(e);
    this.log.error(`${command} failed: ${error.code}: ${error.message}`);
    this.commandError.set(error);
  }
}
