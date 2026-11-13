import { AppError } from '../errors/app-error';

/** DTOs of the system commands – mirror `src-tauri/src/commands/system.rs` and fc-core (by hand). */

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  /** `macos`, `windows`, `linux` … (Rust `std::env::consts::OS`). */
  readonly os: string;
  readonly arch: string;
  /** Folder of the log file; `null` if the system has none. */
  readonly logDir: string | null;
}

export interface OutputDevice {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
}

export interface OutputFormat {
  readonly sampleRate: number;
  readonly channels: number;
}

export interface OutputStatus {
  /** Audio backend in use (`CoreAudio`, `WASAPI`, `ALSA` …). */
  readonly host: string;
  readonly devices: readonly OutputDevice[];
  readonly defaultFormat: OutputFormat | null;
}

export type FormatSupport = 'supported' | 'unsupported';

export interface AudioFormat {
  readonly id: string;
  readonly name: string;
  readonly extensions: readonly string[];
  readonly support: FormatSupport;
}

export interface SystemInfo {
  readonly app: AppInfo;
  readonly output: OutputStatus;
  readonly formats: readonly AudioFormat[];
}

/** Payload of the event `audio://test-tone-finished`. */
export interface TestToneFinished {
  /** `null`: the tone was played to the end. */
  readonly error: AppError | null;
}
