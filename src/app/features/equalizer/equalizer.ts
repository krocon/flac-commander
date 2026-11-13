import { Component, computed, inject } from '@angular/core';
import { locale } from '../../core/i18n/i18n';
import { EQUALIZER_BANDS, EQUALIZER_MAX_DB } from '../../core/player/player.models';
import { EQUALIZER_TEXTS } from './equalizer-texts';
import { CUSTOM_PRESET, EqualizerStore } from './equalizer.store';

/** Short label of a band: `31`, `250`, `1k`, `16k`. */
export function bandLabel(frequency: number): string {
  return frequency >= 1000 ? `${Math.round(frequency / 1000)}k` : `${Math.round(frequency)}`;
}

/** Ten bands, a preamp, presets: the equalizer of the engine. */
@Component({
  selector: 'app-equalizer',
  templateUrl: './equalizer.html',
  styleUrl: './equalizer.css',
})
export class Equalizer {
  protected readonly store = inject(EqualizerStore);
  protected readonly t = EQUALIZER_TEXTS;
  protected readonly max = EQUALIZER_MAX_DB;
  protected readonly custom = CUSTOM_PRESET;

  protected readonly bands = computed(() => {
    const gains = this.store.settings().gainsDb;
    return EQUALIZER_BANDS.map((frequency, index) => ({
      index,
      label: bandLabel(frequency),
      name: this.t.band(new Intl.NumberFormat(locale()).format(Math.round(frequency))),
      gain: gains[index] ?? 0,
    }));
  });

  /** `+3 dB`, `−4.5 dB`, `0 dB` */
  protected dbText(db: number): string {
    const rounded = Math.round(db * 2) / 2;
    const number = new Intl.NumberFormat(locale(), {
      signDisplay: 'exceptZero',
      maximumFractionDigits: 1,
    }).format(rounded);
    return this.t.db(number);
  }

  protected presetName(id: string): string {
    const names: Readonly<Record<string, string>> = this.t.presets;
    return names[id] ?? id;
  }
}
