import { afterRenderEffect, Component, computed, DestroyRef, effect, inject } from '@angular/core';
import { APP_TEXTS } from './app-texts';
import { ActionService } from './core/actions/action.service';
import { LogApi } from './core/log/log-api';
import { Diagnostics } from './features/diagnostics/diagnostics';
import { Equalizer } from './features/equalizer/equalizer';
import { EQUALIZER_TEXTS } from './features/equalizer/equalizer-texts';
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
import { WindowsStore } from './features/windows/windows.store';

@Component({
  selector: 'app-root',
  imports: [Diagnostics, Equalizer, Player, Playlist, SkinChooser, SkinnedPlayer],
  template: `
    @if (windows.label === 'equalizer') {
      <div class="solo">
        <app-equalizer />
      </div>
    } @else if (windows.label === 'playlist') {
      <!-- the playlist window: the list and nothing else -->
      <div class="solo">
        <app-playlist />
      </div>
    } @else if (windows.label === 'skins') {
      <!-- the skin chooser as a window of its own: room to look at the skins -->
      <app-skin-chooser [page]="true" />
    } @else if (skins.absolutePlayer(); as layout) {
      <!-- a skin that places everything itself: nothing of the app's own layout around it -->
      <app-skinned-player [layout]="layout" [listAway]="listAway()" />
    } @else {
      <div class="flow">
        <header>
          <h1>{{ t.title }}</h1>
          @if (version(); as v) {
            <span class="version">{{ t.version(v) }}</span>
          }
          <button
            type="button"
            class="first"
            [attr.aria-pressed]="windows.playlistDetached()"
            [title]="actions.hint('window.playlist')"
            (click)="windows.toggle('playlist')"
          >
            {{ p.playlist }}
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4.5 1.5h6v6M10.5 1.5 5.5 6.5M8 9v1.5H1.5V4H3" />
            </svg>
          </button>
          <button
            type="button"
            [attr.aria-pressed]="windows.equalizerOpen()"
            [title]="actions.hint('window.equalizer')"
            (click)="windows.toggle('equalizer')"
          >
            {{ e.equalizer }}
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4.5 1.5h6v6M10.5 1.5 5.5 6.5M8 9v1.5H1.5V4H3" />
            </svg>
          </button>
          <button type="button" [title]="actions.hint('app.skins')" (click)="openSkins()">
            {{ s.skins }}
          </button>
        </header>
        <main>
          <app-player />
          @if (!listAway()) {
            <app-playlist />
          }
          <details>
            <summary>{{ t.diagnostics }}</summary>
            <app-diagnostics />
          </details>
        </main>
      </div>
    }
    @if (windows.label !== 'skins') {
      <app-skin-chooser />
    }
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
  protected readonly windows = inject(WindowsStore);
  protected readonly t = APP_TEXTS;
  protected readonly p = PLAYLIST_TEXTS;
  protected readonly s = SKINS_TEXTS;
  protected readonly e = EQUALIZER_TEXTS;
  /** The main window shows no track list: hidden by the user, or in a window of its own. */
  protected readonly listAway = computed(
    () => this.skins.listHidden() || this.windows.playlistDetached(),
  );
  protected readonly version = computed(() => this.diagnostics.info()?.app.version ?? null);

  constructor() {
    // actions belong to the app, not to one way of showing the player: every skin uses them
    const unregister = this.actions.register([
      ...playerActions(inject(PlayerStore), this.playlist),
      {
        id: 'app.skins',
        label: () => this.s.chooseSkin,
        shortcut: { key: 'k', mod: true },
        active: () => this.windows.skinsOpen(),
        run: () => void this.openSkins(),
      },
      {
        id: 'app.playlist',
        label: () => (this.skins.listHidden() ? this.t.showList : this.t.hideList),
        shortcut: { key: 'j', mod: true },
        active: () => !this.listAway(),
        run: () => this.skins.toggleList(),
      },
      {
        id: 'window.playlist',
        label: () =>
          this.windows.playlistDetached() ? this.t.playlistDocked : this.t.playlistWindow,
        shortcut: { key: 'l', mod: true },
        active: () => this.windows.playlistDetached(),
        run: () => void this.windows.toggle('playlist'),
      },
      {
        id: 'window.equalizer',
        label: () => this.e.openWindow,
        shortcut: { key: 'e', mod: true },
        active: () => this.windows.equalizerOpen(),
        run: () => void this.windows.toggle('equalizer'),
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
    // one line per window in the log file: a window that never says this did not come up
    inject(LogApi).info(`window ${this.windows.label} ready`);
    // the backend sizes the window of a skin that is shorter without its list
    effect(() => {
      const away = this.listAway();
      if (this.windows.isMain) {
        this.skins.tellListAway(away);
      }
    });
    // once a fixed-size skin is on screen: does the window give it the room it asks for?
    afterRenderEffect(() => {
      if (this.windows.isMain && this.skins.absolutePlayer()) {
        this.fitWindow();
      }
    });
  }

  /** The skin chooser has a window of its own; without one (no desktop backend) it is a dialog. */
  protected async openSkins(): Promise<void> {
    await this.windows.toggle('skins');
    if (this.windows.error()) {
      await this.skins.openChooser();
    }
  }

  protected fitWindow(): void {
    // only the main window is sized by the skin
    if (this.windows.isMain) {
      this.skins.fitWindow(window.innerWidth, window.innerHeight, this.listAway());
    }
  }
}
