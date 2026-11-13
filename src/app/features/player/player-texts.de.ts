import type { Translation } from '../../core/i18n/i18n';
import type { PLAYER_TEXTS_EN } from './player-texts';

export const PLAYER_TEXTS_DE: Translation<typeof PLAYER_TEXTS_EN> = {
  player: 'Player',
  noTrack: 'Kein Titel geladen',
  noTrackHint: 'Eine Audiodatei öffnen, um sie abzuspielen.',
  open: 'Datei öffnen',
  openDialogTitle: 'Audiodatei öffnen',
  play: 'Wiedergabe',
  pause: 'Pause',
  playPause: 'Wiedergabe / Pause',
  stop: 'Stopp',
  back: '5 Sekunden zurück',
  forward: '5 Sekunden vor',
  louder: 'Lauter',
  quieter: 'Leiser',
  position: 'Position',
  positionOf: (position: string, duration: string) => `${position} von ${duration}`,
  volume: 'Lautstärke',
  percent: (value: number) => `${value} %`,
  statusPlaying: 'Wiedergabe läuft',
  statusPaused: 'Pausiert',
  statusStopped: 'Gestoppt',
  channels: (n: number) => (n === 1 ? 'Mono' : n === 2 ? 'Stereo' : `${n} Kanäle`),
  bits: (n: number) => `${n} Bit`,
  underruns: (n: number) => `Aussetzer: ${n}`,
};
