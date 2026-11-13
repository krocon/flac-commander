import { translatable } from '../../core/i18n/i18n';
import { EQUALIZER_TEXTS_DE } from './equalizer-texts.de';

export const EQUALIZER_TEXTS_EN = {
  equalizer: 'Equalizer',
  openWindow: 'Equalizer window',
  enabled: 'Equalizer on',
  preamp: 'Preamp',
  preset: 'Preset',
  custom: 'Custom',
  reset: 'Reset',
  band: (frequency: string) => `${frequency} Hz`,
  db: (value: string) => `${value} dB`,
  presets: {
    flat: 'Flat',
    bass: 'More bass',
    treble: 'More treble',
    loudness: 'Loudness',
    voice: 'Voice',
  },
};

export const EQUALIZER_TEXTS = translatable('equalizer', EQUALIZER_TEXTS_EN, {
  de: EQUALIZER_TEXTS_DE,
});
