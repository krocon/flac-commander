import { formatTime } from './format-time';

describe('formatTime', () => {
  it('shows minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(999)).toBe('0:00');
    expect(formatTime(1000)).toBe('0:01');
    expect(formatTime(61_500)).toBe('1:01');
    expect(formatTime(599_999)).toBe('9:59');
    expect(formatTime(3_599_000)).toBe('59:59');
  });

  it('adds hours from one hour on', () => {
    expect(formatTime(3_600_000)).toBe('1:00:00');
    expect(formatTime(3_914_977)).toBe('1:05:14');
  });

  it('shows a dash for an unknown time', () => {
    expect(formatTime(null)).toBe('–:––');
    expect(formatTime(undefined)).toBe('–:––');
    expect(formatTime(Number.NaN)).toBe('–:––');
    expect(formatTime(-5)).toBe('–:––');
  });
});
