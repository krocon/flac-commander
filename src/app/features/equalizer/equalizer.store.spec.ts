import { TestBed } from '@angular/core/testing';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { EqualizerSettings, FLAT_EQUALIZER } from '../../core/player/player.models';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import {
  FakeLogApi,
  FakePlayerApi,
  FakePlaylistApi,
  TRACK_STATE,
} from '../../../testing/fake-apis';
import { PlayerStore } from '../player/player.store';
import { EqualizerStore } from './equalizer.store';

describe('EqualizerStore', () => {
  let api: FakePlayerApi;
  let log: FakeLogApi;

  const BASS: EqualizerSettings = {
    enabled: true,
    preampDb: -4,
    gainsDb: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  };

  async function createStore(): Promise<EqualizerStore> {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: api },
        { provide: PlaylistApi, useValue: new FakePlaylistApi() },
        { provide: LogApi, useValue: log },
      ],
    });
    const store = TestBed.inject(EqualizerStore);
    await store.ready;
    await TestBed.inject(PlayerStore).ready;
    return store;
  }

  /** The engine reports settings; effects run. */
  function report(equalizer: EqualizerSettings): void {
    api.emit({ ...TRACK_STATE, equalizer });
    TestBed.tick();
  }

  beforeEach(() => {
    api = new FakePlayerApi();
    log = new FakeLogApi();
  });

  it('shows the settings of the engine and names the preset they equal', async () => {
    api.snapshot = { ...TRACK_STATE, equalizer: BASS };
    const store = await createStore();
    expect(store.settings()).toEqual(BASS);
    expect(store.presetId()).toBe('bass');

    report({ ...BASS, gainsDb: [6, 5, 4, 2, 1, 0, 0, 0, 0, 0] });
    expect(store.presetId()).toBe('custom');
    report(FLAT_EQUALIZER);
    expect(store.presetId()).toBe('flat');
  });

  it('sends every step of a moving slider and keeps showing what the user sets', async () => {
    const store = await createStore();
    await store.setGain(2, 3, false);
    await store.setGain(2, 4.5, false);
    expect(api.commands).toEqual([
      'equalizer off 0 [0,0,3,0,0,0,0,0,0,0]',
      'equalizer off 0 [0,0,4.5,0,0,0,0,0,0,0]',
    ]);
    // an echo of the first step must not pull the slider back
    report({ ...FLAT_EQUALIZER, gainsDb: [0, 0, 3, 0, 0, 0, 0, 0, 0, 0] });
    expect(store.settings().gainsDb[2]).toBe(4.5);

    // released: now the engine's word counts again
    await store.setGain(2, 4.5, true);
    report({ ...FLAT_EQUALIZER, gainsDb: [0, 0, 4.5, 0, 0, 0, 0, 0, 0, 0] });
    expect(store.settings().gainsDb[2]).toBe(4.5);
    report({ ...FLAT_EQUALIZER, gainsDb: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0] });
    expect(store.settings().gainsDb[2]).toBe(1);
  });

  it('keeps values within ±12 dB', async () => {
    const store = await createStore();
    await store.setGain(0, 40, true);
    await store.setPreamp(-99, true);
    await store.setPreamp(Number.NaN, true);
    expect(api.commands).toEqual([
      'equalizer off 0 [12,0,0,0,0,0,0,0,0,0]',
      'equalizer off -12 [12,0,0,0,0,0,0,0,0,0]',
      'equalizer off 0 [12,0,0,0,0,0,0,0,0,0]',
    ]);
  });

  it('switches on and off without touching the bands', async () => {
    api.snapshot = { ...TRACK_STATE, equalizer: { ...BASS, enabled: false } };
    const store = await createStore();
    await store.setEnabled(true);
    expect(api.commands).toEqual(['equalizer on -4 [6,5,4,2,0,0,0,0,0,0]']);
  });

  it('applies a preset and switches the equalizer on with it', async () => {
    const store = await createStore();
    await store.applyPreset('bass');
    await store.applyPreset('no-such-preset');
    expect(api.commands).toEqual(['equalizer on -4 [6,5,4,2,0,0,0,0,0,0]']);
    expect(store.presetId()).toBe('bass');
  });

  it('resets every value to 0 dB and leaves the switch alone', async () => {
    api.snapshot = { ...TRACK_STATE, equalizer: BASS };
    const store = await createStore();
    await store.reset();
    expect(api.commands).toEqual(['equalizer on 0 [0,0,0,0,0,0,0,0,0,0]']);
  });

  it('falls back to the settings of the engine when a change is refused', async () => {
    api.snapshot = { ...TRACK_STATE, equalizer: BASS };
    const store = await createStore();
    api.failure = { code: 'internal', message: 'the audio engine is not running' };
    await store.setGain(0, -6, true);
    expect(store.settings()).toEqual(BASS);
    expect(log.lines).toEqual([
      'error player_set_equalizer failed: internal: the audio engine is not running',
    ]);
  });
});
