import { TestBed } from '@angular/core/testing';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { PlaylistApi } from '../../core/playlist/playlist-api';
import {
  FakeLogApi,
  FakePlayerApi,
  FakePlaylistApi,
  TRACK_STATE,
} from '../../../testing/fake-apis';
import { bandLabel, Equalizer } from './equalizer';

describe('Equalizer', () => {
  let api: FakePlayerApi;
  let el: HTMLElement;

  beforeEach(async () => {
    setLanguage('de');
    api = new FakePlayerApi();
    api.snapshot = {
      ...TRACK_STATE,
      equalizer: { enabled: true, preampDb: -4, gainsDb: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: api },
        { provide: PlaylistApi, useValue: new FakePlaylistApi() },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    el = TestBed.createComponent(Equalizer).nativeElement as HTMLElement;
    await vi.waitFor(() => expect(slider('31 Hz').value).toBe('6'));
  });

  afterEach(() => setLanguage('en'));

  function slider(label: string): HTMLInputElement {
    const found = el.querySelector<HTMLInputElement>(`input[type=range][aria-label="${label}"]`);
    if (!found) {
      throw new Error(`no slider "${label}"`);
    }
    return found;
  }

  it('labels the bands by their frequency', () => {
    expect([31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map(bandLabel)).toEqual([
      '31',
      '63',
      '125',
      '250',
      '500',
      '1k',
      '2k',
      '4k',
      '8k',
      '16k',
    ]);
  });

  it('shows a slider per band and the preamp with their values', () => {
    const sliders = [...el.querySelectorAll<HTMLInputElement>('input[type=range]')];
    expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Vorverstärkung',
      '31 Hz',
      '63 Hz',
      '125 Hz',
      '250 Hz',
      '500 Hz',
      '1.000 Hz',
      '2.000 Hz',
      '4.000 Hz',
      '8.000 Hz',
      '16.000 Hz',
    ]);
    expect(sliders.map((s) => s.value)).toEqual([
      '-4',
      '6',
      '5',
      '4',
      '2',
      '0',
      '0',
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(slider('31 Hz').getAttribute('aria-valuetext')).toBe('+6 dB');
    expect(slider('Vorverstärkung').getAttribute('aria-valuetext')).toBe('-4 dB');
    expect(slider('500 Hz').getAttribute('aria-valuetext')).toBe('0 dB');
    expect(slider('31 Hz').min).toBe('-12');
    expect(slider('31 Hz').max).toBe('12');
  });

  it('shows whether it is on and which preset is set', () => {
    expect(el.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
    expect(el.querySelector('select')?.value).toBe('bass');
    const options = [...el.querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Linear', 'Mehr Bass']);
    expect(el.querySelector('.sliders')?.classList.contains('off')).toBe(false);
  });

  it('sets a band while its slider moves', async () => {
    const band = slider('125 Hz');
    band.value = '-3.5';
    band.dispatchEvent(new Event('input'));
    await vi.waitFor(() =>
      expect(api.commands).toEqual(['equalizer on -4 [6,5,-3.5,2,0,0,0,0,0,0]']),
    );
    await vi.waitFor(() => expect(band.getAttribute('aria-valuetext')).toBe('-3,5 dB'));
    // no preset has these values any more
    await vi.waitFor(() => expect(el.querySelector('select')?.value).toBe('custom'));
  });

  it('switches off, applies a preset and resets', async () => {
    const box = el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(api.commands).toHaveLength(1));
    await vi.waitFor(() =>
      expect(el.querySelector('.sliders')?.classList.contains('off')).toBe(true),
    );

    const select = el.querySelector('select')!;
    select.value = 'flat';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(api.commands).toHaveLength(2));

    el.querySelector<HTMLButtonElement>('button')?.click();
    await vi.waitFor(() =>
      expect(api.commands).toEqual([
        'equalizer off -4 [6,5,4,2,0,0,0,0,0,0]',
        'equalizer on 0 [0,0,0,0,0,0,0,0,0,0]',
        'equalizer on 0 [0,0,0,0,0,0,0,0,0,0]',
      ]),
    );
  });

  it('follows the engine when another window changes the settings', async () => {
    api.emit({
      ...TRACK_STATE,
      equalizer: { enabled: false, preampDb: 0, gainsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 12] },
    });
    await vi.waitFor(() => expect(slider('16.000 Hz').value).toBe('12'));
    expect(slider('31 Hz').value).toBe('0');
    expect(el.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false);
  });
});
