import { TestBed } from '@angular/core/testing';
import { setLanguage } from '../../core/i18n/i18n';
import { LogApi } from '../../core/log/log-api';
import { SystemApi } from '../../core/system/system-api';
import { FakeLogApi, FakeSystemApi, NO_OUTPUT, SYSTEM_INFO } from '../../../testing/fake-apis';
import { Diagnostics } from './diagnostics';

describe('Diagnostics', () => {
  let api: FakeSystemApi;
  let el: HTMLElement;
  /** How many `system_info` calls the test has answered. */
  let answered: number;

  beforeEach(() => {
    setLanguage('de');
    answered = 0;
    api = new FakeSystemApi();
    TestBed.configureTestingModule({
      providers: [
        { provide: SystemApi, useValue: api },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    el = TestBed.createComponent(Diagnostics).nativeElement as HTMLElement;
  });

  afterEach(() => setLanguage('en'));

  function button(label: string): HTMLButtonElement {
    const found = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    if (!found) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  }

  /** Text of the element, once it is there. */
  function text(selector: string): string {
    return el.querySelector(selector)?.textContent ?? '';
  }

  /** Answers the pending `system_info` call and waits until the view shows the result. */
  async function show(info = SYSTEM_INFO): Promise<void> {
    await vi.waitFor(() => expect(api.infoCalls.length).toBeGreaterThan(answered));
    api.infoCalls[answered++].resolve(info);
    await vi.waitFor(() => expect(button('Neu laden').disabled).toBe(false));
  }

  it('says that it is loading, then shows system, devices and formats', async () => {
    await vi.waitFor(() => expect(text('[role=status]')).toContain('Systeminformationen'));
    expect(button('Neu laden').disabled).toBe(true);

    await show();
    const all = el.textContent ?? '';
    expect(all).toContain('macos · aarch64');
    expect(all).toContain('CoreAudio');
    expect(all).toContain('48.000 Hz, 2 Kanäle');
    expect(all).toContain('MacBook Pro Speakers');
    expect(el.querySelectorAll('.devices .badge')).toHaveLength(1);

    const rows = [...el.querySelectorAll('tbody tr')].map((r) =>
      [...r.children].map((c) => c.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['FLAC', 'flac', 'unterstützt'],
      ['Opus', 'opus', 'noch nicht unterstützt'],
    ]);
  });

  it('explains a missing output device and disables the test tone', async () => {
    await show(NO_OUTPUT);
    expect(el.textContent).toContain('Kein Ausgabegerät gefunden');
    expect(button('Testton abspielen').disabled).toBe(true);
  });

  it('shows an error of the backend as an alert', async () => {
    await vi.waitFor(() => expect(api.infoCalls).toHaveLength(1));
    api.infoCalls[0].reject({ code: 'backend_unavailable', message: 'no backend' });
    await vi.waitFor(() =>
      expect(text('[role=alert]')).toContain('Das Desktop-Backend ist nicht verfügbar'),
    );
    expect(el.querySelector('table')).toBeNull();
  });

  it('plays the test tone and announces its progress', async () => {
    await show();
    const tone = button('Testton abspielen');
    tone.click();
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    await vi.waitFor(() => expect(tone.disabled).toBe(true));

    api.toneCalls[0].resolve();
    await vi.waitFor(() => expect(text('section .status')).toContain('Testton läuft'));

    api.finishTone();
    await vi.waitFor(() => expect(text('section .status')).toContain('Testton abgespielt'));
    expect(tone.disabled).toBe(false);
  });

  it('shows why the test tone failed', async () => {
    await show();
    button('Testton abspielen').click();
    await vi.waitFor(() => expect(api.toneCalls).toHaveLength(1));
    api.toneCalls[0].reject({ code: 'audio_device', message: 'open output failed' });
    await vi.waitFor(() =>
      expect(text('section [role=alert]')).toContain(
        'Der Testton konnte nicht abgespielt werden: Das Audio-Ausgabegerät meldet einen Fehler',
      ),
    );
  });

  it('reloads on request', async () => {
    await show(NO_OUTPUT);
    button('Neu laden').click();
    await vi.waitFor(() => expect(api.infoCalls).toHaveLength(2));
    api.infoCalls[1].resolve(SYSTEM_INFO);
    await vi.waitFor(() => expect(button('Testton abspielen').disabled).toBe(false));
    expect(el.textContent).toContain('MacBook Pro Speakers');
  });

  it('follows a language switch without a reload', async () => {
    await show();
    setLanguage('en');
    await vi.waitFor(() => expect(button('Play test tone')).toBeTruthy());
    expect(el.textContent).toContain('48,000 Hz, 2 channels');
  });
});
