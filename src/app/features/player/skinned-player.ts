import { Component, computed, inject, input, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { describeError } from '../../core/errors/app-error';
import { PlayerApi } from '../../core/player/player-api';
import {
  LIST_GRIP_HEIGHT,
  sizeRange,
  SkinComponent,
  SkinPlayerWindow,
} from '../../core/skins/skin.models';
import { Playlist } from '../playlist/playlist';
import { SkinStore } from '../skins/skin.store';
import { Visualizer } from '../visualizer/visualizer';
import { PlayerView } from './player-view';
import { PLAYER_TEXTS } from './player-texts';
import { PlayerStore } from './player.store';

/** A component of the skin with what the template needs worked out. */
interface Placed {
  readonly component: SkinComponent;
  /** Where it lies now: a window that has grown moves and stretches components. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
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
  host: { '(window:resize)': 'measure()' },
})
export class SkinnedPlayer {
  readonly layout = input.required<SkinPlayerWindow>();
  /** The track list is hidden or has a window of its own. */
  readonly listAway = input(false);

  /** The skin says how tall it is without its list: it can be cut off above it. */
  protected readonly canCollapse = computed(() => (this.layout().collapsedHeight ?? null) !== null);
  protected readonly collapsed = computed(() => this.listAway() && this.canCollapse());
  /** Room below a collapsed player for the grip that brings the list back. */
  protected readonly gripHeight = LIST_GRIP_HEIGHT;

  protected readonly store = inject(PlayerStore);
  private readonly playerApi = inject(PlayerApi);
  protected readonly view = inject(PlayerView);
  protected readonly actions = inject(ActionService);
  protected readonly skins = inject(SkinStore);
  protected readonly t = PLAYER_TEXTS;

  protected readonly background = computed(() => {
    const path = this.layout().background;
    return path ? this.url(path) : null;
  });

  /** Size of the browser window: a skin with rules for resizing fills it. */
  private readonly viewport = signal(this.viewportNow());

  protected measure(): void {
    this.viewport.set(this.viewportNow());
  }

  private viewportNow(): readonly [number, number] {
    return typeof window === 'undefined' ? [0, 0] : [window.innerWidth, window.innerHeight];
  }

  /** The size of the player: the skin's own, or larger as far as its rules allow. */
  protected readonly size = computed(() => {
    const { min, max } = sizeRange(this.layout(), this.listAway());
    const [width, height] = this.viewport();
    return {
      width: Math.min(Math.max(width, min[0]), max[0]),
      height: Math.min(Math.max(height, min[1]), max[1]),
    };
  });

  /** By how much the window is larger than the skin, and the lines that are drawn out. */
  private readonly growth = computed(() => {
    const layout = this.layout();
    const size = this.size();
    if (this.collapsed()) {
      return { x: { line: null, extra: 0 }, y: { line: null, extra: 0 } };
    }
    return {
      x: { line: layout.resize?.stretchX ?? null, extra: size.width - (layout.width ?? 0) },
      y: { line: layout.resize?.stretchY ?? null, extra: size.height - (layout.height ?? 0) },
    };
  });

  /**
   * The background of a resizable skin in up to nine pieces: along each axis the part before
   * the stretch line, the line itself drawn out, and the part after it.
   */
  protected readonly slices = computed(() => {
    const layout = this.layout();
    if (!layout.resize || !layout.background || this.collapsed()) {
      return null;
    }
    const pieces = (line: number | null, full: number, extra: number) =>
      line === null
        ? [{ at: 0, out: full, start: 0, scale: 1 }]
        : [
            { at: 0, out: line, start: 0, scale: 1 },
            { at: line, out: extra + 1, start: line, scale: extra + 1 },
            { at: line + extra + 1, out: full - line - 1, start: line + 1, scale: 1 },
          ];
    const width = layout.width ?? 0;
    const height = layout.height ?? 0;
    const { x, y } = this.growth();
    return pieces(y.line, height, y.extra).flatMap((row) =>
      pieces(x.line, width, x.extra).map((column) => ({
        left: column.at,
        top: row.at,
        width: column.out,
        height: row.out,
        backgroundSize: `${width * column.scale}px ${height * row.scale}px`,
        backgroundPosition: `${-column.start * column.scale}px ${-row.start * row.scale}px`,
      })),
    );
  });

  protected readonly placed = computed<readonly Placed[]>(() => {
    const { x, y } = this.growth();
    // beyond the stretch line: moved; across it: longer
    const along = (start: number, length: number, axis: { line: number | null; extra: number }) =>
      axis.line === null || axis.extra === 0
        ? [start, length]
        : start > axis.line
          ? [start + axis.extra, length]
          : start + length > axis.line
            ? [start, length + axis.extra]
            : [start, length];
    // without the list: nothing of what lies below the cut
    const cut = this.collapsed() ? (this.layout().collapsedHeight ?? 0) : null;
    const shown = this.layout().components.filter(
      (c) => cut === null || (c.type !== 'playlist' && c.y < cut),
    );
    return shown.map((component) => {
      const states = component.states;
      const of = (path: string | null | undefined) => (path ? this.url(path) : null);
      const [left, width] = along(component.x, component.width, x);
      const [top, height] = along(component.y, component.height, y);
      return {
        component,
        left,
        top,
        width,
        height,
        normal: of(states?.normal),
        hover: of(states?.hover),
        pressed: of(states?.pressed),
        active: of(states?.active),
        disabled: of(states?.disabled),
      };
    });
  });

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

  /** Diameter of the circle a `pack` shows: from `from` to `to` as the track goes on. */
  protected packDiameter(c: SkinComponent): number {
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
    // where the needle lies in the window, whatever the window has grown by
    const needle = event.currentTarget as HTMLElement;
    const window = needle.parentElement?.getBoundingClientRect();
    const pivotX = (window?.left ?? 0) + needle.offsetLeft + (c.pivotX ?? 0);
    const pivotY = (window?.top ?? 0) + needle.offsetTop + (c.pivotY ?? 0);
    return (Math.atan2(event.clientY - pivotY, event.clientX - pivotX) * 180) / Math.PI;
  }

  /** The cover of the loaded track; `null` while nothing is loaded. */
  protected readonly cover = computed(() => {
    const path = this.store.track()?.path;
    return path ? `url("${this.playerApi.coverUrl(path)}")` : null;
  });

  /**
   * What an `image` or `spinner` shows: its own picture – under the cover of the track if it
   * asks for that, so that it still shows where a track has no cover.
   */
  protected picture(item: Placed): string | null {
    const cover = item.component.source === 'track.cover' ? this.cover() : null;
    return cover && item.normal ? `${cover}, ${item.normal}` : (cover ?? item.normal);
  }

  private url(path: string): string {
    return `url("${this.skins.assetUrl(path)}")`;
  }
}
