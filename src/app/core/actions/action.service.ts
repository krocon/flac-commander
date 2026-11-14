import { Injectable } from '@angular/core';
import { describeShortcut, elementHandlesKey, matches, Shortcut } from './shortcut';

/** A key held down repeats faster than this; a shortcut that arrives twice does not. */
const SAME_PRESS_MS = 250;

/** Something the user can do, by button or by key. */
export interface Action {
  readonly id: string;
  /** Read on every use: the language can change. */
  readonly label: () => string;
  readonly shortcut?: Shortcut;
  readonly enabled?: () => boolean;
  /** For actions that switch something: whether it is on (playing, repeat, shuffle). */
  readonly active?: () => boolean;
  readonly run: () => void;
}

/**
 * The one place for keyboard shortcuts: features register actions, the app root passes every
 * `keydown` to {@link handleKey}. No component listens for shortcut keys itself.
 */
@Injectable({ providedIn: 'root' })
export class ActionService {
  private readonly actions = new Map<string, Action>();
  /** When each action last ran by its shortcut, and through which door (key or menu). */
  private readonly lastShortcut = new Map<string, { readonly at: number; readonly door: string }>();

  /** Registers actions; the returned function removes them again. */
  register(actions: readonly Action[]): () => void {
    for (const action of actions) {
      if (this.actions.has(action.id)) {
        throw new Error(`action "${action.id}" is registered twice`);
      }
      this.actions.set(action.id, action);
    }
    return () => actions.forEach((a) => this.actions.delete(a.id));
  }

  /** Runs the action if it exists and is enabled. */
  run(id: string): boolean {
    const action = this.actions.get(id);
    if (!action || action.enabled?.() === false) {
      return false;
    }
    action.run();
    return true;
  }

  /** The action as registered, for those who show it somewhere (the native menu). */
  get(id: string): Action | undefined {
    return this.actions.get(id);
  }

  /**
   * Runs an action that the native menu reports. A shortcut can arrive twice – as a key in
   * the window and as the accelerator of its menu item: the second within one key press is
   * dropped, whichever door it came through.
   */
  runFromMenu(id: string): boolean {
    return this.firstOfPress(id, 'menu') && this.run(id);
  }

  private firstOfPress(id: string, door: string): boolean {
    const last = this.lastShortcut.get(id);
    const now = Date.now();
    this.lastShortcut.set(id, { at: now, door });
    return !last || last.door === door || now - last.at > SAME_PRESS_MS;
  }

  /** The label of an action, in the current language. */
  label(id: string): string {
    return this.actions.get(id)?.label() ?? '';
  }

  isEnabled(id: string): boolean {
    const action = this.actions.get(id);
    return action !== undefined && action.enabled?.() !== false;
  }

  isActive(id: string): boolean {
    return this.actions.get(id)?.active?.() === true;
  }

  /** Label with the shortcut, for tooltips: `Play (Space)`. */
  hint(id: string): string {
    const action = this.actions.get(id);
    if (!action) {
      return '';
    }
    return action.shortcut
      ? `${action.label()} (${describeShortcut(action.shortcut)})`
      : action.label();
  }

  /** Runs the action bound to the key of `event`, unless the focused element needs the key. */
  handleKey(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing || elementHandlesKey(event.target, event)) {
      return false;
    }
    for (const action of this.actions.values()) {
      if (action.shortcut && matches(action.shortcut, event)) {
        // the key belongs to the action even while it is disabled: no page scrolling on Space
        event.preventDefault();
        return this.firstOfPress(action.id, 'key') && this.run(action.id);
      }
    }
    return false;
  }
}
