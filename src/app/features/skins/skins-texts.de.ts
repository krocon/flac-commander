import type { Translation } from '../../core/i18n/i18n';
import type { SKINS_TEXTS_EN } from './skins-texts';

export const SKINS_TEXTS_DE: Translation<typeof SKINS_TEXTS_EN> = {
  skins: 'Skins',
  chooseSkin: 'Skin wählen',
  resetSkin: 'Zurück zum Standard-Skin',
  active: 'aktiv',
  activate: 'Verwenden',
  builtIn: 'mitgeliefert',
  by: (author: string) => `von ${author}`,
  version: (version: string) => `Version ${version}`,
  import: 'Skin importieren …',
  importDialogTitle: 'Skin importieren',
  export: 'Exportieren',
  exportDialogTitle: 'Skin exportieren',
  exported: (name: string) => `„${name}“ wurde gespeichert.`,
  importHint: 'Skins dieser App (.fcskin, .zip) und klassische Winamp-Skins (.wsz).',
  remove: 'Entfernen',
  close: 'Schließen',
  imported: (name: string) => `„${name}“ wurde installiert.`,
  refused: 'Der Skin wurde nicht angenommen:',
  previewOf: (name: string) => `Vorschau von ${name}`,
  filter: 'Skins filtern',
  filterHint: 'Name oder Stichwort …',
  noMatch: 'Kein Skin passt.',
};
