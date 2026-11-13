import { call } from '../backend/call';
import { subscribe, Unsubscribe } from '../backend/events';
import { toAppError } from '../errors/app-error';
import { SystemInfo, TestToneFinished } from './system.models';

/** Event names = `src-tauri/src/events.rs`. */
const EV_TEST_TONE_FINISHED = 'audio://test-tone-finished';

/** What the app can ask the system: its environment and the way to the loudspeaker. */
export abstract class SystemApi {
  abstract systemInfo(): Promise<SystemInfo>;
  /** Resolves when the tone has started; its end comes through {@link onTestToneFinished}. */
  abstract startTestTone(): Promise<void>;
  abstract onTestToneFinished(handler: (result: TestToneFinished) => void): Promise<Unsubscribe>;
}

export class TauriSystemApi extends SystemApi {
  override systemInfo(): Promise<SystemInfo> {
    return call<SystemInfo>('system_info');
  }

  override startTestTone(): Promise<void> {
    return call<void>('start_test_tone');
  }

  override onTestToneFinished(handler: (result: TestToneFinished) => void): Promise<Unsubscribe> {
    return subscribe<{ error: unknown }>(EV_TEST_TONE_FINISHED, (payload) =>
      handler({ error: payload.error == null ? null : toAppError(payload.error) }),
    );
  }
}
