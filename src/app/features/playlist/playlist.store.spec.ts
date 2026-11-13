import { TestBed } from '@angular/core/testing';
import { LogApi } from '../../core/log/log-api';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import { EMPTY_PLAYLIST_STATE } from '../../core/playlist/playlist.models';
import { FakeLogApi, FakePlaylistApi, PLAYLIST } from '../../../testing/fake-apis';
import { entryLabel, PlaylistStore } from './playlist.store';

describe('PlaylistStore', () => {
  let api: FakePlaylistApi;
  let log: FakeLogApi;

  async function createStore(): Promise<PlaylistStore> {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlaylistApi, useValue: api },
        { provide: LogApi, useValue: log },
      ],
    });
    const store = TestBed.inject(PlaylistStore);
    await store.ready;
    return store;
  }

  beforeEach(() => {
    api = new FakePlaylistApi();
    log = new FakeLogApi();
  });

  it('starts with the list the backend has and follows its changes', async () => {
    api.snapshot = PLAYLIST;
    const store = await createStore();
    expect(store.entries()).toHaveLength(4);
    expect(store.current()?.fileName).toBe('12 People.flac');
    expect(store.totalMs()).toBe(189_000 + 222_333);

    api.emit({ ...PLAYLIST, currentId: 1, repeat: 'all', shuffle: true });
    expect(store.current()?.id).toBe(1);
    expect(store.repeat()).toBe('all');
    expect(store.shuffle()).toBe(true);

    api.emit(EMPTY_PLAYLIST_STATE);
    expect(store.isEmpty()).toBe(true);
    expect(store.current()).toBeNull();
  });

  it('labels an entry by its tags, or by its file name', () => {
    const [tagged, , untagged, empty] = PLAYLIST.entries;
    expect(entryLabel(tagged)).toBe("Barbra Streisand – Don't Like Goodbyes");
    expect(entryLabel({ ...tagged, meta: { ...tagged.meta!, artist: null } })).toBe(
      "Don't Like Goodbyes",
    );
    expect(entryLabel(untagged)).toBe('untagged.mp3');
    expect(entryLabel(empty)).toBe('gone.flac');
  });

  it('sends its commands and changes nothing by itself', async () => {
    api.snapshot = PLAYLIST;
    const store = await createStore();
    await store.play(3);
    await store.next();
    await store.previous();
    await store.clear();
    await store.open();
    expect(api.commands).toEqual(['play 3', 'next', 'previous', 'clear', 'open "Add files"']);
    expect(store.entries()).toHaveLength(4);
    expect(store.currentId()).toBe(2);
  });

  it('cycles repeat off → playlist → track → off and toggles shuffle', async () => {
    api.snapshot = PLAYLIST;
    const store = await createStore();
    await store.cycleRepeat();
    api.emit({ ...PLAYLIST, repeat: 'all' });
    await store.cycleRepeat();
    api.emit({ ...PLAYLIST, repeat: 'one' });
    await store.cycleRepeat();
    await store.toggleShuffle();
    api.emit({ ...PLAYLIST, shuffle: true });
    await store.toggleShuffle();
    expect(api.commands).toEqual([
      'repeat all',
      'repeat one',
      'repeat off',
      'shuffle true',
      'shuffle false',
    ]);
  });

  it('moves the selection, starting at the current track', async () => {
    api.snapshot = PLAYLIST;
    const store = await createStore();
    expect(store.selectedId()).toBeNull();

    store.moveSelection(1);
    expect(store.selectedId()).toBe(3);
    store.moveSelection(10);
    expect(store.selectedId()).toBe(4);
    store.moveSelection(-1);
    expect(store.selectedId()).toBe(3);
    store.selectEdge('first');
    expect(store.selectedId()).toBe(1);
    store.moveSelection(-1);
    expect(store.selectedId()).toBe(1);
    store.selectEdge('last');
    expect(store.selectedId()).toBe(4);
  });

  it('plays and removes the selected entry; the selection moves to its neighbour', async () => {
    api.snapshot = PLAYLIST;
    const store = await createStore();
    await store.playSelected();
    await store.removeSelected();
    expect(api.commands).toEqual([]);

    store.select(3);
    await store.playSelected();
    await store.removeSelected();
    expect(api.commands).toEqual(['play 3', 'remove 3']);
    expect(store.selectedId()).toBe(4);

    // the backend confirms; removing the last entry selects the one before it
    api.emit({ ...PLAYLIST, entries: PLAYLIST.entries.filter((e) => e.id !== 3) });
    await store.removeSelected();
    expect(api.commands.at(-1)).toBe('remove 4');
    expect(store.selectedId()).toBe(2);
  });

  it('forgets a selection whose entry is gone', async () => {
    api.snapshot = PLAYLIST;
    const store = await createStore();
    store.select(3);
    api.emit({ ...PLAYLIST, entries: PLAYLIST.entries.slice(0, 2) });
    expect(store.selectedId()).toBeNull();
  });

  it('knows when files are dragged over the window', async () => {
    const store = await createStore();
    expect(store.dragOver()).toBe(false);
    api.drag(true);
    expect(store.dragOver()).toBe(true);
    api.drag(false);
    expect(store.dragOver()).toBe(false);
  });

  it('shows and logs a command the backend refused', async () => {
    const store = await createStore();
    api.failure = { code: 'internal', message: 'the audio engine is not running' };
    await store.next();
    expect(store.commandError()?.code).toBe('internal');
    expect(log.lines).toEqual([
      'error playlist_next failed: internal: the audio engine is not running',
    ]);
    api.failure = null;
    await store.next();
    expect(store.commandError()).toBeNull();
  });

  it('ends its subscriptions when it is destroyed', async () => {
    await createStore();
    expect(api.handlers.size).toBe(1);
    expect(api.dragHandlers.size).toBe(1);
    TestBed.resetTestingModule();
    expect(api.handlers.size).toBe(0);
    expect(api.dragHandlers.size).toBe(0);
  });
});
