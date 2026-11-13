/**
 * A keyboard shortcut: one key, optionally with the platform's command modifier
 * (⌘ on macOS, Ctrl elsewhere). `key` is a `KeyboardEvent.key`, letters in lower case.
 */
export interface Shortcut {
  readonly key: string;
  readonly mod?: boolean;
}

export function isMac(platform: string = navigator.platform): boolean {
  return /mac|iphone|ipad/i.test(platform);
}

/** True if `event` is exactly this shortcut (no other modifiers held). */
export function matches(shortcut: Shortcut, event: KeyboardEvent, mac = isMac()): boolean {
  const mod = mac ? event.metaKey : event.ctrlKey;
  const otherMod = mac ? event.ctrlKey : event.metaKey;
  if (mod !== (shortcut.mod ?? false) || otherMod || event.altKey) {
    return false;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return key === shortcut.key;
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

/** The shortcut as shown in a tooltip: `Space`, `←`, `⌘O`, `Ctrl+O`. */
export function describeShortcut(shortcut: Shortcut, mac = isMac()): string {
  const key = KEY_NAMES[shortcut.key] ?? shortcut.key.toUpperCase();
  if (!shortcut.mod) {
    return key;
  }
  return mac ? `⌘${key}` : `Ctrl+${key}`;
}

/**
 * True if the focused element uses this key itself, so a global shortcut must not fire:
 * typing in a text field, Space/Enter on a button or link, arrows on a slider or a list.
 */
export function elementHandlesKey(target: EventTarget | null, event: KeyboardEvent): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const plainKey = !event.metaKey && !event.ctrlKey;
  if (target.closest('[role=listbox]')) {
    return (
      plainKey &&
      (event.key.startsWith('Arrow') ||
        ['Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Delete', 'Backspace'].includes(event.key))
    );
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return plainKey;
  }
  if (target instanceof HTMLInputElement) {
    const type = target.type;
    if (type === 'range') {
      return (
        event.key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
      );
    }
    if (type === 'checkbox' || type === 'radio' || type === 'button') {
      return event.key === ' ' || event.key === 'Enter';
    }
    return plainKey;
  }
  if (target instanceof HTMLSelectElement) {
    return plainKey;
  }
  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) {
    return event.key === ' ' || event.key === 'Enter';
  }
  if (target.closest('summary')) {
    return event.key === ' ' || event.key === 'Enter';
  }
  return false;
}
