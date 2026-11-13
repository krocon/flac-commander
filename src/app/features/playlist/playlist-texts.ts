import { translatable } from '../../core/i18n/i18n';
import { PLAYLIST_TEXTS_DE } from './playlist-texts.de';

export const PLAYLIST_TEXTS_EN = {
  playlist: 'Playlist',
  empty: 'The playlist is empty',
  emptyHint: 'Open files, or drop files and folders onto the window.',
  dropHere: 'Drop to add to the playlist',
  add: 'Add files',
  remove: 'Remove from playlist',
  clear: 'Clear playlist',
  playSelected: 'Play selected track',
  next: 'Next track',
  previous: 'Previous track',
  repeatOff: 'Repeat: off',
  repeatAll: 'Repeat: playlist',
  repeatOne: 'Repeat: track',
  shuffle: 'Shuffle',
  summary: (tracks: number, duration: string) =>
    `${tracks} ${tracks === 1 ? 'track' : 'tracks'} · ${duration}`,
  notPlayable: (reason: string) => `Cannot be played: ${reason}`,
  nowPlaying: 'current track',
};

export const PLAYLIST_TEXTS = translatable('playlist', PLAYLIST_TEXTS_EN, {
  de: PLAYLIST_TEXTS_DE,
});
