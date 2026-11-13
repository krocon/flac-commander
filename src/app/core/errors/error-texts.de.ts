import type { Translation } from '../i18n/i18n';
import type { ERROR_TEXTS_EN } from './error-texts';

export const ERROR_TEXTS_DE: Translation<typeof ERROR_TEXTS_EN> = {
  not_found: 'Datei nicht gefunden',
  permission_denied: 'Keine Leserechte für die Datei',
  io: 'Die Datei konnte nicht gelesen werden',
  unsupported_format: 'Dieses Audioformat wird nicht unterstützt',
  decode_failed: 'Die Datei ist beschädigt oder unvollständig',
  no_output_device: 'Kein Audio-Ausgabegerät gefunden',
  audio_device: 'Das Audio-Ausgabegerät meldet einen Fehler',
  output_busy: 'Die Audio-Ausgabe ist gerade belegt',
  invalid_skin: 'Der Skin wurde nicht angenommen',
  internal: 'Interner Fehler',
  backend_unavailable: 'Das Desktop-Backend ist nicht verfügbar (läuft die App im Browser?)',
  unknown: 'Unerwarteter Fehler',
};
