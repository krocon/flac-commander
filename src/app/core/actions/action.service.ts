import { Injectable } from '@angular/core';
import { describeShortcut, elementHandlesKey, matches, Shortcut } from './shortcut';

/** Something the user can do, by button or by key. */
export interface Action {
  readonly id: string;
  /** Read on every use: the language can change. */
  readonly label: () => string;
  readonly shortcut?: Shortcut;
  readonly enabled?: () => boolean;
  readonly run: () => void;
}

/**
 * The one place for keyboard shortcuts: features register actions, the app root passes every
 * `keydown` to {@link handleKey}. No component listens for shortcut keys itself.
 */
@Injectable({ providedIn: 'root' })
export class ActionService {
  private readonly actions = new Map<string, Action>();

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
        return this.run(action.id);
      }
    }
    return false;
  }
}
