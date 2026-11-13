import { Unsubscribe } from '../app/core/backend/events';
import { LogApi } from '../app/core/log/log-api';
import { PlayerApi } from '../app/core/player/player-api';
import { EMPTY_PLAYER_STATE, PlayerState } from '../app/core/player/player.models';
import { PlaylistApi } from '../app/core/playlist/playlist-api';
import {
  EMPTY_PLAYLIST_STATE,
  PlaylistState,
  RepeatMode,
} from '../app/core/playlist/playlist.models';
import { SystemApi } from '../app/core/system/system-api';
import { SystemInfo, TestToneFinished } from '../app/core/system/system.models';

export const SYSTEM_INFO: SystemInfo = {
  app: {
    name: 'FLAC Commander',
    version: '0.1.0',
    os: 'macos',
    arch: 'aarch64',
    logDir: '/Users/test/Library/Logs/flac-commander',
  },
  output: {
    host: 'CoreAudio',
    devices: [
      { id: 'coreaudio:speakers', name: 'MacBook Pro Speakers', isDefault: true },
      { id: 'coreaudio:display', name: 'Studio Display', isDefault: false },
    ],
    defaultFormat: { sampleRate: 48000, channels: 2 },
  },
  formats: [
    { id: 'flac', name: 'FLAC', extensions: ['flac'], support: 'supported' },
    { id: 'opus', name: 'Opus', extensions: ['opus'], support: 'unsupported' },
  ],
};

export const NO_OUTPUT: SystemInfo = {
  ...SYSTEM_INFO,
  output: { host: 'ALSA', devices: [], defaultFormat: null },
};

/** A promise the test settles itself: no timers, the test decides when the backend answers. */
export class Deferred<T> {
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;
  readonly promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

export class FakeSystemApi extends SystemApi {
  /** One entry per `systemInfo()` call, to be settled by the test. */
  readonly infoCalls: Deferred<SystemInfo>[] = [];
  readonly toneCalls: Deferred<void>[] = [];
  /** Handlers that are subscribed right now. */
  readonly toneHandlers = new Set<(result: TestToneFinished) => void>();
  /** Set to keep the subscription pending. */
  subscription: Deferred<void> | null = null;

  override systemInfo(): Promise<SystemInfo> {
    const call = new Deferred<SystemInfo>();
    this.infoCalls.push(call);
    return call.promise;
  }

  override startTestTone(): Promise<void> {
    const call = new Deferred<void>();
    this.toneCalls.push(call);
    return call.promise;
  }

  override async onTestToneFinished(
    handler: (result: TestToneFinished) => void,
  ): Promise<Unsubscribe> {
    await this.subscription?.promise;
    this.toneHandlers.add(handler);
    return () => this.toneHandlers.delete(handler);
  }

  /** The backend reports the end of the tone. */
  finishTone(result: TestToneFinished = { error: null }): void {
    for (const handler of this.toneHandlers) {
      handler(result);
    }
  }
}

export const TRACK_STATE: PlayerState = {
  status: 'playing',
  track: {
    path: '/music/People/12 People.flac',
    fileName: '12 People.flac',
    info: {
      container: 'flac',
      codec: 'flac',
      sampleRate: 44100,
      channels: 2,
      bitsPerSample: 16,
      durationMs: 222_333,
    },
  },
  positionMs: 61_500,
  volume: 0.8,
  error: null,
  underruns: 0,
  finished: 0,
};

/** The backend's player: records the commands, the test reports states. */
export class FakePlayerApi extends PlayerApi {
  /** Commands in the order they were sent, e.g. `seek 5000`. */
  readonly commands: string[] = [];
  readonly handlers = new Set<(state: PlayerState) => void>();
  /** Answer of `state()`; a `Deferred` lets the test decide when it arrives. */
  snapshot: PlayerState | Deferred<PlayerState> = EMPTY_PLAYER_STATE;
  /** Set to make every command fail. */
  failure: unknown = null;

  override async state(): Promise<PlayerState> {
    return this.snapshot instanceof Deferred ? this.snapshot.promise : this.snapshot;
  }

  override async play(): Promise<void> {
    this.command('play');
  }

  override async pause(): Promise<void> {
    this.command('pause');
  }

  override async stop(): Promise<void> {
    this.command('stop');
  }

  override async seek(positionMs: number): Promise<void> {
    this.command(`seek ${positionMs}`);
  }

  override async setVolume(volume: number): Promise<void> {
    this.command(`volume ${volume.toFixed(2)}`);
  }

  override async onState(handler: (state: PlayerState) => void): Promise<Unsubscribe> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** The backend reports a state. */
  emit(state: PlayerState): void {
    for (const handler of this.handlers) {
      handler(state);
    }
  }

  private command(text: string): void {
    if (this.failure) {
      throw this.failure;
    }
    this.commands.push(text);
  }
}

export const PLAYLIST: PlaylistState = {
  entries: [
    {
      id: 1,
      path: "/music/People/11 Don't Like Goodbyes.flac",
      fileName: "11 Don't Like Goodbyes.flac",
      meta: {
        title: "Don't Like Goodbyes",
        artist: 'Barbra Streisand',
        album: 'People',
        durationMs: 189_000,
      },
      error: null,
    },
    {
      id: 2,
      path: '/music/People/12 People.flac',
      fileName: '12 People.flac',
      meta: { title: 'People', artist: 'Barbra Streisand', album: 'People', durationMs: 222_333 },
      error: null,
    },
    { id: 3, path: '/music/untagged.mp3', fileName: 'untagged.mp3', meta: null, error: null },
    {
      id: 4,
      path: '/music/gone.flac',
      fileName: 'gone.flac',
      meta: { title: null, artist: null, album: null, durationMs: null },
      error: 'not_found',
    },
  ],
  currentId: 2,
  repeat: 'off',
  shuffle: false,
};

/** The backend's playlist: records the commands, the test reports states. */
export class FakePlaylistApi extends PlaylistApi {
  readonly commands: string[] = [];
  readonly handlers = new Set<(state: PlaylistState) => void>();
  readonly dragHandlers = new Set<(over: boolean) => void>();
  snapshot: PlaylistState = EMPTY_PLAYLIST_STATE;
  failure: unknown = null;

  override async state(): Promise<PlaylistState> {
    return this.snapshot;
  }

  override async open(dialogTitle: string): Promise<number> {
    this.command(`open "${dialogTitle}"`);
    return 1;
  }

  override async play(id: number): Promise<void> {
    this.command(`play ${id}`);
  }

  override async next(): Promise<void> {
    this.command('next');
  }

  override async previous(): Promise<void> {
    this.command('previous');
  }

  override async remove(ids: readonly number[]): Promise<void> {
    this.command(`remove ${ids.join(',')}`);
  }

  override async clear(): Promise<void> {
    this.command('clear');
  }

  override async setRepeat(repeat: RepeatMode): Promise<void> {
    this.command(`repeat ${repeat}`);
  }

  override async setShuffle(shuffle: boolean): Promise<void> {
    this.command(`shuffle ${shuffle}`);
  }

  override async onState(handler: (state: PlaylistState) => void): Promise<Unsubscribe> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  override async onDragOver(handler: (over: boolean) => void): Promise<Unsubscribe> {
    this.dragHandlers.add(handler);
    return () => this.dragHandlers.delete(handler);
  }

  emit(state: PlaylistState): void {
    for (const handler of this.handlers) {
      handler(state);
    }
  }

  drag(over: boolean): void {
    for (const handler of this.dragHandlers) {
      handler(over);
    }
  }

  private command(text: string): void {
    if (this.failure) {
      throw this.failure;
    }
    this.commands.push(text);
  }
}

export class FakeLogApi extends LogApi {
  readonly lines: string[] = [];

  override info(message: string): void {
    this.lines.push(`info ${message}`);
  }

  override warn(message: string): void {
    this.lines.push(`warn ${message}`);
  }

  override error(message: string): void {
    this.lines.push(`error ${message}`);
  }
}
