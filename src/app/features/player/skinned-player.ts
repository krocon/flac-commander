import { Component, computed, inject, input, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { SkinComponent, SkinPlayerWindow } from '../../core/skins/skin.models';
import { Playlist } from '../playlist/playlist';
import { SkinStore } from '../skins/skin.store';
import { Visualizer } from '../visualizer/visualizer';
import { PlayerView } from './player-view';
import { PLAYER_TEXTS } from './player-texts';
import { PlayerStore } from './player.store';

/** A component of the skin with what the template needs worked out. */
interface Placed {
  readonly component: SkinComponent;
  /** CSS `url(…)` per button state, `null` where the skin has no picture. */
  readonly normal: string | null;
  readonly hover: string | null;
  readonly pressed: string | null;
  readonly active: string | null;
  readonly disabled: string | null;
}

/**
 * The player of a skin with an `absolute` layout: every building block sits where the skin
 * puts it. The blocks themselves – what a button does, what a text says, how a slider is
 * operated and announced – are the app's and the same as in the standard player.
 */
@Component({
  selector: 'app-skinned-player',
  imports: [Playlist, Visualizer],
  templateUrl: './skinned-player.html',
  styleUrl: './skinned-player.css',
})
export class SkinnedPlayer {
  readonly layout = input.required<SkinPlayerWindow>();

  protected readonly store = inject(PlayerStore);
  protected readonly view = inject(PlayerView);
  protected readonly actions = inject(ActionService);
  protected readonly skins = inject(SkinStore);
  protected readonly t = PLAYER_TEXTS;

  protected readonly background = computed(() => {
    const path = this.layout().background;
    return path ? this.url(path) : null;
  });

  protected readonly placed = computed<readonly Placed[]>(() =>
    this.layout().components.map((component) => {
      const states = component.states;
      const of = (path: string | null | undefined) => (path ? this.url(path) : null);
      return {
        component,
        normal: of(states?.normal),
        hover: of(states?.hover),
        pressed: of(states?.pressed),
        active: of(states?.active),
        disabled: of(states?.disabled),
      };
    }),
  );

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    return error ? describeError(error) : null;
  });

  /** The text of a `text` component. */
  protected text(source: string | null): string {
    switch (source) {
      case 'track.title':
        return this.view.title();
      case 'track.artist':
        return this.view.artist() ?? '';
      case 'track.details':
        return this.view.details();
      case 'player.status':
        return this.errorText() ?? this.view.status();
      default:
        return '';
    }
  }

  protected time(source: string | null): string {
    return source === 'duration' ? this.view.duration() : this.view.position();
  }

  /** What a button is called: "Pause" while playing, else the label of its action. */
  protected label(action: string | null): string {
    if (action === 'player.togglePlay') {
      return this.store.isPlaying() ? this.t.pause : this.t.play;
    }
    return action ? this.actions.label(action) : '';
  }

  // ---- needle: turns with the position, dragged around its pivot to seek

  /** Set while a needle is dragged: where the pointer and the track were when it began. */
  private drag: { readonly pointerAngle: number; readonly fraction: number } | null = null;
  protected readonly dragging = signal(false);

  /** How far the track has got, 0 to 1. */
  private readonly fraction = computed(() => {
    const duration = this.store.durationMs() ?? 0;
    return duration > 0 ? Math.min(1, Math.max(0, this.store.positionMs() / duration)) : 0;
  });

  protected needleAngle(c: SkinComponent): number {
    const from = c.from ?? 0;
    if (!this.view.seekable()) {
      return c.rest ?? from;
    }
    return from + ((c.to ?? from) - from) * this.fraction();
  }

  protected needleDown(event: PointerEvent, c: SkinComponent): void {
    if (!this.view.seekable() || event.button !== 0) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.drag = { pointerAngle: this.pointerAngle(event, c), fraction: this.fraction() };
    this.dragging.set(true);
    event.preventDefault();
  }

  protected needleMove(event: PointerEvent, c: SkinComponent): void {
    const target = this.dragTarget(event, c);
    if (target !== null) {
      this.store.previewSeek(target);
    }
  }

  protected needleUp(event: PointerEvent, c: SkinComponent): void {
    const target = this.dragTarget(event, c);
    this.drag = null;
    this.dragging.set(false);
    if (target !== null) {
      void this.store.commitSeek(target);
    }
  }

  protected needleKey(event: KeyboardEvent): void {
    const step = { ArrowRight: 5000, ArrowUp: 5000, ArrowLeft: -5000, ArrowDown: -5000 }[event.key];
    if (step !== undefined && this.view.seekable()) {
      event.preventDefault();
      event.stopPropagation();
      void this.store.seekBy(step);
    }
  }

  /** Where in the track (ms) the dragged needle points now; `null` when nothing is dragged. */
  private dragTarget(event: PointerEvent, c: SkinComponent): number | null {
    const sweep = (c.to ?? 0) - (c.from ?? 0);
    if (!this.drag || sweep === 0) {
      return null;
    }
    // the shortest way round from where the drag began
    const turned = ((this.pointerAngle(event, c) - this.drag.pointerAngle + 540) % 360) - 180;
    const fraction = Math.min(1, Math.max(0, this.drag.fraction + turned / sweep));
    return Math.round(fraction * (this.store.durationMs() ?? 0));
  }

  /** Direction from the pivot to the pointer in degrees. */
  private pointerAngle(event: PointerEvent, c: SkinComponent): number {
    const window = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    const pivotX = (window?.left ?? 0) + c.x + (c.pivotX ?? 0);
    const pivotY = (window?.top ?? 0) + c.y + (c.pivotY ?? 0);
    return (Math.atan2(event.clientY - pivotY, event.clientX - pivotX) * 180) / Math.PI;
  }

  private url(path: string): string {
    return `url("${this.skins.assetUrl(path)}")`;
  }
}
