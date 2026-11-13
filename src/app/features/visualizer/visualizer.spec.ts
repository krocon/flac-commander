import { TestBed } from '@angular/core/testing';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { FakeLogApi, FakePlayerApi } from '../../../testing/fake-apis';
import { Visualizer } from './visualizer';

describe('Visualizer', () => {
  let api: FakePlayerApi;
  let drawn: string[];

  /** jsdom has no canvas: a recording context stands in for it. */
  function fakeContext(): CanvasRenderingContext2D {
    return {
      fillStyle: '',
      clearRect: () => drawn.push('clear'),
      fillRect(this: { fillStyle: string }, x: number, y: number, w: number, h: number) {
        drawn.push(`${this.fillStyle} ${x},${y} ${w}x${h}`);
      },
    } as unknown as CanvasRenderingContext2D;
  }

  function create(reducedMotion = false) {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reducedMotion, media: query }));
    TestBed.configureTestingModule({
      providers: [
        { provide: PlayerApi, useValue: api },
        { provide: LogApi, useValue: new FakeLogApi() },
      ],
    });
    return TestBed.createComponent(Visualizer);
  }

  beforeEach(() => {
    api = new FakePlayerApi();
    drawn = [];
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks the engine for the spectrum while it is shown, and no longer after', async () => {
    const fixture = create();
    await vi.waitFor(() => expect(api.spectrumRequests).toEqual(['on']));
    expect(api.spectrumHandlers.size).toBe(1);

    fixture.destroy();
    await vi.waitFor(() => expect(api.spectrumRequests).toEqual(['on', 'off']));
    expect(api.spectrumHandlers.size).toBe(0);
  });

  it('draws the levels as bars in the colour it was given', async () => {
    const fixture = create();
    fixture.componentRef.setInput('color', '#5dff7a');
    await vi.waitFor(() => expect(api.spectrumHandlers.size).toBe(1));
    const element = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => expect(element.querySelector('canvas')).not.toBeNull());
    const canvas = element.querySelector('canvas')!;
    Object.defineProperties(canvas, {
      clientWidth: { value: 100 },
      clientHeight: { value: 40 },
      getContext: { value: () => fakeContext() },
    });

    api.emitSpectrum([0, 0.5, 1, 0.25]);
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(drawn[0]).toBe('clear');
    expect(drawn.slice(1)).toHaveLength(4);
    expect(drawn[3]).toMatch(/^#5dff7a \d+,0 \d+x\d+$/);
  });

  it('shows nothing and asks for nothing when the user wants reduced motion', async () => {
    const fixture = create(true);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('canvas')).toBeNull();
    expect(api.spectrumRequests).toEqual([]);
    expect(api.spectrumHandlers.size).toBe(0);
  });
});
