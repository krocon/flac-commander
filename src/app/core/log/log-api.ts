import { isTauri } from '@tauri-apps/api/core';
import { error as logError, info as logInfo, warn as logWarn } from '@tauri-apps/plugin-log';

/** The app's log. In the desktop app it ends in the log file of the backend. */
export abstract class LogApi {
  abstract info(message: string): void;
  abstract warn(message: string): void;
  abstract error(message: string): void;
}

/** Writes through tauri-plugin-log; in a plain browser (`ng serve`) to the console. */
export class TauriLogApi extends LogApi {
  override info(message: string): void {
    this.write(logInfo, console.info, message);
  }

  override warn(message: string): void {
    this.write(logWarn, console.warn, message);
  }

  override error(message: string): void {
    this.write(logError, console.error, message);
  }

  private write(
    toBackend: (message: string) => Promise<void>,
    toConsole: (message: string) => void,
    message: string,
  ): void {
    if (!isTauri()) {
      toConsole(message);
      return;
    }
    // a log line that cannot be written must not break the caller; the console is what is left
    toBackend(message).catch((e: unknown) => console.error('log failed', e, message));
  }
}
