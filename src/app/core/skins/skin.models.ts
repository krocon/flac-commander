/** DTOs of the skins – mirror `fc_core::skins` and `commands::skins::ActiveSkin` (by hand). */

export interface SkinInfo {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string | null;
  readonly description: string | null;
  /** Path of the preview picture inside the skin. */
  readonly preview: string | null;
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
  'button' | 'seekbar' | 'volume' | 'text' | 'time' | 'playlist' | 'image';

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
}

export interface SkinPlayerWindow {
  /** `flow`: the app lays out its player; `absolute`: the skin places every component. */
  readonly layout: 'flow' | 'absolute';
  readonly width: number | null;
  readonly height: number | null;
  readonly background: string | null;
  readonly pixelated: boolean;
  readonly components: readonly SkinComponent[];
}

/** Payload of `skins://active` and answer of `skins_active`. */
export interface ActiveSkin {
  readonly info: SkinInfo;
  readonly theme: SkinTheme;
  readonly player: SkinPlayerWindow | null;
}
