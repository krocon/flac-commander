import { MenuApi, MenuEntry, MenuModel } from '../app/core/menu/menu-api';
import { Unsubscribe } from '../app/core/backend/events';
import { LibraryApi } from '../app/core/library/library-api';
import {
  EMPTY_LIBRARY_STATE,
  EMPTY_LISTING,
  LibraryFound,
  LibraryListing,
  LibraryState,
} from '../app/core/library/library.models';
import { LogApi } from '../app/core/log/log-api';
import { PlayerApi } from '../app/core/player/player-api';
import {
  EMPTY_PLAYER_STATE,
  EqualizerPreset,
  EqualizerSettings,
  FLAT_EQUALIZER,
  PlayerState,
} from '../app/core/player/player.models';
import { PlaylistApi } from '../app/core/playlist/playlist-api';
import {
  EMPTY_PLAYLIST_STATE,
  PlaylistState,
  RepeatMode,
} from '../app/core/playlist/playlist.models';
import { SkinApi } from '../app/core/skins/skin-api';
import { ActiveSkin, SkinInfo, SkinTheme } from '../app/core/skins/skin.models';
import { SystemApi } from '../app/core/system/system-api';
import { SystemInfo, TestToneFinished } from '../app/core/system/system.models';
import {
  SecondaryWindow,
  WindowApi,
  WindowLabel,
  WindowsState,
} from '../app/core/windows/window-api';

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
  equalizer: FLAT_EQUALIZER,
};

export const PRESETS: readonly EqualizerPreset[] = [
  { id: 'flat', preampDb: 0, gainsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', preampDb: -4, gainsDb: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
];

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

  override coverUrl(key: string): string {
    return `cover://${key}`;
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

  override async setEqualizer(settings: EqualizerSettings): Promise<void> {
    const gains = settings.gainsDb.join(',');
    this.command(`equalizer ${settings.enabled ? 'on' : 'off'} ${settings.preampDb} [${gains}]`);
  }

  override async equalizerPresets(): Promise<readonly EqualizerPreset[]> {
    return PRESETS;
  }

  override async onState(handler: (state: PlayerState) => void): Promise<Unsubscribe> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  readonly spectrumHandlers = new Set<(bands: readonly number[]) => void>();

  /** Requests for the spectrum, apart from the commands: every player view sends them. */
  readonly spectrumRequests: string[] = [];

  override async setSpectrum(enabled: boolean): Promise<void> {
    this.spectrumRequests.push(enabled ? 'on' : 'off');
  }

  override async onSpectrum(handler: (bands: readonly number[]) => void): Promise<Unsubscribe> {
    this.spectrumHandlers.add(handler);
    return () => this.spectrumHandlers.delete(handler);
  }

  /** The backend reports a spectrum. */
  emitSpectrum(bands: readonly number[]): void {
    for (const handler of this.spectrumHandlers) {
      handler(bands);
    }
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

const NO_THEME: SkinTheme = {
  background: null,
  surface: null,
  surfaceRaised: null,
  foreground: null,
  muted: null,
  accent: null,
  accentContrast: null,
  border: null,
  ok: null,
  danger: null,
  focus: null,
  fontFamily: null,
  fontMono: null,
  radius: null,
};

export const MODERN_INFO: SkinInfo = {
  id: 'io.github.krocon.modern',
  name: 'Modern',
  version: '1.0.0',
  author: 'FLAC Commander',
  description: 'Dark, calm and resizable.',
  preview: null,
  builtIn: true,
};

export const RETRO_INFO: SkinInfo = {
  id: 'io.github.krocon.retro',
  name: 'Retro',
  version: '1.0.0',
  author: 'FLAC Commander',
  description: 'Pixels and bevels.',
  preview: 'preview.png',
  builtIn: true,
};

export const IMPORTED_INFO: SkinInfo = {
  id: 'org.example.neon',
  name: 'Neon',
  version: '2.1.0',
  author: null,
  description: null,
  preview: null,
  builtIn: false,
};

export const MODERN_SKIN: ActiveSkin = {
  info: MODERN_INFO,
  theme: { ...NO_THEME, accent: '#ffdd00', background: '#141414', radius: 6 },
  player: {
    layout: 'flow',
    width: null,
    height: null,
    background: null,
    pixelated: false,
    components: [],
  },
};

const BLOCK = {
  action: null,
  source: null,
  states: null,
  align: null,
  fontSize: null,
  color: null,
};

export const RETRO_SKIN: ActiveSkin = {
  info: RETRO_INFO,
  theme: { ...NO_THEME, accent: '#5dff7a', fontFamily: 'ui-monospace, monospace', radius: 0 },
  player: {
    layout: 'absolute',
    width: 320,
    height: 440,
    background: 'assets/background.png',
    pixelated: true,
    components: [
      {
        ...BLOCK,
        type: 'text',
        source: 'track.title',
        x: 14,
        y: 26,
        width: 292,
        height: 18,
        fontSize: 14,
        color: '#5dff7a',
      },
      {
        ...BLOCK,
        type: 'time',
        source: 'position',
        x: 14,
        y: 64,
        width: 90,
        height: 26,
        fontSize: 22,
      },
      { ...BLOCK, type: 'text', source: 'player.status', x: 110, y: 74, width: 110, height: 14 },
      {
        ...BLOCK,
        type: 'time',
        source: 'duration',
        x: 226,
        y: 74,
        width: 80,
        height: 14,
        align: 'right',
      },
      { ...BLOCK, type: 'seekbar', x: 8, y: 100, width: 304, height: 16 },
      {
        ...BLOCK,
        type: 'button',
        action: 'player.togglePlay',
        x: 40,
        y: 124,
        width: 30,
        height: 24,
        states: {
          normal: 'assets/play.png',
          hover: null,
          pressed: 'assets/play-pressed.png',
          active: 'assets/play-active.png',
          disabled: null,
        },
      },
      { ...BLOCK, type: 'button', action: 'player.stop', x: 72, y: 124, width: 30, height: 24 },
      { ...BLOCK, type: 'button', action: 'app.skins', x: 282, y: 124, width: 30, height: 24 },
      { ...BLOCK, type: 'volume', x: 176, y: 150, width: 136, height: 12 },
      { ...BLOCK, type: 'playlist', x: 10, y: 166, width: 300, height: 264 },
    ],
  },
};

/** The backend's skins: records the commands, the test reports the active skin. */
export class FakeSkinApi extends SkinApi {
  readonly commands: string[] = [];
  readonly handlers = new Set<(skin: ActiveSkin) => void>();
  snapshot: ActiveSkin = MODERN_SKIN;
  skins: readonly SkinInfo[] = [MODERN_INFO, RETRO_INFO];
  /** What an import installs; `null`: the dialog is cancelled. */
  imported: SkinInfo | null = IMPORTED_INFO;
  failure: unknown = null;

  override async list(): Promise<readonly SkinInfo[]> {
    return this.skins;
  }

  override async active(): Promise<ActiveSkin> {
    return this.snapshot;
  }

  override async activate(id: string): Promise<void> {
    this.command(`activate ${id}`);
  }

  override async import(dialogTitle: string): Promise<SkinInfo | null> {
    this.command(`import "${dialogTitle}"`);
    if (this.imported) {
      this.skins = [...this.skins, this.imported];
    }
    return this.imported;
  }

  override async remove(id: string): Promise<void> {
    this.command(`remove ${id}`);
    this.skins = this.skins.filter((s) => s.id !== id);
  }

  override async export(id: string, dialogTitle: string): Promise<boolean> {
    this.command(`export ${id} "${dialogTitle}"`);
    return true;
  }

  override async onActive(handler: (skin: ActiveSkin) => void): Promise<Unsubscribe> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  override assetUrl(skinId: string, path: string): string {
    return `skin://${skinId}/${path}`;
  }

  override async fitViewport(width: number, height: number): Promise<void> {
    this.command(`fit ${width}x${height}`);
  }

  override async setListHidden(hidden: boolean): Promise<void> {
    this.command(`list ${hidden ? 'hidden' : 'shown'}`);
  }

  emit(skin: ActiveSkin): void {
    for (const handler of this.handlers) {
      handler(skin);
    }
  }

  private command(text: string): void {
    if (this.failure) {
      throw this.failure;
    }
    this.commands.push(text);
  }
}

export const LIBRARY_STATE: LibraryState = {
  roots: [{ name: 'Music', path: '/music' }],
  scan: { scanning: false, folders: 2, tracks: 3 },
};

/** `/music` → `Barbra` → `People` (2 tracks) and `Guilty` (1 track). */
export const LIBRARY_FOLDERS: Readonly<Record<string, LibraryListing>> = {
  '': {
    folder: null,
    crumbs: [],
    folders: [{ name: 'Music', path: '/music', album: null, artist: null, tracks: 0 }],
    tracks: [],
  },
  '/music': {
    folder: { name: 'Music', path: '/music', album: null, artist: null, tracks: 0 },
    crumbs: [{ name: 'Music', path: '/music' }],
    folders: [{ name: 'Barbra', path: '/music/Barbra', album: null, artist: null, tracks: 0 }],
    tracks: [],
  },
  '/music/Barbra': {
    folder: { name: 'Barbra', path: '/music/Barbra', album: null, artist: null, tracks: 0 },
    crumbs: [
      { name: 'Music', path: '/music' },
      { name: 'Barbra', path: '/music/Barbra' },
    ],
    folders: [
      {
        name: 'Guilty (1980)',
        path: '/music/Barbra/Guilty (1980)',
        album: 'Guilty',
        artist: 'Barbra Streisand',
        tracks: 1,
      },
      {
        name: 'People',
        path: '/music/Barbra/People',
        album: 'People',
        artist: null,
        tracks: 2,
      },
    ],
    tracks: [],
  },
  '/music/Barbra/People': {
    folder: {
      name: 'People',
      path: '/music/Barbra/People',
      album: 'People',
      artist: 'Barbra Streisand',
      tracks: 2,
    },
    crumbs: [
      { name: 'Music', path: '/music' },
      { name: 'Barbra', path: '/music/Barbra' },
      { name: 'People', path: '/music/Barbra/People' },
    ],
    folders: [],
    tracks: [
      {
        name: '11 Goodbyes.flac',
        path: '/music/Barbra/People/11 Goodbyes.flac',
        title: "Don't Like Goodbyes",
        artist: 'Barbra Streisand',
        album: 'People',
        durationMs: 189_000,
      },
      {
        name: '12 untagged.flac',
        path: '/music/Barbra/People/12 untagged.flac',
        title: null,
        artist: null,
        album: null,
        durationMs: null,
      },
    ],
  },
};

export const LIBRARY_FOUND: LibraryFound = {
  albums: [LIBRARY_FOLDERS['/music/Barbra'].folders[1]],
  tracks: [LIBRARY_FOLDERS['/music/Barbra/People'].tracks[0]],
  more: true,
};

/** The backend's library: a small tree of folders; records the commands. */
export class FakeLibraryApi extends LibraryApi {
  readonly commands: string[] = [];
  readonly handlers = new Set<(state: LibraryState) => void>();
  snapshot: LibraryState = LIBRARY_STATE;
  folders: Readonly<Record<string, LibraryListing>> = LIBRARY_FOLDERS;
  /** What every search finds; a `Deferred` lets the test decide when it arrives. */
  found: LibraryFound | Deferred<LibraryFound> = LIBRARY_FOUND;
  /** How many tracks a play or add reports. */
  played = 2;
  failure: unknown = null;

  override async state(): Promise<LibraryState> {
    return this.snapshot;
  }

  override async addRoot(dialogTitle: string): Promise<boolean> {
    this.command(`add root "${dialogTitle}"`);
    return true;
  }

  override async removeRoot(path: string): Promise<void> {
    this.command(`remove root ${path}`);
  }

  override async rescan(): Promise<void> {
    this.command('rescan');
  }

  override async browse(path: string | null): Promise<LibraryListing> {
    this.command(`browse ${path ?? '-'}`);
    const listing = this.folders[path ?? ''];
    if (!listing) {
      throw { code: 'not_found', message: `${path}: no such folder` };
    }
    return listing;
  }

  override async search(query: string): Promise<LibraryFound> {
    this.command(`search "${query}"`);
    return this.found instanceof Deferred ? this.found.promise : this.found;
  }

  override async play(path: string, replace: boolean): Promise<number> {
    this.command(`${replace ? 'play' : 'add'} ${path}`);
    return this.played;
  }

  override async onState(handler: (state: LibraryState) => void): Promise<Unsubscribe> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  override coverUrl(path: string): string {
    return `libcover://${path}`;
  }

  /** The backend reports folders or scan. */
  emit(state: LibraryState): void {
    this.snapshot = state;
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

export const NO_LIBRARY: LibraryState = EMPTY_LIBRARY_STATE;
export const NO_FOLDERS: Readonly<Record<string, LibraryListing>> = { '': EMPTY_LISTING };

/** The app's windows: the test decides which window this is and which are open. */
export class FakeWindowApi extends WindowApi {
  readonly commands: string[] = [];
  readonly handlers = new Set<(state: WindowsState) => void>();
  current: WindowLabel = 'main';
  open: string[] = [];
  failure: unknown = null;

  override label(): WindowLabel {
    return this.current;
  }

  override async state(): Promise<WindowsState> {
    return { open: this.open };
  }

  /** Like the backend: toggles and tells every window. */
  override async toggle(label: SecondaryWindow): Promise<boolean> {
    if (this.failure) {
      throw this.failure;
    }
    this.commands.push(`toggle ${label}`);
    const opens = !this.open.includes(label);
    this.open = opens ? [...this.open, label] : this.open.filter((l) => l !== label);
    this.emit();
    return opens;
  }

  override async onState(handler: (state: WindowsState) => void): Promise<Unsubscribe> {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(): void {
    for (const handler of this.handlers) {
      handler({ open: this.open });
    }
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

/** The native menu: keeps what it was told and lets the test choose an item. */
export class FakeMenuApi extends MenuApi {
  /** Every model that was set, the latest last. */
  readonly models: MenuModel[] = [];
  private handler: ((actionId: string) => void) | null = null;

  override async set(model: MenuModel): Promise<void> {
    this.models.push(model);
  }

  override async onAction(handler: (actionId: string) => void): Promise<Unsubscribe> {
    this.handler = handler;
    return () => (this.handler = null);
  }

  /** The user chooses the item of this action in the menu. */
  choose(actionId: string): void {
    this.handler?.(actionId);
  }

  /** The latest items of all menus, by action id. */
  items(): ReadonlyMap<string, Extract<MenuEntry, { kind: 'action' }>> {
    const items = new Map<string, Extract<MenuEntry, { kind: 'action' }>>();
    for (const group of this.models.at(-1)?.groups ?? []) {
      for (const entry of group.items) {
        if (entry.kind === 'action') {
          items.set(entry.id, entry);
        }
      }
    }
    return items;
  }
}
