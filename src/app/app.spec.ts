import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { SkinStore } from './features/skins/skin.store';
import { ActionService } from './core/actions/action.service';
import { setLanguage } from './core/i18n/i18n';
import { LogApi } from './core/log/log-api';
import { PlayerApi } from './core/player/player-api';
import { PlaylistApi } from './core/playlist/playlist-api';
import { SkinApi } from './core/skins/skin-api';
import { SystemApi } from './core/system/system-api';
import { WindowApi } from './core/windows/window-api';
import {
  FakeLogApi,
  FakePlayerApi,
  FakePlaylistApi,
  FakeSkinApi,
  FakeSystemApi,
  FakeWindowApi,
  MODERN_SKIN,
  RETRO_SKIN,
} from '../testing/fake-apis';

describe('App', () => {
  let skins: FakeSkinApi;
  let playlist: FakePlaylistApi;
  let player: FakePlayerApi;
  let windows: FakeWindowApi;
  let el: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: player },
        { provide: PlaylistApi, useValue: playlist },
        { provide: SkinApi, useValue: skins },
        { provide: WindowApi, useValue: windows },
        { provide: SystemApi, useValue: new FakeSystemApi() },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    el = TestBed.createComponent(App).nativeElement as HTMLElement;
  }

  function press(key: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  }

  /** ⌘ on macOS, Ctrl elsewhere – whatever this test machine is. */
  const mod = /mac/i.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };

  beforeEach(() => {
    setLanguage('de');
    skins = new FakeSkinApi();
    playlist = new FakePlaylistApi();
    player = new FakePlayerApi();
    windows = new FakeWindowApi();
  });

  afterEach(() => setLanguage('en'));

  it('shows the standard layout for a skin that only brings colours', async () => {
    create();
    await vi.waitFor(() => expect(el.querySelector('app-player')).not.toBeNull());
    expect(el.querySelector('app-playlist')).not.toBeNull();
    expect(el.querySelector('app-skinned-player')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toBe('FLAC Commander');
  });

  it('hands the whole window to a skin with its own layout, and back', async () => {
    skins.snapshot = RETRO_SKIN;
    create();
    await vi.waitFor(() => expect(el.querySelector('app-skinned-player')).not.toBeNull());
    expect(el.querySelector('app-player')).toBeNull();
    expect(el.querySelector('h1')).toBeNull();

    skins.emit(MODERN_SKIN);
    await vi.waitFor(() => expect(el.querySelector('app-player')).not.toBeNull());
    expect(el.querySelector('app-skinned-player')).toBeNull();
  });

  it('opens the skin chooser by button and by key', async () => {
    create();
    // in `.flow header`: the chooser dialog has a header with a button of its own
    const skinsButton = () =>
      [...el.querySelectorAll<HTMLButtonElement>('.flow header button')].find(
        (b) => b.textContent?.trim() === 'Skins',
      );
    await vi.waitFor(() => expect(skinsButton()).toBeDefined());
    // the chooser is a window of its own
    skinsButton()?.click();
    await vi.waitFor(() => expect(windows.commands).toEqual(['toggle skins']));
    press('k', mod);
    await vi.waitFor(() => expect(windows.commands).toEqual(['toggle skins', 'toggle skins']));
    const store = TestBed.inject(SkinStore);
    expect(store.chooserOpen()).toBe(false);

    // without a window (no desktop backend) it is a dialog over the player
    windows.failure = { code: 'backend_unavailable', message: 'no backend' };
    skinsButton()?.click();
    await vi.waitFor(() => expect(el.querySelectorAll('.skins > li')).toHaveLength(2));
    // jsdom has no `showModal`: whether the chooser is open is asked of the store
    expect(store.chooserOpen()).toBe(true);
    el.querySelector('dialog')?.dispatchEvent(new Event('close'));
    expect(store.chooserOpen()).toBe(false);
  });

  it('the skins window shows the chooser and nothing else', async () => {
    windows.current = 'skins';
    create();
    await vi.waitFor(() => expect(el.querySelector('app-skin-chooser.page')).not.toBeNull());
    expect(el.querySelector('app-player')).toBeNull();
  });

  it('always has a key back to the standard skin, whatever the skin shows', async () => {
    skins.snapshot = RETRO_SKIN;
    create();
    await vi.waitFor(() => expect(el.querySelector('app-skinned-player')).not.toBeNull());
    press('0', mod);
    await vi.waitFor(() => expect(skins.commands).toContain('activate io.github.krocon.vinyl'));
  });

  it('tells the backend when the window does not give a fixed-size skin its room', async () => {
    skins.snapshot = RETRO_SKIN;
    create();
    // the test window is 1024 × 768, the skin asks for 320 × 440
    await vi.waitFor(() =>
      expect(skins.commands).toEqual([`fit ${window.innerWidth}x${window.innerHeight}`]),
    );
  });

  it('routes shortcuts to the player in every layout', async () => {
    skins.snapshot = RETRO_SKIN;
    create();
    await vi.waitFor(() =>
      expect(TestBed.inject(ActionService).label('player.stop')).toBe('Stopp'),
    );
    press('ArrowUp');
    await vi.waitFor(() => expect(player.commands).toEqual(['volume 1.00']));
  });

  it('moves the playlist to its own window and back', async () => {
    create();
    await vi.waitFor(() => expect(el.querySelector('app-playlist')).not.toBeNull());
    const toggle = el.querySelector<HTMLButtonElement>('.flow header button.first');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');

    toggle?.click();
    await vi.waitFor(() => expect(el.querySelector('app-playlist')).toBeNull());
    expect(windows.commands).toEqual(['toggle playlist']);
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('app-player')).not.toBeNull();

    press('l', mod);
    await vi.waitFor(() => expect(el.querySelector('app-playlist')).not.toBeNull());
    expect(windows.commands).toEqual(['toggle playlist', 'toggle playlist']);
  });

  it('starts without the embedded playlist when its window is open already', async () => {
    windows.open = ['playlist'];
    create();
    await vi.waitFor(() => expect(el.querySelector('app-player')).not.toBeNull());
    await vi.waitFor(() => expect(el.querySelector('app-playlist')).toBeNull());
  });

  it('is the playlist alone in the playlist window, whatever the skin', async () => {
    windows.current = 'playlist';
    skins.snapshot = RETRO_SKIN;
    create();
    await vi.waitFor(() => expect(el.querySelector('.solo app-playlist')).not.toBeNull());
    expect(el.querySelector('app-player')).toBeNull();
    expect(el.querySelector('app-skinned-player')).toBeNull();
    // the skin's colours apply here too, but its window size is the main window's business
    await vi.waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--player-accent')).toBe('#5dff7a'),
    );
    expect(skins.commands).toEqual([]);
    // shortcuts work in every window
    press('ArrowUp');
    await vi.waitFor(() => expect(player.commands).toEqual(['volume 1.00']));
  });

  it('opens the equalizer window by button and key, and is the equalizer alone in it', async () => {
    create();
    await vi.waitFor(() => expect(el.querySelector('.flow header')).not.toBeNull());
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.flow header button')];
    const equalizer = buttons.find((b) => b.textContent?.includes('Equalizer'));
    equalizer?.click();
    await vi.waitFor(() => expect(windows.commands).toEqual(['toggle equalizer']));
    await vi.waitFor(() => expect(equalizer?.getAttribute('aria-pressed')).toBe('true'));
    press('e', mod);
    await vi.waitFor(() => expect(windows.commands).toHaveLength(2));
    // the main window keeps its own layout: the equalizer lives in its window
    expect(el.querySelector('app-equalizer')).toBeNull();

    TestBed.resetTestingModule();
    windows = new FakeWindowApi();
    windows.current = 'equalizer';
    create();
    await vi.waitFor(() => expect(el.querySelector('.solo app-equalizer')).not.toBeNull());
    expect(el.querySelector('app-player')).toBeNull();
    expect(el.querySelector('app-playlist')).toBeNull();
  });

  it('shows where dropped files go while they are dragged over the window', async () => {
    create();
    await vi.waitFor(() => expect(playlist.dragHandlers.size).toBe(1));
    playlist.drag(true);
    await vi.waitFor(() =>
      expect(el.querySelector('.drop')?.textContent).toBe(
        'Loslassen, um zur Playlist hinzuzufügen',
      ),
    );
    playlist.drag(false);
    await vi.waitFor(() => expect(el.querySelector('.drop')).toBeNull());
  });

  it('hides and shows the track list by key and tells the backend', async () => {
    localStorage.removeItem('fc.listHidden');
    create();
    await vi.waitFor(() => expect(el.querySelector('app-playlist')).not.toBeNull());
    press('j', mod);
    await vi.waitFor(() => expect(el.querySelector('app-playlist')).toBeNull());
    expect(skins.commands).toContain('list hidden');
    press('j', mod);
    await vi.waitFor(() => expect(el.querySelector('app-playlist')).not.toBeNull());
    expect(skins.commands.at(-1)).toBe('list shown');
    localStorage.removeItem('fc.listHidden');
  });
});
