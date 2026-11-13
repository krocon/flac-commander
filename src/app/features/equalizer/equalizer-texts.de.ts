import type { Translation } from '../../core/i18n/i18n';
import type { EQUALIZER_TEXTS_EN } from './equalizer-texts';

export const EQUALIZER_TEXTS_DE: Translation<typeof EQUALIZER_TEXTS_EN> = {
  equalizer: 'Equalizer',
  openWindow: 'Equalizer-Fenster',
  enabled: 'Equalizer an',
  preamp: 'Vorverstärkung',
  preset: 'Voreinstellung',
  custom: 'Eigene',
  reset: 'Zurücksetzen',
  band: (frequency: string) => `${frequency} Hz`,
  db: (value: string) => `${value} dB`,
  presets: {
    flat: 'Linear',
    bass: 'Mehr Bass',
    treble: 'Mehr Höhen',
    loudness: 'Loudness',
    voice: 'Stimme',
  },
};
