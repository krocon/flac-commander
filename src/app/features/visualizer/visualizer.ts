import { Component, DestroyRef, ElementRef, inject, input, viewChild } from '@angular/core';
import { untilDestroyed } from '../../core/backend/events';
import { toAppError } from '../../core/errors/app-error';
import { LogApi } from '../../core/log/log-api';
import { PlayerApi } from '../../core/player/player-api';
import { layoutBars } from './bars';

/**
 * Bars that follow the music. The levels come from the engine (a few numbers, 25 times per
 * second); this component only draws them. It is decoration: hidden from assistive technology,
 * and not shown at all to users who asked their system for reduced motion.
 */
@Component({
  selector: 'app-visualizer',
  template: `@if (!reducedMotion) {
    <canvas #canvas aria-hidden="true"></canvas>
  }`,
  styles: `
    :host {
      display: block;
      color: var(--player-accent);
    }

    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class Visualizer {
  /** Colour of the bars; without it the accent colour of the skin. */
  readonly color = input<string | null>(null);

  private readonly api = inject(PlayerApi);
  private readonly log = inject(LogApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    if (this.reducedMotion) {
      return;
    }
    const destroyRef = inject(DestroyRef);
    // subscribe first, then ask the engine to analyse; stop asking when this goes away
    untilDestroyed(
      this.api.onSpectrum((bands) => this.draw(bands)),
      destroyRef,
    )
      .then(() => this.api.setSpectrum(true))
      .catch((e: unknown) => this.report(e));
    destroyRef.onDestroy(() => {
      this.api.setSpectrum(false).catch((e: unknown) => this.report(e));
    });
  }

  private draw(levels: readonly number[]): void {
    const canvas = this.canvas()?.nativeElement;
    const context = canvas?.getContext?.('2d');
    if (!canvas || !context) {
      return;
    }
    // the canvas has as many pixels as it is shown with (sharp bars on every display)
    const scale = globalThis.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * scale);
    const height = Math.round(canvas.clientHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.clearRect(0, 0, width, height);
    context.fillStyle = this.color() ?? getComputedStyle(this.host.nativeElement).color;
    for (const bar of layoutBars(levels, width, height)) {
      context.fillRect(bar.x, bar.y, bar.width, bar.height);
    }
  }

  private report(e: unknown): void {
    const error = toAppError(e);
    this.log.error(`visualizer: ${error.code}: ${error.message}`);
  }
}
