/** A bar of the visualizer: where it is drawn on the canvas. */
export interface Bar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Lays `levels` (0…1) out as bars in a canvas of `width` × `height`: equally wide, a gap of a
 * fifth of a bar between them, growing from the bottom. A level that is not a number is 0;
 * every audible level gets at least one pixel.
 */
export function layoutBars(levels: readonly number[], width: number, height: number): Bar[] {
  const count = levels.length;
  if (count === 0 || width <= 0 || height <= 0) {
    return [];
  }
  const slot = width / count;
  const gap = Math.min(slot * 0.2, 4);
  return levels.map((level, index) => {
    const clamped = Number.isFinite(level) ? Math.min(Math.max(level, 0), 1) : 0;
    const barHeight = clamped === 0 ? 0 : Math.max(1, Math.round(clamped * height));
    return {
      x: Math.round(index * slot + gap / 2),
      y: height - barHeight,
      width: Math.max(1, Math.round(slot - gap)),
      height: barHeight,
    };
  });
}
