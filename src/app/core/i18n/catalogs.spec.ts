import '../../app-texts';
import '../../features/diagnostics/diagnostics-texts';
import '../../features/equalizer/equalizer-texts';
import '../../features/library/library-texts';
import '../../features/player/player-texts';
import '../../features/playlist/playlist-texts';
import '../../features/skins/skins-texts';
import '../errors/error-texts';
import { CATALOGS, LANGUAGES } from './i18n';

/** Every catalog is imported above; a new one is added there. */
describe('text catalogs', () => {
  const catalogs = [...CATALOGS].filter(([name]) => !name.startsWith('spec-'));

  it('are registered', () => {
    expect(catalogs.map(([name]) => name).sort()).toEqual([
      'app',
      'diagnostics',
      'equalizer',
      'errors',
      'library',
      'player',
      'playlist',
      'skins',
    ]);
  });

  it.each(catalogs)('%s has every key in every language, with the same kind of value', (_, c) => {
    const en = c.en as Record<string, unknown>;
    for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
      const tr = c.tr[lang] as Record<string, unknown>;
      expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(typeof tr[key], `${lang}.${key}`).toBe(typeof en[key]);
        if (typeof tr[key] === 'string') {
          expect((tr[key] as string).trim(), `${lang}.${key}`).not.toBe('');
        }
      }
    }
  });
});
