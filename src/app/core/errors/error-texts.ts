import { translatable } from '../i18n/i18n';
import { ERROR_TEXTS_DE } from './error-texts.de';

export const ERROR_TEXTS_EN = {
  not_found: 'File not found',
  permission_denied: 'No permission to read the file',
  io: 'The file could not be read',
  unsupported_format: 'This audio format is not supported',
  decode_failed: 'The file is damaged or incomplete',
  no_output_device: 'No audio output device found',
  audio_device: 'The audio output device reported an error',
  output_busy: 'The audio output is in use',
  internal: 'Internal error',
  backend_unavailable: 'The desktop backend is not available (is the app running in a browser?)',
  unknown: 'Unexpected error',
};

export const ERROR_TEXTS = translatable('errors', ERROR_TEXTS_EN, { de: ERROR_TEXTS_DE });
