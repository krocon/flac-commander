import { afterRenderEffect, Component, computed, DestroyRef, inject } from '@angular/core';
import { APP_TEXTS } from './app-texts';
import { ActionService } from './core/actions/action.service';
import { Diagnostics } from './features/diagnostics/diagnostics';
import { DiagnosticsStore } from './features/diagnostics/diagnostics.store';
import { Player } from './features/player/player';
import { playerActions } from './features/player/player.actions';
import { PlayerStore } from './features/player/player.store';
import { SkinnedPlayer } from './features/player/skinned-player';
import { Playlist } from './features/playlist/playlist';
import { PLAYLIST_TEXTS } from './features/playlist/playlist-texts';
import { PlaylistStore } from './features/playlist/playlist.store';
import { SkinChooser } from './features/skins/skin-chooser';
import { SkinStore } from './features/skins/skin.store';
import { SKINS_TEXTS } from './features/skins/skins-texts';

@Component({
  selector: 'app-root',
  imports: [Diagnostics, Player, Playlist, SkinChooser, SkinnedPlayer],
  template: `
    @if (skins.absolutePlayer(); as layout) {
      <!-- a skin that places everything itself: nothing of the app's own layout around it -->
      <app-skinned-player [layout]="layout" />
    } @else {
      <div class="flow">
        <header>
          <h1>{{ t.title }}</h1>
          <button type="button" [title]="actions.hint('app.skins')" (click)="skins.openChooser()">
            {{ s.skins }}
          </button>
          @if (version(); as v) {
            <span class="version">{{ t.version(v) }}</span>
          }
        </header>
        <main>
          <app-player />
          <app-playlist />
          <details>
            <summary>{{ t.diagnostics }}</summary>
            <app-diagnostics />
          </details>
        </main>
      </div>
    }
    <app-skin-chooser />
    @if (playlist.dragOver()) {
      <div class="drop" aria-hidden="true">{{ p.dropHere }}</div>
    }
  `,
  styleUrl: './app.css',
  // the one keyboard listener of the app: shortcuts are actions (core/actions)
  host: {
    '(document:keydown)': 'actions.handleKey($event)',
    '(window:resize)': 'fitWindow()',
  },
})
export class App {
  private readonly diagnostics = inject(DiagnosticsStore);
  protected readonly actions = inject(ActionService);
  protected readonly playlist = inject(PlaylistStore);
  protected readonly skins = inject(SkinStore);
  protected readonly t = APP_TEXTS;
  protected readonly p = PLAYLIST_TEXTS;
  protected readonly s = SKINS_TEXTS;
  protected readonly version = computed(() => this.diagnostics.info()?.app.version ?? null);

  constructor() {
    // actions belong to the app, not to one way of showing the player: every skin uses them
    const unregister = this.actions.register([
      ...playerActions(inject(PlayerStore), this.playlist),
      {
        id: 'app.skins',
        label: () => this.s.chooseSkin,
        shortcut: { key: 'k', mod: true },
        run: () => void this.skins.openChooser(),
      },
      {
        // the way out of any skin: no skin can take this key away
        id: 'app.resetSkin',
        label: () => this.s.resetSkin,
        shortcut: { key: '0', mod: true },
        run: () => void this.skins.reset(),
      },
    ]);
    inject(DestroyRef).onDestroy(unregister);
    // once a fixed-size skin is on screen: does the window give it the room it asks for?
    afterRenderEffect(() => {
      if (this.skins.absolutePlayer()) {
        this.fitWindow();
      }
    });
  }

  protected fitWindow(): void {
    this.skins.fitWindow(window.innerWidth, window.innerHeight);
  }
}
