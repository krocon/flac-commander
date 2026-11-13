import { translatable } from './core/i18n/i18n';
import { APP_TEXTS_DE } from './app-texts.de';

export const APP_TEXTS_EN = {
  title: 'FLAC Commander',
  version: (version: string) => `Version ${version}`,
  diagnostics: 'Diagnostics and audio formats',
};

export const APP_TEXTS = translatable('app', APP_TEXTS_EN, { de: APP_TEXTS_DE });
