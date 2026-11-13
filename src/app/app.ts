import { Component, computed, inject } from '@angular/core';
import { APP_TEXTS } from './app-texts';
import { ActionService } from './core/actions/action.service';
import { Diagnostics } from './features/diagnostics/diagnostics';
import { DiagnosticsStore } from './features/diagnostics/diagnostics.store';
import { Player } from './features/player/player';
import { Playlist } from './features/playlist/playlist';
import { PLAYLIST_TEXTS } from './features/playlist/playlist-texts';
import { PlaylistStore } from './features/playlist/playlist.store';

@Component({
  selector: 'app-root',
  imports: [Diagnostics, Player, Playlist],
  template: `
    <header>
      <h1>{{ t.title }}</h1>
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
    @if (playlist.dragOver()) {
      <div class="drop" aria-hidden="true">{{ p.dropHere }}</div>
    }
  `,
  styleUrl: './app.css',
  // the one keyboard listener of the app: shortcuts are actions (core/actions)
  host: { '(document:keydown)': 'actions.handleKey($event)' },
})
export class App {
  private readonly diagnostics = inject(DiagnosticsStore);
  protected readonly actions = inject(ActionService);
  protected readonly playlist = inject(PlaylistStore);
  protected readonly t = APP_TEXTS;
  protected readonly p = PLAYLIST_TEXTS;
  protected readonly version = computed(() => this.diagnostics.info()?.app.version ?? null);
}
