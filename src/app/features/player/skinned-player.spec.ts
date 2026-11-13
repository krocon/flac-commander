import { TestBed } from '@angular/core/testing';
import { ActionService } from '../../core/actions/action.service';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import { SkinApi } from '../../core/skins/skin-api';
import {
  FakeLogApi,
  FakePlayerApi,
  FakePlaylistApi,
  FakeSkinApi,
  PLAYLIST,
  RETRO_SKIN,
  TRACK_STATE,
} from '../../../testing/fake-apis';
import { PlaylistStore } from '../playlist/playlist.store';
import { playerActions } from './player.actions';
import { PlayerStore } from './player.store';
import { SkinnedPlayer } from './skinned-player';

describe('SkinnedPlayer', () => {
  let player: FakePlayerApi;
  let el: HTMLElement;
  let opened: number;

  beforeEach(async () => {
    setLanguage('de');
    player = new FakePlayerApi();
    player.snapshot = TRACK_STATE;
    const playlist = new FakePlaylistApi();
    playlist.snapshot = PLAYLIST;
    const skins = new FakeSkinApi();
    skins.snapshot = RETRO_SKIN;
    opened = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: player },
        { provide: PlaylistApi, useValue: playlist },
        { provide: SkinApi, useValue: skins },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    TestBed.inject(ActionService).register([
      ...playerActions(TestBed.inject(PlayerStore), TestBed.inject(PlaylistStore)),
      { id: 'app.skins', label: () => 'Skin wählen', run: () => opened++ },
    ]);
    const fixture = TestBed.createComponent(SkinnedPlayer);
    fixture.componentRef.setInput('layout', RETRO_SKIN.player);
    el = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => expect(button('Pause')).toBeTruthy());
  });

  afterEach(() => setLanguage('en'));

  function button(label: string): HTMLButtonElement {
    const found = el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!found) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  }

  function box(element: HTMLElement): string {
    const s = element.style;
    return `${s.left} ${s.top} ${s.width} ${s.height}`;
  }

  it('has the size and background the skin asks for', () => {
    const window = el.querySelector<HTMLElement>('.window');
    expect(window?.style.width).toBe('320px');
    expect(window?.style.height).toBe('440px');
    expect(window?.style.backgroundImage).toBe(
      'url("skin://io.github.krocon.retro/assets/background.png")',
    );
    expect(window?.classList.contains('pixelated')).toBe(true);
  });

  it('puts every component where the skin says', () => {
    expect(box(button('Pause'))).toBe('40px 124px 30px 24px');
    expect(box(el.querySelector<HTMLElement>('input[aria-label="Position"]')!)).toBe(
      '8px 100px 304px 16px',
    );
    expect(box(el.querySelector<HTMLElement>('app-playlist')!)).toBe('10px 166px 300px 264px');
  });

  it('shows the same texts as the standard player', () => {
    const texts = [...el.querySelectorAll('p.text')].map((p) => p.textContent?.trim());
    expect(texts).toEqual(['People', '1:01', 'Wiedergabe läuft', '3:42']);
    const title = el.querySelector<HTMLElement>('p.text');
    expect(title?.style.color).toBe('rgb(93, 255, 122)');
    expect(title?.style.fontSize).toBe('14px');
    expect(el.querySelector('[role=status]')?.textContent?.trim()).toBe('Wiedergabe läuft');
  });

  it('gives a button the pictures of its states and tells whether it is on', () => {
    const play = button('Pause');
    expect(play.classList.contains('pictured')).toBe(true);
    expect(play.style.getPropertyValue('--normal')).toBe(
      'url("skin://io.github.krocon.retro/assets/play.png")',
    );
    expect(play.style.getPropertyValue('--active')).toContain('play-active.png');
    expect(play.style.getPropertyValue('--hover')).toBe('');
    expect(play.classList.contains('active')).toBe(true);
    expect(play.getAttribute('aria-pressed')).toBe('true');
    expect(play.title).toBe('Wiedergabe / Pause (Space)');
  });

  it('shows a button without pictures with its name', () => {
    const stop = button('Stopp');
    expect(stop.classList.contains('pictured')).toBe(false);
    expect(stop.textContent?.trim()).toBe('Stopp');
  });

  it('runs the actions of the app: a skin has no behaviour of its own', async () => {
    button('Pause').click();
    button('Stopp').click();
    button('Skin wählen').click();
    await vi.waitFor(() => expect(player.commands).toEqual(['pause', 'stop']));
    expect(opened).toBe(1);
  });

  it('follows the player: label, state and position', async () => {
    player.emit({ ...TRACK_STATE, status: 'paused', positionMs: 125_000 });
    await vi.waitFor(() => expect(button('Wiedergabe').classList.contains('active')).toBe(false));
    expect(button('Stopp').disabled).toBe(false);
    expect([...el.querySelectorAll('p.text')].map((p) => p.textContent?.trim())).toEqual([
      'People',
      '2:05',
      'Pausiert',
      '3:42',
    ]);
    player.emit({ ...TRACK_STATE, status: 'stopped', positionMs: 0 });
    await vi.waitFor(() => expect(button('Stopp').disabled).toBe(true));
  });

  it('seeks and sets the volume with its sliders', async () => {
    const seek = el.querySelector<HTMLInputElement>('input[aria-label="Position"]')!;
    seek.value = '90000';
    seek.dispatchEvent(new Event('change'));
    const volume = el.querySelector<HTMLInputElement>('input[aria-label="Lautstärke"]')!;
    expect(volume.value).toBe('80');
    volume.value = '20';
    volume.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(player.commands).toEqual(['seek 90000', 'volume 0.20']));
  });

  it('shows an error in place of the status', async () => {
    player.emit({
      ...TRACK_STATE,
      status: 'paused',
      error: { code: 'audio_device', message: 'output stream failed' },
    });
    await vi.waitFor(() =>
      expect(el.querySelector('[role=status]')?.textContent?.trim()).toBe(
        'Das Audio-Ausgabegerät meldet einen Fehler',
      ),
    );
  });
});
