import { translatable } from '../../core/i18n/i18n';
import { SKINS_TEXTS_DE } from './skins-texts.de';

export const SKINS_TEXTS_EN = {
  skins: 'Skins',
  chooseSkin: 'Choose skin',
  resetSkin: 'Back to the standard skin',
  active: 'active',
  activate: 'Use',
  builtIn: 'built in',
  by: (author: string) => `by ${author}`,
  version: (version: string) => `Version ${version}`,
  import: 'Import skin …',
  importDialogTitle: 'Import skin',
  export: 'Export',
  exportDialogTitle: 'Export skin',
  exported: (name: string) => `“${name}” was saved.`,
  importHint: 'Skins of this app (.fcskin, .zip) and classic Winamp skins (.wsz).',
  remove: 'Remove',
  close: 'Close',
  imported: (name: string) => `“${name}” was installed.`,
  refused: 'The skin was not accepted:',
  previewOf: (name: string) => `Preview of ${name}`,
  filter: 'Filter skins',
  filterHint: 'Name or keyword …',
  noMatch: 'No skin matches.',
};

export const SKINS_TEXTS = translatable('skins', SKINS_TEXTS_EN, { de: SKINS_TEXTS_DE });
