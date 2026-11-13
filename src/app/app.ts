import { Component, computed, inject } from '@angular/core';
import { APP_TEXTS } from './app-texts';
import { Diagnostics } from './features/diagnostics/diagnostics';
import { DiagnosticsStore } from './features/diagnostics/diagnostics.store';

@Component({
  selector: 'app-root',
  imports: [Diagnostics],
  template: `
    <header>
      <h1>{{ t.title }}</h1>
      @if (version(); as v) {
        <span class="version">{{ t.version(v) }}</span>
      }
    </header>
    <p class="stage">{{ t.stage }}</p>
    <main>
      <app-diagnostics />
    </main>
  `,
  styleUrl: './app.css',
})
export class App {
  private readonly store = inject(DiagnosticsStore);
  protected readonly t = APP_TEXTS;
  protected readonly version = computed(() => this.store.info()?.app.version ?? null);
}
