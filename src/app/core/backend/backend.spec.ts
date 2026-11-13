import { DestroyRef } from '@angular/core';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import { call } from './call';
import { subscribe, untilDestroyed } from './events';

/** A `DestroyRef` the test fires itself. */
class ManualDestroyRef extends DestroyRef {
  private readonly callbacks: (() => void)[] = [];
  destroyed = false;

  override onDestroy(callback: () => void): () => void {
    this.callbacks.push(callback);
    return () => undefined;
  }

  destroy(): void {
    this.destroyed = true;
    this.callbacks.forEach((cb) => cb());
  }
}

describe('backend access', () => {
  afterEach(() => clearMocks());

  describe('without a backend', () => {
    it('call() rejects with backend_unavailable', async () => {
      await expect(call('system_info')).rejects.toEqual({
        code: 'backend_unavailable',
        message: 'desktop backend is not available',
      });
    });

    it('subscribe() resolves and never delivers', async () => {
      const off = await subscribe('audio://x', () => {
        throw new Error('must not be called');
      });
      expect(() => off()).not.toThrow();
    });
  });

  describe('with the mocked Tauri IPC', () => {
    // `isTauri()` reads this flag; the real app gets it from the Tauri runtime
    const runtime = globalThis as { isTauri?: boolean };
    beforeEach(() => (runtime.isTauri = true));
    afterEach(() => delete runtime.isTauri);

    it('call() passes command and arguments and returns the answer', async () => {
      const seen: unknown[] = [];
      mockIPC((cmd, args) => {
        seen.push([cmd, args]);
        return { ok: true };
      });
      await expect(call('probe', { path: 'a.flac' })).resolves.toEqual({ ok: true });
      expect(seen).toEqual([['probe', { path: 'a.flac' }]]);
    });

    it('call() turns a rejection of the backend into an AppError', async () => {
      mockIPC(() => {
        throw { code: 'not_found', message: 'a.flac: not found' };
      });
      await expect(call('probe')).rejects.toEqual({
        code: 'not_found',
        message: 'a.flac: not found',
      });
    });

    it('call() turns an unexpected rejection into "unknown"', async () => {
      mockIPC(() => {
        throw 'command probe not found';
      });
      await expect(call('probe')).rejects.toEqual({
        code: 'unknown',
        message: 'command probe not found',
      });
    });

    it('subscribe() delivers payloads until it is ended', async () => {
      mockIPC(() => undefined, { shouldMockEvents: true });
      const seen: number[] = [];
      const off = await subscribe<number>('spec://n', (n) => seen.push(n));
      await emit('spec://n', 1);
      await emit('spec://n', 2);
      off();
      await emit('spec://n', 3);
      expect(seen).toEqual([1, 2]);
    });
  });

  describe('untilDestroyed', () => {
    it('ends the subscription with its owner', async () => {
      const owner = new ManualDestroyRef();
      let ended = 0;
      await untilDestroyed(
        Promise.resolve(() => ended++),
        owner,
      );
      expect(ended).toBe(0);
      owner.destroy();
      expect(ended).toBe(1);
    });

    it('ends a subscription that arrives after its owner is gone', async () => {
      const owner = new ManualDestroyRef();
      let ended = 0;
      let arrive!: (off: () => void) => void;
      const active = untilDestroyed(new Promise<() => void>((r) => (arrive = r)), owner);
      owner.destroy();
      arrive(() => ended++);
      await active;
      expect(ended).toBe(1);
    });
  });
});
