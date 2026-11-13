import { Action } from '../../core/actions/action.service';
import { PLAYLIST_TEXTS } from '../playlist/playlist-texts';
import { PlaylistStore } from '../playlist/playlist.store';
import { PLAYER_TEXTS } from './player-texts';
import { PlayerStore } from './player.store';

/** What the player offers by button and key. Space and the arrows follow common players. */
export function playerActions(store: PlayerStore, playlist: PlaylistStore): readonly Action[] {
  const t = PLAYER_TEXTS;
  const p = PLAYLIST_TEXTS;
  const withList = () => !playlist.isEmpty();
  const withTrack = () => store.hasTrack();
  return [
    {
      id: 'player.open',
      label: () => p.add,
      shortcut: { key: 'o', mod: true },
      run: () => void playlist.open(),
    },
    {
      id: 'player.togglePlay',
      label: () => t.playPause,
      shortcut: { key: ' ' },
      active: () => store.isPlaying(),
      run: () => void store.togglePlay(),
    },
    {
      // play and pause as separate buttons, as classic skins have them
      id: 'player.play',
      label: () => t.play,
      enabled: () => !store.isPlaying(),
      run: () => void store.play(),
    },
    {
      id: 'player.pause',
      label: () => t.pause,
      enabled: () => store.isPlaying(),
      run: () => void store.pause(),
    },
    {
      id: 'player.stop',
      label: () => t.stop,
      shortcut: { key: 'v' },
      enabled: () => store.hasTrack() && store.status() !== 'stopped',
      run: () => void store.stop(),
    },
    {
      id: 'player.previous',
      label: () => p.previous,
      shortcut: { key: 'z' },
      enabled: withList,
      run: () => void playlist.previous(),
    },
    {
      id: 'player.next',
      label: () => p.next,
      shortcut: { key: 'b' },
      enabled: withList,
      run: () => void playlist.next(),
    },
    {
      id: 'player.repeat',
      label: () =>
        playlist.repeat() === 'all'
          ? p.repeatAll
          : playlist.repeat() === 'one'
            ? p.repeatOne
            : p.repeatOff,
      shortcut: { key: 'r' },
      active: () => playlist.repeat() !== 'off',
      run: () => void playlist.cycleRepeat(),
    },
    {
      id: 'player.shuffle',
      label: () => p.shuffle,
      shortcut: { key: 's' },
      active: () => playlist.shuffle(),
      run: () => void playlist.toggleShuffle(),
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
