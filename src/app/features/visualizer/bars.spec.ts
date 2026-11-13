import { layoutBars } from './bars';

describe('layoutBars', () => {
  it('spreads the bars over the width and grows them from the bottom', () => {
    const bars = layoutBars([0, 0.5, 1, 0.25], 100, 40);
    expect(bars.map((b) => b.height)).toEqual([0, 20, 40, 10]);
    expect(bars.map((b) => b.y)).toEqual([40, 20, 0, 30]);
    expect(bars.map((b) => b.x)).toEqual([2, 27, 52, 77]);
    expect(bars.every((b) => b.width === 21)).toBe(true);
    // nothing reaches beyond the canvas
    expect(bars.every((b) => b.x + b.width <= 100 && b.y >= 0)).toBe(true);
  });

  it('keeps levels in range and shows every audible level', () => {
    const bars = layoutBars([-1, 2, Number.NaN, 0.001], 80, 10);
    expect(bars.map((b) => b.height)).toEqual([0, 10, 0, 1]);
  });

  it('draws nothing where there is nothing to draw on', () => {
    expect(layoutBars([], 100, 40)).toEqual([]);
    expect(layoutBars([1], 0, 40)).toEqual([]);
    expect(layoutBars([1], 100, 0)).toEqual([]);
  });

  it('keeps bars at least a pixel wide in a narrow canvas', () => {
    const bars = layoutBars(new Array<number>(24).fill(1), 20, 10);
    expect(bars.every((b) => b.width >= 1)).toBe(true);
  });
});
