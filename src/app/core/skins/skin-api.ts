import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
import { call } from '../backend/call';
import { subscribe, Unsubscribe } from '../backend/events';
import { ActiveSkin, SkinInfo } from './skin.models';

/** Event names = `src-tauri/src/events.rs`. */
const EV_SKIN_ACTIVE = 'skins://active';

/** The skins of the backend. A skin is validated there; the window only shows the result. */
export abstract class SkinApi {
  abstract list(): Promise<readonly SkinInfo[]>;
  abstract active(): Promise<ActiveSkin>;
  abstract activate(id: string): Promise<void>;
  /** Shows the file dialog and installs the chosen archive; `null` if the user cancelled. */
  abstract import(dialogTitle: string): Promise<SkinInfo | null>;
  abstract remove(id: string): Promise<void>;
  abstract onActive(handler: (skin: ActiveSkin) => void): Promise<Unsubscribe>;
  /**
   * Tells the backend how large the window's content really is, so that it can give a
   * fixed-size skin exactly the room it asks for.
   */
  abstract fitViewport(width: number, height: number): Promise<void>;
  /** Address of a picture of an installed skin (served by the `skin://` protocol). */
  abstract assetUrl(skinId: string, path: string): string;
}

export class TauriSkinApi extends SkinApi {
  override list(): Promise<readonly SkinInfo[]> {
    return call<readonly SkinInfo[]>('skins_list');
  }

  override active(): Promise<ActiveSkin> {
    return call<ActiveSkin>('skins_active');
  }

  override activate(id: string): Promise<void> {
    return call<void>('skins_activate', { id });
  }

  override import(dialogTitle: string): Promise<SkinInfo | null> {
    return call<SkinInfo | null>('skins_import', { title: dialogTitle });
  }

  override remove(id: string): Promise<void> {
    return call<void>('skins_remove', { id });
  }

  override onActive(handler: (skin: ActiveSkin) => void): Promise<Unsubscribe> {
    return subscribe<ActiveSkin>(EV_SKIN_ACTIVE, handler);
  }

  override fitViewport(width: number, height: number): Promise<void> {
    return call<void>('skins_fit_viewport', { viewportWidth: width, viewportHeight: height });
  }

  override assetUrl(skinId: string, path: string): string {
    // the only place that knows how the protocol is addressed on each platform
    return isTauri() ? convertFileSrc(`${skinId}/${path}`, 'skin') : '';
  }
}
