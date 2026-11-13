import { language, setLanguage, systemLanguage, translatable } from './i18n';

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('reads the catalog of the current language on every access', () => {
    const texts = translatable(
      'spec-i18n',
      { hello: 'Hello', count: (n: number) => `${n} files` },
      { de: { hello: 'Hallo', count: (n: number) => `${n} Dateien` } },
    );
    expect(texts.hello).toBe('Hello');
    setLanguage('de');
    expect(language()).toBe('de');
    expect(texts.hello).toBe('Hallo');
    expect(texts.count(3)).toBe('3 Dateien');
    expect(document.documentElement.lang).toBe('de');
  });

  it('falls back to English for a key the translation lacks', () => {
    const partial = { a: 'A (de)' } as { a: string; b: string };
    const texts = translatable('spec-i18n-partial', { a: 'A', b: 'B' }, { de: partial });
    setLanguage('de');
    expect(texts.a).toBe('A (de)');
    expect(texts.b).toBe('B');
  });

  it('takes German only if it is the first system language', () => {
    expect(systemLanguage(['de-AT', 'en'])).toBe('de');
    expect(systemLanguage(['de'])).toBe('de');
    expect(systemLanguage(['en-US', 'de'])).toBe('en');
    expect(systemLanguage(['fr-FR'])).toBe('en');
    expect(systemLanguage([])).toBe('en');
  });
});
