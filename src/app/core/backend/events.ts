import { DestroyRef } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Ends a subscription. */
export type Unsubscribe = () => void;

/**
 * The only place that calls `listen()`. Resolves once the backend delivers `event` to `handler`;
 * without a backend (tests, `ng serve` in a browser) nothing is ever delivered.
 */
export async function subscribe<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<Unsubscribe> {
  if (!isTauri()) {
    return () => undefined;
  }
  return listen<T>(event, (e) => handler(e.payload));
}

/**
 * Ties a subscription to the life of its owner: it ends when `destroyRef` fires – also if that
 * happens before the subscription is established. Resolves when the subscription is active.
 */
export function untilDestroyed(
  subscription: Promise<Unsubscribe>,
  destroyRef: DestroyRef,
): Promise<void> {
  let destroyed = false;
  let unsubscribe: Unsubscribe | undefined;
  destroyRef.onDestroy(() => {
    destroyed = true;
    unsubscribe?.();
  });
  return subscription.then((off) => {
    if (destroyed) {
      off();
    } else {
      unsubscribe = off;
    }
  });
}
