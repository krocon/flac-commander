import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { toAppError } from '../../core/errors/app-error';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import {
  EQUALIZER_MAX_DB,
  EqualizerPreset,
  EqualizerSettings,
} from '../../core/player/player.models';
import { PlayerStore } from '../player/player.store';

/** The id shown when the settings match no preset. */
export const CUSTOM_PRESET = 'custom';

function clampDb(value: number): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(value, -EQUALIZER_MAX_DB), EQUALIZER_MAX_DB)
    : 0;
}

function sameValues(settings: EqualizerSettings, preset: EqualizerPreset): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) < 0.05;
  return (
    close(settings.preampDb, preset.preampDb) &&
    settings.gainsDb.length === preset.gainsDb.length &&
    settings.gainsDb.every((gain, i) => close(gain, preset.gainsDb[i]))
  );
}

/**
 * The equalizer as this window sees it: the settings the engine reports, and – while a slider
 * is being moved – what the user is setting right now.
 */
@Injectable({ providedIn: 'root' })
export class EqualizerStore {
  private readonly api = inject(PlayerApi);
  private readonly log = inject(LogApi);
  private readonly player = inject(PlayerStore);

  /** What is being set while sliders move; `null`: show the engine's settings. */
  private readonly draft = signal<EqualizerSettings | null>(null);
  private readonly presetsState = signal<readonly EqualizerPreset[]>([]);
  /** The interaction is over: the next state of the engine replaces the draft. */
  private committed = false;

  readonly settings = computed(() => this.draft() ?? this.player.state().equalizer);
  readonly presets = this.presetsState.asReadonly();
  /** Id of the preset the settings equal, or {@link CUSTOM_PRESET}. */
  readonly presetId = computed(() => {
    const settings = this.settings();
    return this.presetsState().find((p) => sameValues(settings, p))?.id ?? CUSTOM_PRESET;
  });

  readonly ready: Promise<void>;

  constructor() {
    // a state of the engine after the user let go: the draft has done its job
    effect(() => {
      this.player.state();
      if (this.committed) {
        this.committed = false;
        this.draft.set(null);
      }
    });
    this.ready = this.loadPresets();
  }

  private async loadPresets(): Promise<void> {
    try {
      this.presetsState.set(await this.api.equalizerPresets());
    } catch (e) {
      const error = toAppError(e);
      this.log.error(`equalizer_presets failed: ${error.code}: ${error.message}`);
    }
  }

  setEnabled(enabled: boolean): Promise<void> {
    return this.apply({ ...this.settings(), enabled }, true);
  }

  /** A band slider moves (`final`: it was released). */
  setGain(band: number, db: number, final: boolean): Promise<void> {
    const gainsDb = this.settings().gainsDb.map((gain, i) => (i === band ? clampDb(db) : gain));
    return this.apply({ ...this.settings(), gainsDb }, final);
  }

  setPreamp(db: number, final: boolean): Promise<void> {
    return this.apply({ ...this.settings(), preampDb: clampDb(db) }, final);
  }

  /** Takes over the values of a preset and switches the equalizer on. */
  applyPreset(id: string): Promise<void> {
    const preset = this.presetsState().find((p) => p.id === id);
    if (!preset) {
      return Promise.resolve();
    }
    return this.apply({ enabled: true, preampDb: preset.preampDb, gainsDb: preset.gainsDb }, true);
  }

  /** Everything back to 0 dB; on or off stays as it is. */
  reset(): Promise<void> {
    const settings = this.settings();
    return this.apply({ ...settings, preampDb: 0, gainsDb: settings.gainsDb.map(() => 0) }, true);
  }

  private async apply(settings: EqualizerSettings, final: boolean): Promise<void> {
    this.committed = false;
    this.draft.set(settings);
    try {
      await this.api.setEqualizer(settings);
    } catch (e) {
      const error = toAppError(e);
      this.log.error(`player_set_equalizer failed: ${error.code}: ${error.message}`);
      // nothing was set: show what the engine really has
      this.draft.set(null);
      return;
    }
    this.committed = final;
  }
}
