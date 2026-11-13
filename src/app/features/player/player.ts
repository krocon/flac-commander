import { Component, computed, DestroyRef, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { locale } from '../../core/i18n/i18n';
import { formatTime } from './format-time';
import { PLAYLIST_TEXTS } from '../playlist/playlist-texts';
import { PlaylistStore } from '../playlist/playlist.store';
import { PLAYER_TEXTS } from './player-texts';
import { playerActions } from './player.actions';
import { PlayerStore } from './player.store';

/** Display, seek bar, transport buttons and volume of the one player. */
@Component({
  selector: 'app-player',
  templateUrl: './player.html',
  styleUrl: './player.css',
})
export class Player {
  protected readonly store = inject(PlayerStore);
  protected readonly actions = inject(ActionService);
  protected readonly playlist = inject(PlaylistStore);
  protected readonly t = PLAYER_TEXTS;
  protected readonly p = PLAYLIST_TEXTS;

  /** Title and artist from the tags of the current playlist entry; else the file name. */
  protected readonly title = computed(() => {
    const track = this.store.track();
    const entry = this.playlist.current();
    const tagged = entry && entry.path === track?.path ? entry.meta?.title : null;
    return tagged ?? track?.fileName ?? '';
  });
  protected readonly artist = computed(() => {
    const track = this.store.track();
    const entry = this.playlist.current();
    return entry && entry.path === track?.path ? (entry.meta?.artist ?? null) : null;
  });
  protected readonly repeatLabel = computed(() => {
    switch (this.playlist.repeat()) {
      case 'all':
        return this.p.repeatAll;
      case 'one':
        return this.p.repeatOne;
      default:
        return this.p.repeatOff;
    }
  });

  protected readonly position = computed(() => formatTime(this.store.positionMs()));
  protected readonly duration = computed(() => formatTime(this.store.durationMs()));
  protected readonly positionText = computed(() =>
    this.t.positionOf(this.position(), this.duration()),
  );
  protected readonly seekable = computed(
    () => this.store.hasTrack() && (this.store.durationMs() ?? 0) > 0,
  );
  protected readonly volumePercent = computed(() => Math.round(this.store.volume() * 100));

  /** `FLAC · 44.1 kHz · 16 bit · stereo` */
  protected readonly details = computed(() => {
    const info = this.store.track()?.info;
    if (!info) {
      return '';
    }
    const kHz = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(
      info.sampleRate / 1000,
    );
    return [
      this.artist(),
      info.codec.toUpperCase(),
      `${kHz} kHz`,
      info.bitsPerSample ? this.t.bits(info.bitsPerSample) : null,
      this.t.channels(info.channels),
    ]
      .filter((part) => part !== null)
      .join(' · ');
  });

  protected readonly statusText = computed(() => {
    if (!this.store.hasTrack()) {
      return '';
    }
    switch (this.store.status()) {
      case 'playing':
        return this.t.statusPlaying;
      case 'paused':
        return this.t.statusPaused;
      default:
        return this.t.statusStopped;
    }
  });

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    return error ? describeError(error) : null;
  });

  constructor() {
    const unregister = this.actions.register(playerActions(this.store, this.playlist));
    inject(DestroyRef).onDestroy(unregister);
  }
}
