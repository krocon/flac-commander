import { call } from '../backend/call';
import { subscribe, Unsubscribe } from '../backend/events';

/** Event names = `src-tauri/src/events.rs`. */
const EV_MENU_ACTION = 'menu://action';

/** An item of the native menu – mirrors `MenuEntry` in `commands/menu.rs`. */
export type MenuEntry =
  | { readonly kind: 'separator' }
  | {
      readonly kind: 'action';
      /** Id of the action it runs. */
      readonly id: string;
      readonly label: string;
      /** `CmdOrCtrl+K`; only shortcuts with the command key go into the native menu. */
      readonly accelerator: string | null;
      /** A tick for actions that switch something; `null` for the others. */
      readonly checked: boolean | null;
      readonly enabled: boolean;
    };

export interface MenuGroup {
  readonly title: string;
  readonly items: readonly MenuEntry[];
}

/** Payload of `menu_set`. */
export interface MenuModel {
  /** Titles of the menus the system fills itself. */
  readonly editTitle: string;
  readonly windowTitle: string;
  readonly groups: readonly MenuGroup[];
}

/** The native menu of the app: the main window says what it offers and hears what was chosen. */
export abstract class MenuApi {
  abstract set(model: MenuModel): Promise<void>;
  /** `handler` gets the id of the action of the item that was chosen. */
  abstract onAction(handler: (actionId: string) => void): Promise<Unsubscribe>;
}

export class TauriMenuApi extends MenuApi {
  override set(model: MenuModel): Promise<void> {
    return call<void>('menu_set', { model });
  }

  override onAction(handler: (actionId: string) => void): Promise<Unsubscribe> {
    return subscribe<string>(EV_MENU_ACTION, handler);
  }
}
