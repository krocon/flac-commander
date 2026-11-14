import { TestBed } from '@angular/core/testing';
import { LibraryApi } from '../../core/library/library-api';
import { LibraryFound } from '../../core/library/library.models';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import {
  Deferred,
  FakeLibraryApi,
  FakeLogApi,
  LIBRARY_FOUND,
  LIBRARY_STATE,
  NO_FOLDERS,
  NO_LIBRARY,
} from '../../../testing/fake-apis';
import { LibraryStore } from './library.store';

describe('LibraryStore', () => {
  let api: FakeLibraryApi;
  let log: FakeLogApi;

  function create(): LibraryStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: LibraryApi, useValue: api },
        { provide: LogApi, useValue: log },
      ],
    });
    return TestBed.inject(LibraryStore);
  }

  beforeEach(() => {
    setLanguage('en');
    api = new FakeLibraryApi();
    log = new FakeLogApi();
  });

  it('starts with the folders of the library', async () => {
    const store = create();
    expect(store.isEmpty()).toBe(false);
    await store.ready;
    expect(store.roots()).toEqual(LIBRARY_STATE.roots);
    expect(store.scan().tracks).toBe(3);
    expect(store.path()).toBeNull();
    expect(store.listing().folders.map((f) => f.name)).toEqual(['Music']);
    expect(api.commands).toEqual(['browse -']);
    expect(store.isEmpty()).toBe(false);
  });

  it('knows a library without folders', async () => {
    api.snapshot = NO_LIBRARY;
    api.folders = NO_FOLDERS;
    const store = create();
    await store.ready;
    expect(store.isEmpty()).toBe(true);
  });

  it('goes into folders, up again and reports a folder that is gone', async () => {
    const store = create();
    await store.ready;
    await store.open('/music/Barbra/People');
    expect(store.path()).toBe('/music/Barbra/People');
    expect(store.listing().tracks).toHaveLength(2);
    await store.up();
    expect(store.path()).toBe('/music/Barbra');
    await store.up();
    await store.up();
    expect(store.path()).toBeNull();

    await store.open('/music/gone');
    expect(store.error()?.code).toBe('not_found');
    expect(log.lines.at(-1)).toContain('library_browse failed: not_found');
    // what was shown stays
    expect(store.path()).toBeNull();
    await store.open('/music');
    expect(store.error()).toBeNull();
  });

  it('shows the answer to the latest request only', async () => {
    const store = create();
    await store.ready;
    const slow = new Deferred<LibraryFound>();
    api.found = slow;
    const first = store.setQuery('peo');
    api.found = { albums: [], tracks: [], more: false };
    await store.setQuery('people');
    expect(store.found()?.more).toBe(false);
    slow.resolve(LIBRARY_FOUND);
    await first;
    expect(store.found()?.more).toBe(false);
    expect(store.query()).toBe('people');
    expect(store.searching()).toBe(true);
  });

  it('searches, and leaves the search by emptying it or going to a folder', async () => {
    const store = create();
    await store.ready;
    await store.setQuery('people');
    expect(api.commands.at(-1)).toBe('search "people"');
    expect(store.found()).toEqual(LIBRARY_FOUND);
    await store.setQuery('  ');
    expect(store.searching()).toBe(false);
    expect(store.found()).toBeNull();
    expect(api.commands.at(-1)).toBe('search "people"');

    await store.setQuery('people');
    await store.goTo('/music');
    expect(store.searching()).toBe(false);
    expect(store.path()).toBe('/music');
  });

  it('plays now or adds, and tells what happened', async () => {
    const store = create();
    await store.ready;
    await store.play('/music/Barbra/People');
    expect(api.commands.at(-1)).toBe('play /music/Barbra/People');
    expect(store.notice()).toBeNull();
    await store.add('/music/Barbra/People');
    expect(api.commands.at(-1)).toBe('add /music/Barbra/People');
    expect(store.notice()).toBe('2 tracks added to the playlist');
    api.played = 1;
    await store.add('/music/Barbra/People/11 Goodbyes.flac');
    expect(store.notice()).toBe('1 track added to the playlist');
    api.played = 0;
    await store.play('/music');
    expect(store.notice()).toBe('Nothing playable in there');

    api.failure = { code: 'permission_denied', message: 'not inside the library' };
    await store.play('/etc');
    expect(store.error()?.code).toBe('permission_denied');
    expect(store.notice()).toBeNull();
  });

  it('passes folder commands on', async () => {
    const store = create();
    await store.ready;
    await store.addRoot();
    await store.removeRoot('/music');
    await store.rescan();
    expect(api.commands.slice(1)).toEqual([
      'add root "Choose music folders"',
      'remove root /music',
      'rescan',
    ]);
  });

  it('goes back to the list of folders when the folders change', async () => {
    const store = create();
    await store.ready;
    await store.open('/music/Barbra');
    api.emit({ ...LIBRARY_STATE, roots: [...LIBRARY_STATE.roots, { name: 'B', path: '/b' }] });
    await vi.waitFor(() => expect(store.path()).toBeNull());
    expect(store.roots()).toHaveLength(2);
  });

  it('follows the scan: reads the folder again at its end and searches again while it runs', async () => {
    const store = create();
    await store.ready;
    await store.open('/music/Barbra');
    await store.setQuery('people');
    const scanning = { ...LIBRARY_STATE, scan: { scanning: true, folders: 1, tracks: 1 } };
    api.commands.length = 0;
    api.emit(scanning);
    expect(store.scan().scanning).toBe(true);
    await vi.waitFor(() => expect(api.commands).toEqual(['search "people"']));
    api.emit(LIBRARY_STATE);
    await vi.waitFor(() =>
      expect(api.commands).toEqual(['search "people"', 'browse /music/Barbra', 'search "people"']),
    );
    // nothing is asked when nothing changed
    api.emit(LIBRARY_STATE);
    expect(api.commands).toHaveLength(3);
  });

  it('reports a backend that is not there', async () => {
    api.failure = { code: 'backend_unavailable', message: 'no backend' };
    const store = create();
    await store.ready;
    expect(store.error()?.code).toBe('backend_unavailable');
  });
});
