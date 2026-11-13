import type { Translation } from './core/i18n/i18n';
import type { APP_TEXTS_EN } from './app-texts';

export const APP_TEXTS_DE: Translation<typeof APP_TEXTS_EN> = {
  title: 'FLAC Commander',
  version: (version: string) => `Version ${version}`,
  diagnostics: 'Diagnose und Audioformate',
  playlistWindow: 'Playlist in eigenem Fenster',
  playlistDocked: 'Playlist im Hauptfenster',
};
