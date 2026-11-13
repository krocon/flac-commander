import { TestBed } from '@angular/core/testing';
import { ActionService } from '../../core/actions/action.service';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import { FakeLogApi, FakePlaylistApi, PLAYLIST } from '../../../testing/fake-apis';
import { Playlist } from './playlist';

describe('Playlist', () => {
  let api: FakePlaylistApi;
  let el: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: PlaylistApi, useValue: api },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    el = TestBed.createComponent(Playlist).nativeElement as HTMLElement;
  }

  function options(): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>('[role=option]')];
  }

  function listbox(): HTMLElement {
    const list = el.querySelector<HTMLElement>('[role=listbox]');
    if (!list) {
      throw new Error('no listbox');
    }
    return list;
  }

  function button(label: string): HTMLButtonElement {
    const found = el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!found) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  }

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    listbox().dispatchEvent(event);
    return event;
  }

  async function shown(): Promise<void> {
    await vi.waitFor(() => expect(options()).toHaveLength(PLAYLIST.entries.length));
  }

  beforeEach(() => {
    setLanguage('de');
    api = new FakePlaylistApi();
  });

  afterEach(() => setLanguage('en'));

  it('explains how to fill an empty list', async () => {
    create();
    await vi.waitFor(() => expect(el.textContent).toContain('Die Playlist ist leer'));
    expect(el.textContent).toContain('Dateien und Ordner auf das Fenster ziehen');
    expect(el.querySelector('[role=listbox]')).toBeNull();
    expect(button('Playlist leeren').disabled).toBe(true);
    expect(button('Aus der Playlist entfernen').disabled).toBe(true);
  });

  it('lists the tracks with number, label and duration and marks the current one', async () => {
    api.snapshot = PLAYLIST;
    create();
    await shown();
    const rows = options().map((o) =>
      [...o.querySelectorAll(':scope > span')].map((s) =>
        s.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    );
    expect(rows).toEqual([
      ['1.', "Barbra Streisand – Don't Like Goodbyes", '3:09'],
      ['2.', 'Barbra Streisand – People (aktueller Titel)', '3:42'],
      ['3.', 'untagged.mp3', ''],
      ['4.', 'gone.flac (Nicht abspielbar: Datei nicht gefunden)', ''],
    ]);
    expect(options()[1].getAttribute('aria-current')).toBe('true');
    expect(options()[0].getAttribute('aria-current')).toBeNull();
    expect(options()[3].classList.contains('failed')).toBe(true);
    expect(el.querySelector('.summary')?.textContent).toBe('4 Titel · 6:51');
  });

  it('selects by click and plays by double click', async () => {
    api.snapshot = PLAYLIST;
    create();
    await shown();
    options()[2].click();
    await vi.waitFor(() => expect(options()[2].getAttribute('aria-selected')).toBe('true'));
    expect(listbox().getAttribute('aria-activedescendant')).toBe(options()[2].id);
    expect(api.commands).toEqual([]);

    options()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await vi.waitFor(() => expect(api.commands).toEqual(['play 1']));
  });

  it('is operable by keyboard: arrows select, Enter plays, Delete removes', async () => {
    api.snapshot = PLAYLIST;
    create();
    await shown();

    expect(press('ArrowDown').defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(options()[2].getAttribute('aria-selected')).toBe('true'));
    press('Home');
    await vi.waitFor(() => expect(options()[0].getAttribute('aria-selected')).toBe('true'));
    press('End');
    press('ArrowUp');
    await vi.waitFor(() => expect(options()[2].getAttribute('aria-selected')).toBe('true'));

    press('Enter');
    press('Delete');
    await vi.waitFor(() => expect(api.commands).toEqual(['play 3', 'remove 3']));
    // other keys are not the list's business
    expect(press('x').defaultPrevented).toBe(false);
  });

  it('keeps its keys from the global shortcuts', async () => {
    api.snapshot = PLAYLIST;
    create();
    await shown();
    const actions = TestBed.inject(ActionService);
    const ran: string[] = [];
    const remove = actions.register([
      { id: 'spec.up', label: () => 'Up', shortcut: { key: 'ArrowUp' }, run: () => ran.push('up') },
      {
        id: 'spec.space',
        label: () => 'Space',
        shortcut: { key: ' ' },
        run: () => ran.push('space'),
      },
    ]);
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true });
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    listbox().dispatchEvent(up);
    listbox().dispatchEvent(space);
    actions.handleKey(up);
    actions.handleKey(space);
    remove();
    // the arrow belongs to the list, Space still toggles playback
    expect(ran).toEqual(['space']);
  });

  it('offers add, remove and clear as buttons too', async () => {
    api.snapshot = PLAYLIST;
    create();
    await shown();
    options()[0].click();
    await vi.waitFor(() => expect(button('Aus der Playlist entfernen').disabled).toBe(false));
    button('Aus der Playlist entfernen').click();
    button('Playlist leeren').click();
    button('Dateien hinzufügen').click();
    await vi.waitFor(() =>
      expect(api.commands).toEqual(['remove 1', 'clear', 'open "Dateien hinzufügen"']),
    );
  });

  it('shows signs instead of words where there is little room, with the same names', async () => {
    api.snapshot = PLAYLIST;
    TestBed.configureTestingModule({
      providers: [
        { provide: PlaylistApi, useValue: api },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    const fixture = TestBed.createComponent(Playlist);
    fixture.componentRef.setInput('compact', true);
    el = fixture.nativeElement as HTMLElement;
    await shown();
    expect(button('Dateien hinzufügen').textContent?.trim()).toBe('+');
    expect(button('Aus der Playlist entfernen').textContent?.trim()).toBe('−');
    expect(button('Playlist leeren').textContent?.trim()).toBe('✕');
  });

  it('follows the backend: tags arrive, the current track moves on', async () => {
    api.snapshot = PLAYLIST;
    create();
    await shown();
    api.emit({
      ...PLAYLIST,
      currentId: 3,
      entries: PLAYLIST.entries.map((e) =>
        e.id === 3
          ? { ...e, meta: { title: 'Waterloo', artist: 'Abba', album: null, durationMs: 163_000 } }
          : e,
      ),
    });
    await vi.waitFor(() => expect(options()[2].textContent).toContain('Abba – Waterloo'));
    expect(options()[2].getAttribute('aria-current')).toBe('true');
    expect(options()[1].getAttribute('aria-current')).toBeNull();
  });

  it('shows why a command failed', async () => {
    api.snapshot = PLAYLIST;
    create();
    await shown();
    api.failure = { code: 'backend_unavailable', message: 'no backend' };
    button('Playlist leeren').click();
    await vi.waitFor(() =>
      expect(el.querySelector('[role=alert]')?.textContent).toContain(
        'Das Desktop-Backend ist nicht verfügbar',
      ),
    );
  });
});
