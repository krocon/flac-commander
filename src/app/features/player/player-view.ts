import { computed, inject, Injectable } from '@angular/core';
import { locale } from '../../core/i18n/i18n';
import { PlaylistStore } from '../playlist/playlist.store';
import { formatTime } from './format-time';
import { PLAYER_TEXTS } from './player-texts';
import { PlayerStore } from './player.store';

/**
 * What a player shows, as text: the same for the standard player and for one a skin lays out.
 * Derived from the stores only – no state of its own.
 */
@Injectable({ providedIn: 'root' })
export class PlayerView {
  private readonly player = inject(PlayerStore);
  private readonly playlist = inject(PlaylistStore);
  private readonly t = PLAYER_TEXTS;

  /** The playlist entry of the loaded track, if the list still has it. */
  private readonly entry = computed(() => {
    const track = this.player.track();
    const entry = this.playlist.current();
    return entry && entry.path === track?.path ? entry : null;
  });

  /** Title from the tags, else the file name; without a track the invitation to open one. */
  readonly title = computed(() => {
    const track = this.player.track();
    return track ? (this.entry()?.meta?.title ?? track.fileName) : this.t.noTrack;
  });

  readonly artist = computed(() => this.entry()?.meta?.artist ?? null);

  /** `FLAC · 44.1 kHz · 16 bit · stereo` */
  readonly format = computed(() => {
    const info = this.player.track()?.info;
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

  /** Artist and format in one line. */
  readonly details = computed(() => {
    if (!this.player.hasTrack()) {
      return this.t.noTrackHint;
    }
    return [this.artist(), this.format()].filter((part) => part).join(' · ');
  });

  readonly status = computed(() => {
    if (!this.player.hasTrack()) {
      return '';
    }
    switch (this.player.status()) {
      case 'playing':
        return this.t.statusPlaying;
      case 'paused':
        return this.t.statusPaused;
      default:
        return this.t.statusStopped;
    }
  });

  readonly position = computed(() => formatTime(this.player.positionMs()));
  readonly duration = computed(() => formatTime(this.player.durationMs()));
  readonly positionText = computed(() => this.t.positionOf(this.position(), this.duration()));
  readonly seekable = computed(() => this.player.hasTrack() && (this.player.durationMs() ?? 0) > 0);
  readonly volumePercent = computed(() => Math.round(this.player.volume() * 100));
}
