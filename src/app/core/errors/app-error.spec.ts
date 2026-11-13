import { setLanguage } from '../i18n/i18n';
import { BACKEND_ERROR_CODES, describeError, toAppError } from './app-error';
import { ERROR_TEXTS_EN } from './error-texts';

describe('AppError', () => {
  afterEach(() => setLanguage('en'));

  /** The same list is asserted in crates/fc-core/src/error.rs (`codes_match_the_frontend_contract`). */
  it('knows exactly the codes of the backend', () => {
    expect([...BACKEND_ERROR_CODES]).toEqual([
      'not_found',
      'permission_denied',
      'io',
      'unsupported_format',
      'decode_failed',
      'no_output_device',
      'audio_device',
      'output_busy',
      'invalid_skin',
      'internal',
    ]);
  });

  it('has a text for every code', () => {
    for (const code of [...BACKEND_ERROR_CODES, 'backend_unavailable', 'unknown'] as const) {
      expect(ERROR_TEXTS_EN[code]).toBeTruthy();
    }
  });

  it('takes over what the backend sends', () => {
    expect(
      toAppError({ code: 'decode_failed', message: 'a.flac: cut off', details: 'eof' }),
    ).toEqual({ code: 'decode_failed', message: 'a.flac: cut off', details: 'eof' });
    expect(toAppError({ code: 'io', message: 'x' })).toEqual({ code: 'io', message: 'x' });
  });

  it('turns anything else into "unknown" without losing the message', () => {
    expect(toAppError(new Error('boom'))).toEqual({ code: 'unknown', message: 'boom' });
    expect(toAppError('plain text')).toEqual({ code: 'unknown', message: 'plain text' });
    expect(toAppError(null)).toEqual({ code: 'unknown', message: 'null' });
    expect(toAppError({ code: 42, message: 'x' }).code).toBe('unknown');
    expect(toAppError({ code: 'brand_new_code', message: 'from a newer backend' })).toEqual({
      code: 'unknown',
      message: 'from a newer backend',
    });
  });

  it('describes errors in the current language', () => {
    const error = toAppError({ code: 'no_output_device', message: 'no audio output device' });
    expect(describeError(error)).toBe('No audio output device found');
    setLanguage('de');
    expect(describeError(error)).toBe('Kein Audio-Ausgabegerät gefunden');
  });

  it('shows the message where the code says nothing', () => {
    expect(describeError({ code: 'unknown', message: 'boom' })).toBe('Unexpected error: boom');
    expect(describeError({ code: 'internal', message: 'state' })).toBe('Internal error: state');
  });
});
