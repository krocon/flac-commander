import { translatable } from './core/i18n/i18n';
import { APP_TEXTS_DE } from './app-texts.de';

export const APP_TEXTS_EN = {
  title: 'FLAC Commander',
  version: (version: string) => `Version ${version}`,
  stage: 'Foundation build (phase 1): the player interface follows with the audio engine.',
};

export const APP_TEXTS = translatable('app', APP_TEXTS_EN, { de: APP_TEXTS_DE });
