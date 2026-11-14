import { TestBed } from '@angular/core/testing';
import { ActionService } from '../../core/actions/action.service';
import { setLanguage } from '../../core/i18n/i18n';
import { LibraryApi } from '../../core/library/library-api';
import { LogApi } from '../../core/log/log-api';
import {
  FakeLibraryApi,
  FakeLogApi,
  LIBRARY_STATE,
  NO_FOLDERS,
  NO_LIBRARY,
} from '../../../testing/fake-apis';
import { Library } from './library';
import { LibraryStore } from './library.store';

describe('Library', () => {
  let api: FakeLibraryApi;
  let el: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: LibraryApi, useValue: api },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    el = TestBed.createComponent(Library).nativeElement as HTMLElement;
  }

  function tiles(): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>('.tile')];
  }

  function tile(name: string): HTMLElement {
    const found = tiles().find((t) => t.querySelector('.name')?.textContent === name);
    if (!found) {
      throw new Error(`no tile "${name}"`);
    }
    return found;
  }

  function face(of: HTMLElement): HTMLButtonElement {
    return of.querySelector<HTMLButtonElement>('.face') as HTMLButtonElement;
  }

  function rows(): HTMLElement[] {
    return [...el.querySelectorAll<HTMLElement>('.row')];
  }

  function button(label: string, within: HTMLElement = el): HTMLButtonElement {
    const found = [...within.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
    );
    if (!found) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  }

  function crumbs(): string[] {
    return [...el.querySelectorAll('.crumb')].map((c) => c.textContent?.trim() ?? '');
  }

  /** A click of the mouse (`detail` 1), unlike `click()` which looks like the keyboard. */
  function mouseClick(target: HTMLElement): void {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  }

  function type(text: string): void {
    const input = el.querySelector<HTMLInputElement>('input[type=search]') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  async function at(path: string): Promise<void> {
    const store = TestBed.inject(LibraryStore);
    await store.ready;
    await store.open(path);
    await vi.waitFor(() =>
      expect(el.querySelector('.crumb[aria-current=page]')?.getAttribute('title')).toBe(path),
    );
  }

  beforeEach(() => {
    setLanguage('de');
    api = new FakeLibraryApi();
  });

  afterEach(() => setLanguage('en'));

  it('offers to choose a folder while the library is empty', async () => {
    api.snapshot = NO_LIBRARY;
    api.folders = NO_FOLDERS;
    create();
    await vi.waitFor(() =>
      expect(el.querySelector('.empty h1')?.textContent).toBe('Die Bibliothek ist leer'),
    );
    button('Ordner hinzufügen', el.querySelector('.empty') as HTMLElement).click();
    await vi.waitFor(() => expect(api.commands).toContain('add root "Musikordner wählen"'));
    expect(tiles()).toHaveLength(0);
  });

  it('shows the folders of the library and lets one be removed', async () => {
    create();
    await vi.waitFor(() => expect(tiles()).toHaveLength(1));
    expect(crumbs()).toEqual(['Bibliothek']);
    expect(el.querySelector('[role=status]')?.textContent).toBe('3 Titel in 2 Ordnern');
    button('„Music“ aus der Bibliothek entfernen').click();
    await vi.waitFor(() => expect(api.commands).toContain('remove root /music'));
  });

  it('walks through folders by click and back by breadcrumb', async () => {
    create();
    await vi.waitFor(() => expect(tiles()).toHaveLength(1));
    // a folder of folders opens with one click of the mouse
    mouseClick(face(tile('Music')));
    await vi.waitFor(() => expect(crumbs()).toEqual(['Bibliothek', 'Music']));
    mouseClick(face(tile('Barbra')));
    await vi.waitFor(() => expect(tiles()).toHaveLength(2));
    expect(crumbs()).toEqual(['Bibliothek', 'Music', 'Barbra']);
    expect(el.querySelector('.crumb[aria-current=page]')?.textContent?.trim()).toBe('Barbra');
    // inside the library a folder is not removed
    expect(el.querySelector('[aria-label*="entfernen"]')).toBeNull();

    [...el.querySelectorAll<HTMLButtonElement>('.crumb')][1].click();
    await vi.waitFor(() => expect(crumbs()).toEqual(['Bibliothek', 'Music']));
    [...el.querySelectorAll<HTMLButtonElement>('.crumb')][0].click();
    await vi.waitFor(() => expect(crumbs()).toEqual(['Bibliothek']));
  });

  it('shows albums as covers with name and artist', async () => {
    create();
    await at('/music/Barbra');
    const guilty = tile('Guilty (1980)');
    expect(guilty.querySelector('.sub')?.textContent).toBe('Barbra Streisand');
    expect(guilty.querySelector('img')?.getAttribute('src')).toBe(
      'libcover:///music/Barbra/Guilty (1980)',
    );
    expect(guilty.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    // no artist in the tags: the number of tracks
    expect(tile('People').querySelector('.sub')?.textContent).toBe('2 Titel');

    // a cover that cannot be loaded gives way to the placeholder
    guilty.querySelector('img')?.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(guilty.querySelector('img')).toBeNull());
    expect(tile('People').querySelector('img')).not.toBeNull();
  });

  it('picks an album by click, plays it by double click and opens it by key', async () => {
    create();
    await at('/music/Barbra');
    api.commands.length = 0;
    const people = tile('People');
    mouseClick(face(people));
    await vi.waitFor(() => expect(people.classList.contains('selected')).toBe(true));
    expect(api.commands).toEqual([]);

    face(people).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await vi.waitFor(() => expect(api.commands).toEqual(['play /music/Barbra/People']));

    // Enter and Space on a button arrive as a click without `detail`
    face(people).click();
    await vi.waitFor(() => expect(crumbs().at(-1)).toBe('People'));
    expect(api.commands.at(-1)).toBe('browse /music/Barbra/People');
  });

  it('plays, adds and opens an album by the buttons on its tile', async () => {
    create();
    await at('/music/Barbra');
    const people = tile('People');
    button('„People“ abspielen', people).click();
    await vi.waitFor(() => expect(api.commands.at(-1)).toBe('play /music/Barbra/People'));
    button('„People“ zur Playlist hinzufügen', people).click();
    await vi.waitFor(() => expect(api.commands.at(-1)).toBe('add /music/Barbra/People'));
    await vi.waitFor(() =>
      expect(el.querySelector('[role=status]')?.textContent).toBe(
        '2 Titel zur Playlist hinzugefügt',
      ),
    );
    button('„People“ öffnen', people).click();
    await vi.waitFor(() => expect(crumbs().at(-1)).toBe('People'));
  });

  it('shows an album with its cover, its tracks and what to do with them', async () => {
    create();
    await at('/music/Barbra/People');
    const album = el.querySelector('.album') as HTMLElement;
    expect(album.querySelector('h1')?.textContent).toBe('People');
    expect(album.querySelector('.artist')?.textContent).toBe('Barbra Streisand');
    expect(album.querySelector('.count')?.textContent).toBe('2 Titel');
    expect(album.querySelector('img')?.getAttribute('src')).toBe('libcover:///music/Barbra/People');

    expect(rows().map((r) => r.querySelector('.title')?.textContent)).toEqual([
      "Don't Like Goodbyes",
      '12 untagged.flac',
    ]);
    expect(rows().map((r) => r.querySelector('.time')?.textContent)).toEqual(['3:09', '']);

    api.commands.length = 0;
    button('Abspielen', album).click();
    button('Zur Playlist hinzufügen', album).click();
    await vi.waitFor(() =>
      expect(api.commands).toEqual(['play /music/Barbra/People', 'add /music/Barbra/People']),
    );
  });

  it('picks a track by click and plays it by double click, key or button', async () => {
    create();
    await at('/music/Barbra/People');
    api.commands.length = 0;
    const [first, second] = rows();
    mouseClick(face(first));
    await vi.waitFor(() => expect(first.classList.contains('selected')).toBe(true));
    expect(api.commands).toEqual([]);

    const path = '/music/Barbra/People/11 Goodbyes.flac';
    face(first).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    face(first).click();
    button("„Don't Like Goodbyes“ abspielen", first).click();
    await vi.waitFor(() =>
      expect(api.commands).toEqual([`play ${path}`, `play ${path}`, `play ${path}`]),
    );
    button('„12 untagged.flac“ zur Playlist hinzufügen', second).click();
    await vi.waitFor(() =>
      expect(api.commands.at(-1)).toBe('add /music/Barbra/People/12 untagged.flac'),
    );
  });

  it('searches as the user types and shows albums and tracks', async () => {
    create();
    await at('/music/Barbra');
    type('people');
    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(api.commands.at(-1)).toBe('search "people"');
    expect([...el.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Alben', 'Titel']);
    expect(tiles()).toHaveLength(1);
    expect(rows()[0].querySelector('.by')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Barbra Streisand · People',
    );
    expect(el.textContent).toContain('Es gibt weitere Treffer');
    // the breadcrumb is the way back
    expect(crumbs()).toEqual(['Bibliothek']);

    // Escape empties the search: the folder is there again
    el.querySelector('input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await vi.waitFor(() => expect(tiles()).toHaveLength(2));
    expect(el.querySelector<HTMLInputElement>('input')?.value).toBe('');
    expect(crumbs()).toEqual(['Bibliothek', 'Music', 'Barbra']);
  });

  it('says so when nothing is found, and that the library is still being read', async () => {
    api.found = { albums: [], tracks: [], more: false };
    create();
    await vi.waitFor(() => expect(tiles()).toHaveLength(1));
    type('zappa');
    await vi.waitFor(() => expect(el.textContent).toContain('Nichts gefunden für „zappa“'));
    expect(el.textContent).not.toContain('wird noch eingelesen');

    api.emit({ ...LIBRARY_STATE, scan: { scanning: true, folders: 1, tracks: 120 } });
    await vi.waitFor(() => expect(el.textContent).toContain('wird noch eingelesen'));
    expect(el.querySelector('[role=status]')?.textContent).toBe(
      'Bibliothek wird eingelesen … 120 Titel',
    );
    expect(button('Neu einlesen').disabled).toBe(true);
  });

  it('reads the library again on request and shows what went wrong', async () => {
    create();
    await vi.waitFor(() => expect(tiles()).toHaveLength(1));
    button('Neu einlesen').click();
    await vi.waitFor(() => expect(api.commands).toContain('rescan'));

    await TestBed.inject(LibraryStore).open('/music/gone');
    await vi.waitFor(() =>
      expect(el.querySelector('[role=alert]')?.textContent).toBe('Datei nicht gefunden'),
    );
  });

  it('has a key for the search', async () => {
    create();
    await vi.waitFor(() => expect(tiles()).toHaveLength(1));
    document.body.appendChild(el);
    const actions = TestBed.inject(ActionService);
    expect(actions.hint('library.search')).toMatch(/^Suchen \(.+F\)$/);
    actions.run('library.search');
    expect(document.activeElement).toBe(el.querySelector('input'));
    el.remove();
  });
});
