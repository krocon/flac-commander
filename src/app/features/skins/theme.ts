import { SkinTheme } from '../../core/skins/skin.models';

/** Theme field → CSS variable. The complete list of what a skin can set. */
const VARIABLES: Readonly<Record<keyof SkinTheme, string>> = {
  background: '--player-background',
  surface: '--player-surface',
  surfaceRaised: '--player-surface-raised',
  foreground: '--player-foreground',
  muted: '--player-muted',
  accent: '--player-accent',
  accentContrast: '--player-accent-contrast',
  border: '--player-border',
  ok: '--player-ok',
  danger: '--player-danger',
  focus: '--player-focus',
  fontFamily: '--player-font-family',
  fontMono: '--player-font-mono',
  radius: '--player-radius',
};

export const THEME_VARIABLES: readonly string[] = Object.values(VARIABLES);

/**
 * The CSS variables a theme sets. A field the theme leaves out is `null`: the variable is
 * removed and the default of `styles.css` applies again.
 */
export function themeVariables(theme: SkinTheme): ReadonlyMap<string, string | null> {
  const result = new Map<string, string | null>();
  for (const [field, variable] of Object.entries(VARIABLES) as [keyof SkinTheme, string][]) {
    const value = theme[field];
    result.set(variable, value == null ? null : typeof value === 'number' ? `${value}px` : value);
  }
  return result;
}

/** Sets the variables of `theme` on `element` and removes those it does not set. */
export function applyTheme(element: HTMLElement, theme: SkinTheme): void {
  for (const [variable, value] of themeVariables(theme)) {
    if (value === null) {
      element.style.removeProperty(variable);
    } else {
      element.style.setProperty(variable, value);
    }
  }
}
