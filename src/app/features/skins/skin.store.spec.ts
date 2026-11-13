import { TestBed } from '@angular/core/testing';
import { LogApi } from '../../core/log/log-api';
import { SkinApi } from '../../core/skins/skin-api';
import {
  FakeLogApi,
  FakeSkinApi,
  IMPORTED_INFO,
  MODERN_SKIN,
  RETRO_INFO,
  RETRO_SKIN,
} from '../../../testing/fake-apis';
import { SkinStore } from './skin.store';
import { THEME_VARIABLES } from './theme';

describe('SkinStore', () => {
  let api: FakeSkinApi;
  let log: FakeLogApi;
  const root = document.documentElement;

  async function createStore(): Promise<SkinStore> {
    TestBed.configureTestingModule({
      providers: [
        { provide: SkinApi, useValue: api },
        { provide: LogApi, useValue: log },
      ],
    });
    const store = TestBed.inject(SkinStore);
    await store.ready;
    return store;
  }

  beforeEach(() => {
    api = new FakeSkinApi();
    log = new FakeLogApi();
  });

  afterEach(() => THEME_VARIABLES.forEach((v) => root.style.removeProperty(v)));

  it('applies the theme of the active skin to the document', async () => {
    const store = await createStore();
    expect(store.activeId()).toBe('io.github.krocon.modern');
    expect(root.style.getPropertyValue('--player-accent')).toBe('#ffdd00');
    expect(store.absolutePlayer()).toBeNull();
  });

  it('follows the backend when another skin becomes active', async () => {
    const store = await createStore();
    api.emit(RETRO_SKIN);
    expect(store.activeId()).toBe('io.github.krocon.retro');
    expect(root.style.getPropertyValue('--player-accent')).toBe('#5dff7a');
    expect(root.style.getPropertyValue('--player-background')).toBe('');
    expect(store.absolutePlayer()?.width).toBe(320);
    expect(store.assetUrl('assets/play.png')).toBe('skin://io.github.krocon.retro/assets/play.png');
  });

  it('only asks the backend to activate: the skin changes when the backend says so', async () => {
    const store = await createStore();
    await store.activate('io.github.krocon.retro');
    await store.reset();
    expect(api.commands).toEqual([
      'activate io.github.krocon.retro',
      'activate io.github.krocon.vinyl',
    ]);
    expect(store.activeId()).toBe('io.github.krocon.modern');
  });

  it('loads the list when the chooser opens', async () => {
    const store = await createStore();
    expect(store.list()).toEqual([]);
    await store.openChooser();
    expect(store.chooserOpen()).toBe(true);
    expect(store.list().map((s) => s.name)).toEqual(['Modern', 'Retro']);
    expect(store.previewUrl(RETRO_INFO)).toBe('skin://io.github.krocon.retro/preview.png');
    expect(store.previewUrl(IMPORTED_INFO)).toBeNull();
    store.closeChooser();
    expect(store.chooserOpen()).toBe(false);
  });

  it('imports a skin, tells so and lists it', async () => {
    const store = await createStore();
    await store.openChooser();
    await store.import();
    expect(api.commands).toEqual(['import "Import skin"']);
    expect(store.notice()).toBe('“Neon” was installed.');
    expect(store.list().map((s) => s.name)).toEqual(['Modern', 'Retro', 'Neon']);
  });

  it('says nothing when the import dialog is cancelled', async () => {
    api.imported = null;
    const store = await createStore();
    await store.import();
    expect(store.notice()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('keeps the reasons when a skin is refused', async () => {
    const store = await createStore();
    api.failure = {
      code: 'invalid_skin',
      message: 'the skin was not accepted',
      details: 'theme.accent: must be a colour\nid: must be 3–100 characters',
    };
    await store.import();
    expect(store.error()?.code).toBe('invalid_skin');
    expect(store.error()?.details).toContain('theme.accent');
    expect(store.notice()).toBeNull();
    expect(log.lines).toEqual([
      'error skins_import failed: invalid_skin: the skin was not accepted',
    ]);
  });

  it('removes a skin and refreshes the list', async () => {
    api.skins = [...api.skins, IMPORTED_INFO];
    const store = await createStore();
    await store.openChooser();
    await store.remove('org.example.neon');
    expect(api.commands).toEqual(['remove org.example.neon']);
    expect(store.list().map((s) => s.name)).toEqual(['Modern', 'Retro']);
  });

  it('asks the backend to correct the window of a fixed-size skin, a few times at most', async () => {
    const store = await createStore();
    // the standard skin leaves the window to the user
    store.fitWindow(560, 720);
    expect(api.commands).toEqual([]);

    api.emit(RETRO_SKIN);
    store.fitWindow(320, 440);
    expect(api.commands).toEqual([]);
    for (let i = 0; i < 10; i++) {
      store.fitWindow(320, 412);
    }
    await vi.waitFor(() => expect(api.commands).toHaveLength(3));
    expect(api.commands[0]).toBe('fit 320x412');

    // another skin (or the same again) starts counting anew
    api.emit(RETRO_SKIN);
    store.fitWindow(320, 412);
    await vi.waitFor(() => expect(api.commands).toHaveLength(4));
  });

  it('prefers the event over the older snapshot and ends its subscription', async () => {
    api.snapshot = MODERN_SKIN;
    await createStore();
    expect(api.handlers.size).toBe(1);
    TestBed.resetTestingModule();
    expect(api.handlers.size).toBe(0);
  });
});
