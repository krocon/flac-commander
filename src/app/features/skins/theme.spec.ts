import { MODERN_SKIN, RETRO_SKIN } from '../../../testing/fake-apis';
import { applyTheme, THEME_VARIABLES, themeVariables } from './theme';

describe('skin theme', () => {
  it('maps every theme field to one CSS variable', () => {
    const variables = themeVariables(RETRO_SKIN.theme);
    expect([...variables.keys()].sort()).toEqual([...THEME_VARIABLES].sort());
    expect(variables.get('--player-accent')).toBe('#5dff7a');
    expect(variables.get('--player-font-family')).toBe('ui-monospace, monospace');
    expect(variables.get('--player-radius')).toBe('0px');
    expect(variables.get('--player-border')).toBeNull();
  });

  it('sets what a theme gives and removes what the next one leaves out', () => {
    const element = document.createElement('div');
    applyTheme(element, RETRO_SKIN.theme);
    expect(element.style.getPropertyValue('--player-accent')).toBe('#5dff7a');
    expect(element.style.getPropertyValue('--player-font-family')).toBe('ui-monospace, monospace');
    expect(element.style.getPropertyValue('--player-background')).toBe('');

    applyTheme(element, MODERN_SKIN.theme);
    expect(element.style.getPropertyValue('--player-accent')).toBe('#ffdd00');
    expect(element.style.getPropertyValue('--player-background')).toBe('#141414');
    expect(element.style.getPropertyValue('--player-radius')).toBe('6px');
    // the font of the previous skin is gone: the default of styles.css applies again
    expect(element.style.getPropertyValue('--player-font-family')).toBe('');
  });
});
