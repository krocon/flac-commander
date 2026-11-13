import { Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { PLAYLIST_TEXTS } from '../playlist/playlist-texts';
import { PlaylistStore } from '../playlist/playlist.store';
import { PLAYER_TEXTS } from './player-texts';
import { PlayerView } from './player-view';
import { PlayerStore } from './player.store';

/** Display, seek bar, transport buttons and volume of the one player. */
@Component({
  selector: 'app-player',
  templateUrl: './player.html',
  styleUrl: './player.css',
})
export class Player {
  protected readonly store = inject(PlayerStore);
  protected readonly playlist = inject(PlaylistStore);
  protected readonly view = inject(PlayerView);
  protected readonly actions = inject(ActionService);
  protected readonly t = PLAYER_TEXTS;
  protected readonly p = PLAYLIST_TEXTS;

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

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    return error ? describeError(error) : null;
  });
}
