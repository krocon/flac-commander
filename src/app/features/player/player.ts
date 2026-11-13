import { Component, computed, DestroyRef, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { locale } from '../../core/i18n/i18n';
import { formatTime } from './format-time';
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
  protected readonly t = PLAYER_TEXTS;

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
    const unregister = this.actions.register(playerActions(this.store));
    inject(DestroyRef).onDestroy(unregister);
  }
}
