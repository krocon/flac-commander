import { TestBed } from '@angular/core/testing';
import { ActionService } from '../../core/actions/action.service';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { EMPTY_PLAYER_STATE } from '../../core/player/player.models';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import {
  FakeLogApi,
  FakePlayerApi,
  FakePlaylistApi,
  PLAYLIST,
  TRACK_STATE,
} from '../../../testing/fake-apis';
import { PlaylistStore } from '../playlist/playlist.store';
import { Player } from './player';
import { playerActions } from './player.actions';
import { PlayerStore } from './player.store';

describe('Player', () => {
  let api: FakePlayerApi;
  let playlistApi: FakePlaylistApi;
  let el: HTMLElement;
  let actions: ActionService;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: api },
        { provide: PlaylistApi, useValue: playlistApi },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    // the app registers the player's actions; here the test does
    actions = TestBed.inject(ActionService);
    actions.register(playerActions(TestBed.inject(PlayerStore), TestBed.inject(PlaylistStore)));
    el = TestBed.createComponent(Player).nativeElement as HTMLElement;
  }

  function button(label: string): HTMLButtonElement {
    const found = el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!found) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  }

  function slider(label: string): HTMLInputElement {
    const found = el.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    if (!found) {
      throw new Error(`no slider "${label}"`);
    }
    return found;
  }

  function text(selector: string): string {
    return el.querySelector(selector)?.textContent?.trim() ?? '';
  }

  function press(key: string, target: HTMLElement = el): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    actions.handleKey(event);
    return event;
  }

  beforeEach(() => {
    setLanguage('de');
    api = new FakePlayerApi();
    playlistApi = new FakePlaylistApi();
  });

  afterEach(() => setLanguage('en'));

  it('invites to open a file while nothing is loaded', async () => {
    create();
    await vi.waitFor(() => expect(text('.title')).toBe('Kein Titel geladen'));
    expect(slider('Position').disabled).toBe(true);
    expect(button('Stopp').disabled).toBe(true);
    expect(button('Wiedergabe').disabled).toBe(false);
    expect(text('[role=status]')).toBe('');
  });

  it('shows the running track with time, format and status', async () => {
    api.snapshot = TRACK_STATE;
    create();
    await vi.waitFor(() => expect(text('.title')).toBe('12 People.flac'));
    expect(text('.details')).toBe('FLAC · 44,1 kHz · 16 Bit · Stereo');
    expect([...el.querySelectorAll('.time')].map((t) => t.textContent)).toEqual(['1:01', '3:42']);
    expect(slider('Position').value).toBe('61500');
    expect(slider('Position').getAttribute('aria-valuetext')).toBe('1:01 von 3:42');
    expect(slider('Lautstärke').value).toBe('80');
    expect(text('.percent')).toBe('80 %');
    expect(text('[role=status]')).toBe('Wiedergabe läuft');
    expect(button('Pause')).toBeTruthy();
  });

  it('sends the commands of its buttons', async () => {
    api.snapshot = TRACK_STATE;
    create();
    await vi.waitFor(() => expect(button('Pause')).toBeTruthy());

    button('Pause').click();
    button('Stopp').click();
    button('Dateien hinzufügen').click();
    await vi.waitFor(() => expect(api.commands).toEqual(['pause', 'stop']));
    await vi.waitFor(() => expect(playlistApi.commands).toEqual(['open "Dateien hinzufügen"']));

    api.emit({ ...TRACK_STATE, status: 'paused' });
    await vi.waitFor(() => expect(button('Wiedergabe')).toBeTruthy());
    expect(text('[role=status]')).toBe('Pausiert');
    button('Wiedergabe').click();
    await vi.waitFor(() => expect(api.commands.at(-1)).toBe('play'));
  });

  it('seeks when the seek slider is released, not while it is dragged', async () => {
    api.snapshot = TRACK_STATE;
    create();
    await vi.waitFor(() => expect(slider('Position').disabled).toBe(false));
    const seek = slider('Position');

    seek.value = '120000';
    seek.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(el.querySelector('.time')?.textContent).toBe('2:00'));
    expect(api.commands).toEqual([]);

    seek.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(api.commands).toEqual(['seek 120000']));
  });

  it('sets the volume while the volume slider moves', async () => {
    api.snapshot = TRACK_STATE;
    create();
    await vi.waitFor(() => expect(slider('Lautstärke').value).toBe('80'));
    const volume = slider('Lautstärke');
    volume.value = '35';
    volume.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(api.commands).toEqual(['volume 0.35']));
    await vi.waitFor(() => expect(text('.percent')).toBe('35 %'));
  });

  it('is operable by keyboard through the action system', async () => {
    api.snapshot = TRACK_STATE;
    create();
    await vi.waitFor(() => expect(button('Pause')).toBeTruthy());

    expect(press(' ').defaultPrevented).toBe(true);
    press('ArrowRight');
    press('ArrowLeft');
    press('ArrowUp');
    press('ArrowDown');
    press('v');
    await vi.waitFor(() =>
      expect(api.commands).toEqual([
        'pause',
        'seek 66500',
        'seek 56500',
        'volume 0.85',
        'volume 0.75',
        'stop',
      ]),
    );
  });

  it('leaves the arrow keys to a focused slider and Space to a focused button', async () => {
    api.snapshot = TRACK_STATE;
    create();
    await vi.waitFor(() => expect(button('Pause')).toBeTruthy());
    press('ArrowRight', slider('Lautstärke'));
    press(' ', button('Stopp'));
    expect(api.commands).toEqual([]);
  });

  it('shows title and artist from the tags of the current playlist entry', async () => {
    api.snapshot = TRACK_STATE;
    playlistApi.snapshot = PLAYLIST;
    create();
    await vi.waitFor(() => expect(text('.title')).toBe('People'));
    expect(text('.details')).toBe('Barbra Streisand · FLAC · 44,1 kHz · 16 Bit · Stereo');
  });

  it('moves through the playlist and switches repeat and shuffle', async () => {
    api.snapshot = TRACK_STATE;
    playlistApi.snapshot = PLAYLIST;
    create();
    await vi.waitFor(() => expect(button('Nächster Titel').disabled).toBe(false));

    button('Nächster Titel').click();
    button('Vorheriger Titel').click();
    button('Wiederholen: aus').click();
    button('Zufällige Reihenfolge').click();
    press('b');
    press('z');
    await vi.waitFor(() =>
      expect(playlistApi.commands).toEqual([
        'next',
        'previous',
        'repeat all',
        'shuffle true',
        'next',
        'previous',
      ]),
    );

    playlistApi.emit({ ...PLAYLIST, repeat: 'one', shuffle: true });
    await vi.waitFor(() => expect(button('Wiederholen: Titel')).toBeTruthy());
    expect(button('Zufällige Reihenfolge').getAttribute('aria-pressed')).toBe('true');
  });

  it('disables next and previous while the playlist is empty', async () => {
    create();
    await vi.waitFor(() => expect(text('.title')).toBe('Kein Titel geladen'));
    expect(button('Nächster Titel').disabled).toBe(true);
    expect(button('Vorheriger Titel').disabled).toBe(true);
  });

  it('shows the shortcut in the tooltip of a button', async () => {
    create();
    await vi.waitFor(() => expect(button('Stopp').title).toBe('Stopp (V)'));
    expect(button('Wiedergabe').title).toBe('Wiedergabe / Pause (Space)');
  });

  it('shows why a file could not be played', async () => {
    create();
    await vi.waitFor(() => expect(api.handlers.size).toBe(1));
    api.emit({
      ...EMPTY_PLAYER_STATE,
      error: { code: 'unsupported_format', message: 'x.opus: no decoder' },
    });
    await vi.waitFor(() =>
      expect(text('[role=alert]')).toBe('Dieses Audioformat wird nicht unterstützt'),
    );
  });

  it('warns about dropouts only when there were any', async () => {
    api.snapshot = TRACK_STATE;
    create();
    await vi.waitFor(() => expect(button('Pause')).toBeTruthy());
    expect(el.querySelector('.underruns')).toBeNull();
    api.emit({ ...TRACK_STATE, underruns: 3 });
    await vi.waitFor(() => expect(text('.underruns')).toBe('Aussetzer: 3'));
  });
});
