import { Component, computed, inject } from '@angular/core';
import { describeError } from '../../core/errors/app-error';
import { locale } from '../../core/i18n/i18n';
import { OutputFormat } from '../../core/system/system.models';
import { DIAGNOSTICS_TEXTS } from './diagnostics-texts';
import { DiagnosticsStore } from './diagnostics.store';

/** Phase 1 screen: shows what the backend found and lets the user test the audio output. */
@Component({
  selector: 'app-diagnostics',
  templateUrl: './diagnostics.html',
  styleUrl: './diagnostics.css',
})
export class Diagnostics {
  protected readonly store = inject(DiagnosticsStore);
  protected readonly t = DIAGNOSTICS_TEXTS;

  private readonly numbers = computed(() => new Intl.NumberFormat(locale()));

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    return error ? describeError(error) : null;
  });

  protected readonly toneText = computed(() => {
    switch (this.store.tone()) {
      case 'starting':
        return this.t.toneStarting;
      case 'playing':
        return this.t.tonePlaying;
      case 'done':
        return this.t.toneDone;
      default:
        return '';
    }
  });

  protected readonly toneErrorText = computed(() => {
    const error = this.store.toneError();
    return error ? `${this.t.toneFailed}: ${describeError(error)}` : null;
  });

  constructor() {
    void this.store.load();
  }

  protected formatText(format: OutputFormat): string {
    return this.t.format(this.numbers().format(format.sampleRate), format.channels);
  }
}
