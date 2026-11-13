import type { Translation } from '../../core/i18n/i18n';
import type { DIAGNOSTICS_TEXTS_EN } from './diagnostics-texts';

export const DIAGNOSTICS_TEXTS_DE: Translation<typeof DIAGNOSTICS_TEXTS_EN> = {
  loading: 'Systeminformationen werden gelesen …',
  reload: 'Neu laden',
  system: 'System',
  platform: 'Plattform',
  audioBackend: 'Audio-Backend',
  logFolder: 'Protokollordner',
  none: 'keiner',
  output: 'Audio-Ausgabe',
  defaultFormat: 'Standardformat',
  format: (sampleRate: string, channels: number) =>
    `${sampleRate} Hz, ${channels} ${channels === 1 ? 'Kanal' : 'Kanäle'}`,
  devices: 'Geräte',
  noDevices: 'Kein Ausgabegerät gefunden. Gerät anschließen oder aktivieren und neu laden.',
  defaultDevice: 'Standard',
  testTone: 'Testton abspielen',
  testToneHint: 'Spielt einen kurzen, leisen 440-Hz-Ton auf dem Standardgerät.',
  toneStarting: 'Ausgabe wird geöffnet …',
  tonePlaying: 'Testton läuft …',
  toneDone: 'Testton abgespielt. Wenn nichts zu hören war: Gerät und Lautstärke prüfen.',
  toneFailed: 'Der Testton konnte nicht abgespielt werden',
  formats: 'Audioformate',
  formatsCaption: 'Was dieser Build dekodiert, durch Tests belegt',
  formatName: 'Format',
  extensions: 'Dateiendungen',
  status: 'Status',
  supported: 'unterstützt',
  unsupported: 'noch nicht unterstützt',
};
