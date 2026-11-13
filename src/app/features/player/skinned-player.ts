import { Component, computed, inject, input } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { SkinComponent, SkinPlayerWindow } from '../../core/skins/skin.models';
import { Playlist } from '../playlist/playlist';
import { SkinStore } from '../skins/skin.store';
import { PlayerView } from './player-view';
import { PLAYER_TEXTS } from './player-texts';
import { PlayerStore } from './player.store';

/** A component of the skin with what the template needs worked out. */
interface Placed {
  readonly component: SkinComponent;
  /** CSS `url(…)` per button state, `null` where the skin has no picture. */
  readonly normal: string | null;
  readonly hover: string | null;
  readonly pressed: string | null;
  readonly active: string | null;
  readonly disabled: string | null;
}

/**
 * The player of a skin with an `absolute` layout: every building block sits where the skin
 * puts it. The blocks themselves – what a button does, what a text says, how a slider is
 * operated and announced – are the app's and the same as in the standard player.
 */
@Component({
  selector: 'app-skinned-player',
  imports: [Playlist],
  templateUrl: './skinned-player.html',
  styleUrl: './skinned-player.css',
})
export class SkinnedPlayer {
  readonly layout = input.required<SkinPlayerWindow>();

  protected readonly store = inject(PlayerStore);
  protected readonly view = inject(PlayerView);
  protected readonly actions = inject(ActionService);
  protected readonly skins = inject(SkinStore);
  protected readonly t = PLAYER_TEXTS;

  protected readonly background = computed(() => {
    const path = this.layout().background;
    return path ? this.url(path) : null;
  });

  protected readonly placed = computed<readonly Placed[]>(() =>
    this.layout().components.map((component) => {
      const states = component.states;
      const of = (path: string | null | undefined) => (path ? this.url(path) : null);
      return {
        component,
        normal: of(states?.normal),
        hover: of(states?.hover),
        pressed: of(states?.pressed),
        active: of(states?.active),
        disabled: of(states?.disabled),
      };
    }),
  );

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    return error ? describeError(error) : null;
  });

  /** The text of a `text` component. */
  protected text(source: string | null): string {
    switch (source) {
      case 'track.title':
        return this.view.title();
      case 'track.artist':
        return this.view.artist() ?? '';
      case 'track.details':
        return this.view.details();
      case 'player.status':
        return this.errorText() ?? this.view.status();
      default:
        return '';
    }
  }

  protected time(source: string | null): string {
    return source === 'duration' ? this.view.duration() : this.view.position();
  }

  /** What a button is called: "Pause" while playing, else the label of its action. */
  protected label(action: string | null): string {
    if (action === 'player.togglePlay') {
      return this.store.isPlaying() ? this.t.pause : this.t.play;
    }
    return action ? this.actions.label(action) : '';
  }

  private url(path: string): string {
    return `url("${this.skins.assetUrl(path)}")`;
  }
}
