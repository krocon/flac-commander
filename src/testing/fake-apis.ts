import { Unsubscribe } from '../app/core/backend/events';
import { LogApi } from '../app/core/log/log-api';
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
