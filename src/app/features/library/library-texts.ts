import { translatable } from '../../core/i18n/i18n';
import { LIBRARY_TEXTS_DE } from './library-texts.de';

export const LIBRARY_TEXTS_EN = {
  library: 'Library',
  openWindow: 'Library',
  addFolder: 'Add folder',
  addFolderTitle: 'Choose music folders',
  rescan: 'Read again',
  removeFolder: (name: string) => `Remove “${name}” from the library`,
  search: 'Search',
  searchHint: 'Folder, album, artist or title',
  clearSearch: 'Clear search',
  empty: 'Your library is empty',
  emptyHint: 'Choose the folders your music is in. Nothing is copied or changed.',
  emptyFolder: 'No music in this folder',
  path: 'Path',
  folders: 'Folders',
  albums: 'Albums',
  tracks: 'Tracks',
  folder: 'Folder',
  trackCount: (tracks: number) => (tracks === 1 ? '1 track' : `${tracks} tracks`),
  play: (name: string) => `Play “${name}”`,
  add: (name: string) => `Add “${name}” to the playlist`,
  open: (name: string) => `Open “${name}”`,
  playAll: 'Play',
  addAll: 'Add to playlist',
  scanning: (tracks: number) => `Reading the library … ${tracks} tracks`,
  scanned: (tracks: number, folders: number) => `${tracks} tracks in ${folders} folders`,
  added: (tracks: number) =>
    tracks === 1 ? '1 track added to the playlist' : `${tracks} tracks added to the playlist`,
  nothingToPlay: 'Nothing playable in there',
  noResults: (query: string) => `Nothing found for “${query}”`,
  noResultsYet: 'The library is still being read – results may be incomplete.',
  more: 'There are more results – add a word to narrow the search.',
};

export const LIBRARY_TEXTS = translatable('library', LIBRARY_TEXTS_EN, { de: LIBRARY_TEXTS_DE });
