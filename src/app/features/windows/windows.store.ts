import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { untilDestroyed } from '../../core/backend/events';
import { AppError, toAppError } from '../../core/errors/app-error';
import { LogApi } from '../../core/log/log-api';
import { SecondaryWindow, WindowApi, WindowLabel } from '../../core/windows/window-api';

/** Which window this is and which other windows are open. */
@Injectable({ providedIn: 'root' })
export class WindowsStore {
  private readonly api = inject(WindowApi);
  private readonly log = inject(LogApi);

  private readonly openState = signal<readonly string[]>([]);
  private readonly errorState = signal<AppError | null>(null);
  private stateReceived = false;

  /** The label of this window: fixed for its lifetime. */
  readonly label: WindowLabel = this.api.label();
  readonly isMain = this.label === 'main';
  readonly open = this.openState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** The playlist has a window of its own: the main window does not show it as well. */
  readonly playlistDetached = computed(() => this.openState().includes('playlist'));
  readonly equalizerOpen = computed(() => this.openState().includes('equalizer'));
  readonly skinsOpen = computed(() => this.openState().includes('skins'));
  readonly libraryOpen = computed(() => this.openState().includes('library'));

  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.connect(inject(DestroyRef));
  }

  private async connect(destroyRef: DestroyRef): Promise<void> {
    try {
      await untilDestroyed(
        this.api.onState((state) => {
          this.stateReceived = true;
          this.openState.set(state.open);
        }),
        destroyRef,
      );
      const snapshot = await this.api.state();
      if (!this.stateReceived) {
        this.openState.set(snapshot.open);
      }
    } catch (e) {
      this.fail('windows_state', e);
    }
  }

  async toggle(label: SecondaryWindow): Promise<void> {
    try {
      await this.api.toggle(label);
      this.errorState.set(null);
    } catch (e) {
      this.fail('windows_toggle', e);
    }
  }

  private fail(command: string, e: unknown): void {
    const error = toAppError(e);
    this.log.error(`${command} failed: ${error.code}: ${error.message}`);
    this.errorState.set(error);
  }
}
