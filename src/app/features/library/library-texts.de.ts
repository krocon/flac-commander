import type { Translation } from '../../core/i18n/i18n';
import type { LIBRARY_TEXTS_EN } from './library-texts';

export const LIBRARY_TEXTS_DE: Translation<typeof LIBRARY_TEXTS_EN> = {
  library: 'Bibliothek',
  openWindow: 'Bibliothek',
  addFolder: 'Ordner hinzufügen',
  addFolderTitle: 'Musikordner wählen',
  rescan: 'Neu einlesen',
  removeFolder: (name: string) => `„${name}“ aus der Bibliothek entfernen`,
  search: 'Suchen',
  searchHint: 'Ordner, Album, Interpret oder Titel',
  clearSearch: 'Suche leeren',
  empty: 'Die Bibliothek ist leer',
  emptyHint:
    'Wählen Sie die Ordner, in denen Ihre Musik liegt. Nichts wird kopiert oder verändert.',
  emptyFolder: 'Keine Musik in diesem Ordner',
  path: 'Pfad',
  folders: 'Ordner',
  albums: 'Alben',
  tracks: 'Titel',
  folder: 'Ordner',
  trackCount: (tracks: number) => (tracks === 1 ? '1 Titel' : `${tracks} Titel`),
  play: (name: string) => `„${name}“ abspielen`,
  add: (name: string) => `„${name}“ zur Playlist hinzufügen`,
  open: (name: string) => `„${name}“ öffnen`,
  playAll: 'Abspielen',
  addAll: 'Zur Playlist hinzufügen',
  scanning: (tracks: number) => `Bibliothek wird eingelesen … ${tracks} Titel`,
  scanned: (tracks: number, folders: number) => `${tracks} Titel in ${folders} Ordnern`,
  added: (tracks: number) =>
    tracks === 1 ? '1 Titel zur Playlist hinzugefügt' : `${tracks} Titel zur Playlist hinzugefügt`,
  nothingToPlay: 'Darin ist nichts Abspielbares',
  noResults: (query: string) => `Nichts gefunden für „${query}“`,
  noResultsYet: 'Die Bibliothek wird noch eingelesen – die Treffer können unvollständig sein.',
  more: 'Es gibt weitere Treffer – ein weiteres Wort grenzt die Suche ein.',
};
