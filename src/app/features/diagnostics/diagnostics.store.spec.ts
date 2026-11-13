import { TestBed } from '@angular/core/testing';
import { LogApi } from '../../core/log/log-api';
import { SystemApi } from '../../core/system/system-api';
import {
  Deferred,
  FakeLogApi,
  FakeSystemApi,
  NO_OUTPUT,
  SYSTEM_INFO,
} from '../../../testing/fake-apis';
import { DiagnosticsStore } from './diagnostics.store';

describe('DiagnosticsStore', () => {
  let api: FakeSystemApi;
  let log: FakeLogApi;

  function createStore(): DiagnosticsStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: SystemApi, useValue: api },
        { provide: LogApi, useValue: log },
      ],
    });
    return TestBed.inject(DiagnosticsStore);
  }

  async function loaded(store: DiagnosticsStore, info = SYSTEM_INFO): Promise<void> {
    const done = store.load();
    api.infoCalls.at(-1)?.resolve(info);
    await done;
  }

  beforeEach(() => {
    api = new FakeSystemApi();
    log = new FakeLogApi();
  });

  it('loads the system information', async () => {
    const store = createStore();
    expect(store.info()).toBeNull();
    expect(store.loading()).toBe(false);

    const done = store.load();
    expect(store.loading()).toBe(true);
    api.infoCalls[0].resolve(SYSTEM_INFO);
    await done;

    expect(store.info()).toEqual(SYSTEM_INFO);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.canPlayTone()).toBe(true);
  });

  it('shows and logs why the information could not be read, and recovers on reload', async () => {
    const store = createStore();
    const failed = store.load();
    api.infoCalls[0].reject({ code: 'internal', message: 'no state' });
    await failed;

    expect(store.error()).toEqual({ code: 'internal', message: 'no state' });
    expect(store.loading()).toBe(false);
    expect(log.lines).toEqual(['error system_info failed: internal: no state']);

    await loaded(store);
    expect(store.error()).toBeNull();
    expect(store.info()).toEqual(SYSTEM_INFO);
  });

  it('drops the answer of an overtaken load', async () => {
    const store = createStore();
    const first = store.load();
    const second = store.load();
    api.infoCalls[1].resolve(SYSTEM_INFO);
    await second;
    api.infoCalls[0].resolve(NO_OUTPUT);
    await first;

    expect(store.info()).toEqual(SYSTEM_INFO);
    expect(store.loading()).toBe(false);
  });

  it('does not offer the tone without an output device', async () => {
    const store = createStore();
    await loaded(store, NO_OUTPUT);
    expect(store.hasOutput()).toBe(false);
    expect(store.canPlayTone()).toBe(false);

    await store.playTestTone();
    expect(api.toneCalls).toHaveLength(0);
    expect(store.tone()).toBe('idle');
  });

  it('follows the backend from starting to playing to done', async () => {
    const store = createStore();
    await loaded(store);

    const started = store.playTestTone();
    expect(store.tone()).toBe('starting');
    expect(store.canPlayTone()).toBe(false);
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    api.toneCalls[0].resolve();
    await started;
    expect(store.tone()).toBe('playing');

    api.finishTone();
    expect(store.tone()).toBe('done');
    expect(store.canPlayTone()).toBe(true);
    expect(store.toneError()).toBeNull();
  });

  it('starts only one tone at a time', async () => {
    const store = createStore();
    await loaded(store);
    const first = store.playTestTone();
    await store.playTestTone();
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    api.toneCalls[0].resolve();
    await first;
    expect(api.toneCalls).toHaveLength(1);
  });

  it('reports a tone that could not be started', async () => {
    const store = createStore();
    await loaded(store);
    const started = store.playTestTone();
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    api.toneCalls[0].reject({ code: 'no_output_device', message: 'no audio output device' });
    await started;

    expect(store.tone()).toBe('failed');
    expect(store.toneError()?.code).toBe('no_output_device');
    expect(store.canPlayTone()).toBe(true);
    expect(log.lines).toEqual(['error test tone failed: no_output_device: no audio output device']);
  });

  it('reports a device error that ends a running tone', async () => {
    const store = createStore();
    await loaded(store);
    const started = store.playTestTone();
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    api.toneCalls[0].resolve();
    await started;

    api.finishTone({ error: { code: 'audio_device', message: 'output stream failed' } });
    expect(store.tone()).toBe('failed');
    expect(store.toneError()?.code).toBe('audio_device');
  });

  it('keeps "done" when the end is reported before the start call returns', async () => {
    const store = createStore();
    await loaded(store);
    const started = store.playTestTone();
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    api.finishTone();
    api.toneCalls[0].resolve();
    await started;
    expect(store.tone()).toBe('done');
  });

  it('asks for a tone only once the end of it can be received', async () => {
    api.subscription = new Deferred<void>();
    const store = createStore();
    await loaded(store);

    const started = store.playTestTone();
    expect(store.tone()).toBe('starting');
    expect(api.toneCalls).toHaveLength(0);

    api.subscription.resolve();
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    expect(api.toneHandlers.size).toBe(1);
    api.toneCalls[0].resolve();
    await started;
    expect(store.tone()).toBe('playing');
  });

  it('ends its subscription when it is destroyed', async () => {
    createStore();
    await vi.waitFor(() => expect(api.toneHandlers.size).toBe(1));
    TestBed.resetTestingModule();
    expect(api.toneHandlers.size).toBe(0);
  });

  it('ends a subscription that is established only after it was destroyed', async () => {
    api.subscription = new Deferred<void>();
    createStore();
    TestBed.resetTestingModule();
    api.subscription.resolve();
    // the handler is added and removed in the same turn; give the promise chain its turns
    await api.subscription.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(api.toneHandlers.size).toBe(0);
  });
});
