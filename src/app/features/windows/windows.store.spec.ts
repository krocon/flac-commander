import { TestBed } from '@angular/core/testing';
import { LogApi } from '../../core/log/log-api';
import { WindowApi } from '../../core/windows/window-api';
import { FakeLogApi, FakeWindowApi } from '../../../testing/fake-apis';
import { WindowsStore } from './windows.store';

describe('WindowsStore', () => {
  let api: FakeWindowApi;
  let log: FakeLogApi;

  async function createStore(): Promise<WindowsStore> {
    TestBed.configureTestingModule({
      providers: [
        { provide: WindowApi, useValue: api },
        { provide: LogApi, useValue: log },
      ],
    });
    const store = TestBed.inject(WindowsStore);
    await store.ready;
    return store;
  }

  beforeEach(() => {
    api = new FakeWindowApi();
    log = new FakeLogApi();
  });

  it('knows which window it is in', async () => {
    expect((await createStore()).isMain).toBe(true);
    TestBed.resetTestingModule();
    api.current = 'playlist';
    const store = await createStore();
    expect(store.label).toBe('playlist');
    expect(store.isMain).toBe(false);
  });

  it('starts with the windows that are open and follows changes from any window', async () => {
    api.open = ['playlist'];
    const store = await createStore();
    expect(store.playlistDetached()).toBe(true);

    // closed by its own close button: the backend tells everyone
    api.open = [];
    api.emit();
    expect(store.playlistDetached()).toBe(false);
  });

  it('asks the backend to toggle and shows what the backend reports', async () => {
    const store = await createStore();
    await store.toggle('playlist');
    expect(api.commands).toEqual(['toggle playlist']);
    expect(store.playlistDetached()).toBe(true);
    await store.toggle('playlist');
    expect(store.playlistDetached()).toBe(false);
  });

  it('shows and logs a window that could not be opened', async () => {
    const store = await createStore();
    api.failure = { code: 'internal', message: 'window playlist' };
    await store.toggle('playlist');
    expect(store.error()?.code).toBe('internal');
    expect(store.playlistDetached()).toBe(false);
    expect(log.lines).toEqual(['error windows_toggle failed: internal: window playlist']);
  });

  it('ends its subscription when it is destroyed', async () => {
    await createStore();
    expect(api.handlers.size).toBe(1);
    TestBed.resetTestingModule();
    expect(api.handlers.size).toBe(0);
  });
});
