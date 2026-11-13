import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { call } from '../backend/call';
import { subscribe, Unsubscribe } from '../backend/events';

/** Event names = `src-tauri/src/events.rs`. */
const EV_WINDOWS_STATE = 'windows://state';

/** Labels of the app's windows (`windows.rs`). */
export type WindowLabel = 'main' | 'playlist';
export type SecondaryWindow = Exclude<WindowLabel, 'main'>;

/** Payload of `windows://state` and answer of `windows_state`. */
export interface WindowsState {
  /** The secondary windows that are open. */
  readonly open: readonly string[];
}

/** The windows of the app. Each one is a webview of its own showing this same frontend. */
export abstract class WindowApi {
  /** Which window this is: decides what it shows. */
  abstract label(): WindowLabel;
  abstract state(): Promise<WindowsState>;
  /** Opens the window if it is closed, closes it if it is open. */
  abstract toggle(label: SecondaryWindow): Promise<boolean>;
  abstract onState(handler: (state: WindowsState) => void): Promise<Unsubscribe>;
}

export class TauriWindowApi extends WindowApi {
  override label(): WindowLabel {
    if (!isTauri()) {
      return 'main';
    }
    return getCurrentWindow().label === 'playlist' ? 'playlist' : 'main';
  }

  override state(): Promise<WindowsState> {
    return call<WindowsState>('windows_state');
  }

  override toggle(label: SecondaryWindow): Promise<boolean> {
    return call<boolean>('windows_toggle', { label });
  }

  override onState(handler: (state: WindowsState) => void): Promise<Unsubscribe> {
    return subscribe<WindowsState>(EV_WINDOWS_STATE, handler);
  }
}
