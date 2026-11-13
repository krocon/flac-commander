import { Action } from '../../core/actions/action.service';
import { PLAYER_TEXTS } from './player-texts';
import { PlayerStore } from './player.store';

/** What the player offers by button and key. Space and the arrows follow common players. */
export function playerActions(store: PlayerStore): readonly Action[] {
  const t = PLAYER_TEXTS;
  const withTrack = () => store.hasTrack();
  return [
    {
      id: 'player.open',
      label: () => t.open,
      shortcut: { key: 'o', mod: true },
      run: () => void store.open(),
    },
    {
      id: 'player.togglePlay',
      label: () => t.playPause,
      shortcut: { key: ' ' },
      run: () => void store.togglePlay(),
    },
    {
      id: 'player.stop',
      label: () => t.stop,
      shortcut: { key: 'v' },
      enabled: () => store.hasTrack() && store.status() !== 'stopped',
      run: () => void store.stop(),
    },
    {
      id: 'player.back',
      label: () => t.back,
      shortcut: { key: 'ArrowLeft' },
      enabled: withTrack,
      run: () => void store.back(),
    },
    {
      id: 'player.forward',
      label: () => t.forward,
      shortcut: { key: 'ArrowRight' },
      enabled: withTrack,
      run: () => void store.forward(),
    },
    {
      id: 'player.louder',
      label: () => t.louder,
      shortcut: { key: 'ArrowUp' },
      run: () => void store.louder(),
    },
    {
      id: 'player.quieter',
      label: () => t.quieter,
      shortcut: { key: 'ArrowDown' },
      run: () => void store.quieter(),
    },
  ];
}
