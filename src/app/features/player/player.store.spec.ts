import { TestBed } from '@angular/core/testing';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { EMPTY_PLAYER_STATE, PlayerState } from '../../core/player/player.models';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import {
  Deferred,
  FakeLogApi,
  FakePlayerApi,
  FakePlaylistApi,
  PLAYLIST,
  TRACK_STATE,
} from '../../../testing/fake-apis';
import { PlaylistStore } from '../playlist/playlist.store';
import { PlayerStore } from './player.store';

describe('PlayerStore', () => {
  let api: FakePlayerApi;
  let playlistApi: FakePlaylistApi;
  let log: FakeLogApi;

  async function createStore(): Promise<PlayerStore> {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: api },
        { provide: PlaylistApi, useValue: playlistApi },
        { provide: LogApi, useValue: log },
      ],
    });
    const store = TestBed.inject(PlayerStore);
    await store.ready;
    return store;
  }

  beforeEach(() => {
    api = new FakePlayerApi();
    playlistApi = new FakePlaylistApi();
    log = new FakeLogApi();
  });

  afterEach(() => setLanguage('en'));

  it('starts with the state the backend has: a reloaded window shows the running track', async () => {
    api.snapshot = TRACK_STATE;
    const store = await createStore();
    expect(store.isPlaying()).toBe(true);
    expect(store.track()?.fileName).toBe('12 People.flac');
    expect(store.positionMs()).toBe(61_500);
    expect(store.durationMs()).toBe(222_333);
    expect(store.volume()).toBe(0.8);
  });

  it('follows the states the backend reports', async () => {
    const store = await createStore();
    expect(store.hasTrack()).toBe(false);

    api.emit(TRACK_STATE);
    expect(store.status()).toBe('playing');
    api.emit({ ...TRACK_STATE, status: 'paused', positionMs: 70_000 });
    expect(store.status()).toBe('paused');
    expect(store.positionMs()).toBe(70_000);
  });

  it('prefers an event over the older snapshot', async () => {
    const snapshot = new Deferred<PlayerState>();
    api.snapshot = snapshot;
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: api },
        { provide: PlaylistApi, useValue: playlistApi },
        { provide: LogApi, useValue: log },
      ],
    });
    const store = TestBed.inject(PlayerStore);
    await vi.waitFor(() => expect(api.handlers.size).toBe(1));

    api.emit(TRACK_STATE);
    snapshot.resolve(EMPTY_PLAYER_STATE);
    await store.ready;
    expect(store.track()?.fileName).toBe('12 People.flac');
  });

  it('does not change its state by itself: commands only ask the backend', async () => {
    api.snapshot = { ...TRACK_STATE, status: 'paused' };
    const store = await createStore();

    await store.togglePlay();
    expect(api.commands).toEqual(['play']);
    expect(store.status()).toBe('paused');

    api.emit(TRACK_STATE);
    await store.togglePlay();
    expect(api.commands).toEqual(['play', 'pause']);
    expect(store.status()).toBe('playing');
  });

  it('opens the file dialog when there is nothing to play at all', async () => {
    const store = await createStore();
    await store.togglePlay();
    expect(playlistApi.commands).toEqual(['open "Add files"']);
    expect(api.commands).toEqual([]);
  });

  it('starts the playlist when no track is loaded but the list has tracks', async () => {
    playlistApi.snapshot = { ...PLAYLIST, currentId: null };
    const store = await createStore();
    await vi.waitFor(() => expect(playlistApi.handlers.size).toBe(1));
    await TestBed.inject(PlaylistStore).ready;
    await store.togglePlay();
    expect(api.commands).toEqual(['play']);
    expect(playlistApi.commands).toEqual([]);
  });

  it('plays and pauses on their own too, for skins with two buttons', async () => {
    api.snapshot = { ...TRACK_STATE, status: 'paused' };
    const store = await createStore();
    await store.play();
    await store.pause();
    expect(api.commands).toEqual(['play', 'pause']);
  });

  it('seeks relative to the reported position and stays inside the track', async () => {
    api.snapshot = TRACK_STATE;
    const store = await createStore();
    await store.forward();
    await store.back();
    await store.seekTo(999_999_999);
    await store.seekTo(-5);
    await store.seekTo(Number.NaN);
    expect(api.commands).toEqual(['seek 66500', 'seek 56500', 'seek 222333', 'seek 0']);
  });

  it('does not seek without a track', async () => {
    const store = await createStore();
    await store.forward();
    await store.seekTo(1000);
    expect(api.commands).toEqual([]);
  });

  it('changes the volume in steps and keeps it between 0 and 1', async () => {
    api.snapshot = TRACK_STATE;
    const store = await createStore();
    await store.louder();
    await store.quieter();
    await store.setVolume(3);
    await store.setVolume(-1);
    await store.setVolume(Number.NaN);
    expect(api.commands).toEqual(['volume 0.85', 'volume 0.75', 'volume 1.00', 'volume 0.00']);
    expect(store.volume()).toBe(0.8);
  });

  it('shows the dragged seek position without seeking, and seeks on release', async () => {
    api.snapshot = TRACK_STATE;
    const store = await createStore();

    store.previewSeek(100_000);
    expect(store.positionMs()).toBe(100_000);
    // the track goes on meanwhile; the slider stays under the finger
    api.emit({ ...TRACK_STATE, positionMs: 62_000 });
    expect(store.positionMs()).toBe(100_000);
    expect(api.commands).toEqual([]);

    await store.commitSeek(120_000);
    expect(api.commands).toEqual(['seek 120000']);
    expect(store.positionMs()).toBe(120_000);

    api.emit({ ...TRACK_STATE, positionMs: 120_050 });
    expect(store.positionMs()).toBe(120_050);
  });

  it('sets the volume while its slider is dragged and takes over the backend value after', async () => {
    api.snapshot = TRACK_STATE;
    const store = await createStore();

    await store.previewVolume(0.5);
    await store.previewVolume(0.4);
    expect(api.commands).toEqual(['volume 0.50', 'volume 0.40']);
    // an echo of the first step must not pull the slider back
    api.emit({ ...TRACK_STATE, volume: 0.5 });
    expect(store.volume()).toBe(0.4);

    store.commitVolume();
    api.emit({ ...TRACK_STATE, volume: 0.4 });
    expect(store.volume()).toBe(0.4);
    api.emit({ ...TRACK_STATE, volume: 0.9 });
    expect(store.volume()).toBe(0.9);
  });

  it('shows an error the backend reports with a state, and drops it with the next state', async () => {
    const store = await createStore();
    const error = { code: 'unsupported_format', message: 'x.opus: no decoder' } as const;
    api.emit({ ...EMPTY_PLAYER_STATE, error });
    expect(store.error()).toEqual(error);
    api.emit(TRACK_STATE);
    expect(store.error()).toBeNull();
  });

  it('shows and logs a command the backend refused, until a command succeeds', async () => {
    api.snapshot = TRACK_STATE;
    const store = await createStore();
    api.failure = { code: 'internal', message: 'the audio engine is not running' };
    await store.stop();
    expect(store.error()?.code).toBe('internal');
    expect(log.lines).toEqual([
      'error player_stop failed: internal: the audio engine is not running',
    ]);

    api.failure = null;
    await store.stop();
    expect(store.error()).toBeNull();
  });

  it('reports a backend that is not there', async () => {
    api.snapshot = new Deferred<PlayerState>();
    api.snapshot.reject({ code: 'backend_unavailable', message: 'no backend' });
    const store = await createStore();
    expect(store.error()?.code).toBe('backend_unavailable');
    expect(store.hasTrack()).toBe(false);
  });

  it('ends its subscription when it is destroyed', async () => {
    await createStore();
    expect(api.handlers.size).toBe(1);
    TestBed.resetTestingModule();
    expect(api.handlers.size).toBe(0);
  });
});
