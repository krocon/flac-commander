import { TestBed } from '@angular/core/testing';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import { SkinApi } from '../../core/skins/skin-api';
import { FakeLogApi, FakeSkinApi, IMPORTED_INFO, RETRO_SKIN } from '../../../testing/fake-apis';
import { SkinChooser } from './skin-chooser';
import { SkinStore } from './skin.store';

describe('SkinChooser', () => {
  let api: FakeSkinApi;
  let el: HTMLElement;
  let store: SkinStore;

  beforeEach(async () => {
    setLanguage('de');
    api = new FakeSkinApi();
    api.skins = [...api.skins, IMPORTED_INFO];
    TestBed.configureTestingModule({
      providers: [
        { provide: SkinApi, useValue: api },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    el = TestBed.createComponent(SkinChooser).nativeElement as HTMLElement;
    store = TestBed.inject(SkinStore);
    await store.ready;
  });

  afterEach(() => setLanguage('en'));

  function button(label: string): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find(
      (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label,
    );
    if (!found) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  }

  async function open(): Promise<void> {
    await store.openChooser();
    await vi.waitFor(() => expect(el.querySelectorAll('.skins > li')).toHaveLength(3));
  }

  it('lists the skins with version, origin and preview and marks the active one', async () => {
    await open();
    const rows = [...el.querySelectorAll('.skins > li')].map((li) => ({
      name: li.querySelector('.name')?.textContent?.replace(/\s+/g, ' ').trim(),
      meta: li.querySelector('.meta')?.textContent?.replace(/\s+/g, ' ').trim(),
      preview: li.querySelector('img')?.getAttribute('src') ?? null,
    }));
    expect(rows).toEqual([
      {
        name: 'Modern aktiv',
        meta: 'Version 1.0.0 · von FLAC Commander · mitgeliefert',
        preview: null,
      },
      {
        name: 'Retro',
        meta: 'Version 1.0.0 · von FLAC Commander · mitgeliefert',
        preview: 'skin://io.github.krocon.retro/preview.png',
      },
      { name: 'Neon', meta: 'Version 2.1.0', preview: null },
    ]);
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('Vorschau von Retro');
    expect(button('Verwenden: Modern').disabled).toBe(true);
  });

  it('activates a skin and marks it once the backend has switched', async () => {
    await open();
    button('Verwenden: Retro').click();
    await vi.waitFor(() => expect(api.commands).toEqual(['activate io.github.krocon.retro']));
    api.emit(RETRO_SKIN);
    await vi.waitFor(() => expect(button('Verwenden: Retro').disabled).toBe(true));
    expect(button('Verwenden: Modern').disabled).toBe(false);
  });

  it('offers to remove imported skins only', async () => {
    await open();
    expect(() => button('Entfernen: Modern')).toThrow();
    button('Entfernen: Neon').click();
    await vi.waitFor(() => expect(el.querySelectorAll('.skins > li')).toHaveLength(2));
    expect(api.commands).toEqual(['remove org.example.neon']);
  });

  it('reports an installed skin', async () => {
    api.skins = api.skins.filter((s) => s.id !== IMPORTED_INFO.id);
    await store.openChooser();
    await vi.waitFor(() => expect(el.querySelectorAll('.skins > li')).toHaveLength(2));
    button('Skin importieren …').click();
    await vi.waitFor(() =>
      expect(el.querySelector('[role=status]')?.textContent).toBe('„Neon“ wurde installiert.'),
    );
    expect(el.querySelectorAll('.skins > li')).toHaveLength(3);
  });

  it('lists every reason why a skin was refused', async () => {
    await open();
    api.failure = {
      code: 'invalid_skin',
      message: 'the skin was not accepted',
      details: 'theme.accent: must be a colour\nwindows.player: needs width and height',
    };
    button('Skin importieren …').click();
    await vi.waitFor(() => expect(el.querySelector('[role=alert]')).not.toBeNull());
    const alert = el.querySelector('[role=alert]');
    expect(alert?.querySelector('p')?.textContent).toBe('Der Skin wurde nicht angenommen:');
    expect([...(alert?.querySelectorAll('li') ?? [])].map((li) => li.textContent)).toEqual([
      'theme.accent: must be a colour',
      'windows.player: needs width and height',
    ]);
  });

  it('closes by its button and by the dialog itself (Escape)', async () => {
    await open();
    button('Schließen').click();
    expect(store.chooserOpen()).toBe(false);
    await store.openChooser();
    el.querySelector('dialog')?.dispatchEvent(new Event('close'));
    expect(store.chooserOpen()).toBe(false);
  });
});
