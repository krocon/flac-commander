import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { untilDestroyed } from '../../core/backend/events';
import { AppError, toAppError } from '../../core/errors/app-error';
import { LogApi } from '../../core/log/log-api';
import { SystemApi } from '../../core/system/system-api';
import { SystemInfo, TestToneFinished } from '../../core/system/system.models';

export type ToneState = 'idle' | 'starting' | 'playing' | 'done' | 'failed';

/**
 * System information and the test tone. The state comes from the backend: the tone is `playing`
 * because the backend started it and `done` because the backend said so, never by a timer here.
 */
@Injectable({ providedIn: 'root' })
export class DiagnosticsStore {
  private readonly api = inject(SystemApi);
  private readonly log = inject(LogApi);

  private readonly infoState = signal<SystemInfo | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<AppError | null>(null);
  private readonly toneState = signal<ToneState>('idle');
  private readonly toneErrorState = signal<AppError | null>(null);

  readonly info = this.infoState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /** Why the system information could not be read. */
  readonly error = this.errorState.asReadonly();
  readonly tone = this.toneState.asReadonly();
  readonly toneError = this.toneErrorState.asReadonly();

  readonly hasOutput = computed(() => this.infoState()?.output.defaultFormat != null);
  readonly toneBusy = computed(
    () => this.toneState() === 'starting' || this.toneState() === 'playing',
  );
  readonly canPlayTone = computed(() => this.hasOutput() && !this.toneBusy());

  /** Resolves once the end of a tone can be received; a tone is only started after that. */
  private readonly listening: Promise<void>;
  /** Counts `load()` calls: the answer of an overtaken call is dropped. */
  private loads = 0;

  constructor() {
    this.listening = untilDestroyed(
      this.api.onTestToneFinished((result) => this.onToneFinished(result)),
      inject(DestroyRef),
    );
    // reported when a tone is requested; here it only must not count as unhandled
    this.listening.catch(() => undefined);
  }

  async load(): Promise<void> {
    const load = ++this.loads;
    this.loadingState.set(true);
    try {
      const info = await this.api.systemInfo();
      if (load !== this.loads) {
        return;
      }
      this.infoState.set(info);
      this.errorState.set(null);
    } catch (e) {
      if (load !== this.loads) {
        return;
      }
      const error = toAppError(e);
      this.log.error(`system_info failed: ${error.code}: ${error.message}`);
      this.errorState.set(error);
    } finally {
      if (load === this.loads) {
        this.loadingState.set(false);
      }
    }
  }

  async playTestTone(): Promise<void> {
    if (!this.canPlayTone()) {
      return;
    }
    this.toneState.set('starting');
    this.toneErrorState.set(null);
    try {
      await this.listening;
      await this.api.startTestTone();
      // the end may have been reported already
      if (this.toneState() === 'starting') {
        this.toneState.set('playing');
      }
    } catch (e) {
      this.failTone(toAppError(e));
    }
  }

  private onToneFinished(result: TestToneFinished): void {
    if (result.error) {
      this.failTone(result.error);
    } else {
      this.toneState.set('done');
    }
  }

  private failTone(error: AppError): void {
    this.log.error(`test tone failed: ${error.code}: ${error.message}`);
    this.toneErrorState.set(error);
    this.toneState.set('failed');
  }
}
