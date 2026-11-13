import type { Translation } from '../../core/i18n/i18n';
import type { PLAYLIST_TEXTS_EN } from './playlist-texts';

export const PLAYLIST_TEXTS_DE: Translation<typeof PLAYLIST_TEXTS_EN> = {
  playlist: 'Playlist',
  empty: 'Die Playlist ist leer',
  emptyHint: 'Dateien öffnen oder Dateien und Ordner auf das Fenster ziehen.',
  dropHere: 'Loslassen, um zur Playlist hinzuzufügen',
  add: 'Dateien hinzufügen',
  remove: 'Aus der Playlist entfernen',
  clear: 'Playlist leeren',
  playSelected: 'Ausgewählten Titel abspielen',
  next: 'Nächster Titel',
  previous: 'Vorheriger Titel',
  repeatOff: 'Wiederholen: aus',
  repeatAll: 'Wiederholen: Playlist',
  repeatOne: 'Wiederholen: Titel',
  shuffle: 'Zufällige Reihenfolge',
  summary: (tracks: number, duration: string) =>
    `${tracks} ${tracks === 1 ? 'Titel' : 'Titel'} · ${duration}`,
  notPlayable: (reason: string) => `Nicht abspielbar: ${reason}`,
  nowPlaying: 'aktueller Titel',
};
