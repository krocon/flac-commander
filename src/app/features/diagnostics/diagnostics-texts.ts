import { translatable } from '../../core/i18n/i18n';
import { DIAGNOSTICS_TEXTS_DE } from './diagnostics-texts.de';

export const DIAGNOSTICS_TEXTS_EN = {
  loading: 'Reading system information …',
  reload: 'Reload',
  system: 'System',
  platform: 'Platform',
  audioBackend: 'Audio backend',
  logFolder: 'Log folder',
  none: 'none',
  output: 'Audio output',
  defaultFormat: 'Default format',
  format: (sampleRate: string, channels: number) =>
    `${sampleRate} Hz, ${channels} ${channels === 1 ? 'channel' : 'channels'}`,
  devices: 'Devices',
  noDevices: 'No output device found. Connect or enable one and reload.',
  defaultDevice: 'default',
  testTone: 'Play test tone',
  testToneHint: 'Plays a short, quiet 440 Hz tone on the default device.',
  toneStarting: 'Opening the output …',
  tonePlaying: 'Test tone is playing …',
  toneDone: 'Test tone played. If you heard nothing, check device and volume.',
  toneFailed: 'The test tone could not be played',
  formats: 'Audio formats',
  formatsCaption: 'What this build decodes, verified by tests',
  formatName: 'Format',
  extensions: 'File extensions',
  status: 'Status',
  supported: 'supported',
  unsupported: 'not yet supported',
};

export const DIAGNOSTICS_TEXTS = translatable('diagnostics', DIAGNOSTICS_TEXTS_EN, {
  de: DIAGNOSTICS_TEXTS_DE,
});
