import { translatable } from '../../core/i18n/i18n';
import { PLAYER_TEXTS_DE } from './player-texts.de';

export const PLAYER_TEXTS_EN = {
  player: 'Player',
  noTrack: 'No track loaded',
  noTrackHint: 'Open audio files to play them.',
  play: 'Play',
  pause: 'Pause',
  playPause: 'Play / pause',
  stop: 'Stop',
  back: 'Back 5 seconds',
  forward: 'Forward 5 seconds',
  louder: 'Louder',
  quieter: 'Quieter',
  position: 'Position',
  positionOf: (position: string, duration: string) => `${position} of ${duration}`,
  volume: 'Volume',
  percent: (value: number) => `${value} %`,
  statusPlaying: 'Playing',
  statusPaused: 'Paused',
  statusStopped: 'Stopped',
  channels: (n: number) => (n === 1 ? 'mono' : n === 2 ? 'stereo' : `${n} channels`),
  bits: (n: number) => `${n} bit`,
  underruns: (n: number) => `Dropouts: ${n}`,
};

export const PLAYER_TEXTS = translatable('player', PLAYER_TEXTS_EN, { de: PLAYER_TEXTS_DE });
