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
import {
  FakeLogApi,
  FakePlayerApi,
  FakePlaylistApi,
  FakeSkinApi,
  FakeSystemApi,
  MODERN_SKIN,
  RETRO_SKIN,
} from '../testing/fake-apis';

describe('App', () => {
  let skins: FakeSkinApi;
  let playlist: FakePlaylistApi;
  let player: FakePlayerApi;
  let el: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: player },
        { provide: PlaylistApi, useValue: playlist },
        { provide: SkinApi, useValue: skins },
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
    // `.flow header`: the chooser dialog has a header with a button of its own
    await vi.waitFor(() => expect(el.querySelector('.flow header button')).not.toBeNull());
    el.querySelector<HTMLButtonElement>('.flow header button')?.click();
    await vi.waitFor(() => expect(el.querySelectorAll('.skins > li')).toHaveLength(2));

    // jsdom has no `showModal`: whether the chooser is open is asked of the store
    const store = TestBed.inject(SkinStore);
    expect(store.chooserOpen()).toBe(true);
    el.querySelector('dialog')?.dispatchEvent(new Event('close'));
    expect(store.chooserOpen()).toBe(false);
    press('k', mod);
    expect(store.chooserOpen()).toBe(true);
  });

  it('always has a key back to the standard skin, whatever the skin shows', async () => {
    skins.snapshot = RETRO_SKIN;
    create();
    await vi.waitFor(() => expect(el.querySelector('app-skinned-player')).not.toBeNull());
    press('0', mod);
    await vi.waitFor(() => expect(skins.commands).toContain('activate io.github.krocon.modern'));
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
});
