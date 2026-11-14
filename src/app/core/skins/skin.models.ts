/** DTOs of the skins – mirror `fc_core::skins` and `commands::skins::ActiveSkin` (by hand). */

export interface SkinInfo {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string | null;
  readonly description: string | null;
  /** Path of the preview picture inside the skin. */
  readonly preview: string | null;
  /** Words to find the skin by. */
  readonly keywords?: readonly string[];
  readonly builtIn: boolean;
}

/** Every value is optional: what a skin leaves out keeps the app's default. */
export interface SkinTheme {
  readonly background: string | null;
  readonly surface: string | null;
  readonly surfaceRaised: string | null;
  readonly foreground: string | null;
  readonly muted: string | null;
  readonly accent: string | null;
  readonly accentContrast: string | null;
  readonly border: string | null;
  readonly ok: string | null;
  readonly danger: string | null;
  readonly focus: string | null;
  readonly fontFamily: string | null;
  readonly fontMono: string | null;
  readonly radius: number | null;
}

export type SkinComponentType =
  | 'button'
  | 'seekbar'
  | 'volume'
  | 'text'
  | 'time'
  | 'playlist'
  | 'image'
  | 'spectrum'
  | 'needle'
  | 'spinner'
  | 'pack';

export interface SkinStates {
  readonly normal: string | null;
  readonly hover: string | null;
  readonly pressed: string | null;
  readonly active: string | null;
  readonly disabled: string | null;
}

export interface SkinComponent {
  readonly type: SkinComponentType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly action: string | null;
  readonly source: string | null;
  readonly states: SkinStates | null;
  readonly align: 'left' | 'center' | 'right' | null;
  readonly fontSize: number | null;
  readonly color: string | null;
  /** A `needle` only: the point it turns around, from the top left of its box. */
  readonly pivotX?: number | null;
  readonly pivotY?: number | null;
  /**
   * A `needle`: degrees (clockwise) at the start and the end of the track, and at rest.
   * A `pack`: the diameter of the circle shown, in CSS pixels.
   */
  readonly from?: number | null;
  readonly to?: number | null;
  readonly rest?: number | null;
  /** A `spinner` only: milliseconds for one turn. */
  readonly period?: number | null;
  /** A `pack` only: the part of its box that is seen at all, from the top left of the box. */
  readonly clip?: SkinClip | null;
}

export interface SkinClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Rounded corners, in CSS pixels. */
  readonly radius?: number | null;
}

/** Along each axis one line of the background is drawn out when the window grows. */
export interface SkinResize {
  readonly stretchX: number | null;
  readonly stretchY: number | null;
  readonly maxWidth: number | null;
  readonly maxHeight: number | null;
}

/** Height of the strip below a collapsed player, for the grip (`LIST_GRIP_HEIGHT` in fc-core). */
export const LIST_GRIP_HEIGHT = 14;

/** Largest side of a window a skin lets grow (`MAX_WINDOW_SIDE` in fc-core). */
export const MAX_WINDOW_SIDE = 4000;

/** Smallest and largest size of a skin's window; the same where a side is fixed. */
export function sizeRange(
  player: SkinPlayerWindow,
  listHidden = false,
): {
  readonly min: readonly [number, number];
  readonly max: readonly [number, number];
} {
  const width = player.width ?? 0;
  const height = player.height ?? 0;
  // without its list a skin that says how tall it is then has exactly that size
  if (listHidden && typeof player.collapsedHeight === 'number') {
    const size = [width, player.collapsedHeight + LIST_GRIP_HEIGHT] as const;
    return { min: size, max: size };
  }
  const most = (line: number | null | undefined, max: number | null | undefined, least: number) =>
    line === null || line === undefined ? least : Math.max(max ?? MAX_WINDOW_SIDE, least);
  return {
    min: [width, height],
    max: [
      most(player.resize?.stretchX, player.resize?.maxWidth, width),
      most(player.resize?.stretchY, player.resize?.maxHeight, height),
    ],
  };
}

export interface SkinPlayerWindow {
  /** `flow`: the app lays out its player; `absolute`: the skin places every component. */
  readonly layout: 'flow' | 'absolute';
  readonly width: number | null;
  readonly height: number | null;
  readonly background: string | null;
  readonly pixelated: boolean;
  /** Height while the track list is hidden; without it the skin keeps its list. */
  readonly collapsedHeight?: number | null;
  /** How the window may grow; without it the size is fixed. */
  readonly resize?: SkinResize | null;
  readonly components: readonly SkinComponent[];
}

/** Payload of `skins://active` and answer of `skins_active`. */
export interface ActiveSkin {
  readonly info: SkinInfo;
  readonly theme: SkinTheme;
  readonly player: SkinPlayerWindow | null;
}
