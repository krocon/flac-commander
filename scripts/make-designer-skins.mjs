#!/usr/bin/env node
// Draws the built-in skins "Hi-Fi", "Neon", "Tape", "Vinyl" and "Panel" (skins/hifi, … skins/panel).
//
// Every picture is original artwork described below as HTML and CSS, rendered by a headless
// Chrome at twice the size and cut into the files a skin needs. Nothing is copied from another
// player. The results are committed; this script only runs when a design changes:
//
//   node scripts/make-designer-skins.mjs            # writes skins/<name>/
//   node scripts/make-designer-skins.mjs --mock DIR # also writes DIR/<name>.png, the skin "in use"
//
// CHROME=/path/to/chrome overrides the browser.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCALE = 2;
const CHROME =
  process.env.CHROME ??
  [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);

const CWEBP = ['/opt/homebrew/bin/cwebp', '/usr/local/bin/cwebp', '/usr/bin/cwebp'].find(existsSync);

// ---------------------------------------------------------------- icons (24 × 24, currentColor)

const filled = (d) => `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`;
const stroked = (d, extra = '') =>
  `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>${extra}</svg>`;

const ICON = {
  previous: filled('M6 5h2.6v14H6zM19 5v14l-9.4-7z'),
  next: filled('M15.4 5H18v14h-2.6zM5 5l9.4 7L5 19z'),
  play: filled('M7.5 4.5v15L20 12z'),
  pause: filled('M6.5 5h4v14h-4zM13.5 5h4v14h-4z'),
  stop: filled('M6.5 6.5h11v11h-11z'),
  open: filled('M12 5l7.5 9h-15zM4.5 16.5h15V19h-15z'),
  repeat: stroked('M6 11v-1a3 3 0 0 1 3-3h9M18 13v1a3 3 0 0 1-3 3H6M15.5 4.5 18 7l-2.5 2.5M8.5 14.5 6 17l2.5 2.5'),
  shuffle: stroked(
    'M4 7h3c2.2 0 3.2 1.2 4.3 3l1.4 4c1.1 1.8 2.1 3 4.3 3h3M4 17h3c1.6 0 2.6-.6 3.5-1.7M13.5 8.7c.9-1.1 1.9-1.7 3.5-1.7h3M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5',
  ),
  equalizer: stroked(
    'M7 4v16M12 4v16M17 4v16',
    '<g fill="currentColor"><circle cx="7" cy="9" r="2.6"/><circle cx="12" cy="15" r="2.6"/><circle cx="17" cy="8" r="2.6"/></g>',
  ),
  skins: filled('M12 3.2c3.2 3.8 5.8 7 5.8 10.2a5.8 5.8 0 0 1-11.6 0c0-3.2 2.6-6.4 5.8-10.2z'),
  list: filled('M4 5.5h2.5V8H4zM9 5.5h11V8H9zM4 10.75h2.5v2.5H4zM9 10.75h11v2.5H9zM4 16h2.5v2.5H4zM9 16h11v2.5H9z'),
};

// ---------------------------------------------------------------- the designs
//
// A design is a window of fixed size with: `css` and `art` (the face without buttons), `buttons`
// (drawn once per state and cut out), and `components` (everything the app draws itself).
// A button's rectangle is larger than its visible face by `pad`, so shadows and glows fit in.

const button = (action, icon, x, y, width, height, look, more = {}) => ({
  action,
  icon,
  x,
  y,
  width,
  height,
  look,
  ...more,
});
const PLAY = { activeIcon: 'pause', toggle: true };
const TOGGLE = { toggle: true };

const hifi = {
  folder: 'hifi',
  manifest: {
    id: 'io.github.krocon.hifi',
    name: 'Hi-Fi',
    description: 'Brushed aluminium, turned knobs and an amber display: a receiver from the rack.',
    theme: {
      background: '#191612',
      surface: '#0e0c09',
      surfaceRaised: '#27221a',
      foreground: '#f3e8d2',
      muted: '#b3a385',
      accent: '#ffb000',
      accentContrast: '#1a1200',
      border: '#4a4132',
      ok: '#8fd98a',
      danger: '#ff9b85',
      focus: '#7fc4ff',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontMono: 'Menlo, Consolas, monospace',
      radius: 2,
    },
  },
  width: 400,
  height: 528,
  pad: 4,
  css: `
    body {
      background:
        repeating-linear-gradient(0deg, rgba(255,255,255,.16) 0 .5px, rgba(0,0,0,.05) .5px 1px, transparent 1px 2.5px),
        linear-gradient(90deg, rgba(0,0,0,.10), transparent 12%, transparent 88%, rgba(0,0,0,.10)),
        linear-gradient(180deg, #dfe2e5 0%, #c6cace 28%, #b3b7bc 62%, #cdd1d5 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.9), inset 0 -1px 0 rgba(0,0,0,.35);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    }
    .glass {
      position: absolute; border-radius: 4px;
      background: linear-gradient(118deg, rgba(255,255,255,.07) 0 34%, transparent 34.4%), linear-gradient(#0a0907, #13100b);
      box-shadow: inset 0 2px 7px #000, inset 0 0 0 1px #000, 0 1px 0 rgba(255,255,255,.85), 0 -1px 0 rgba(0,0,0,.3);
    }
    .well { position: absolute; border-radius: 3px; background: #0e0c09;
      box-shadow: inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.85), 0 -1px 0 rgba(0,0,0,.3); }
    .slot { position: absolute; border-radius: 3px; background: #2a2c2f;
      box-shadow: inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,.8); }
    .engraved { position: absolute; font-size: 7.5px; font-weight: 600; letter-spacing: .22em; color: #4d5157;
      text-shadow: 0 1px 0 rgba(255,255,255,.75); white-space: nowrap; }
    .face { color: #2a2d32; }
    .face svg { width: 46%; height: 46%; }
    .round { border-radius: 50%;
      background: conic-gradient(from 20deg, #f6f7f8, #a4a8ad, #eef0f1, #979ba0, #f6f7f8, #a4a8ad, #eef0f1, #979ba0, #f6f7f8);
      box-shadow: 0 2px 3px rgba(0,0,0,.5), 0 0 0 1px #6c7076, inset 0 0 0 1px rgba(255,255,255,.7), inset 0 0 0 5px rgba(255,255,255,.12); }
    .key { border-radius: 3px; background: linear-gradient(#f4f5f6, #c2c6ca);
      box-shadow: 0 1px 2px rgba(0,0,0,.55), 0 0 0 1px #74787e, inset 0 1px 0 #fff; }
    .key svg { width: 15px; height: 15px; }
    .key.led svg { margin-top: 6px; }
    .key.led::before { content: ''; position: absolute; top: 4px; left: 50%; width: 12px; height: 3px; margin-left: -6px;
      border-radius: 2px; background: #6a5a38; box-shadow: inset 0 1px 1px rgba(0,0,0,.6); }
    .hover .face { filter: brightness(1.07); }
    .pressed .round { filter: brightness(.92);
      box-shadow: 0 0 1px rgba(0,0,0,.6), 0 0 0 1px #5a5e64, inset 0 2px 5px rgba(0,0,0,.4); }
    .pressed .key { background: linear-gradient(#c9cdd1, #dcdfe2);
      box-shadow: 0 0 0 1px #5a5e64, inset 0 2px 3px rgba(0,0,0,.35); }
    .pressed .face svg { transform: translateY(1px); }
    .active .round { color: #b85c00;
      box-shadow: 0 2px 3px rgba(0,0,0,.5), 0 0 0 1px #6c7076, 0 0 0 3px rgba(255,176,0,.9), inset 0 0 0 1px rgba(255,255,255,.7); }
    .active .key.led::before { background: #ffb000; box-shadow: 0 0 5px 1px rgba(255,160,0,.9); }
  `,
  art: `
    <div class="glass" style="left:14px;top:14px;width:372px;height:112px"></div>
    <div class="slot" style="left:12px;top:136px;width:376px;height:14px"></div>
    <div class="engraved" style="left:282px;top:168px">VOLUME</div>
    <div class="slot" style="left:280px;top:182px;width:108px;height:14px"></div>
    <div class="engraved" style="left:176px;top:233px">LOSSLESS · STEREO</div>
    <div class="well" style="left:14px;top:262px;width:372px;height:252px"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 14, 166, 48, 48, 'round'),
    button('player.togglePlay', 'play', 64, 160, 60, 60, 'round', PLAY),
    button('player.stop', 'stop', 126, 166, 48, 48, 'round'),
    button('player.next', 'next', 176, 166, 48, 48, 'round'),
    button('player.open', 'open', 226, 166, 48, 48, 'round'),
    button('player.repeat', 'repeat', 14, 222, 50, 34, 'key led', TOGGLE),
    button('player.shuffle', 'shuffle', 66, 222, 50, 34, 'key led', TOGGLE),
    button('window.equalizer', 'equalizer', 118, 222, 50, 34, 'key led', TOGGLE),
    button('app.skins', 'skins', 338, 222, 50, 34, 'key'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 28, y: 22, width: 344, height: 22, fontSize: 15, color: '#ffb000' },
    { type: 'text', source: 'track.artist', x: 28, y: 44, width: 344, height: 16, fontSize: 12, color: '#d09324' },
    { type: 'time', source: 'position', x: 28, y: 70, width: 112, height: 44, fontSize: 32, color: '#ffb000' },
    { type: 'spectrum', x: 150, y: 76, width: 140, height: 34, color: '#ffb000' },
    { type: 'text', source: 'player.status', x: 296, y: 78, width: 76, height: 14, fontSize: 10, align: 'right', color: '#d09324' },
    { type: 'time', source: 'duration', x: 296, y: 96, width: 76, height: 14, fontSize: 11, align: 'right', color: '#d09324' },
    { type: 'seekbar', x: 14, y: 138, width: 372, height: 10 },
    { type: 'volume', x: 282, y: 184, width: 104, height: 10 },
    { type: 'playlist', x: 18, y: 266, width: 364, height: 244 },
  ],
};

const neon = {
  folder: 'neon',
  manifest: {
    id: 'io.github.krocon.neon',
    name: 'Neon',
    description: 'Glowing tubes over a night-time grid: cyan, magenta and a setting sun.',
    theme: {
      background: '#120826',
      surface: '#0d0620',
      surfaceRaised: '#25123f',
      foreground: '#f6edff',
      muted: '#b9a3da',
      accent: '#ff5fdc',
      accentContrast: '#1c0322',
      border: '#56308a',
      ok: '#6ff0b0',
      danger: '#ff9a9a',
      focus: '#5ff4ff',
      fontFamily: '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif',
      fontMono: 'Menlo, Consolas, monospace',
      radius: 8,
    },
  },
  width: 380,
  height: 540,
  pad: 5,
  css: `
    body { background: radial-gradient(130% 55% at 50% 0%, #43177a 0%, #1d0c3c 55%, #0e0620 100%); }
    .floor { position: absolute; left: -60%; top: 150px; width: 220%; height: 260px; opacity: .34;
      background:
        repeating-linear-gradient(90deg, #ff5fdc 0 1.5px, transparent 1.5px 34px),
        repeating-linear-gradient(0deg, #ff5fdc 0 1.5px, transparent 1.5px 30px);
      transform: perspective(170px) rotateX(58deg); transform-origin: 50% 0;
      -webkit-mask-image: linear-gradient(#000 0%, transparent 78%); }
    .horizon { position: absolute; left: 0; top: 149px; width: 100%; height: 2px;
      background: linear-gradient(90deg, transparent, #5ff4ff 20%, #fff 50%, #5ff4ff 80%, transparent);
      box-shadow: 0 0 10px 1px rgba(95,244,255,.7); opacity: .0; }
    .panel { position: absolute; border-radius: 12px; overflow: hidden;
      background: linear-gradient(180deg, #0d0620, #150a30);
      box-shadow: 0 0 0 1.5px rgba(95,244,255,.75), 0 0 14px rgba(95,244,255,.45), inset 0 0 26px rgba(0,0,0,.8); }
    .panel.list { background: #0d0620; box-shadow: 0 0 0 1.5px rgba(255,95,220,.7), 0 0 14px rgba(255,95,220,.4); }
    .sun { position: absolute; right: 16px; top: 22px; width: 92px; height: 92px; border-radius: 50%; opacity: .9;
      background: linear-gradient(180deg, #ffe14d 0%, #ff8a3d 45%, #ff3fa4 100%);
      -webkit-mask-image: linear-gradient(#000 0 50%, transparent 50% 54%, #000 54% 62%, transparent 62% 67%, #000 67% 74%, transparent 74% 80%, #000 80% 86%, transparent 86% 93%, #000 93%);
      filter: drop-shadow(0 0 10px rgba(255,95,160,.6)); }
    .groove { position: absolute; border-radius: 10px; background: rgba(13,6,32,.9);
      box-shadow: 0 0 0 1px rgba(95,244,255,.35); }
    .face { color: #5ff4ff; }
    .face svg { width: 52%; height: 52%; filter: drop-shadow(0 0 3px rgba(95,244,255,.8)); }
    .tile { border-radius: 11px; background: rgba(18,8,40,.9);
      box-shadow: inset 0 0 0 1.5px #5ff4ff, inset 0 0 9px rgba(95,244,255,.35), 0 0 5px rgba(95,244,255,.55); }
    .tile.small svg { width: 17px; height: 17px; }
    .orb { border-radius: 50%; color: #1c0322; background: linear-gradient(160deg, #ffe14d 0%, #ff7a4d 45%, #ff3fb4 100%);
      box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55), 0 0 6px rgba(255,95,200,.9); }
    .orb svg { width: 48%; height: 48%; filter: none; }
    .hover .tile { color: #fff; background: rgba(40,20,80,.95);
      box-shadow: inset 0 0 0 1.5px #b5fbff, inset 0 0 12px rgba(95,244,255,.6), 0 0 5px rgba(95,244,255,.9); }
    .hover .orb { filter: brightness(1.12) saturate(1.1); }
    .pressed .tile { color: #0d0620; background: #5ff4ff; box-shadow: 0 0 5px rgba(95,244,255,.9); }
    .pressed .tile svg { filter: none; }
    .pressed .orb { filter: brightness(.85); box-shadow: inset 0 2px 5px rgba(0,0,0,.4), 0 0 3px rgba(255,95,200,.9); }
    .active .tile { color: #ff5fdc; background: rgba(48,8,48,.95);
      box-shadow: inset 0 0 0 1.5px #ff5fdc, inset 0 0 12px rgba(255,95,220,.55), 0 0 5px rgba(255,95,220,.9); }
    .active .tile svg { filter: drop-shadow(0 0 3px rgba(255,95,220,.9)); }
    .active .orb { box-shadow: inset 0 0 0 1.5px #fff, 0 0 5px 1px rgba(255,225,77,.95); }
  `,
  art: `
    <div class="floor"></div>
    <div class="panel" style="left:14px;top:14px;width:352px;height:118px"><div class="sun"></div></div>
    <div class="groove" style="left:11px;top:142px;width:358px;height:14px"></div>
    <div class="groove" style="left:125px;top:249px;width:130px;height:14px"></div>
    <div class="panel list" style="left:14px;top:290px;width:352px;height:236px"></div>
  `,
  buttons: [
    button('player.stop', 'stop', 57, 174, 50, 50, 'tile'),
    button('player.previous', 'previous', 107, 174, 50, 50, 'tile'),
    button('player.togglePlay', 'play', 157, 166, 66, 66, 'orb', PLAY),
    button('player.next', 'next', 223, 174, 50, 50, 'tile'),
    button('player.open', 'open', 273, 174, 50, 50, 'tile'),
    button('player.repeat', 'repeat', 9, 236, 54, 40, 'tile small', TOGGLE),
    button('player.shuffle', 'shuffle', 63, 236, 54, 40, 'tile small', TOGGLE),
    button('window.equalizer', 'equalizer', 263, 236, 54, 40, 'tile small', TOGGLE),
    button('app.skins', 'skins', 317, 236, 54, 40, 'tile small'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 28, y: 24, width: 232, height: 22, fontSize: 16, color: '#f6edff' },
    { type: 'text', source: 'track.artist', x: 28, y: 46, width: 232, height: 16, fontSize: 12, color: '#5ff4ff' },
    { type: 'time', source: 'position', x: 28, y: 72, width: 108, height: 40, fontSize: 30, color: '#ff5fdc' },
    { type: 'spectrum', x: 144, y: 82, width: 112, height: 28, color: '#5ff4ff' },
    { type: 'text', source: 'player.status', x: 28, y: 112, width: 150, height: 14, fontSize: 10, color: '#b9a3da' },
    { type: 'time', source: 'duration', x: 190, y: 112, width: 66, height: 14, fontSize: 10, align: 'right', color: '#b9a3da' },
    { type: 'seekbar', x: 14, y: 145, width: 352, height: 8 },
    { type: 'volume', x: 128, y: 252, width: 124, height: 8 },
    { type: 'playlist', x: 20, y: 296, width: 340, height: 224 },
  ],
};

const reel = (cx) => `<div class="pack" style="left:${cx - 44}px"></div>`;
const hub = (name, x, y) => ({
  name,
  x,
  y,
  width: 30,
  height: 30,
  period: 2600,
  html: '<div class="hub" style="left:0;top:0"><i></i><i></i><i></i></div>',
});

const tape = {
  folder: 'tape',
  manifest: {
    id: 'io.github.krocon.tape',
    name: 'Tape',
    description: 'A cassette deck in cream and orange: paper label, piano keys and two reels.',
    theme: {
      background: '#e7dbc0',
      surface: '#f7f0df',
      surfaceRaised: '#fffaf0',
      foreground: '#2a2018',
      muted: '#655440',
      accent: '#a83410',
      accentContrast: '#fff8ec',
      border: '#b6a583',
      ok: '#1f6b3a',
      danger: '#a3231b',
      focus: '#1f5fbf',
      fontFamily: '"American Typewriter", "Courier New", Courier, serif',
      fontMono: '"American Typewriter", "Courier New", Courier, monospace',
      radius: 3,
    },
  },
  width: 400,
  height: 540,
  pad: 2,
  css: `
    body { background:
        radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,.35), transparent 60%),
        linear-gradient(#efe5cd, #e1d3b3);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.9), inset 0 -1px 0 rgba(0,0,0,.25);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .stripes { position: absolute; left: 0; top: 34px; width: 100%; height: 30px;
      background: linear-gradient(#d9541e 0 33.3%, #e9a23b 33.3% 66.6%, #6b3a22 66.6%); }
    .shell { position: absolute; left: 30px; top: 14px; width: 340px; height: 156px; border-radius: 9px;
      background: linear-gradient(#34322f, #24221f);
      box-shadow: 0 3px 6px rgba(60,40,10,.45), inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px #151412; }
    .screw { position: absolute; width: 9px; height: 9px; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #cfcfcf, #6d6d6d 70%); box-shadow: 0 0 0 1px #111; }
    .screw::after { content: ''; position: absolute; left: 1px; right: 1px; top: 4px; height: 1px; background: #2a2a2a; transform: rotate(40deg); }
    .label { position: absolute; left: 20px; top: 10px; width: 300px; height: 70px; border-radius: 4px; background: #f7f0df;
      box-shadow: inset 0 0 0 1px rgba(120,90,40,.35), 0 1px 0 rgba(0,0,0,.4); overflow: hidden; }
    .label::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 7px;
      background: linear-gradient(90deg, #d9541e 0 62%, #e9a23b 62% 84%, #6b3a22 84%); }
    .label::after { content: ''; position: absolute; left: 10px; right: 10px; top: 36px; height: 30px;
      background: repeating-linear-gradient(#0000 0 21px, rgba(120,90,40,.3) 21px 22px); }
    .side { position: absolute; right: 9px; bottom: 5px; font-size: 8px; font-weight: 700; letter-spacing: .15em; color: #a83410; }
    .window { position: absolute; left: 62px; top: 88px; width: 216px; height: 50px; border-radius: 6px; overflow: hidden;
      background: linear-gradient(#1a1410, #0f0c0a); box-shadow: inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.18); }
    .window::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,.13) 0 30%, transparent 30.5%); }
    .pack { position: absolute; top: -19px; width: 88px; height: 88px; border-radius: 50%;
      background: repeating-radial-gradient(circle, #4a2f1f 0 1.5px, #3a2417 1.5px 3px); box-shadow: 0 0 0 1px #1c120c; }
    .hub { position: absolute; width: 30px; height: 30px; border-radius: 50%; background: #efe7d6;
      box-shadow: inset 0 0 0 3px #efe7d6, inset 0 0 0 9px #17120e, 0 0 0 1px #17120e; }
    .hub i { position: absolute; left: 13px; top: 2px; width: 4px; height: 26px; background: linear-gradient(#efe7d6 0 7px, transparent 7px 19px, #efe7d6 19px); }
    .hub i:nth-child(2) { transform: rotate(60deg); } .hub i:nth-child(3) { transform: rotate(120deg); }
    .feet { position: absolute; left: 80px; bottom: 0; width: 180px; height: 12px; border-radius: 6px 6px 0 0;
      background: #1b1917; box-shadow: inset 0 1px 0 rgba(255,255,255,.14); }
    .plate { position: absolute; border-radius: 3px; background: #f7f0df;
      box-shadow: inset 0 1px 3px rgba(60,40,10,.55), 0 1px 0 rgba(255,255,255,.8); }
    .caption { position: absolute; font-size: 7px; font-weight: 700; letter-spacing: .2em; color: #7a6548; white-space: nowrap; }
    .slot { position: absolute; border-radius: 4px; background: #cdbd99;
      box-shadow: inset 0 1px 2px rgba(60,40,10,.55), 0 1px 0 rgba(255,255,255,.8); }
    .bed { position: absolute; left: 28px; top: 244px; width: 344px; height: 54px; border-radius: 5px; background: #17150f;
      box-shadow: inset 0 2px 4px #000, 0 1px 0 rgba(255,255,255,.8); }
    .card { position: absolute; border-radius: 4px; background: #f7f0df;
      box-shadow: inset 0 0 0 1px rgba(120,90,40,.4), 0 2px 4px rgba(60,40,10,.3); }
    .face { color: #efe7d6; }
    .piano { border-radius: 3px 3px 5px 5px; background: linear-gradient(#45423e 0%, #2b2926 70%, #1d1b19 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.3), inset 0 -5px 0 rgba(0,0,0,.4), 0 2px 2px rgba(0,0,0,.5); }
    .piano svg { width: 20px; height: 20px; margin-top: -4px; }
    .piano.go { color: #ff8a4a; }
    .pill { border-radius: 14px; color: #5a3a22; background: linear-gradient(#fffaf0, #e9dcc0);
      box-shadow: 0 1px 2px rgba(60,40,10,.55), inset 0 0 0 1px rgba(120,90,40,.5), inset 0 1px 0 #fff; }
    .pill svg { width: 16px; height: 16px; }
    .hover .piano { background: linear-gradient(#55524d 0%, #33312d 70%, #1d1b19 100%); }
    .hover .pill { background: linear-gradient(#fff, #f1e6cd); }
    .pressed .piano { transform: translateY(3px); background: linear-gradient(#34322f 0%, #232120 70%, #191817 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.2), inset 0 -2px 0 rgba(0,0,0,.4); }
    .pressed .pill { background: linear-gradient(#e2d4b4, #efe5cd); box-shadow: inset 0 1px 3px rgba(60,40,10,.6), inset 0 0 0 1px rgba(120,90,40,.5); }
    .active .piano { transform: translateY(3px); color: #ffb37a;
      background: linear-gradient(#3a2a22 0%, #2a1c16 70%, #1c1310 100%);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.2), inset 0 -2px 0 rgba(0,0,0,.4), inset 0 0 12px rgba(255,120,50,.35); }
    .active .piano svg { filter: drop-shadow(0 0 3px rgba(255,130,60,.9)); }
    .active .pill { color: #fff8ec; background: linear-gradient(#d9541e, #a83410);
      box-shadow: 0 1px 2px rgba(60,40,10,.55), inset 0 0 0 1px #7c260b, inset 0 1px 0 rgba(255,255,255,.35); }
  `,
  art: `
    <div class="stripes"></div>
    <div class="shell">
      <div class="screw" style="left:6px;top:6px"></div><div class="screw" style="right:6px;top:6px"></div>
      <div class="screw" style="left:6px;bottom:6px"></div><div class="screw" style="right:6px;bottom:6px"></div>
      <div class="label"><div class="side">SIDE A · LOSSLESS</div></div>
      <div class="window">${reel(54)}${reel(162)}</div>
      <div class="feet"></div>
    </div>
    <div class="caption" style="left:30px;top:179px">COUNTER</div>
    <div class="plate" style="left:30px;top:190px;width:98px;height:30px"></div>
    <div class="caption" style="left:138px;top:179px">LEVEL</div>
    <div class="plate" style="left:138px;top:190px;width:128px;height:30px"></div>
    <div class="slot" style="left:28px;top:226px;width:344px;height:14px"></div>
    <div class="bed"></div>
    <div class="caption" style="left:180px;top:303px">VOLUME</div>
    <div class="slot" style="left:178px;top:314px;width:140px;height:14px"></div>
    <div class="card" style="left:30px;top:346px;width:340px;height:180px"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 30, 246, 68, 50, 'piano'),
    button('player.togglePlay', 'play', 98, 246, 68, 50, 'piano go', PLAY),
    button('player.stop', 'stop', 166, 246, 68, 50, 'piano'),
    button('player.next', 'next', 234, 246, 68, 50, 'piano'),
    button('player.open', 'open', 302, 246, 68, 50, 'piano'),
    button('player.repeat', 'repeat', 28, 304, 48, 34, 'pill', TOGGLE),
    button('player.shuffle', 'shuffle', 76, 304, 48, 34, 'pill', TOGGLE),
    button('window.equalizer', 'equalizer', 124, 304, 48, 34, 'pill', TOGGLE),
    button('app.skins', 'skins', 324, 304, 48, 34, 'pill'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 60, y: 35, width: 280, height: 22, fontSize: 15, color: '#2a2018' },
    { type: 'text', source: 'track.artist', x: 60, y: 57, width: 200, height: 18, fontSize: 12, color: '#655440' },
    { type: 'time', source: 'position', x: 32, y: 191, width: 94, height: 28, fontSize: 20, align: 'center', color: '#2a2018' },
    { type: 'spectrum', x: 144, y: 195, width: 116, height: 21, color: '#a83410' },
    { type: 'text', source: 'player.status', x: 276, y: 190, width: 94, height: 14, fontSize: 10, align: 'right', color: '#655440' },
    { type: 'time', source: 'duration', x: 276, y: 206, width: 94, height: 14, fontSize: 11, align: 'right', color: '#655440' },
    { type: 'seekbar', x: 30, y: 228, width: 340, height: 10 },
    { type: 'volume', x: 180, y: 316, width: 136, height: 10 },
    { type: 'playlist', x: 34, y: 350, width: 332, height: 172 },
  ],
  spinners: [hub('hub-left', 131, 112), hub('hub-right', 239, 112)],
};

const vinyl = {
  folder: 'vinyl',
  manifest: {
    id: 'io.github.krocon.vinyl',
    name: 'Vinyl',
    description: 'A soft, dark turntable: a record under the needle and controls pressed out of the surface.',
    theme: {
      background: '#23262b',
      surface: '#1c1f23',
      surfaceRaised: '#2d3138',
      foreground: '#e9ecf0',
      muted: '#a0a9b3',
      accent: '#66b5f5',
      accentContrast: '#0a1622',
      border: '#14161a',
      ok: '#7fdca0',
      danger: '#ff9d94',
      focus: '#ffd166',
      fontFamily: '"SF Pro Rounded", "Avenir Next", "Segoe UI", sans-serif',
      fontMono: '"SF Pro Rounded", "Avenir Next", "Segoe UI", sans-serif',
      radius: 8,
    },
  },
  width: 640,
  height: 400,
  pad: 6,
  css: `
    body { background: linear-gradient(145deg, #272a30, #202327); }
    .platter { position: absolute; left: 8px; top: 30px; width: 304px; height: 304px; border-radius: 50%; background: #1c1f23;
      box-shadow: inset 5px 5px 10px rgba(0,0,0,.6), inset -4px -4px 9px rgba(255,255,255,.05); }
    .record { position: absolute; left: 20px; top: 42px; width: 280px; height: 280px; border-radius: 50%;
      background:
        /* the smooth middle around the label, and the lead-in at the rim */
        radial-gradient(circle, #0b0b0d 0 54px, #17181b 54px 55px, #0a0a0c 55px 62px, transparent 62px 134px, #0c0c0e 134px 137px, #1d1e21 137px 138.5px, #060607 138.5px),
        /* the gaps between the songs */
        radial-gradient(circle, transparent 0 79px, rgba(0,0,0,.7) 79px 80.2px, rgba(255,255,255,.06) 80.2px 80.8px, transparent 80.8px 96px, rgba(0,0,0,.7) 96px 97.2px, rgba(255,255,255,.06) 97.2px 97.8px, transparent 97.8px 111px, rgba(0,0,0,.7) 111px 112.4px, rgba(255,255,255,.06) 112.4px 113px, transparent 113px 124px, rgba(0,0,0,.7) 124px 125.2px, transparent 125.2px),
        /* light from the upper left, and its fainter twin opposite */
        conic-gradient(from 285deg, transparent 0deg, rgba(255,255,255,.04) 8deg, rgba(255,255,255,.30) 24deg, rgba(255,255,255,.34) 30deg, rgba(255,255,255,.08) 46deg, transparent 58deg, transparent 176deg, rgba(255,255,255,.03) 186deg, rgba(255,255,255,.17) 204deg, rgba(255,255,255,.05) 222deg, transparent 236deg),
        /* the grooves: fine, and not quite even */
        repeating-radial-gradient(circle, rgba(255,255,255,.045) 0 .5px, transparent .5px 3.7px),
        repeating-radial-gradient(circle, #030304 0 .55px, #1a1b1e .55px 1.15px);
      box-shadow: 0 5px 12px rgba(0,0,0,.6), 0 0 0 1px #050506, inset 0 0 0 1px rgba(255,255,255,.07); }
    .pivot { position: absolute; left: 270px; top: 36px; width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(145deg, #30343b, #1e2125);
      box-shadow: 4px 4px 8px rgba(0,0,0,.55), -3px -3px 7px rgba(255,255,255,.06); }
    .arm { position: absolute; inset: 0; filter: drop-shadow(3px 4px 3px rgba(0,0,0,.5)); }
    .arm i { position: absolute; display: block; }
    .arm .weight { left: 7px; top: 2px; width: 16px; height: 26px; border-radius: 4px;
      background: linear-gradient(90deg, #5d646b, #c9ced3 45%, #6f767d); }
    .arm .tube { left: 12px; top: 30px; width: 6px; height: 186px; border-radius: 3px;
      background: linear-gradient(90deg, #7d848b, #eef1f3 45%, #9aa1a8); }
    .arm .cap { left: 4px; top: 27px; width: 22px; height: 22px; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #f1f3f5, #8b9299 75%); box-shadow: 0 0 0 1px rgba(0,0,0,.35); }
    .arm .shell { left: 6px; top: 208px; width: 18px; height: 30px; border-radius: 3px;
      background: linear-gradient(90deg, #2b2e33, #4a4f56 50%, #2b2e33); box-shadow: inset 0 -4px 0 #66b5f5; }
    .disc-label { position: absolute; inset: 2px; border-radius: 50%;
      background:
        radial-gradient(circle, #0b0c0d 0 4px, #dfe5ea 4px 6px, transparent 6px),
        radial-gradient(circle, transparent 0 25px, #3f8fd8 25px 26px, transparent 26px),
        conic-gradient(from 20deg, #66b5f5 0 62%, #9ad0fb 62% 70%, #66b5f5 70% 82%, #4a9be3 82% 90%, #66b5f5 90%);
      box-shadow: 0 0 0 1px #050506; }
    .disc-label::after { content: 'FLAC · 33'; position: absolute; left: 0; right: 0; top: 9px; text-align: center;
      font: 700 7px "Helvetica Neue", Arial, sans-serif; letter-spacing: .14em; color: #0a2540; }
    .spindle { position: absolute; left: 0; top: 0; width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle, #0b0c0d 0 3px, #e3e7ea 3px 5px, #7d848b 5px); box-shadow: 0 1px 2px rgba(0,0,0,.6); }
    .well { position: absolute; border-radius: 12px; background: #1c1f23;
      box-shadow: inset 3px 3px 7px rgba(0,0,0,.6), inset -2px -2px 6px rgba(255,255,255,.05); }
    .face { color: #a9cdee; }
    .face svg { width: 44%; height: 44%; }
    .soft { border-radius: 50%; background: linear-gradient(145deg, #2e3238, #1f2226);
      box-shadow: 3px 3px 6px rgba(0,0,0,.6), -3px -3px 6px rgba(255,255,255,.065); }
    .soft.blue { color: #0a1622; background: linear-gradient(145deg, #7cc3fb, #3f8fd8);
      box-shadow: 3px 3px 6px rgba(0,0,0,.6), -3px -3px 6px rgba(255,255,255,.065), inset 0 0 0 1px rgba(255,255,255,.35); }
    .hover .soft { color: #fff; background: linear-gradient(145deg, #343940, #23262b); }
    .hover .soft.blue { color: #0a1622; background: linear-gradient(145deg, #93cffd, #4d9ce3); }
    .pressed .soft { background: #1e2125; box-shadow: inset 3px 3px 6px rgba(0,0,0,.65), inset -2px -2px 5px rgba(255,255,255,.05); }
    .pressed .soft.blue { background: linear-gradient(145deg, #3f8fd8, #5aa9ee); box-shadow: inset 3px 3px 6px rgba(0,0,0,.4); }
    .active .soft { color: #66b5f5; background: #1e2125;
      box-shadow: inset 3px 3px 6px rgba(0,0,0,.65), inset -2px -2px 5px rgba(255,255,255,.05), inset 0 0 0 1.5px rgba(102,181,245,.8); }
    .active .soft svg { filter: drop-shadow(0 0 3px rgba(102,181,245,.8)); }
    .active .soft.blue { color: #0a1622; background: linear-gradient(145deg, #7cc3fb, #3f8fd8);
      box-shadow: 3px 3px 6px rgba(0,0,0,.6), -3px -3px 6px rgba(255,255,255,.065), inset 0 0 0 2px #e9f5ff; }
    .active .soft.blue svg { filter: none; }
  `,
  art: `
    <div class="platter"></div><div class="record"></div>
    <div class="pivot"></div>
    <div class="well" style="left:341px;top:113px;width:286px;height:14px;border-radius:7px"></div>
    <div class="well" style="left:435px;top:227px;width:102px;height:14px;border-radius:7px"></div>
    <div class="well" style="left:340px;top:258px;width:288px;height:130px"></div>
  `,
  buttons: [
    button('player.open', 'open', 346, 149, 46, 46, 'soft'),
    button('player.previous', 'previous', 392, 144, 56, 56, 'soft'),
    button('player.togglePlay', 'play', 448, 136, 72, 72, 'soft blue', PLAY),
    button('player.next', 'next', 520, 144, 56, 56, 'soft'),
    button('player.stop', 'stop', 576, 149, 46, 46, 'soft'),
    button('player.repeat', 'repeat', 342, 212, 44, 44, 'soft', TOGGLE),
    button('player.shuffle', 'shuffle', 386, 212, 44, 44, 'soft', TOGGLE),
    button('window.equalizer', 'equalizer', 540, 212, 44, 44, 'soft', TOGGLE),
    button('app.skins', 'skins', 584, 212, 44, 44, 'soft'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 344, y: 22, width: 280, height: 26, fontSize: 18, color: '#e9ecf0' },
    { type: 'text', source: 'track.artist', x: 344, y: 48, width: 280, height: 18, fontSize: 13, color: '#66b5f5' },
    { type: 'text', source: 'player.status', x: 344, y: 70, width: 280, height: 14, fontSize: 10, color: '#a0a9b3' },
    { type: 'time', source: 'position', x: 344, y: 94, width: 80, height: 14, fontSize: 11, color: '#a0a9b3' },
    { type: 'time', source: 'duration', x: 544, y: 94, width: 80, height: 14, fontSize: 11, align: 'right', color: '#a0a9b3' },
    { type: 'seekbar', x: 344, y: 116, width: 280, height: 8 },
    { type: 'volume', x: 438, y: 230, width: 96, height: 8 },
    { type: 'spectrum', x: 60, y: 350, width: 200, height: 30, color: '#66b5f5' },
    { type: 'playlist', x: 346, y: 264, width: 276, height: 118 },
  ],
  spinners: [{ name: 'label', x: 112, y: 134, width: 96, height: 96, period: 1800, source: 'track.cover', html: '<div class="disc-label"></div>' }],
  // the spindle stays on top of the cover
  overlays: [{ name: 'spindle', x: 153, y: 175, width: 14, height: 14, html: '<div class="spindle"></div>' }],
  // the tonearm: turns from the first groove to the last with the track, and is dragged to seek
  needles: [
    {
      name: 'arm',
      x: 281,
      y: 24,
      width: 30,
      height: 242,
      pivotX: 15,
      pivotY: 38,
      from: 8,
      to: 28,
      rest: -3,
      html: '<div class="arm"><i class="weight"></i><i class="tube"></i><i class="shell"></i><i class="cap"></i></div>',
    },
  ],
};

const label = (text, x, y, width) =>
  `<div class="lbl" style="left:${x}px;top:${y}px;width:${width}px">${text}</div>`;

const panel = {
  folder: 'panel',
  manifest: {
    id: 'io.github.krocon.panel',
    name: 'Panel',
    description: 'Less, but better: a matt light panel, round push buttons and a single red one.',
    theme: {
      background: '#e8e7e3',
      surface: '#f5f4f0',
      surfaceRaised: '#ffffff',
      foreground: '#1c1c1a',
      muted: '#595854',
      accent: '#b83216',
      accentContrast: '#ffffff',
      border: '#a3a29d',
      ok: '#1f6b3a',
      danger: '#a3231b',
      focus: '#1f5fbf',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      radius: 2,
    },
  },
  width: 340,
  height: 560,
  pad: 5,
  css: `
    body { background: linear-gradient(160deg, #eeede9, #e3e2de); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      box-shadow: inset 0 1px 0 #fff, inset 0 -1px 0 rgba(0,0,0,.2); }
    .rule { position: absolute; left: 24px; width: 292px; height: 1px; background: #1c1c1a; opacity: .75; }
    .scale { position: absolute; left: 24px; top: 86px; width: 292px; height: 44px; border-radius: 2px; background: #f5f4f0;
      box-shadow: inset 0 1px 3px rgba(0,0,0,.4), 0 1px 0 #fff; }
    .scale::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: 3px; height: 4px;
      background: repeating-linear-gradient(90deg, #1c1c1a 0 1px, transparent 1px 6px); opacity: .45; }
    .slot { position: absolute; border-radius: 7px; background: #cfcec9; box-shadow: inset 0 1px 2px rgba(0,0,0,.45), 0 1px 0 #fff; }
    .lbl { position: absolute; font-size: 8.5px; letter-spacing: .04em; color: #3c3b38; text-align: center; white-space: nowrap; }
    .sheet { position: absolute; left: 24px; top: 332px; width: 292px; height: 208px; border-radius: 2px; background: #f5f4f0;
      box-shadow: inset 0 0 0 1px #a3a29d; }
    .grille { position: absolute; right: 24px; top: 20px; width: 50px; height: 50px; border-radius: 50%;
      background: radial-gradient(circle, #2a2a28 1.1px, transparent 1.4px) 0 0 / 5px 5px; opacity: .8; }
    .face { color: #1c1c1a; }
    .face svg { width: 42%; height: 42%; }
    .disc { border-radius: 50%; background: linear-gradient(160deg, #fdfcfa, #d6d5d0);
      box-shadow: 0 0 0 1px #84837e, 0 2px 3px rgba(0,0,0,.28), inset 0 0 0 4px rgba(255,255,255,.4), inset 0 -3px 5px rgba(0,0,0,.08); }
    .disc.red { color: #fff; background: linear-gradient(160deg, #e7573a, #b83216);
      box-shadow: 0 0 0 1px #77200c, 0 2px 3px rgba(0,0,0,.3), inset 0 0 0 4px rgba(255,255,255,.14); }
    .hover .disc { background: linear-gradient(160deg, #fff, #e2e1dc); }
    .hover .disc.red { background: linear-gradient(160deg, #f0664a, #c63a1c); }
    .pressed .disc { background: linear-gradient(160deg, #cfcec9, #e6e5e0); box-shadow: 0 0 0 1px #84837e, inset 0 2px 4px rgba(0,0,0,.35); }
    .pressed .disc.red { background: linear-gradient(160deg, #a82c12, #cf4526); box-shadow: 0 0 0 1px #77200c, inset 0 2px 4px rgba(0,0,0,.4); }
    .pressed .face svg { transform: translateY(1px); }
    .active .disc { color: #fff; background: linear-gradient(160deg, #3a3a37, #1c1c1a);
      box-shadow: 0 0 0 1px #000, 0 1px 2px rgba(0,0,0,.3), inset 0 0 0 4px rgba(255,255,255,.07); }
    .active .disc.red { background: linear-gradient(160deg, #e7573a, #b83216);
      box-shadow: 0 0 0 1px #77200c, 0 0 0 3px #e8e7e3, 0 0 0 4.5px #b83216, inset 0 0 0 4px rgba(255,255,255,.14); }
  `,
  art: `
    <div class="grille"></div>
    <div class="rule" style="top:76px"></div>
    <div class="scale"></div>
    <div class="slot" style="left:22px;top:157px;width:296px;height:14px"></div>
    ${label('back', 30, 240, 56)}${label('play', 86, 240, 56)}${label('stop', 142, 240, 56)}${label('next', 198, 240, 56)}${label('open', 254, 240, 56)}
    <div class="rule" style="top:258px;opacity:.25"></div>
    ${label('repeat', 22, 310, 44)}${label('shuffle', 66, 310, 44)}${label('eq', 110, 310, 44)}${label('volume', 164, 310, 100)}${label('skin', 274, 310, 44)}
    <div class="slot" style="left:162px;top:281px;width:104px;height:14px"></div>
    <div class="sheet"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 30, 182, 56, 56, 'disc'),
    button('player.togglePlay', 'play', 86, 182, 56, 56, 'disc red', PLAY),
    button('player.stop', 'stop', 142, 182, 56, 56, 'disc'),
    button('player.next', 'next', 198, 182, 56, 56, 'disc'),
    button('player.open', 'open', 254, 182, 56, 56, 'disc'),
    button('player.repeat', 'repeat', 22, 266, 44, 44, 'disc', TOGGLE),
    button('player.shuffle', 'shuffle', 66, 266, 44, 44, 'disc', TOGGLE),
    button('window.equalizer', 'equalizer', 110, 266, 44, 44, 'disc', TOGGLE),
    button('app.skins', 'skins', 274, 266, 44, 44, 'disc'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 24, y: 22, width: 232, height: 24, fontSize: 17, color: '#1c1c1a' },
    { type: 'text', source: 'track.artist', x: 24, y: 48, width: 232, height: 18, fontSize: 12, color: '#595854' },
    { type: 'spectrum', x: 34, y: 92, width: 170, height: 28, color: '#b83216' },
    { type: 'time', source: 'position', x: 214, y: 90, width: 92, height: 32, fontSize: 22, align: 'right', color: '#1c1c1a' },
    { type: 'text', source: 'player.status', x: 24, y: 136, width: 200, height: 14, fontSize: 10, color: '#595854' },
    { type: 'time', source: 'duration', x: 236, y: 136, width: 80, height: 14, fontSize: 10, align: 'right', color: '#595854' },
    { type: 'seekbar', x: 24, y: 160, width: 292, height: 8 },
    { type: 'volume', x: 164, y: 284, width: 100, height: 8 },
    { type: 'playlist', x: 28, y: 336, width: 284, height: 200 },
  ],
};

// ---- "Reel": a tape machine, white front, two reels that turn

const reelHtml = () => `
  <div class="reel">
    <b></b><b style="transform:rotate(120deg)"></b><b style="transform:rotate(240deg)"></b>
    <div class="core"></div><div class="tag"></div>
  </div>`;

const reelDeck = {
  folder: 'reel',
  manifest: {
    id: 'io.github.krocon.reel',
    name: 'Reel',
    description: 'A tape machine with a white front: two reels that turn, square keys and black knobs.',
    theme: {
      background: '#e9e9e5',
      surface: '#f6f6f2',
      surfaceRaised: '#ffffff',
      foreground: '#1d1d1b',
      muted: '#5a5a56',
      accent: '#b73e0e',
      accentContrast: '#ffffff',
      border: '#a6a6a1',
      ok: '#1f6b3a',
      danger: '#a3231b',
      focus: '#1f5fbf',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      radius: 2,
    },
  },
  width: 640,
  height: 430,
  pad: 4,
  css: `
    body { background: linear-gradient(170deg, #f1f1ee, #e2e2de); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      box-shadow: inset 0 0 0 1px #b9b9b4, inset 0 2px 0 #fff; }
    .screw { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #d8d8d4, #84847f 75%); box-shadow: 0 0 0 1px rgba(0,0,0,.25); }
    .seat { position: absolute; width: 232px; height: 232px; border-radius: 50%; background: #dcdcd8;
      box-shadow: inset 0 2px 6px rgba(0,0,0,.22), 0 1px 0 #fff; }
    .path { position: absolute; left: 150px; top: 236px; width: 340px; height: 14px; border: 2px solid #3b2a20; border-top: none; border-radius: 0 0 14px 14px; opacity: .8; }
    .head { position: absolute; left: 252px; top: 196px; width: 136px; height: 50px; border-radius: 8px; background: linear-gradient(#fafaf7, #e4e4e0);
      box-shadow: 0 0 0 1px #9a9a95, 0 3px 5px rgba(0,0,0,.25); }
    .head::before { content: ''; position: absolute; left: 10px; right: 10px; top: 9px; bottom: 9px; border-radius: 2px; background: #f6f6f2; box-shadow: inset 0 1px 3px rgba(0,0,0,.45); }
    .sheet { position: absolute; border-radius: 2px; background: #f6f6f2; box-shadow: inset 0 0 0 1px #a6a6a1; }
    .slot { position: absolute; border-radius: 7px; background: #cfcfca; box-shadow: inset 0 1px 2px rgba(0,0,0,.45), 0 1px 0 #fff; }
    .cap { position: absolute; font-size: 7.5px; letter-spacing: .06em; color: #3c3c39; white-space: nowrap; }
    .reel { position: absolute; inset: 0; border-radius: 50%;
      background: radial-gradient(circle, transparent 0 104px, rgba(150,150,144,.55) 104px 106px, rgba(255,255,255,.5) 106px 110px, rgba(120,120,115,.8) 110px 112px);
      box-shadow: inset 0 0 0 112px rgba(255,255,255,.2); filter: drop-shadow(0 3px 4px rgba(0,0,0,.28)); }
    .wound { position: absolute; inset: 0; border-radius: 50%; background: repeating-radial-gradient(circle, #40302a 0 1.5px, #32251f 1.5px 3px); }
    .reel b { position: absolute; left: 50%; top: 50%; width: 40px; height: 108px; margin-left: -20px; transform-origin: 50% 0;
      background: linear-gradient(90deg, rgba(225,225,220,.88), rgba(248,248,245,.92) 50%, rgba(215,215,210,.88)); border-radius: 0 0 14px 14px; box-shadow: 0 0 0 1px rgba(0,0,0,.14); }
    .reel .core { position: absolute; left: 50%; top: 50%; width: 76px; height: 76px; margin: -38px; border-radius: 50%;
      background: radial-gradient(circle, #8a8a85 0 4px, #e9e9e5 4px 9px, #b5b5b0 9px 10px, #fbfbf8 10px);
      box-shadow: 0 0 0 1px #9a9a95, 0 1px 3px rgba(0,0,0,.3); }
    .reel .tag { position: absolute; left: 50%; top: 152px; width: 26px; height: 44px; margin-left: -13px; border-radius: 3px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.25);
      background-image: linear-gradient(#b73e0e 0 8px, transparent 8px); }
    .face { color: #1d1d1b; }
    .face svg { width: 20px; height: 20px; }
    .sq { border-radius: 4px; background: linear-gradient(#fcfcf9, #dcdcd7); box-shadow: 0 0 0 1px #8c8c87, 0 2px 2px rgba(0,0,0,.25), inset 0 1px 0 #fff; }
    .sq.go::after { content: ''; position: absolute; left: 50%; bottom: 4px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: #c9c9c4; }
    .sq.go svg { margin-top: -6px; }
    .knob { border-radius: 50%; color: #f6f6f2; background: radial-gradient(circle at 35% 28%, #5a5a55, #151513 72%); box-shadow: 0 2px 3px rgba(0,0,0,.4), 0 0 0 1px #000; }
    .knob svg { width: 16px; height: 16px; }
    .hover .sq { background: linear-gradient(#fff, #e8e8e3); }
    .hover .knob { background: radial-gradient(circle at 35% 28%, #74746e, #232320 72%); }
    .pressed .sq { background: linear-gradient(#d5d5d0, #e9e9e4); box-shadow: 0 0 0 1px #8c8c87, inset 0 2px 3px rgba(0,0,0,.3); }
    .pressed .knob { box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.8); }
    .pressed .face svg { transform: translateY(1px); }
    .active .sq.go { color: #b73e0e; }
    .active .sq.go::after { background: #f2581c; box-shadow: 0 0 4px rgba(242,88,28,.9); }
    .active .knob { color: #ff9a62; box-shadow: 0 2px 3px rgba(0,0,0,.4), 0 0 0 1px #000, 0 0 0 3px #f2581c; }
  `,
  art: `
    <div class="screw" style="left:8px;top:8px"></div><div class="screw" style="right:8px;top:8px"></div>
    <div class="screw" style="left:8px;bottom:8px"></div><div class="screw" style="right:8px;bottom:8px"></div>
    <div class="seat" style="left:34px;top:14px"></div><div class="seat" style="left:374px;top:14px"></div>
    <div class="path"></div><div class="head"></div>
    <div class="slot" style="left:22px;top:343px;width:284px;height:14px"></div>
    <div class="cap" style="left:332px;top:262px">volume</div>
    <div class="slot" style="left:376px;top:259px;width:242px;height:14px"></div>
    <div class="sheet" style="left:330px;top:282px;width:288px;height:134px"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 22, 372, 52, 46, 'sq'),
    button('player.togglePlay', 'play', 74, 372, 52, 46, 'sq go', PLAY),
    button('player.stop', 'stop', 126, 372, 52, 46, 'sq'),
    button('player.next', 'next', 178, 372, 52, 46, 'sq'),
    button('player.open', 'open', 230, 372, 52, 46, 'sq'),
    button('player.repeat', 'repeat', 298, 16, 44, 44, 'knob', TOGGLE),
    button('player.shuffle', 'shuffle', 298, 60, 44, 44, 'knob', TOGGLE),
    button('window.equalizer', 'equalizer', 298, 104, 44, 44, 'knob', TOGGLE),
    button('app.skins', 'skins', 298, 148, 44, 44, 'knob'),
  ],
  components: [
    { type: 'spectrum', x: 266, y: 208, width: 108, height: 26, color: '#b73e0e' },
    { type: 'text', source: 'track.title', x: 24, y: 276, width: 282, height: 24, fontSize: 17, color: '#1d1d1b' },
    { type: 'text', source: 'track.artist', x: 24, y: 300, width: 282, height: 18, fontSize: 12, color: '#5a5a56' },
    { type: 'time', source: 'position', x: 24, y: 324, width: 80, height: 16, fontSize: 12, color: '#1d1d1b' },
    { type: 'text', source: 'player.status', x: 104, y: 324, width: 122, height: 16, fontSize: 10, align: 'center', color: '#5a5a56' },
    { type: 'time', source: 'duration', x: 226, y: 324, width: 80, height: 16, fontSize: 12, align: 'right', color: '#5a5a56' },
    { type: 'seekbar', x: 24, y: 346, width: 280, height: 8 },
    { type: 'volume', x: 378, y: 262, width: 238, height: 8 },
    { type: 'playlist', x: 334, y: 286, width: 280, height: 126 },
  ],
  spinners: [
    { name: 'reel-left', x: 38, y: 18, width: 224, height: 224, period: 3200, html: reelHtml() },
    { name: 'reel-right', x: 378, y: 18, width: 224, height: 224, period: 3200, html: reelHtml() },
  ],
  // the tape: wound off the left reel and on to the right one as the track goes on
  packs: [
    { name: 'tape-left', x: 54, y: 34, width: 192, height: 192, from: 192, to: 92, html: '<div class="wound"></div>' },
    { name: 'tape-right', x: 394, y: 34, width: 192, height: 192, from: 92, to: 192, html: '<div class="wound"></div>' },
  ],
};

// ---- "Recorder": a pocket recorder, black body, a display that glows, a ring of keys

const recorder = {
  folder: 'recorder',
  manifest: {
    id: 'io.github.krocon.recorder',
    name: 'Recorder',
    description: 'A pocket recorder: matt black body, a glowing display and a ring of keys around play.',
    theme: {
      background: '#18191b',
      surface: '#0b0e10',
      surfaceRaised: '#2a2c30',
      foreground: '#e9eef0',
      muted: '#9aa4a8',
      accent: '#ff6156',
      accentContrast: '#1c0200',
      border: '#34373b',
      ok: '#7fdca0',
      danger: '#ff9d94',
      focus: '#7fc4ff',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontMono: 'Menlo, Consolas, monospace',
      radius: 3,
    },
  },
  width: 340,
  height: 600,
  pad: 5,
  css: `
    body { background: linear-gradient(90deg, rgba(255,255,255,.05), transparent 8%, transparent 92%, rgba(255,255,255,.05)), linear-gradient(#202124, #141516);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .top { position: absolute; left: 0; top: 0; width: 100%; height: 44px;
      background: repeating-linear-gradient(0deg, rgba(255,255,255,.18) 0 .5px, rgba(0,0,0,.05) .5px 1px, transparent 1px 2.5px), linear-gradient(#e3e5e7, #a9adb1);
      box-shadow: 0 2px 4px rgba(0,0,0,.6), inset 0 1px 0 #fff; }
    .led { position: absolute; top: 18px; width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 1px 1px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.7); }
    .mark { position: absolute; top: 15px; font-size: 8px; font-weight: 700; letter-spacing: .12em; color: #3b3e42; }
    .lcd { position: absolute; border-radius: 4px; background: linear-gradient(#0b0e10, #0e1215);
      box-shadow: inset 0 0 0 1px #000, inset 0 2px 8px #000, 0 0 0 3px #2b2d30, 0 0 0 4px #000, 0 1px 0 4px rgba(255,255,255,.08); }
    .hair { position: absolute; left: 12px; right: 12px; height: 1px; background: rgba(233,238,240,.22); }
    .ring { position: absolute; left: 30px; top: 240px; width: 164px; height: 164px; border-radius: 50%; background: #111214;
      box-shadow: inset 0 2px 6px #000, 0 1px 0 rgba(255,255,255,.1); }
    .slot { position: absolute; border-radius: 7px; background: #0b0c0d; box-shadow: inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,.1); }
    .tiny { position: absolute; font-size: 7px; font-weight: 700; letter-spacing: .16em; color: #7d858a; white-space: nowrap; }
    .face { color: #e9eef0; }
    .face svg { width: 18px; height: 18px; }
    .cap { border-radius: 50%; background: linear-gradient(#3c3e42, #1d1e21); box-shadow: 0 0 0 1px #000, 0 2px 3px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.2); }
    .cap.silver { color: #18191b; background: linear-gradient(#f4f5f6, #b4b8bc); box-shadow: 0 0 0 1px #000, 0 2px 3px rgba(0,0,0,.6), inset 0 1px 0 #fff; }
    .cap.silver svg { width: 26px; height: 26px; }
    .hover .cap { background: linear-gradient(#4b4e53, #26272b); }
    .hover .cap.silver { background: linear-gradient(#fff, #c6cace); }
    .pressed .cap { background: linear-gradient(#1d1e21, #2b2d30); box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.7); }
    .pressed .cap.silver { background: linear-gradient(#b4b8bc, #d9dcdf); box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.45); }
    .active .cap { color: #ff6156; box-shadow: 0 0 0 1px #000, 0 0 0 2.5px #ff6156, inset 0 1px 0 rgba(255,255,255,.2); }
    .active .cap.silver { color: #c2241a; box-shadow: 0 0 0 1px #000, 0 0 0 3px #ff6156, 0 0 8px 2px rgba(255,97,86,.6), inset 0 1px 0 #fff; }
  `,
  art: `
    <div class="top"></div>
    <div class="led" style="left:120px;background:#8fd98a"></div><div class="mark" style="left:134px">L</div>
    <div class="led" style="left:196px;background:#d7d9db"></div><div class="mark" style="left:210px">R</div>
    <div class="lcd" style="left:30px;top:62px;width:280px;height:150px"><div class="hair" style="top:44px"></div><div class="hair" style="top:104px"></div></div>
    <div class="slot" style="left:28px;top:221px;width:284px;height:14px"></div>
    <div class="ring"></div>
    <div class="tiny" style="left:214px;top:376px">VOLUME</div>
    <div class="slot" style="left:210px;top:387px;width:102px;height:14px"></div>
    <div class="lcd" style="left:30px;top:420px;width:280px;height:164px"></div>
  `,
  buttons: [
    button('player.open', 'open', 90, 242, 44, 44, 'cap'),
    button('player.previous', 'previous', 32, 300, 44, 44, 'cap'),
    button('player.togglePlay', 'play', 79, 289, 66, 66, 'cap silver', PLAY),
    button('player.next', 'next', 148, 300, 44, 44, 'cap'),
    button('player.stop', 'stop', 90, 358, 44, 44, 'cap'),
    button('player.repeat', 'repeat', 210, 250, 50, 50, 'cap', TOGGLE),
    button('player.shuffle', 'shuffle', 262, 250, 50, 50, 'cap', TOGGLE),
    button('window.equalizer', 'equalizer', 210, 306, 50, 50, 'cap', TOGGLE),
    button('app.skins', 'skins', 262, 306, 50, 50, 'cap'),
  ],
  components: [
    { type: 'spectrum', x: 42, y: 70, width: 256, height: 30, color: '#e9eef0' },
    { type: 'text', source: 'player.status', x: 42, y: 112, width: 90, height: 16, fontSize: 10, color: '#ff6156' },
    { type: 'time', source: 'duration', x: 42, y: 132, width: 90, height: 16, fontSize: 11, color: '#9aa4a8' },
    { type: 'time', source: 'position', x: 134, y: 110, width: 164, height: 50, fontSize: 36, align: 'right', color: '#e9eef0' },
    { type: 'text', source: 'track.title', x: 42, y: 170, width: 256, height: 20, fontSize: 13, color: '#e9eef0' },
    { type: 'text', source: 'track.artist', x: 42, y: 190, width: 256, height: 16, fontSize: 11, color: '#9aa4a8' },
    { type: 'seekbar', x: 30, y: 224, width: 280, height: 8 },
    { type: 'volume', x: 212, y: 390, width: 98, height: 8 },
    { type: 'playlist', x: 34, y: 424, width: 272, height: 156 },
  ],
};

// ---- "Deck": a cassette lying on dark brushed metal, ridged silver keys

const smallHub = (name, x, y) => ({
  name,
  x,
  y,
  width: 28,
  height: 28,
  period: 2600,
  html: '<div class="cog"><i></i><i></i><i></i></div>',
});
const COG_CSS = `
    .cog { position: absolute; inset: 0; border-radius: 50%; background: #f1ece0; box-shadow: inset 0 0 0 3px #f1ece0, inset 0 0 0 8px #141312, 0 0 0 1px #141312; }
    .cog i { position: absolute; left: 12px; top: 2px; width: 4px; height: 24px; background: linear-gradient(#f1ece0 0 6px, transparent 6px 18px, #f1ece0 18px); }
    .cog i:nth-child(2) { transform: rotate(60deg); } .cog i:nth-child(3) { transform: rotate(120deg); }`;

const deck = {
  folder: 'deck',
  manifest: {
    id: 'io.github.krocon.deck',
    name: 'Deck',
    description: 'A cassette on dark brushed metal, ridged silver keys and an orange stripe.',
    theme: {
      background: '#2b2c2e',
      surface: '#18191a',
      surfaceRaised: '#3a3b3e',
      foreground: '#f1f1ee',
      muted: '#b2b2ad',
      accent: '#ff8136',
      accentContrast: '#1c0c00',
      border: '#111213',
      ok: '#7fdca0',
      danger: '#ff9d94',
      focus: '#7fc4ff',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      radius: 3,
    },
  },
  width: 380,
  height: 600,
  pad: 3,
  css: `
    body { background:
        repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 .5px, rgba(0,0,0,.06) .5px 1px, transparent 1px 2.5px),
        linear-gradient(#3a3b3d, #252628 55%, #2c2d2f);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .bay { position: absolute; left: 30px; top: 16px; width: 320px; height: 204px; border-radius: 8px; background: #151617;
      box-shadow: inset 0 3px 8px #000, 0 1px 0 rgba(255,255,255,.12); }
    .shell { position: absolute; left: 40px; top: 24px; width: 300px; height: 188px; border-radius: 7px; background: linear-gradient(#f1ece0, #ddd6c6);
      box-shadow: 0 4px 8px rgba(0,0,0,.6), inset 0 1px 0 #fff, inset 0 0 0 1px rgba(0,0,0,.25); }
    .band { position: absolute; left: 14px; top: 12px; width: 272px; height: 58px; border-radius: 3px; background: #18191a; }
    .stripe { position: absolute; left: 14px; top: 74px; width: 272px; height: 9px; background: linear-gradient(90deg, #ff8136 0 70%, #f1ece0 70% 72%, #ff8136 72% 80%, #f1ece0 80% 82%, #ff8136 82%); }
    .glass { position: absolute; left: 66px; top: 92px; width: 168px; height: 46px; border-radius: 6px; background: linear-gradient(#211a15, #100d0b); box-shadow: inset 0 2px 5px #000; overflow: hidden; }
    .glass::before, .glass::after { content: ''; position: absolute; top: -18px; width: 82px; height: 82px; border-radius: 50%; background: repeating-radial-gradient(circle, #4a2f1f 0 1.5px, #3a2417 1.5px 3px); }
    .glass::before { left: -7px; } .glass::after { right: -19px; width: 70px; height: 70px; top: -12px; }
    .foot { position: absolute; left: 60px; bottom: 0; width: 180px; height: 34px; background: #cfc8b8; clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%); }
    .foot::after { content: ''; position: absolute; left: 30px; top: 12px; width: 120px; height: 10px; background: radial-gradient(circle, #18191a 3.5px, transparent 4px) 0 0 / 30px 10px; }
    .well { position: absolute; border-radius: 4px; background: #18191a; box-shadow: inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.1); }
    .slot { position: absolute; border-radius: 7px; background: #121314; box-shadow: inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,.1); }
    .block { position: absolute; left: 30px; top: 228px; width: 320px; height: 54px; border-radius: 5px; background: #121314; box-shadow: inset 0 2px 4px #000, 0 1px 0 rgba(255,255,255,.1); }
    ${COG_CSS}
    .face { color: #2b2c2e; }
    .face svg { width: 20px; height: 20px; }
    .ridge { border-radius: 3px;
      background: repeating-linear-gradient(0deg, rgba(0,0,0,.07) 0 1px, transparent 1px 4px), linear-gradient(#f6f6f4, #c4c4c0);
      box-shadow: 0 0 0 1px #0c0c0c, 0 3px 3px rgba(0,0,0,.55), inset 0 1px 0 #fff; }
    .flat { color: #b2b2ad; border-radius: 4px; }
    .flat svg { width: 18px; height: 18px; }
    .hover .ridge { background: repeating-linear-gradient(0deg, rgba(0,0,0,.06) 0 1px, transparent 1px 4px), linear-gradient(#fff, #d4d4d0); }
    .hover .flat { color: #fff; background: rgba(255,255,255,.07); }
    .pressed .ridge { transform: translateY(2px); background: repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 1px, transparent 1px 4px), linear-gradient(#cfcfcb, #b9b9b5);
      box-shadow: 0 0 0 1px #0c0c0c, 0 1px 1px rgba(0,0,0,.55); }
    .pressed .flat { color: #fff; background: rgba(0,0,0,.35); }
    .active .ridge { transform: translateY(2px); color: #d4520a; box-shadow: 0 0 0 1px #0c0c0c, 0 1px 1px rgba(0,0,0,.55), inset 0 -3px 0 #ff8136; }
    .active .flat { color: #ff8136; box-shadow: inset 0 -2px 0 #ff8136; }
  `,
  art: `
    <div class="bay"></div>
    <div class="shell"><div class="band"></div><div class="stripe"></div><div class="glass"></div><div class="foot"></div></div>
    <div class="block"></div>
    <div class="slot" style="left:164px;top:299px;width:140px;height:14px"></div>
    <div class="slot" style="left:22px;top:355px;width:336px;height:14px"></div>
    <div class="well" style="left:24px;top:394px;width:332px;height:192px"></div>
  `,
  buttons: [
    button('player.open', 'open', 34, 231, 56, 48, 'ridge'),
    button('player.previous', 'previous', 90, 231, 62, 48, 'ridge'),
    button('player.togglePlay', 'play', 152, 231, 76, 48, 'ridge', PLAY),
    button('player.next', 'next', 228, 231, 62, 48, 'ridge'),
    button('player.stop', 'stop', 290, 231, 56, 48, 'ridge'),
    button('player.repeat', 'repeat', 24, 288, 44, 36, 'flat', TOGGLE),
    button('player.shuffle', 'shuffle', 68, 288, 44, 36, 'flat', TOGGLE),
    button('window.equalizer', 'equalizer', 112, 288, 44, 36, 'flat', TOGGLE),
    button('app.skins', 'skins', 312, 288, 44, 36, 'flat'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 64, y: 42, width: 252, height: 24, fontSize: 16, color: '#f1f1ee' },
    { type: 'text', source: 'track.artist', x: 64, y: 66, width: 252, height: 18, fontSize: 12, color: '#ff8136' },
    { type: 'volume', x: 166, y: 302, width: 136, height: 8 },
    { type: 'time', source: 'position', x: 24, y: 334, width: 70, height: 16, fontSize: 12, color: '#f1f1ee' },
    { type: 'text', source: 'player.status', x: 94, y: 334, width: 90, height: 16, fontSize: 10, color: '#b2b2ad' },
    { type: 'spectrum', x: 190, y: 332, width: 100, height: 18, color: '#ff8136' },
    { type: 'time', source: 'duration', x: 292, y: 334, width: 64, height: 16, fontSize: 12, align: 'right', color: '#b2b2ad' },
    { type: 'seekbar', x: 24, y: 358, width: 332, height: 8 },
    { type: 'playlist', x: 28, y: 398, width: 324, height: 184 },
  ],
  spinners: [smallHub('hub-left', 136, 125), smallHub('hub-right', 232, 125)],
};

// ---- "Walk": a pocket cassette player in orange and black

const bigHub = (name, x, y) => ({ ...smallHub(name, x, y), width: 36, height: 36, html: '<div class="cog big"><i></i><i></i><i></i></div>' });

const walk = {
  folder: 'walk',
  manifest: {
    id: 'io.github.krocon.walk',
    name: 'Walk',
    description: 'A pocket cassette player in orange and black, for music on the way.',
    theme: {
      background: '#1b1a19',
      surface: '#121110',
      surfaceRaised: '#2e2b28',
      foreground: '#f5efe4',
      muted: '#b9b0a1',
      accent: '#ff7a2a',
      accentContrast: '#1c0a00',
      border: '#0a0908',
      ok: '#7fdca0',
      danger: '#ff9d94',
      focus: '#7fc4ff',
      fontFamily: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
      fontMono: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
      radius: 3,
    },
  },
  width: 360,
  height: 580,
  titleBar: '#e9621a',
  pad: 2,
  css: `
    body { background:
        radial-gradient(circle, rgba(0,0,0,.10) .6px, transparent .9px) 0 0 / 5px 5px,
        radial-gradient(circle, rgba(255,255,255,.10) .6px, transparent .9px) 2px 3px / 7px 7px,
        linear-gradient(160deg, #f7742a, #e55a12);
      font-family: "Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif; }
    .panel { position: absolute; left: 24px; top: 18px; width: 320px; height: 222px; background: #121110; clip-path: polygon(0 0, 100% 0, 100% 100%, 40% 100%, 0 52%); }
    .rim { position: absolute; left: 24px; top: 18px; width: 320px; height: 222px; }
    .rim::after { content: ''; position: absolute; left: 148px; top: 130px; width: 160px; height: 76px; border-radius: 5px; background: linear-gradient(#f5efe4, #dcd4c4); box-shadow: 0 0 0 1px #000; }
    .word { position: absolute; left: 44px; top: 150px; font-size: 19px; font-weight: 800; letter-spacing: .08em; color: #7a2a05; transform: rotate(49deg); transform-origin: 0 0; white-space: nowrap; opacity: .85; }
    .hole { position: absolute; top: 148px; width: 40px; height: 40px; border-radius: 50%; background: #121110; box-shadow: inset 0 2px 4px #000; }
    .hatch { position: absolute; left: 250px; top: 154px; width: 32px; height: 28px; background: repeating-linear-gradient(45deg, #121110 0 2px, transparent 2px 5px); opacity: .7; }
    .slot { position: absolute; border-radius: 7px; background: #3a1503; box-shadow: inset 0 1px 2px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.25); }
    .bar { position: absolute; left: 24px; top: 278px; width: 320px; height: 58px; border-radius: 6px; background: #121110; box-shadow: 0 2px 3px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.12); }
    .box { position: absolute; border-radius: 5px; background: #121110; box-shadow: 0 2px 3px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.12); }
    .tiny { position: absolute; font-size: 8px; font-weight: 800; letter-spacing: .14em; color: #5a1f04; white-space: nowrap; }
    ${COG_CSS}
    .cog.big i { left: 16px; top: 3px; height: 30px; background: linear-gradient(#f1ece0 0 8px, transparent 8px 22px, #f1ece0 22px); }
    .face { color: #f5efe4; }
    .face svg { width: 20px; height: 20px; }
    .slab { border-radius: 3px; background: linear-gradient(#4a4744, #2a2826); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.22), inset 0 -3px 0 rgba(0,0,0,.35); }
    .chip { border-radius: 4px; background: #121110; box-shadow: 0 2px 3px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.14); }
    .chip svg { width: 17px; height: 17px; }
    .hover .slab { background: linear-gradient(#5d5a56, #353230); }
    .hover .chip { background: #2a2826; }
    .pressed .slab { background: linear-gradient(#2a2826, #353230); box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.6); }
    .pressed .chip { background: #000; box-shadow: inset 0 2px 4px #000; }
    .pressed .face svg { transform: translateY(1px); }
    .active .slab { color: #ff9a55; background: linear-gradient(#3a2416, #2a1a10); box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.6), inset 0 -3px 0 #ff7a2a; }
    .active .chip { color: #1c0a00; background: linear-gradient(#fff3e6, #ffd9b8); box-shadow: 0 2px 3px rgba(0,0,0,.4), inset 0 0 0 1px #fff; }
  `,
  art: `
    <div class="panel"></div><div class="rim"></div>
    <div class="word">STEREO</div>
    <div class="hole" style="left:182px"></div><div class="hole" style="left:286px"></div>
    <div class="hatch"></div>
    <div class="slot" style="left:22px;top:253px;width:324px;height:14px"></div>
    <div class="bar"></div>
    <div class="tiny" style="left:172px;top:346px">VOLUME</div>
    <div class="slot" style="left:170px;top:358px;width:124px;height:14px"></div>
    <div class="box" style="left:24px;top:392px;width:320px;height:174px"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 28, 282, 58, 50, 'slab'),
    button('player.togglePlay', 'play', 86, 282, 82, 50, 'slab', PLAY),
    button('player.stop', 'stop', 168, 282, 58, 50, 'slab'),
    button('player.next', 'next', 226, 282, 58, 50, 'slab'),
    button('player.open', 'open', 284, 282, 56, 50, 'slab'),
    button('player.repeat', 'repeat', 22, 344, 46, 36, 'chip', TOGGLE),
    button('player.shuffle', 'shuffle', 68, 344, 46, 36, 'chip', TOGGLE),
    button('window.equalizer', 'equalizer', 114, 344, 46, 36, 'chip', TOGGLE),
    button('app.skins', 'skins', 300, 344, 46, 36, 'chip'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 40, y: 28, width: 290, height: 26, fontSize: 19, color: '#f5efe4' },
    { type: 'text', source: 'track.artist', x: 40, y: 54, width: 290, height: 18, fontSize: 13, color: '#ff7a2a' },
    { type: 'time', source: 'position', x: 40, y: 78, width: 110, height: 40, fontSize: 30, color: '#f5efe4' },
    { type: 'spectrum', x: 176, y: 84, width: 154, height: 30, color: '#ff7a2a' },
    { type: 'text', source: 'player.status', x: 176, y: 118, width: 90, height: 14, fontSize: 10, color: '#b9b0a1' },
    { type: 'time', source: 'duration', x: 266, y: 118, width: 64, height: 14, fontSize: 11, align: 'right', color: '#b9b0a1' },
    { type: 'seekbar', x: 24, y: 256, width: 320, height: 8 },
    { type: 'volume', x: 172, y: 361, width: 120, height: 8 },
    { type: 'playlist', x: 28, y: 396, width: 312, height: 166 },
  ],
  spinners: [bigHub('hub-left', 184, 150), bigHub('hub-right', 288, 150)],
};

// ---- "Meter": dark steel, two meter windows, a cassette in its bay

const meter = {
  folder: 'meter',
  manifest: {
    id: 'io.github.krocon.meter',
    name: 'Meter',
    description: 'Dark steel with two meter windows, a cassette in its bay and a red ring around play.',
    theme: {
      background: '#2a3138', surface: '#151a1f', surfaceRaised: '#3a434c', foreground: '#eef2f5', muted: '#a9b4be',
      accent: '#ff6b60', accentContrast: '#1c0200', border: '#0b0e11', ok: '#7fdca0', danger: '#ffa39b', focus: '#7fc4ff',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif', radius: 3,
    },
  },
  width: 380,
  height: 640,
  pad: 4,
  css: `
    body { background: repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 .5px, rgba(0,0,0,.06) .5px 1px, transparent 1px 2.5px), linear-gradient(#333c45, #252b31);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .vu { position: absolute; top: 20px; width: 160px; height: 84px; border-radius: 5px; background: linear-gradient(#12161a, #191f25); overflow: hidden;
      box-shadow: inset 0 2px 6px #000, 0 0 0 1px #0b0e11, 0 1px 0 1px rgba(255,255,255,.12); }
    .vu::before { content: ''; position: absolute; inset: 0;
      background: repeating-conic-gradient(from -42deg at 50% 190%, #a9b4be 0 .7deg, transparent .7deg 4deg);
      -webkit-mask-image: radial-gradient(circle at 50% 190%, transparent 0 138px, #000 138px 146px, transparent 146px); }
    .vu::after { content: ''; position: absolute; inset: 0;
      background: conic-gradient(from 18deg at 50% 190%, #ff6b60 0 24deg, transparent 24deg);
      -webkit-mask-image: radial-gradient(circle at 50% 190%, transparent 0 131px, #000 131px 135px, transparent 135px); }
    .bay { position: absolute; left: 24px; top: 116px; width: 332px; height: 170px; border-radius: 8px; background: #12161a; box-shadow: inset 0 3px 8px #000, 0 1px 0 rgba(255,255,255,.12); }
    .shell { position: absolute; left: 44px; top: 126px; width: 292px; height: 150px; border-radius: 6px; background: linear-gradient(#d3d8dd, #b4bbc2);
      box-shadow: 0 3px 6px rgba(0,0,0,.6), inset 0 1px 0 #fff, inset 0 0 0 1px rgba(0,0,0,.3); }
    .band { position: absolute; left: 12px; top: 8px; width: 268px; height: 54px; border-radius: 3px; background: #151a1f; box-shadow: inset 0 -3px 0 #ff6b60; }
    .glass { position: absolute; left: 62px; top: 68px; width: 168px; height: 46px; border-radius: 23px; background: linear-gradient(#211a15, #0f0c0a); box-shadow: inset 0 2px 5px #000, 0 0 0 2px #8e959c; overflow: hidden; }
    .glass::before, .glass::after { content: ''; position: absolute; top: -18px; width: 82px; height: 82px; border-radius: 50%; background: repeating-radial-gradient(circle, #4a2f1f 0 1.5px, #3a2417 1.5px 3px); }
    .glass::before { left: -3px; } .glass::after { right: -15px; width: 70px; height: 70px; top: -12px; }
    .foot { position: absolute; left: 66px; bottom: 0; width: 160px; height: 26px; background: #9aa1a8; clip-path: polygon(7% 0, 93% 0, 100% 100%, 0 100%); }
    .slot { position: absolute; border-radius: 7px; background: #12161a; box-shadow: inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,.12); }
    .well { position: absolute; border-radius: 4px; background: #151a1f; box-shadow: inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.12); }
    ${COG_CSS}
    .face { color: #eef2f5; }
    .face svg { width: 20px; height: 20px; }
    .knob { border-radius: 50%; background: radial-gradient(circle at 50% 25%, #4d5863, #1e242a 78%); box-shadow: 0 0 0 1px #0b0e11, 0 3px 4px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.22); }
    .knob.red { color: #ff6b60; box-shadow: 0 0 0 1px #0b0e11, 0 3px 4px rgba(0,0,0,.5), inset 0 0 0 4px #ff6b60, inset 0 0 0 5px #0b0e11; }
    .knob.red svg { width: 28px; height: 28px; }
    .tab { border-radius: 4px; color: #a9b4be; }
    .tab svg { width: 18px; height: 18px; }
    .hover .knob { background: radial-gradient(circle at 50% 25%, #5e6a76, #272e35 78%); }
    .hover .tab { color: #fff; background: rgba(255,255,255,.07); }
    .pressed .knob { background: radial-gradient(circle at 50% 70%, #3b444d, #171c21 78%); }
    .pressed .knob:not(.red) { box-shadow: 0 0 0 1px #0b0e11, inset 0 2px 5px rgba(0,0,0,.7); }
    .pressed .tab { color: #fff; background: rgba(0,0,0,.3); }
    .active .knob.red { color: #fff; box-shadow: 0 0 0 1px #0b0e11, 0 0 10px 2px rgba(255,107,96,.55), inset 0 0 0 4px #ff6b60, inset 0 0 0 5px #0b0e11, inset 0 0 16px rgba(255,107,96,.5); }
    .active .tab { color: #ff6b60; box-shadow: inset 0 -2px 0 #ff6b60; }
  `,
  art: `
    <div class="vu" style="left:24px"></div><div class="vu" style="left:196px"></div>
    <div class="bay"></div>
    <div class="shell"><div class="band"></div><div class="glass"></div><div class="foot"></div></div>
    <div class="slot" style="left:22px;top:315px;width:336px;height:14px"></div>
    <div class="slot" style="left:170px;top:441px;width:132px;height:14px"></div>
    <div class="well" style="left:24px;top:476px;width:332px;height:150px"></div>
  `,
  buttons: [
    button('player.open', 'open', 42, 357, 46, 46, 'knob'),
    button('player.previous', 'previous', 88, 350, 60, 60, 'knob'),
    button('player.togglePlay', 'play', 148, 338, 84, 84, 'knob red', PLAY),
    button('player.next', 'next', 232, 350, 60, 60, 'knob'),
    button('player.stop', 'stop', 292, 357, 46, 46, 'knob'),
    button('player.repeat', 'repeat', 24, 430, 46, 36, 'tab', TOGGLE),
    button('player.shuffle', 'shuffle', 70, 430, 46, 36, 'tab', TOGGLE),
    button('window.equalizer', 'equalizer', 116, 430, 46, 36, 'tab', TOGGLE),
    button('app.skins', 'skins', 310, 430, 46, 36, 'tab'),
  ],
  components: [
    { type: 'spectrum', x: 38, y: 58, width: 132, height: 38, color: '#f3ecd6' },
    { type: 'time', source: 'position', x: 208, y: 54, width: 136, height: 44, fontSize: 30, align: 'center', color: '#f3ecd6' },
    { type: 'text', source: 'track.title', x: 66, y: 138, width: 248, height: 22, fontSize: 15, color: '#eef2f5' },
    { type: 'text', source: 'track.artist', x: 66, y: 160, width: 248, height: 18, fontSize: 12, color: '#ff6b60' },
    { type: 'text', source: 'player.status', x: 24, y: 294, width: 200, height: 16, fontSize: 10, color: '#a9b4be' },
    { type: 'time', source: 'duration', x: 276, y: 294, width: 80, height: 16, fontSize: 11, align: 'right', color: '#a9b4be' },
    { type: 'seekbar', x: 24, y: 318, width: 332, height: 8 },
    { type: 'volume', x: 172, y: 444, width: 128, height: 8 },
    { type: 'playlist', x: 28, y: 480, width: 324, height: 142 },
  ],
  spinners: [smallHub('hub-left', 140, 203), smallHub('hub-right', 232, 203)],
};

// ---- "Ferro": one big black cassette with white hubs

const ferro = {
  folder: 'ferro',
  manifest: {
    id: 'io.github.krocon.ferro',
    name: 'Ferro',
    description: 'One big black cassette: ribbed shell, white hubs and a number in pale blue.',
    theme: {
      background: '#1b1b1c', surface: '#101011', surfaceRaised: '#2e2e30', foreground: '#f3f3f0', muted: '#b1b1ad',
      accent: '#7dbdff', accentContrast: '#06121f', border: '#000000', ok: '#7fdca0', danger: '#ff9d94', focus: '#ffd166',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif', radius: 3,
    },
  },
  width: 400,
  height: 570,
  pad: 2,
  css: `
    body { background: linear-gradient(#232324, #161617); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .shell { position: absolute; left: 14px; top: 14px; width: 372px; height: 240px; border-radius: 9px;
      background: repeating-linear-gradient(45deg, rgba(255,255,255,.035) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, rgba(255,255,255,.035) 0 1px, transparent 1px 4px), linear-gradient(#262627, #171718);
      box-shadow: 0 4px 8px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.22), inset 0 0 0 1px #000; }
    .paper { position: absolute; left: 18px; top: 14px; width: 336px; height: 30px; border-radius: 3px 3px 0 0; background: #f3f3f0;
      background-image: repeating-linear-gradient(#0000 0 13px, rgba(0,0,0,.35) 13px 14px); background-position: 46px 0; background-size: 280px 100%; background-repeat: no-repeat; }
    .paper::before { content: 'SIDE A'; position: absolute; left: 8px; top: 4px; font-size: 8px; font-weight: 700; letter-spacing: .1em; color: #1b1b1c; }
    .band { position: absolute; left: 18px; top: 44px; width: 336px; height: 54px; background: #101011; }
    .eye { position: absolute; top: 112px; width: 60px; height: 50px; border-radius: 12px; background: #f3f3f0; box-shadow: inset 0 0 0 1px #000; }
    .mid { position: absolute; left: 150px; top: 118px; width: 72px; height: 38px; border-radius: 4px; background: linear-gradient(90deg, #3a2417 0 55%, #f3f3f0 55% 75%, #1b1b1c 75%); box-shadow: inset 0 2px 4px #000, 0 0 0 1px #000; }
    .type { position: absolute; left: 22px; top: 176px; font-size: 21px; letter-spacing: .02em; color: #9d9d99; }
    .type b { font-weight: 800; color: #d4d4d0; }
    .num { position: absolute; right: 22px; top: 170px; font-size: 30px; font-weight: 300; color: #7dbdff; }
    .foot { position: absolute; left: 70px; bottom: 0; width: 232px; height: 30px; background: #111112; clip-path: polygon(6% 0, 94% 0, 100% 100%, 0 100%); }
    .foot::after { content: ''; position: absolute; left: 36px; top: 10px; width: 160px; height: 10px; background: radial-gradient(circle, #f3f3f0 3.5px, transparent 4px) 0 0 / 40px 10px; }
    .slot { position: absolute; border-radius: 7px; background: #0b0b0c; box-shadow: inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,.1); }
    .well { position: absolute; border-radius: 4px; background: #101011; box-shadow: inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.1); }
    .cog { position: absolute; inset: 0; border-radius: 50%; background: #f3f3f0; box-shadow: inset 0 0 0 4px #f3f3f0, inset 0 0 0 10px #1b1b1c, 0 0 0 1px #000; }
    .cog i { position: absolute; left: 16px; top: 3px; width: 4px; height: 30px; background: linear-gradient(#f3f3f0 0 8px, transparent 8px 22px, #f3f3f0 22px); }
    .cog i:nth-child(2) { transform: rotate(60deg); } .cog i:nth-child(3) { transform: rotate(120deg); }
    .face { color: #f3f3f0; }
    .face svg { width: 20px; height: 20px; }
    .bar { border-radius: 4px; background: linear-gradient(#323234, #1d1d1e); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.16); }
    .mini { border-radius: 4px; color: #b1b1ad; }
    .mini svg { width: 18px; height: 18px; }
    .hover .bar { background: linear-gradient(#434346, #262627); }
    .hover .mini { color: #fff; background: rgba(255,255,255,.07); }
    .pressed .bar { background: linear-gradient(#1d1d1e, #262627); box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.7); }
    .pressed .mini { color: #fff; background: rgba(0,0,0,.4); }
    .active .bar { color: #7dbdff; box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.16), inset 0 -3px 0 #7dbdff; }
    .active .mini { color: #7dbdff; box-shadow: inset 0 -2px 0 #7dbdff; }
  `,
  art: `
    <div class="shell">
      <div class="paper"></div><div class="band"></div>
      <div class="eye" style="left:84px"></div><div class="eye" style="left:228px"></div><div class="mid"></div>
      <div class="type"><b>FLAC</b> Fe·I lossless</div><div class="num">90</div>
      <div class="foot"></div>
    </div>
    <div class="slot" style="left:14px;top:285px;width:372px;height:14px"></div>
    <div class="slot" style="left:168px;top:373px;width:150px;height:14px"></div>
    <div class="well" style="left:16px;top:406px;width:368px;height:150px"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 20, 308, 72, 48, 'bar'),
    button('player.togglePlay', 'play', 92, 308, 72, 48, 'bar', PLAY),
    button('player.stop', 'stop', 164, 308, 72, 48, 'bar'),
    button('player.next', 'next', 236, 308, 72, 48, 'bar'),
    button('player.open', 'open', 308, 308, 72, 48, 'bar'),
    button('player.repeat', 'repeat', 18, 362, 46, 36, 'mini', TOGGLE),
    button('player.shuffle', 'shuffle', 64, 362, 46, 36, 'mini', TOGGLE),
    button('window.equalizer', 'equalizer', 110, 362, 46, 36, 'mini', TOGGLE),
    button('app.skins', 'skins', 336, 362, 46, 36, 'mini'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 42, y: 62, width: 240, height: 24, fontSize: 16, color: '#f3f3f0' },
    { type: 'text', source: 'track.artist', x: 42, y: 86, width: 240, height: 18, fontSize: 12, color: '#7dbdff' },
    { type: 'spectrum', x: 288, y: 66, width: 72, height: 34, color: '#7dbdff' },
    { type: 'time', source: 'position', x: 16, y: 262, width: 80, height: 18, fontSize: 13, color: '#f3f3f0' },
    { type: 'text', source: 'player.status', x: 100, y: 262, width: 200, height: 18, fontSize: 10, align: 'center', color: '#b1b1ad' },
    { type: 'time', source: 'duration', x: 304, y: 262, width: 80, height: 18, fontSize: 13, align: 'right', color: '#b1b1ad' },
    { type: 'seekbar', x: 16, y: 288, width: 368, height: 8 },
    { type: 'volume', x: 170, y: 376, width: 146, height: 8 },
    { type: 'playlist', x: 20, y: 410, width: 360, height: 142 },
  ],
  spinners: [
    { name: 'hub-left', x: 110, y: 133, width: 36, height: 36, period: 2600, html: '<div class="cog"><i></i><i></i><i></i></div>' },
    { name: 'hub-right', x: 254, y: 133, width: 36, height: 36, period: 2600, html: '<div class="cog"><i></i><i></i><i></i></div>' },
  ],
};

// ---- "Mixtape": a loud label in sky blue, white and black, written by hand

const mixtape = {
  folder: 'mixtape',
  manifest: {
    id: 'io.github.krocon.mixtape',
    name: 'Mixtape',
    description: 'A loud cassette label in sky blue, white and black, the titles written by hand.',
    theme: {
      background: '#f3efe7', surface: '#ffffff', surfaceRaised: '#ffffff', foreground: '#161616', muted: '#565656',
      accent: '#0a6a9e', accentContrast: '#ffffff', border: '#161616', ok: '#1f6b3a', danger: '#a3231b', focus: '#b83216',
      fontFamily: '"Marker Felt", "Segoe Print", "Comic Sans MS", sans-serif', fontMono: '"Marker Felt", "Segoe Print", "Comic Sans MS", sans-serif', radius: 4,
    },
  },
  width: 400,
  height: 580,
  pad: 4,
  css: `
    body { background: linear-gradient(#f7f3ec, #ebe6dc); font-family: "Helvetica Neue", "Arial Narrow", Arial, sans-serif; }
    .shell { position: absolute; left: 16px; top: 16px; width: 368px; height: 238px; border-radius: 10px; background: linear-gradient(#f1ebdf, #dfd8c9);
      box-shadow: 0 4px 8px rgba(60,40,10,.4), inset 0 1px 0 #fff, inset 0 0 0 1px rgba(0,0,0,.3); }
    .lab { position: absolute; left: 14px; top: 12px; width: 340px; height: 184px; border-radius: 6px; background: #2bb7ea; box-shadow: inset 0 0 0 1px rgba(0,0,0,.35); }
    .white { position: absolute; left: 10px; top: 10px; width: 232px; height: 62px; border-radius: 3px; background: #fff;
      background-image: linear-gradient(#2bb7ea, #2bb7ea); background-size: 204px 1.5px; background-position: 20px 32px; background-repeat: no-repeat; }
    .white::before { content: 'A'; position: absolute; left: 5px; top: 2px; font: 800 17px "Helvetica Neue", Arial, sans-serif; color: #161616; }
    .c60 { position: absolute; right: 10px; top: 10px; width: 80px; height: 40px; background: #161616; color: #fff; font: 800 25px/40px "Helvetica Neue", Arial, sans-serif; text-align: center; letter-spacing: .02em; }
    .say { position: absolute; top: 96px; font: 800 20px/22px "Helvetica Neue", "Arial Narrow", Arial, sans-serif; color: #fff; letter-spacing: .01em; }
    .gap { position: absolute; left: 96px; top: 88px; width: 148px; height: 52px; border-radius: 6px; background: #e9e2d2; box-shadow: inset 0 0 0 1px rgba(0,0,0,.4); }
    .gap::after { content: ''; position: absolute; left: 48px; top: 10px; width: 52px; height: 26px; border-radius: 3px; background: linear-gradient(90deg, #5a2f22 0 60%, #1b1b1b 60%); box-shadow: inset 0 2px 3px rgba(0,0,0,.6); }
    .base { position: absolute; left: 0; bottom: 0; width: 340px; height: 36px; border-radius: 0 0 6px 6px; background: #161616; color: #fff; font: 800 22px/36px "Helvetica Neue", "Arial Narrow", Arial, sans-serif; padding-left: 14px; letter-spacing: .04em; }
    .base i { position: absolute; right: 14px; top: 9px; padding: 0 8px; border: 1.5px solid #fff; font: italic 700 9px/15px "Helvetica Neue", Arial, sans-serif; letter-spacing: .1em; }
    .foot { position: absolute; left: 86px; bottom: 0; width: 196px; height: 30px; background: #cfc8b8; clip-path: polygon(6% 0, 94% 0, 100% 100%, 0 100%); }
    .foot::after { content: ''; position: absolute; left: 38px; top: 10px; width: 120px; height: 10px; background: radial-gradient(circle, #161616 3.5px, transparent 4px) 0 0 / 30px 10px; }
    .slot { position: absolute; border-radius: 7px; background: #d2ccbf; box-shadow: inset 0 1px 2px rgba(0,0,0,.5), 0 1px 0 #fff; }
    .card { position: absolute; border-radius: 4px; background: #fff; box-shadow: 0 0 0 1.5px #161616, 4px 4px 0 #2bb7ea; }
    ${COG_CSS}
    .cog { background: #fff; box-shadow: inset 0 0 0 3px #fff, inset 0 0 0 8px #161616, 0 0 0 2px #161616; }
    .cog i { background: linear-gradient(#fff 0 6px, transparent 6px 18px, #fff 18px); }
    .face { color: #fff; }
    .face svg { width: 22px; height: 22px; }
    .puck { border-radius: 50%; background: #161616; box-shadow: 3px 3px 0 #2bb7ea; }
    .puck.blue { color: #161616; background: #2bb7ea; box-shadow: 0 0 0 2px #161616, 3px 3px 0 2px #161616; }
    .tag { border-radius: 4px; color: #161616; background: #fff; box-shadow: 0 0 0 1.5px #161616; }
    .tag svg { width: 17px; height: 17px; }
    .hover .puck { background: #333; }
    .hover .puck.blue { background: #5acbf2; }
    .hover .tag { background: #e3f5fc; }
    .pressed .puck { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #2bb7ea; }
    .pressed .puck.blue { transform: translate(2px, 2px); box-shadow: 0 0 0 2px #161616, 1px 1px 0 2px #161616; }
    .pressed .tag { background: #161616; color: #fff; }
    .active .puck.blue { background: #fff; }
    .active .tag { color: #fff; background: #0a6a9e; }
  `,
  art: `
    <div class="shell">
      <div class="lab"><div class="white"></div><div class="c60">C-60</div>
        <div class="say" style="left:14px">HI-FI</div><div class="gap"></div><div class="say" style="left:256px;top:86px">LOW<br>NOISE</div>
        <div class="base">LOSSLESS<i>STEREO</i></div></div>
      <div class="foot"></div>
    </div>
    <div class="slot" style="left:14px;top:285px;width:372px;height:14px"></div>
    <div class="slot" style="left:176px;top:391px;width:140px;height:14px"></div>
    <div class="card" style="left:18px;top:424px;width:360px;height:138px"></div>
  `,
  buttons: [
    button('player.open', 'open', 30, 314, 56, 56, 'puck'),
    button('player.previous', 'previous', 96, 314, 56, 56, 'puck'),
    button('player.togglePlay', 'play', 164, 306, 72, 72, 'puck blue', PLAY),
    button('player.next', 'next', 248, 314, 56, 56, 'puck'),
    button('player.stop', 'stop', 314, 314, 56, 56, 'puck'),
    button('player.repeat', 'repeat', 16, 380, 50, 38, 'tag', TOGGLE),
    button('player.shuffle', 'shuffle', 66, 380, 50, 38, 'tag', TOGGLE),
    button('window.equalizer', 'equalizer', 116, 380, 50, 38, 'tag', TOGGLE),
    button('app.skins', 'skins', 334, 380, 50, 38, 'tag'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 64, y: 40, width: 206, height: 28, fontSize: 17, color: '#161616' },
    { type: 'text', source: 'track.artist', x: 64, y: 72, width: 206, height: 24, fontSize: 14, color: '#0a6a9e' },
    { type: 'time', source: 'position', x: 16, y: 262, width: 80, height: 20, fontSize: 15, color: '#161616' },
    { type: 'text', source: 'player.status', x: 96, y: 262, width: 100, height: 20, fontSize: 11, color: '#565656' },
    { type: 'spectrum', x: 200, y: 262, width: 100, height: 18, color: '#0a6a9e' },
    { type: 'time', source: 'duration', x: 304, y: 262, width: 80, height: 20, fontSize: 15, align: 'right', color: '#565656' },
    { type: 'seekbar', x: 16, y: 288, width: 368, height: 8 },
    { type: 'volume', x: 178, y: 394, width: 136, height: 8 },
    { type: 'playlist', x: 22, y: 428, width: 352, height: 130 },
  ],
  spinners: [smallHub('hub-left', 136, 128), smallHub('hub-right', 222, 128)],
};

// ---- "System": white marks on black, one reel that turns, one green light

const systemSkin = {
  folder: 'system',
  manifest: {
    id: 'io.github.krocon.system',
    name: 'System',
    description: 'White marks on black: dots, hairlines, a reel that turns and a single green light.',
    theme: {
      background: '#0c0c0c', surface: '#000000', surfaceRaised: '#1f1f1f', foreground: '#f5f5f5', muted: '#a9a9a9',
      accent: '#49e58f', accentContrast: '#00210e', border: '#5c5c5c', ok: '#49e58f', danger: '#ff8f85', focus: '#7fc4ff',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif', radius: 1,
    },
  },
  width: 380,
  height: 610,
  pad: 5,
  css: `
    body { background: #0c0c0c; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .word { position: absolute; left: 24px; top: 18px; font-size: 12px; font-weight: 700; color: #f5f5f5; letter-spacing: .01em; }
    .dots { position: absolute; height: 8px; background: radial-gradient(circle, #f5f5f5 2.6px, transparent 3px) 0 0 / 14px 8px; }
    .line { position: absolute; height: 1px; background: #f5f5f5; opacity: .5; }
    .scale { position: absolute; left: 24px; top: 190px; width: 10px; height: 60px; border: 1px solid #f5f5f5;
      background: linear-gradient(#ff5a4f 0 30%, transparent 30%), repeating-linear-gradient(#0000 0 4px, #f5f5f5 4px 5px); }
    .seat { position: absolute; left: 196px; top: 92px; width: 164px; height: 164px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(245,245,245,.5); }
    .led { position: absolute; width: 7px; height: 7px; border-radius: 50%; }
    .frame { position: absolute; background: #000; box-shadow: inset 0 0 0 1px #5c5c5c; }
    .wheel { position: absolute; inset: 6px; border-radius: 50%; border: 9px solid #f5f5f5;
      background: radial-gradient(circle, #0c0c0c 0 5px, #f5f5f5 5px 22px, transparent 22px); }
    .wheel b { position: absolute; left: 50%; top: 50%; width: 22px; height: 67px; margin-left: -11px; transform-origin: 50% 0; background: #f5f5f5; }
    .face { color: #f5f5f5; }
    .face svg { width: 18px; height: 18px; }
    .dot { border-radius: 50%; box-shadow: inset 0 0 0 1.5px #f5f5f5; }
    .dot.full { color: #0c0c0c; background: #f5f5f5; }
    .dot.full svg { width: 22px; height: 22px; }
    .hover .dot { background: #2a2a2a; }
    .hover .dot.full { background: #fff; box-shadow: 0 0 0 3px #0c0c0c, 0 0 0 4.5px #f5f5f5; }
    .pressed .dot { color: #0c0c0c; background: #f5f5f5; }
    .pressed .dot.full { background: #a9a9a9; }
    .active .dot { color: #49e58f; box-shadow: inset 0 0 0 1.5px #49e58f; }
    .active .dot.full { color: #00210e; background: #49e58f; box-shadow: 0 0 10px 1px rgba(73,229,143,.6); }
  `,
  art: `
    <div class="word">systems</div>
    <div class="dots" style="left:250px;top:22px;width:56px"></div>
    <div class="led" style="left:320px;top:22px;background:#49e58f"></div><div class="led" style="left:334px;top:22px;background:#f5f5f5"></div><div class="led" style="left:348px;top:22px;background:#ff5a4f"></div>
    <div class="line" style="left:24px;top:40px;width:332px"></div>
    <div class="scale"></div>
    <div class="seat"></div>
    <div class="dots" style="left:24px;top:262px;width:112px"></div>
    <div class="line" style="left:24px;top:352px;width:332px;opacity:.25"></div>
    <div class="frame" style="left:24px;top:418px;width:332px;height:174px"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 22, 292, 54, 54, 'dot'),
    button('player.togglePlay', 'play', 86, 292, 54, 54, 'dot full', PLAY),
    button('player.stop', 'stop', 150, 292, 54, 54, 'dot'),
    button('player.next', 'next', 214, 292, 54, 54, 'dot'),
    button('player.open', 'open', 278, 292, 54, 54, 'dot'),
    button('player.repeat', 'repeat', 22, 362, 46, 46, 'dot', TOGGLE),
    button('player.shuffle', 'shuffle', 68, 362, 46, 46, 'dot', TOGGLE),
    button('window.equalizer', 'equalizer', 114, 362, 46, 46, 'dot', TOGGLE),
    button('app.skins', 'skins', 312, 362, 46, 46, 'dot'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 24, y: 50, width: 332, height: 22, fontSize: 15, color: '#f5f5f5' },
    { type: 'text', source: 'track.artist', x: 24, y: 72, width: 332, height: 16, fontSize: 11, color: '#a9a9a9' },
    { type: 'time', source: 'position', x: 24, y: 104, width: 160, height: 56, fontSize: 44, color: '#f5f5f5' },
    { type: 'text', source: 'player.status', x: 24, y: 162, width: 100, height: 14, fontSize: 10, color: '#49e58f' },
    { type: 'time', source: 'duration', x: 104, y: 162, width: 80, height: 14, fontSize: 10, align: 'right', color: '#a9a9a9' },
    { type: 'spectrum', x: 44, y: 190, width: 140, height: 60, color: '#f5f5f5' },
    { type: 'seekbar', x: 24, y: 276, width: 332, height: 6 },
    { type: 'volume', x: 172, y: 382, width: 130, height: 6 },
    { type: 'playlist', x: 28, y: 422, width: 324, height: 166 },
  ],
  spinners: [
    { name: 'wheel', x: 196, y: 92, width: 164, height: 164, period: 3000, html: '<div class="wheel"><b></b><b style="transform:rotate(120deg)"></b><b style="transform:rotate(240deg)"></b></div>' },
  ],
};

// ---- "Console": matt grey, keys you press into the surface, small lights above them

const consoleSkin = {
  folder: 'console',
  manifest: {
    id: 'io.github.krocon.console',
    name: 'Console',
    description: 'Matt grey with hollow keys you press into the surface, small lights and one red key.',
    theme: {
      background: '#c5c7c9', surface: '#d7d9db', surfaceRaised: '#e7e9eb', foreground: '#1b1d1f', muted: '#44484c',
      accent: '#00513f', accentContrast: '#ffffff', border: '#8b8e91', ok: '#0b5a2b', danger: '#8f1d16', focus: '#1f5fbf',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif', radius: 4,
    },
  },
  width: 400,
  height: 580,
  pad: 5,
  css: `
    body { background: linear-gradient(160deg, #ccced0, #bbbdbf); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .lcd { position: absolute; border-radius: 6px; background: #d7d9db; box-shadow: inset 0 2px 5px rgba(0,0,0,.4), inset 0 0 0 1px rgba(0,0,0,.25), 0 1px 0 rgba(255,255,255,.7); }
    .slot { position: absolute; border-radius: 7px; background: #a9acae; box-shadow: inset 0 1px 2px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.7); }
    .rail { position: absolute; left: 22px; top: 262px; width: 356px; height: 66px; border-radius: 8px; background: #2a2c2e; box-shadow: inset 0 2px 4px #000, 0 1px 0 rgba(255,255,255,.7); }
    .grill { position: absolute; width: 18px; height: 18px; background: radial-gradient(circle, #44484c 1.6px, transparent 2px) 0 0 / 6px 6px; }
    .tiny { position: absolute; font-size: 8px; letter-spacing: .06em; color: #44484c; text-align: center; white-space: nowrap; }
    .face { color: #2a2c2e; }
    .face svg { width: 22px; height: 22px; }
    .bowl { border-radius: 50%; top: 18px !important; background: linear-gradient(160deg, #a9acae, #e9ebed);
      box-shadow: 0 0 0 3px #d2d4d6, 0 0 0 4px #8b8e91, 0 4px 6px rgba(0,0,0,.3), inset 0 3px 6px rgba(0,0,0,.25); }
    .bowl::before { content: ''; position: absolute; left: 50%; top: -15px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: #5a5e62; }
    .cell { border-radius: 5px; background: linear-gradient(160deg, #b3b6b8, #e3e5e7); box-shadow: 0 0 0 1px #17181a, inset 0 3px 5px rgba(0,0,0,.22); }
    .cell.red { color: #fff; background: linear-gradient(160deg, #c22a20, #ee5a4d); }
    .hover .bowl, .hover .cell { background: linear-gradient(160deg, #b7babc, #f5f7f9); }
    .hover .cell.red { background: linear-gradient(160deg, #d2382d, #f77467); }
    .pressed .bowl { background: linear-gradient(160deg, #94979a, #cfd1d3); box-shadow: 0 0 0 3px #d2d4d6, 0 0 0 4px #8b8e91, inset 0 5px 9px rgba(0,0,0,.4); }
    .pressed .cell { background: linear-gradient(160deg, #94979a, #cfd1d3); box-shadow: 0 0 0 1px #17181a, inset 0 5px 8px rgba(0,0,0,.4); }
    .pressed .cell.red { background: linear-gradient(160deg, #9d1f17, #cf453a); }
    .active .bowl::before { background: #19e0b6; box-shadow: 0 0 6px 2px rgba(25,224,182,.8); }
    .active .bowl { color: #00513f; }
    .active .cell { color: #00513f; background: linear-gradient(160deg, #9fd9cc, #d9f3ee); box-shadow: 0 0 0 1px #17181a, inset 0 3px 5px rgba(0,0,0,.22), inset 0 -3px 0 #19e0b6; }
  `,
  art: `
    <div class="lcd" style="left:22px;top:18px;width:356px;height:100px"></div>
    <div class="slot" style="left:22px;top:129px;width:356px;height:14px"></div>
    <div class="rail"></div>
    <div class="tiny" style="left:22px;top:332px;width:70px">repeat</div><div class="tiny" style="left:93px;top:332px;width:70px">shuffle</div><div class="tiny" style="left:164px;top:332px;width:70px">eq</div><div class="tiny" style="left:235px;top:332px;width:70px">skin</div><div class="tiny" style="left:306px;top:332px;width:70px">stop</div>
    <div class="grill" style="left:24px;top:352px"></div><div class="tiny" style="left:48px;top:356px">volume</div>
    <div class="slot" style="left:96px;top:353px;width:282px;height:14px"></div>
    <div class="lcd" style="left:22px;top:380px;width:356px;height:184px"></div>
  `,
  buttons: [
    button('player.previous', 'previous', 24, 150, 88, 106, 'bowl'),
    button('player.togglePlay', 'play', 112, 150, 88, 106, 'bowl', PLAY),
    button('player.next', 'next', 200, 150, 88, 106, 'bowl'),
    button('player.open', 'open', 288, 150, 88, 106, 'bowl'),
    button('player.repeat', 'repeat', 23, 264, 71, 62, 'cell', TOGGLE),
    button('player.shuffle', 'shuffle', 94, 264, 71, 62, 'cell', TOGGLE),
    button('window.equalizer', 'equalizer', 165, 264, 71, 62, 'cell', TOGGLE),
    button('app.skins', 'skins', 236, 264, 71, 62, 'cell'),
    button('player.stop', 'stop', 307, 264, 70, 62, 'cell red'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 36, y: 26, width: 328, height: 24, fontSize: 16, color: '#1b1d1f' },
    { type: 'text', source: 'track.artist', x: 36, y: 50, width: 328, height: 18, fontSize: 12, color: '#44484c' },
    { type: 'time', source: 'position', x: 36, y: 72, width: 96, height: 38, fontSize: 28, color: '#1b1d1f' },
    { type: 'spectrum', x: 140, y: 78, width: 130, height: 28, color: '#00513f' },
    { type: 'text', source: 'player.status', x: 276, y: 78, width: 88, height: 14, fontSize: 10, align: 'right', color: '#00513f' },
    { type: 'time', source: 'duration', x: 276, y: 94, width: 88, height: 14, fontSize: 11, align: 'right', color: '#44484c' },
    { type: 'seekbar', x: 24, y: 132, width: 352, height: 8 },
    { type: 'volume', x: 98, y: 356, width: 278, height: 8 },
    { type: 'playlist', x: 26, y: 384, width: 348, height: 176 },
  ],
};

// ---- "Dial": one big turned knob; its mark shows the position and turning it seeks

const dial = {
  folder: 'dial',
  manifest: {
    id: 'io.github.krocon.dial',
    name: 'Dial',
    description: 'One big turned aluminium knob: its green mark shows the position, turning it seeks.',
    theme: {
      background: '#e3e4e5', surface: '#f3f4f5', surfaceRaised: '#ffffff', foreground: '#1c1d1f', muted: '#54575a',
      accent: '#256b0c', accentContrast: '#ffffff', border: '#a5a7a9', ok: '#256b0c', danger: '#a3231b', focus: '#1f5fbf',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontMono: '"Helvetica Neue", Helvetica, Arial, sans-serif', radius: 3,
    },
  },
  width: 360,
  height: 680,
  pad: 5,
  css: `
    body { background: linear-gradient(#f0f1f2, #d9dadb); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .seat { position: absolute; left: 56px; top: 116px; width: 248px; height: 248px; border-radius: 50%; background: linear-gradient(#d2d3d4, #f6f7f8);
      box-shadow: inset 0 2px 5px rgba(0,0,0,.25), 0 1px 0 #fff; }
    .ticks { position: absolute; left: 40px; top: 100px; width: 280px; height: 280px; border-radius: 50%;
      background: repeating-conic-gradient(from 220deg, #54575a 0 .8deg, transparent .8deg 10deg);
      -webkit-mask-image: radial-gradient(circle, transparent 0 131px, #000 131px 138px, transparent 138px), conic-gradient(from 219deg, #000 0 282deg, transparent 282deg); -webkit-mask-composite: source-in; }
    .sign { position: absolute; top: 352px; font-size: 14px; color: #54575a; }
    .shade { position: absolute; left: 70px; top: 136px; width: 220px; height: 220px; border-radius: 50%; box-shadow: 0 12px 16px rgba(0,0,0,.3), 0 2px 3px rgba(0,0,0,.35); }
    .slot { position: absolute; border-radius: 7px; background: #c9cacb; box-shadow: inset 0 1px 2px rgba(0,0,0,.45), 0 1px 0 #fff; }
    .sheet { position: absolute; border-radius: 3px; background: #f3f4f5; box-shadow: inset 0 0 0 1px #a5a7a9; }
    .cap { position: absolute; font-size: 8px; letter-spacing: .08em; color: #54575a; white-space: nowrap; }
    .turn { position: absolute; inset: 0; border-radius: 50%;
      background: conic-gradient(from 0deg, #fdfdfd, #b9bbbd 12%, #f4f5f6 25%, #aeb0b2 37%, #fdfdfd 50%, #b9bbbd 62%, #f4f5f6 75%, #aeb0b2 87%, #fdfdfd);
      box-shadow: inset 0 0 0 1px #8f9193, inset 0 0 0 7px rgba(255,255,255,.35), inset 0 0 0 8px rgba(0,0,0,.12); }
    .turn::after { content: ''; position: absolute; left: 50%; top: 12px; width: 6px; height: 34px; margin-left: -3px; border-radius: 3px; background: #4fb81f; box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
    .face { color: #1c1d1f; }
    .face svg { width: 18px; height: 18px; }
    .pad { border-radius: 50%; background: linear-gradient(#ffffff, #dcddde); box-shadow: 0 0 0 1px #9c9ea0, 0 2px 3px rgba(0,0,0,.2); }
    .pad.dark { color: #fff; background: linear-gradient(#3c3e40, #1c1d1f); box-shadow: 0 0 0 1px #000, 0 2px 3px rgba(0,0,0,.3); }
    .pad.dark svg { width: 24px; height: 24px; }
    .hover .pad { background: linear-gradient(#fff, #ebeced); }
    .hover .pad.dark { background: linear-gradient(#4e5052, #26272a); }
    .pressed .pad { background: linear-gradient(#d0d1d2, #e6e7e8); box-shadow: 0 0 0 1px #9c9ea0, inset 0 2px 4px rgba(0,0,0,.3); }
    .pressed .pad.dark { background: linear-gradient(#1c1d1f, #2c2d30); box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.7); }
    .active .pad { color: #256b0c; box-shadow: 0 0 0 1px #256b0c, 0 0 0 3px rgba(79,184,31,.45); }
    .active .pad.dark { color: #7fe24d; box-shadow: 0 0 0 1px #000, 0 0 0 3px #4fb81f; }
  `,
  art: `
    <div class="ticks"></div><div class="seat"></div><div class="shade"></div>
    <div class="sign" style="left:66px">–</div><div class="sign" style="right:66px">+</div>
    <div class="cap" style="left:118px;top:473px">volume</div>
    <div class="slot" style="left:116px;top:485px;width:128px;height:14px"></div>
    <div class="sheet" style="left:22px;top:516px;width:316px;height:148px"></div>
  `,
  buttons: [
    button('player.open', 'open', 26, 408, 52, 52, 'pad'),
    button('player.previous', 'previous', 84, 408, 52, 52, 'pad'),
    button('player.togglePlay', 'play', 144, 398, 72, 72, 'pad dark', PLAY),
    button('player.next', 'next', 224, 408, 52, 52, 'pad'),
    button('player.stop', 'stop', 282, 408, 52, 52, 'pad'),
    button('player.repeat', 'repeat', 20, 468, 46, 46, 'pad', TOGGLE),
    button('player.shuffle', 'shuffle', 66, 468, 46, 46, 'pad', TOGGLE),
    button('window.equalizer', 'equalizer', 248, 468, 46, 46, 'pad', TOGGLE),
    button('app.skins', 'skins', 294, 468, 46, 46, 'pad'),
  ],
  components: [
    { type: 'time', source: 'position', x: 24, y: 14, width: 312, height: 44, fontSize: 34, align: 'center', color: '#1c1d1f' },
    { type: 'text', source: 'track.title', x: 24, y: 60, width: 312, height: 22, fontSize: 15, align: 'center', color: '#1c1d1f' },
    { type: 'text', source: 'track.artist', x: 24, y: 82, width: 312, height: 16, fontSize: 11, align: 'center', color: '#54575a' },
    { type: 'text', source: 'player.status', x: 24, y: 376, width: 90, height: 16, fontSize: 10, color: '#256b0c' },
    { type: 'spectrum', x: 120, y: 374, width: 120, height: 18, color: '#256b0c' },
    { type: 'time', source: 'duration', x: 246, y: 376, width: 90, height: 16, fontSize: 11, align: 'right', color: '#54575a' },
    { type: 'volume', x: 118, y: 488, width: 124, height: 8 },
    { type: 'playlist', x: 26, y: 520, width: 308, height: 140 },
  ],
  needles: [
    { name: 'knob', x: 70, y: 130, width: 220, height: 220, pivotX: 110, pivotY: 110, from: -140, to: 140, rest: -140, html: '<div class="turn"></div>' },
  ],
};

// ---------------------------------------------------------------- a kit for the lower half
//
// Many skins differ in their face and share the order below it: seek bar, five transport keys,
// three switches with the volume and the skin key, the track list. `lower` lays that out from
// a height `y` down; the skin gives the looks.

const STATES = `
    .hover .face { filter: brightness(1.12); }
    .pressed .face { filter: brightness(.84); }
    .pressed .face svg { transform: translateY(1px); }`;

/** Slots for the sliders and the bed of the track list, for a light or a dark skin. */
const beds = (slot, well, light) => `
    .slot { position: absolute; border-radius: 7px; background: ${slot};
      box-shadow: inset 0 1px 2px rgba(0,0,0,${light ? 0.45 : 0.9}), 0 1px 0 rgba(255,255,255,${light ? 0.8 : 0.1}); }
    .well { position: absolute; border-radius: 4px; background: ${well};
      box-shadow: ${light ? 'inset 0 0 0 1px rgba(0,0,0,.28)' : 'inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.1)'}; }`;

function lower({ width, y, margin = 24, look, playLook = look, toggleLook = look, big = 72, mid = 56, toggle = [46, 38], list = 150, seek = true }) {
  const inner = width - 2 * margin;
  const rowY = seek ? y + 24 : y;
  const start = Math.round((width - 4 * mid - big) / 2);
  const midY = rowY + (big - mid) / 2;
  const [tw, th] = toggle;
  const toggleY = rowY + big + 8;
  const volumeX = margin + 3 * tw + 12;
  const volumeWidth = width - margin - 2 * tw - 10 - volumeX;
  const volumeY = toggleY + Math.round(th / 2) - 4;
  const listY = toggleY + th + 10;
  return {
    height: listY + list + 14,
    resize: { stretchY: listY + Math.round(list / 2) },
    art: `
      ${seek ? `<div class="slot" style="left:${margin - 2}px;top:${y}px;width:${inner + 4}px;height:14px"></div>` : ''}
      <div class="slot" style="left:${volumeX - 2}px;top:${volumeY - 3}px;width:${volumeWidth + 4}px;height:14px"></div>
      <div class="well" style="left:${margin}px;top:${listY}px;width:${inner}px;height:${list}px"></div>`,
    buttons: [
      button('player.open', 'open', start, midY, mid, mid, look),
      button('player.previous', 'previous', start + mid, midY, mid, mid, look),
      button('player.togglePlay', 'play', start + 2 * mid, rowY, big, big, playLook, PLAY),
      button('player.next', 'next', start + 2 * mid + big, midY, mid, mid, look),
      button('player.stop', 'stop', start + 3 * mid + big, midY, mid, mid, look),
      button('player.repeat', 'repeat', margin - 2, toggleY, tw, th, toggleLook, TOGGLE),
      button('player.shuffle', 'shuffle', margin - 2 + tw, toggleY, tw, th, toggleLook, TOGGLE),
      button('window.equalizer', 'equalizer', margin - 2 + 2 * tw, toggleY, tw, th, toggleLook, TOGGLE),
      button('app.playlist', 'list', width - margin - 2 * tw + 2, toggleY, tw, th, toggleLook, TOGGLE),
      button('app.skins', 'skins', width - margin - tw + 2, toggleY, tw, th, toggleLook),
    ],
    components: [
      ...(seek ? [{ type: 'seekbar', x: margin, y: y + 3, width: inner, height: 8 }] : []),
      { type: 'volume', x: volumeX, y: volumeY, width: volumeWidth, height: 8 },
      { type: 'playlist', x: margin + 4, y: listY + 4, width: inner - 8, height: list - 8 },
    ],
  };
}

/** The usual lines of a display in a box `w` wide and about 100 high. */
const display = (x, y, w, c) => [
  { type: 'text', source: 'track.title', x, y, width: w, height: 22, fontSize: 16, color: c.title },
  { type: 'text', source: 'track.artist', x, y: y + 23, width: w, height: 16, fontSize: 12, color: c.artist },
  { type: 'time', source: 'position', x, y: y + 46, width: 100, height: 38, fontSize: 28, color: c.time },
  { type: 'spectrum', x: x + 108, y: y + 52, width: w - 198, height: 28, color: c.bars },
  { type: 'text', source: 'player.status', x: x + w - 84, y: y + 52, width: 84, height: 14, fontSize: 10, align: 'right', color: c.artist },
  { type: 'time', source: 'duration', x: x + w - 84, y: y + 68, width: 84, height: 14, fontSize: 11, align: 'right', color: c.muted },
];

const theme = (colours, fontFamily, radius = 3, fontMono = fontFamily) => ({ ...colours, fontFamily, fontMono, radius });
const HELVETICA = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const skin = (folder, name, description, keywords, more) => ({
  folder,
  manifest: { id: `io.github.krocon.${folder}`, name, description, theme: more.theme },
  keywords,
  pad: 4,
  ...more,
});

// ---- "Pocket": a pocket calculator that plays music

const pocketLow = lower({ width: 340, y: 136, look: 'key', playLook: 'key red', toggleLook: 'key green', big: 64, mid: 54, toggle: [46, 46], list: 150 });
const pocket = skin('pocket', 'Pocket', 'A white pocket calculator that plays music: a slanted display and round keys in three colours.', ['calculator', 'light', 'minimal', 'white', 'round keys'], {
  theme: theme({ background: '#f1f1ee', surface: '#dfe5da', surfaceRaised: '#ffffff', foreground: '#1b201c', muted: '#4d564f', accent: '#9c2b1e', accentContrast: '#ffffff', border: '#9aa39b', ok: '#1f6b3a', danger: '#9c2b1e', focus: '#1f5fbf' }, HELVETICA, 3, '"Menlo", "Consolas", monospace'),
  width: 340,
  height: pocketLow.height,
  resize: pocketLow.resize,
  css: `
    body { background: linear-gradient(170deg, #fafaf8, #e9e9e5); box-shadow: inset 0 0 0 1px #c9c9c4, inset 0 2px 0 #fff; font-family: ${HELVETICA}; }
    .bezel { position: absolute; left: 22px; top: 22px; width: 296px; height: 104px; border-radius: 6px; background: linear-gradient(#d9d9d5, #f4f4f1); box-shadow: inset 0 1px 3px rgba(0,0,0,.35), 0 1px 0 #fff; }
    .lcd { position: absolute; left: 10px; top: 10px; right: 10px; bottom: 10px; border-radius: 3px; background: linear-gradient(#d6ddd1, #e6ebe1); box-shadow: inset 0 2px 5px rgba(0,0,0,.4), inset 0 0 0 1px rgba(0,0,0,.35); }
    ${beds('#cfcfca', '#dfe5da', true)}
    .face { color: #fff; } .face svg { width: 42%; height: 42%; }
    .key { border-radius: 50%; background: radial-gradient(circle at 40% 30%, #5c6862, #2f3a35 75%); box-shadow: 0 2px 3px rgba(0,0,0,.35), 0 0 0 1px #1d2521, inset 0 1px 0 rgba(255,255,255,.3); }
    .key.red { background: radial-gradient(circle at 40% 30%, #e0503f, #a3261a 75%); box-shadow: 0 2px 3px rgba(0,0,0,.35), 0 0 0 1px #6d150d, inset 0 1px 0 rgba(255,255,255,.4); }
    .key.green { background: radial-gradient(circle at 40% 30%, #6f9a84, #3d6551 75%); box-shadow: 0 2px 3px rgba(0,0,0,.35), 0 0 0 1px #24402f, inset 0 1px 0 rgba(255,255,255,.3); }
    .key.green svg { width: 18px; height: 18px; }
    ${STATES}
    .pressed .key { box-shadow: 0 0 0 1px #1d2521, inset 0 2px 4px rgba(0,0,0,.6); }
    .active .key.red { box-shadow: 0 0 0 1px #6d150d, 0 0 0 3px #f1f1ee, 0 0 0 4.5px #c0392b, inset 0 1px 0 rgba(255,255,255,.4); }
    .active .key.green { background: radial-gradient(circle at 40% 30%, #f6f6f3, #cfd6cf 75%); color: #24402f; box-shadow: 0 0 0 1px #24402f, inset 0 2px 3px rgba(0,0,0,.25); }
  `,
  art: `<div class="bezel"><div class="lcd"></div></div>${pocketLow.art}`,
  buttons: pocketLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 42, y: 38, width: 256, height: 18, fontSize: 13, color: '#1b201c' },
    { type: 'text', source: 'track.artist', x: 42, y: 56, width: 150, height: 14, fontSize: 10, color: '#4d564f' },
    { type: 'spectrum', x: 42, y: 76, width: 110, height: 30, color: '#4d564f' },
    { type: 'text', source: 'player.status', x: 200, y: 56, width: 98, height: 14, fontSize: 10, align: 'right', color: '#9c2b1e' },
    { type: 'time', source: 'position', x: 160, y: 70, width: 138, height: 40, fontSize: 32, align: 'right', color: '#1b201c' },
    ...pocketLow.components,
  ],
});

// ---- "Beat": a drum machine, warm dark rubber and one pad that glows

const beatLow = lower({ width: 380, y: 140, look: 'rubber', playLook: 'pad', toggleLook: 'rubber', big: 84, mid: 56, toggle: [46, 40], list: 150 });
const beat = skin('beat', 'Beat', 'A drum machine in warm dark rubber, with one pad that glows pink while the music plays.', ['drum machine', 'dark', 'pink', 'rubber', 'glow'], {
  theme: theme({ background: '#3b3835', surface: '#221f1d', surfaceRaised: '#4a4642', foreground: '#f1ece4', muted: '#b9b1a6', accent: '#ff7ab6', accentContrast: '#2a0014', border: '#151312', ok: '#7fdca0', danger: '#ffa39b', focus: '#7fc4ff' }, HELVETICA),
  width: 380,
  height: beatLow.height,
  resize: beatLow.resize,
  css: `
    body { background: radial-gradient(120% 70% at 50% 0%, #4a4642, #33302d 70%); font-family: ${HELVETICA}; }
    .screen { position: absolute; left: 22px; top: 20px; width: 336px; height: 108px; border-radius: 6px; background: linear-gradient(#1d1b19, #262321); box-shadow: inset 0 3px 8px #000, 0 1px 0 rgba(255,255,255,.12); }
    .mark { position: absolute; font-size: 7.5px; font-weight: 700; letter-spacing: .18em; color: #b9b1a6; white-space: nowrap; }
    ${beds('#1b1917', '#221f1d', false)}
    .face { color: #f1ece4; } .face svg { width: 20px; height: 20px; }
    .rubber { border-radius: 50%; background: radial-gradient(circle at 50% 22%, #57524d, #24211f 78%); box-shadow: 0 0 0 1px #121110, 0 4px 5px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.2); }
    .pad { border-radius: 50%; color: #4a1730; background: radial-gradient(circle, rgba(255,255,255,.14) 1px, transparent 1.4px) 0 0 / 6px 6px, radial-gradient(circle at 50% 35%, #7d3a57, #4a1c31 75%); box-shadow: 0 0 0 1px #121110, 0 0 0 5px #24211f, 0 0 0 6px #121110, inset 0 2px 5px rgba(0,0,0,.5); }
    .pad svg { width: 28px; height: 28px; color: #f6d5e3; }
    ${STATES}
    .pressed .rubber { box-shadow: 0 0 0 1px #121110, inset 0 3px 6px rgba(0,0,0,.7); }
    .active .rubber { color: #ff7ab6; box-shadow: 0 0 0 1px #121110, 0 4px 5px rgba(0,0,0,.5), inset 0 0 0 2px #ff7ab6; }
    .active .pad { background: radial-gradient(circle, rgba(255,255,255,.35) 1px, transparent 1.4px) 0 0 / 6px 6px, radial-gradient(circle at 50% 35%, #ffd5e8, #ff5fa5 70%);
      box-shadow: 0 0 0 1px #121110, 0 0 0 5px #24211f, 0 0 0 6px #121110, 0 0 18px 6px rgba(255,95,165,.55); }
    .active .pad svg { color: #4a0c28; }
  `,
  art: `<div class="screen"></div>${beatLow.art}`,
  buttons: beatLow.buttons,
  components: [...display(36, 28, 308, { title: '#f1ece4', artist: '#ff7ab6', time: '#f1ece4', bars: '#ff7ab6', muted: '#b9b1a6' }), ...beatLow.components],
});

// ---- "Stripe": a flat drawing, black outlines and stripes in blue and pink

const stripeLow = lower({ width: 380, y: 240, look: 'ring', playLook: 'ring full', toggleLook: 'ring', big: 68, mid: 54, toggle: [46, 46], list: 150 });
const stripe = skin('stripe', 'Stripe', 'A flat drawing: black outlines on cream, a cassette and racing stripes in blue and pink.', ['flat', 'illustration', 'light', 'stripes', 'cassette', 'blue', 'pink'], {
  theme: theme({ background: '#fbf7ef', surface: '#ffffff', surfaceRaised: '#ffffff', foreground: '#14161a', muted: '#54575e', accent: '#1f56b8', accentContrast: '#ffffff', border: '#14161a', ok: '#1f6b3a', danger: '#a3231b', focus: '#b83216' }, '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif', 10),
  width: 380,
  height: stripeLow.height,
  resize: stripeLow.resize,
  css: `
    body { background: #fbf7ef; font-family: "Avenir Next", "Helvetica Neue", sans-serif; }
    .frame { position: absolute; left: 20px; top: 18px; width: 340px; height: 210px; border-radius: 18px; background: #fff; box-shadow: inset 0 0 0 2.5px #14161a; overflow: hidden; }
    .rays { position: absolute; left: 0; top: 82px; width: 100%; height: 30px;
      background: linear-gradient(#1f56b8 0 30%, #fff 30% 38%, #7fb2f0 38% 64%, #fff 64% 72%, #f08bb0 72%); }
    .tape { position: absolute; right: 18px; bottom: 18px; width: 170px; height: 100px; border-radius: 10px; background: #fff; box-shadow: inset 0 0 0 2.5px #14161a; }
    .tape::before { content: ''; position: absolute; left: 12px; right: 12px; top: 12px; height: 16px; background: repeating-linear-gradient(#14161a 0 2.5px, transparent 2.5px 6.5px); }
    .tape::after { content: ''; position: absolute; left: 22px; right: 22px; bottom: 16px; height: 40px; border-radius: 20px; box-shadow: inset 0 0 0 2.5px #14161a; background: linear-gradient(90deg, transparent 0 42%, #14161a 42% 58%, transparent 58%); }
    ${beds('#fff', '#fff', true)}
    .slot { box-shadow: inset 0 0 0 2px #14161a; } .well { border-radius: 12px; box-shadow: inset 0 0 0 2.5px #14161a; }
    .cog { position: absolute; inset: 0; border-radius: 50%; background: #14161a; }
    .cog i { position: absolute; left: 11px; top: 3px; width: 6px; height: 22px; background: linear-gradient(#fff 0 5px, transparent 5px 17px, #fff 17px); }
    .cog i:nth-child(2) { transform: rotate(60deg); } .cog i:nth-child(3) { transform: rotate(120deg); }
    .face { color: #14161a; } .face svg { width: 20px; height: 20px; }
    .ring { border-radius: 50%; background: #fff; box-shadow: inset 0 0 0 2.5px #14161a; }
    .ring.full { color: #fff; background: #14161a; box-shadow: 4px 4px 0 #f08bb0; }
    .ring.full svg { width: 26px; height: 26px; }
    .hover .ring { background: #e6f0fd; } .hover .ring.full { background: #1f56b8; }
    .pressed .ring { background: #14161a; color: #fff; } .pressed .ring.full { transform: translate(3px, 3px); box-shadow: 1px 1px 0 #f08bb0; }
    .active .ring { color: #fff; background: #1f56b8; } .active .ring.full { background: #1f56b8; box-shadow: 4px 4px 0 #14161a; }
  `,
  art: `<div class="frame"><div class="rays"></div><div class="tape"></div></div>${stripeLow.art}`,
  buttons: stripeLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 36, y: 30, width: 308, height: 26, fontSize: 18, color: '#14161a' },
    { type: 'text', source: 'track.artist', x: 36, y: 56, width: 200, height: 18, fontSize: 12, color: '#1f56b8' },
    { type: 'time', source: 'position', x: 36, y: 180, width: 80, height: 30, fontSize: 22, color: '#14161a' },
    { type: 'text', source: 'player.status', x: 36, y: 164, width: 100, height: 14, fontSize: 10, color: '#54575e' },
    { type: 'time', source: 'duration', x: 116, y: 190, width: 46, height: 16, fontSize: 11, color: '#54575e' },
    { type: 'spectrum', x: 36, y: 122, width: 100, height: 34, color: '#14161a' },
    ...stripeLow.components,
  ],
  spinners: [
    { name: 'hub-left', x: 202, y: 164, width: 28, height: 28, period: 2600, html: '<div class="cog"><i></i><i></i><i></i></div>' },
    { name: 'hub-right', x: 292, y: 164, width: 28, height: 28, period: 2600, html: '<div class="cog"><i></i><i></i><i></i></div>' },
  ],
});

// ---- "Amp": a black amplifier, white print, white keys and a green lamp

const ampLow = lower({ width: 360, y: 150, look: 'oval', playLook: 'lamp', toggleLook: 'stud', big: 68, mid: 56, toggle: [46, 42], list: 150 });
const amp = skin('amp', 'Amp', 'A matt black amplifier with white print, white oval keys and a green lamp for play.', ['amplifier', 'black', 'dark', 'minimal', 'green', 'sixties'], {
  theme: theme({ background: '#1c1c1c', surface: '#0f0f0f', surfaceRaised: '#303030', foreground: '#f2f2f0', muted: '#adadaa', accent: '#6fe0a0', accentContrast: '#00210e', border: '#4a4a4a', ok: '#6fe0a0', danger: '#ff9d94', focus: '#7fc4ff' }, HELVETICA, 2),
  width: 360,
  height: ampLow.height,
  resize: ampLow.resize,
  css: `
    body { background: linear-gradient(#222, #171717); font-family: ${HELVETICA}; }
    .print { position: absolute; font-size: 9px; color: #f2f2f0; letter-spacing: .02em; white-space: nowrap; }
    .rule { position: absolute; left: 24px; width: 312px; height: 1px; background: #f2f2f0; opacity: .35; }
    .grid { position: absolute; right: 24px; top: 20px; width: 44px; height: 44px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px #f2f2f0; background: radial-gradient(circle, #f2f2f0 1.3px, transparent 1.7px) 4px 4px / 9px 9px; opacity: .8; }
    ${beds('#0a0a0a', '#0f0f0f', false)}
    .face { color: #1c1c1c; } .face svg { width: 18px; height: 18px; }
    .oval { border-radius: 46% / 50%; background: linear-gradient(160deg, #fff, #d2d2ce); box-shadow: 0 3px 4px rgba(0,0,0,.7), inset 0 -3px 5px rgba(0,0,0,.12); }
    .lamp { border-radius: 50%; color: #cfeedd; background: radial-gradient(circle at 40% 30%, #4a7d63, #1f3a2c 72%); box-shadow: 0 0 0 2px #0a0a0a, 0 0 0 3.5px #5a5a5a, inset 0 2px 4px rgba(255,255,255,.2); }
    .lamp svg { width: 24px; height: 24px; }
    .stud { border-radius: 50%; color: #f2f2f0; background: radial-gradient(circle at 40% 28%, #555, #151515 72%); box-shadow: 0 0 0 1px #000, 0 2px 3px rgba(0,0,0,.6); }
    .stud svg { width: 16px; height: 16px; }
    ${STATES}
    .pressed .oval { box-shadow: 0 1px 1px rgba(0,0,0,.7), inset 0 3px 5px rgba(0,0,0,.3); }
    .active .lamp { color: #00210e; background: radial-gradient(circle at 40% 30%, #d9ffe9, #49e58f 70%); box-shadow: 0 0 0 2px #0a0a0a, 0 0 0 3.5px #5a5a5a, 0 0 16px 4px rgba(73,229,143,.55); }
    .active .stud { color: #6fe0a0; box-shadow: 0 0 0 1px #000, 0 0 0 2.5px #49e58f; }
  `,
  art: `<div class="grid"></div><div class="rule" style="top:132px"></div>
    <div class="print" style="left:24px;top:138px">position</div>${ampLow.art}`,
  buttons: ampLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 24, y: 20, width: 256, height: 24, fontSize: 17, color: '#f2f2f0' },
    { type: 'text', source: 'track.artist', x: 24, y: 44, width: 256, height: 16, fontSize: 12, color: '#adadaa' },
    { type: 'time', source: 'position', x: 24, y: 70, width: 110, height: 44, fontSize: 34, color: '#f2f2f0' },
    { type: 'spectrum', x: 142, y: 80, width: 110, height: 30, color: '#6fe0a0' },
    { type: 'text', source: 'player.status', x: 256, y: 80, width: 80, height: 14, fontSize: 10, align: 'right', color: '#6fe0a0' },
    { type: 'time', source: 'duration', x: 256, y: 96, width: 80, height: 14, fontSize: 11, align: 'right', color: '#adadaa' },
    ...ampLow.components.map((c) => (c.type === 'seekbar' ? { ...c, y: 156 } : c)),
  ],
});
amp.art = amp.art.replace('top:150px;width:316px', 'top:153px;width:316px');

// ---- "Magnet": a silver radio recorder with a pink cassette

const magnetLow = lower({ width: 360, y: 232, look: 'chrome', playLook: 'chrome', toggleLook: 'knurl', big: 60, mid: 60, toggle: [46, 40], list: 150 });
const magnet = skin('magnet', 'Magnet', 'A silver radio recorder: a speaker grille, chrome keys in a row and a pink cassette.', ['radio recorder', 'boombox', 'silver', 'light', 'pink', 'cassette', 'eighties'], {
  theme: theme({ background: '#cfd2d6', surface: '#eceef0', surfaceRaised: '#ffffff', foreground: '#1a1c1f', muted: '#474b50', accent: '#a80f49', accentContrast: '#ffffff', border: '#7f858c', ok: '#0b5a2b', danger: '#8f1d16', focus: '#1f5fbf' }, HELVETICA),
  width: 360,
  height: magnetLow.height,
  resize: magnetLow.resize,
  pad: 1,
  css: `
    body { background: repeating-linear-gradient(0deg, rgba(255,255,255,.2) 0 .5px, rgba(0,0,0,.04) .5px 1px, transparent 1px 2.5px), linear-gradient(#e1e3e6, #b9bdc2); box-shadow: inset 0 1px 0 #fff; font-family: ${HELVETICA}; }
    .grille { position: absolute; left: 22px; top: 18px; width: 316px; height: 40px; border-radius: 4px; background: radial-gradient(circle, #1a1c1f 1.4px, transparent 1.8px) 0 0 / 6px 6px, #8d9299; box-shadow: inset 0 2px 4px rgba(0,0,0,.5), 0 1px 0 #fff; }
    .bay { position: absolute; left: 22px; top: 68px; width: 316px; height: 152px; border-radius: 6px; background: #17181a; box-shadow: inset 0 3px 8px #000, 0 1px 0 #fff; }
    .shell { position: absolute; left: 14px; top: 12px; width: 288px; height: 128px; border-radius: 6px; background: linear-gradient(#2c2d30, #1d1e20); box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 0 0 1px #000; }
    .paper { position: absolute; left: 10px; top: 8px; width: 268px; height: 50px; border-radius: 3px; background: #eceef0; }
    .pink { position: absolute; left: 10px; top: 58px; width: 268px; height: 52px; background: linear-gradient(#ff5f98 0 16%, #fff 16% 22%, #ff3f84 22% 78%, #fff 78% 84%, #ff5f98 84%); }
    .eye { position: absolute; left: 76px; top: 66px; width: 136px; height: 36px; border-radius: 18px; background: #17181a; box-shadow: inset 0 2px 4px #000; }
    ${COG_CSS}
    ${beds('#9da2a8', '#eceef0', true)}
    .face { color: #1a1c1f; } .face svg { width: 20px; height: 20px; }
    .chrome { border-radius: 2px; background: linear-gradient(#fdfdfd 0%, #c3c7cc 45%, #9ea3a9 55%, #e4e6e9 100%); box-shadow: 0 0 0 1px #4e5257, inset 0 1px 0 #fff; }
    .knurl { border-radius: 50%; color: #fff; background: repeating-conic-gradient(#3a3d41 0 6deg, #1a1c1f 6deg 12deg); box-shadow: 0 2px 3px rgba(0,0,0,.4), inset 0 0 0 5px #2a2c2f, inset 0 0 0 6px #6c7076; }
    .knurl svg { width: 15px; height: 15px; }
    ${STATES}
    .pressed .chrome { transform: translateY(2px); box-shadow: 0 0 0 1px #4e5257, inset 0 3px 5px rgba(0,0,0,.35); }
    .active .chrome { transform: translateY(2px); color: #a80f49; box-shadow: 0 0 0 1px #4e5257, inset 0 3px 5px rgba(0,0,0,.3), inset 0 -3px 0 #ff3f84; }
    .active .knurl { color: #ff8fb8; box-shadow: 0 2px 3px rgba(0,0,0,.4), inset 0 0 0 5px #2a2c2f, inset 0 0 0 6px #ff3f84; }
  `,
  art: `<div class="grille"></div><div class="bay"><div class="shell"><div class="paper"></div><div class="pink"></div><div class="eye"></div></div></div>${magnetLow.art}`,
  buttons: magnetLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 54, y: 90, width: 252, height: 22, fontSize: 15, color: '#1a1c1f' },
    { type: 'text', source: 'track.artist', x: 54, y: 112, width: 150, height: 18, fontSize: 12, color: '#a80f49' },
    { type: 'time', source: 'position', x: 206, y: 112, width: 100, height: 18, fontSize: 13, align: 'right', color: '#474b50' },
    ...magnetLow.components,
  ],
  spinners: [smallHub('hub-left', 128, 150), smallHub('hub-right', 204, 150)],
});

// ---- "Studio": black leather, a cream meter panel, steel knobs

const studioLow = lower({ width: 380, y: 150, look: 'steel', playLook: 'steel', toggleLook: 'tab', big: 76, mid: 54, toggle: [50, 34], list: 150 });
const studio = skin('studio', 'Studio', 'A recorder in black leather with a cream meter panel, steel knobs and tabs that light up blue.', ['recorder', 'leather', 'meter', 'cream', 'steel', 'skeuomorphic'], {
  theme: theme({ background: '#e9dfbf', surface: '#f4ecd2', surfaceRaised: '#fffaf0', foreground: '#2a2418', muted: '#62573f', accent: '#a3261c', accentContrast: '#fff8ec', border: '#8d8262', ok: '#1f6b3a', danger: '#a3261c', focus: '#1f5fbf' }, '"Georgia", "Times New Roman", serif'),
  width: 380,
  height: studioLow.height,
  resize: studioLow.resize,
  css: `
    body { background: radial-gradient(circle, rgba(255,255,255,.05) .7px, transparent 1px) 0 0 / 4px 4px, radial-gradient(circle, rgba(0,0,0,.4) .7px, transparent 1px) 2px 2px / 4px 4px, linear-gradient(#26282b, #17181a); font-family: Georgia, serif; }
    .stitch { position: absolute; inset: 8px; border-radius: 10px; border: 1.5px dashed rgba(255,255,255,.16); }
    .panel { position: absolute; left: 24px; top: 22px; width: 332px; height: 116px; border-radius: 12px; background: radial-gradient(120% 90% at 50% 0%, #fbf4dc, #e6dcb8); box-shadow: inset 0 2px 6px rgba(60,40,10,.5), 0 0 0 3px #0e0f10, 0 0 0 4px #5a5c60, 0 2px 0 4px rgba(255,255,255,.1); overflow: hidden; }
    .panel::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 100%;
      background: repeating-conic-gradient(from -16.2deg at 50% 500%, #2a2418 0 .22deg, transparent .22deg 1.6deg);
      -webkit-mask-image: radial-gradient(circle at 50% 500%, transparent 0 566px, #000 566px 573px, transparent 573px); }
    .panel::after { content: ''; position: absolute; inset: 0; background: conic-gradient(from 7deg at 50% 500%, #a3261c 0 9.4deg, transparent 9.4deg);
      -webkit-mask-image: radial-gradient(circle at 50% 500%, transparent 0 559px, #000 559px 563px, transparent 563px); }
    ${beds('#f4ecd2', '#f4ecd2', true)}
    .slot { box-shadow: inset 0 1px 3px rgba(60,40,10,.6), 0 0 0 2px #0e0f10, 0 1px 0 2px rgba(255,255,255,.12); }
    .well { border-radius: 8px; box-shadow: inset 0 2px 6px rgba(60,40,10,.45), 0 0 0 3px #0e0f10, 0 0 0 4px #5a5c60; }
    .face { color: #2a2d31; } .face svg { width: 38%; height: 38%; }
    .steel { border-radius: 50%; background: conic-gradient(from 30deg, #f4f5f6, #8f9398, #e9ebed, #84888d, #f4f5f6, #8f9398, #e9ebed, #84888d, #f4f5f6); box-shadow: 0 0 0 1px #0b0b0c, 0 0 0 5px #2b2d30, 0 0 0 6px #0b0b0c, 0 5px 6px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.7); }
    .tab { border-radius: 12px; color: #9fb0c0; background: linear-gradient(#34373b, #1d1f21); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.2); }
    .tab svg { width: 16px; height: 16px; }
    ${STATES}
    .pressed .steel { box-shadow: 0 0 0 1px #0b0b0c, 0 0 0 5px #2b2d30, 0 0 0 6px #0b0b0c, inset 0 3px 6px rgba(0,0,0,.45); }
    .active .steel { color: #a3261c; box-shadow: 0 0 0 1px #0b0b0c, 0 0 0 5px #2b2d30, 0 0 0 6px #d2372b, 0 0 12px 3px rgba(210,55,43,.5), inset 0 0 0 1px rgba(255,255,255,.7); }
    .active .tab { color: #06223d; background: linear-gradient(#d6efff, #6db9f5); box-shadow: 0 0 0 1px #000, 0 0 10px 2px rgba(109,185,245,.6), inset 0 1px 0 #fff; }
  `,
  art: `<div class="stitch"></div><div class="panel"></div>${studioLow.art}`,
  buttons: studioLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 40, y: 52, width: 300, height: 22, fontSize: 16, align: 'center', color: '#2a2418' },
    { type: 'text', source: 'track.artist', x: 40, y: 74, width: 300, height: 16, fontSize: 12, align: 'center', color: '#62573f' },
    { type: 'time', source: 'position', x: 40, y: 98, width: 90, height: 30, fontSize: 22, color: '#a3261c' },
    { type: 'spectrum', x: 136, y: 102, width: 108, height: 24, color: '#62573f' },
    { type: 'text', source: 'player.status', x: 250, y: 100, width: 90, height: 14, fontSize: 10, align: 'right', color: '#a3261c' },
    { type: 'time', source: 'duration', x: 250, y: 114, width: 90, height: 14, fontSize: 11, align: 'right', color: '#62573f' },
    ...studioLow.components,
  ],
});

// ---- "Crimson": two steel reels full of red tape on black

const crimsonReel = '<div class="spool"><b></b><b style="transform:rotate(120deg)"></b><b style="transform:rotate(240deg)"></b><i></i></div>';
const crimsonLow = lower({ width: 380, y: 270, look: 'bead', playLook: 'bead hot', toggleLook: 'bead', big: 64, mid: 52, toggle: [44, 44], list: 150 });
const crimson = skin('crimson', 'Crimson', 'Two steel reels full of red tape on black cloth, and a thin red line between them.', ['reel', 'dark', 'red', 'steel', 'minimal', 'skeuomorphic'], {
  theme: theme({ background: '#1c1c1d', surface: '#111112', surfaceRaised: '#2f2f31', foreground: '#f3f1ee', muted: '#b3afa9', accent: '#ff6257', accentContrast: '#1c0200', border: '#000000', ok: '#7fdca0', danger: '#ffa39b', focus: '#7fc4ff' }, HELVETICA),
  width: 380,
  height: crimsonLow.height,
  resize: crimsonLow.resize,
  css: `
    body { background: repeating-linear-gradient(45deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(0,0,0,.25) 0 1px, transparent 1px 3px), radial-gradient(120% 80% at 50% 20%, #2a2a2c, #151516); font-family: ${HELVETICA}; }
    .line { position: absolute; left: 100px; top: 166px; width: 180px; height: 34px; border: 1.5px solid #c8281f; border-top: none; border-radius: 0 0 40px 40px; }
    .caps { position: absolute; left: 150px; top: 190px; width: 80px; height: 20px; border-radius: 10px; background: linear-gradient(#fafafa, #cfcfcf); box-shadow: 0 2px 4px rgba(0,0,0,.6); }
    .caps::after { content: ''; position: absolute; left: 24px; top: 7px; width: 32px; height: 6px; background: radial-gradient(circle, #c8281f 2.5px, transparent 3px) 0 0 / 12px 6px; }
    .wound { position: absolute; inset: 0; border-radius: 50%; background: repeating-radial-gradient(circle, #b3221a 0 1.5px, #8f1a13 1.5px 3px); }
    .spool { position: absolute; inset: 0; border-radius: 50%; filter: drop-shadow(0 3px 4px rgba(0,0,0,.6));
      background: radial-gradient(circle, transparent 0 68px, #f1f2f3 68px 70px, #9a9ea3 70px 74px, #e8eaec 74px 75px); }
    .spool b { position: absolute; left: 50%; top: 50%; width: 46px; height: 72px; margin-left: -23px; transform-origin: 50% 0; border-radius: 0 0 8px 8px;
      background: repeating-linear-gradient(0deg, rgba(0,0,0,.05) 0 1px, transparent 1px 3px), linear-gradient(90deg, #a9adb2, #f1f2f3 50%, #a9adb2); }
    .spool i { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px; border-radius: 50%; background: radial-gradient(circle, #1c1c1d 0 4px, #f4f5f6 4px 9px, #8f9398 9px 11px, #e9ebed 11px); box-shadow: 0 0 0 1px #5d6166; }
    ${beds('#0c0c0d', '#111112', false)}
    .face { color: #f3f1ee; } .face svg { width: 18px; height: 18px; }
    .bead { border-radius: 50%; background: radial-gradient(circle at 40% 28%, #4a4a4d, #19191a 72%); box-shadow: 0 0 0 1px #000, 0 3px 4px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.18); }
    .bead.hot { color: #2a0300; background: radial-gradient(circle at 40% 28%, #ff8a7f, #c8281f 72%); box-shadow: 0 0 0 1px #000, 0 3px 4px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.4); }
    .bead.hot svg { width: 24px; height: 24px; }
    ${STATES}
    .pressed .bead { box-shadow: 0 0 0 1px #000, inset 0 3px 5px rgba(0,0,0,.7); }
    .active .bead { color: #ff6257; box-shadow: 0 0 0 1px #000, 0 0 0 2.5px #c8281f, inset 0 1px 0 rgba(255,255,255,.18); }
    .active .bead.hot { color: #fff; box-shadow: 0 0 0 1px #000, 0 0 14px 4px rgba(255,98,87,.6), inset 0 1px 0 rgba(255,255,255,.4); }
  `,
  art: `<div class="line"></div><div class="caps"></div>${crimsonLow.art}`,
  buttons: crimsonLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 24, y: 214, width: 332, height: 22, fontSize: 16, align: 'center', color: '#f3f1ee' },
    { type: 'text', source: 'track.artist', x: 24, y: 236, width: 332, height: 16, fontSize: 12, align: 'center', color: '#ff6257' },
    { type: 'time', source: 'position', x: 24, y: 252, width: 80, height: 14, fontSize: 11, color: '#b3afa9' },
    { type: 'text', source: 'player.status', x: 110, y: 252, width: 160, height: 14, fontSize: 10, align: 'center', color: '#b3afa9' },
    { type: 'time', source: 'duration', x: 276, y: 252, width: 80, height: 14, fontSize: 11, align: 'right', color: '#b3afa9' },
    ...crimsonLow.components,
  ],
  packs: [
    { name: 'tape-left', x: 36, y: 24, width: 136, height: 136, from: 136, to: 60, html: '<div class="wound"></div>' },
    { name: 'tape-right', x: 208, y: 24, width: 136, height: 136, from: 60, to: 136, html: '<div class="wound"></div>' },
  ],
  spinners: [
    { name: 'reel-left', x: 29, y: 17, width: 150, height: 150, period: 3000, html: crimsonReel },
    { name: 'reel-right', x: 201, y: 17, width: 150, height: 150, period: 3000, html: crimsonReel },
  ],
});

// ---- "Mono": black on white and nothing else; the cover large

const NOTE = '<div class="blank"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 4v10.2a3.2 3.2 0 1 0 2 3V8h6V4z"/></svg></div>';
const monoLow = lower({ width: 360, y: 356, look: 'bare', playLook: 'disc', toggleLook: 'bare', big: 64, mid: 52, toggle: [44, 40], list: 150 });
const mono = skin('mono', 'Mono', 'Black on white and nothing else: the cover large, a row of bars, plain signs.', ['minimal', 'black', 'white', 'light', 'cover', 'flat'], {
  theme: theme({ background: '#ffffff', surface: '#ffffff', surfaceRaised: '#f2f2f2', foreground: '#000000', muted: '#555555', accent: '#000000', accentContrast: '#ffffff', border: '#000000', ok: '#0b5a2b', danger: '#a3231b', focus: '#1f5fbf' }, '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif', 12),
  width: 360,
  height: monoLow.height,
  resize: monoLow.resize,
  css: `
    body { background: #fff; }
    .rim { position: absolute; left: 68px; top: 20px; width: 224px; height: 224px; border-radius: 26px; box-shadow: 0 0 0 3px #000; }
    .blank { position: absolute; inset: 0; border-radius: 24px; background: #f2f2f2; display: grid; place-items: center; color: #000; }
    .blank svg { width: 64px; height: 64px; }
    ${beds('#fff', '#fff', true)}
    .slot { height: 4px !important; margin-top: 5px; border-radius: 2px; background: #000; box-shadow: none; }
    .well { border-radius: 14px; box-shadow: inset 0 0 0 2.5px #000; }
    .face { color: #000; } .face svg { width: 22px; height: 22px; }
    .bare { border-radius: 50%; }
    .disc { border-radius: 50%; color: #fff; background: #000; } .disc svg { width: 26px; height: 26px; }
    .hover .bare { background: #eee; } .hover .disc { background: #333; }
    .pressed .bare { background: #000; color: #fff; } .pressed .disc { background: #666; }
    .active .bare { color: #fff; background: #000; } .active .disc { box-shadow: 0 0 0 3px #fff, 0 0 0 5.5px #000; }
  `,
  art: `<div class="rim"></div>${monoLow.art}`,
  buttons: monoLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 24, y: 256, width: 312, height: 24, fontSize: 17, color: '#000000' },
    { type: 'text', source: 'track.artist', x: 24, y: 280, width: 312, height: 18, fontSize: 12, color: '#555555' },
    { type: 'spectrum', x: 24, y: 304, width: 312, height: 30, color: '#000000' },
    { type: 'time', source: 'position', x: 24, y: 338, width: 80, height: 14, fontSize: 11, color: '#000000' },
    { type: 'text', source: 'player.status', x: 110, y: 338, width: 140, height: 14, fontSize: 10, align: 'center', color: '#555555' },
    { type: 'time', source: 'duration', x: 256, y: 338, width: 80, height: 14, fontSize: 11, align: 'right', color: '#000000' },
    ...monoLow.components,
  ],
  overlays: [{ name: 'cover', x: 68, y: 20, width: 224, height: 224, source: 'track.cover', html: NOTE }],
});

// ---- "Wheel": a white pocket player, a bright screen with the cover and a ring of keys

const wheel = skin('wheel', 'Wheel', 'A white pocket player: a bright screen with the cover of the album and a ring of keys below it.', ['pocket player', 'white', 'light', 'cover', 'ring', 'glossy'], {
  theme: theme({ background: '#f4f5f6', surface: '#e8f1f8', surfaceRaised: '#ffffff', foreground: '#111417', muted: '#49535c', accent: '#1a62a8', accentContrast: '#ffffff', border: '#8e98a1', ok: '#0b5a2b', danger: '#a3231b', focus: '#b83216' }, '"Lucida Grande", "Segoe UI", "Helvetica Neue", sans-serif', 4),
  width: 340,
  height: 700,
  resize: { stretchY: 610 },
  pad: 2,
  css: `
    body { background: linear-gradient(120deg, rgba(255,255,255,.9) 0 40%, transparent 40.3%), linear-gradient(#fdfdfd, #e9eaec); box-shadow: inset 0 0 0 1px #b9bdc1, inset 0 0 0 3px #fff; }
    .screen { position: absolute; left: 22px; top: 22px; width: 296px; height: 196px; border-radius: 6px; background: linear-gradient(#f4f9fc, #dcebf5); box-shadow: 0 0 0 4px #2a2d30, 0 0 0 5px #8e98a1; overflow: hidden; }
    .bar { position: absolute; left: 0; right: 0; top: 0; height: 22px; background: linear-gradient(#f7fafc, #c9dbe8); box-shadow: 0 1px 0 #9fb3c2; }
    .cell { position: absolute; right: 8px; top: 6px; width: 20px; height: 10px; border-radius: 2px; background: linear-gradient(#7fe07a, #2f9a2a); box-shadow: 0 0 0 1px #2a2d30; }
    .ringpad { position: absolute; left: 60px; top: 250px; width: 220px; height: 220px; border-radius: 50%; background: linear-gradient(#b9bdc1, #a8acb0); box-shadow: inset 0 1px 2px rgba(0,0,0,.25), 0 1px 0 #fff; }
    .blank { position: absolute; inset: 0; background: linear-gradient(135deg, #b9cfe0, #7fa3bf); display: grid; place-items: center; color: #fff; }
    .blank svg { width: 40px; height: 40px; }
    ${beds('#cfd3d7', '#e8f1f8', true)}
    .face { color: #fff; } .face svg { width: 20px; height: 20px; filter: drop-shadow(0 1px 0 rgba(0,0,0,.25)); }
    .on { border-radius: 50%; }
    .hub { border-radius: 50%; color: #6d747b; background: linear-gradient(#ffffff, #eceef0); box-shadow: 0 0 0 1px #a9aeb3, inset 0 1px 2px rgba(0,0,0,.08); }
    .hub svg { width: 30px; height: 30px; filter: none; }
    .lite { border-radius: 50%; color: #6d747b; } .lite svg { width: 17px; height: 17px; filter: none; }
    .hover .on { background: rgba(255,255,255,.25); } .hover .hub { background: #fff; } .hover .lite { background: rgba(0,0,0,.06); }
    .pressed .on { background: rgba(0,0,0,.14); } .pressed .hub { background: linear-gradient(#dfe2e5, #eef0f2); box-shadow: 0 0 0 1px #a9aeb3, inset 0 2px 4px rgba(0,0,0,.2); } .pressed .lite { background: rgba(0,0,0,.16); }
    .active .hub { color: #1a62a8; box-shadow: 0 0 0 1px #1a62a8, 0 0 0 3px rgba(26,98,168,.3); }
    .active .lite { color: #fff; background: #1a62a8; }
  `,
  art: `<div class="screen"><div class="bar"><div class="cell"></div></div></div><div class="ringpad"></div>
    <div class="slot" style="left:40px;top:177px;width:260px;height:14px"></div>
    <div class="slot" style="left:118px;top:497px;width:104px;height:14px"></div>
    <div class="well" style="left:22px;top:530px;width:296px;height:156px"></div>`,
  buttons: [
    button('player.open', 'open', 140, 254, 60, 50, 'on'),
    button('player.previous', 'previous', 64, 335, 60, 50, 'on'),
    button('player.togglePlay', 'play', 126, 316, 88, 88, 'hub', PLAY),
    button('player.next', 'next', 216, 335, 60, 50, 'on'),
    button('player.stop', 'stop', 140, 416, 60, 50, 'on'),
    button('player.repeat', 'repeat', 22, 482, 44, 44, 'lite', TOGGLE),
    button('player.shuffle', 'shuffle', 66, 482, 44, 44, 'lite', TOGGLE),
    button('window.equalizer', 'equalizer', 230, 482, 44, 44, 'lite', TOGGLE),
    button('app.skins', 'skins', 274, 482, 44, 44, 'lite'),
  ],
  components: [
    { type: 'text', source: 'player.status', x: 60, y: 24, width: 220, height: 18, fontSize: 12, align: 'center', color: '#111417' },
    { type: 'text', source: 'track.title', x: 140, y: 66, width: 166, height: 22, fontSize: 14, color: '#111417' },
    { type: 'text', source: 'track.artist', x: 140, y: 90, width: 166, height: 20, fontSize: 13, color: '#111417' },
    { type: 'spectrum', x: 140, y: 118, width: 166, height: 24, color: '#1a62a8' },
    { type: 'seekbar', x: 42, y: 180, width: 256, height: 8 },
    { type: 'time', source: 'position', x: 42, y: 194, width: 80, height: 16, fontSize: 12, color: '#111417' },
    { type: 'time', source: 'duration', x: 218, y: 194, width: 80, height: 16, fontSize: 12, align: 'right', color: '#111417' },
    { type: 'volume', x: 120, y: 500, width: 100, height: 8 },
    { type: 'playlist', x: 26, y: 534, width: 288, height: 148 },
  ],
  overlays: [{ name: 'cover', x: 40, y: 58, width: 88, height: 88, source: 'track.cover', html: NOTE }],
});

// ---- two reels above the kit: shared by the small tape machines

const twoReels = (html, period = 3000) => [
  { name: 'reel-left', x: 29, y: 17, width: 150, height: 150, period, html },
  { name: 'reel-right', x: 201, y: 17, width: 150, height: 150, period, html },
];
const twoPacks = [
  { name: 'tape-left', x: 36, y: 24, width: 136, height: 136, from: 136, to: 62, html: '<div class="wound"></div>' },
  { name: 'tape-right', x: 208, y: 24, width: 136, height: 136, from: 62, to: 136, html: '<div class="wound"></div>' },
];
const WOUND = `.wound { position: absolute; inset: 0; border-radius: 50%; background: repeating-radial-gradient(circle, #4a342a 0 1.5px, #38271f 1.5px 3px); }`;
/** Six round holes in a disc 150 wide, as a mask. */
const SIX_HOLES = [0, 60, 120, 180, 240, 300]
  .map((a) => `radial-gradient(circle at ${(75 + 46 * Math.sin((a * Math.PI) / 180)).toFixed(1)}px ${(75 - 46 * Math.cos((a * Math.PI) / 180)).toFixed(1)}px, transparent 0 16px, #000 16.5px)`)
  .join(', ');
const belowReels = (c) => [
  { type: 'text', source: 'track.title', x: 34, y: 186, width: 312, height: 22, fontSize: 16, align: 'center', color: c.title },
  { type: 'text', source: 'track.artist', x: 34, y: 208, width: 312, height: 16, fontSize: 12, align: 'center', color: c.artist },
  { type: 'time', source: 'position', x: 34, y: 232, width: 80, height: 14, fontSize: 11, color: c.muted },
  { type: 'text', source: 'player.status', x: 120, y: 232, width: 140, height: 14, fontSize: 10, align: 'center', color: c.muted },
  { type: 'time', source: 'duration', x: 266, y: 232, width: 80, height: 14, fontSize: 11, align: 'right', color: c.muted },
];

// ---- "Nano": a miniature tape recorder cut from steel, seen from above
//
// The face is the machine and nothing else: two reels, the tape between them, machined keys.
// The track list lies below it and can be hidden, which leaves the machine alone.

const holes = (size, distance, radius, count = 6) =>
  Array.from({ length: count }, (_, n) => (n * 2 * Math.PI) / count)
    .map((a) => `radial-gradient(circle at ${(size / 2 + distance * Math.sin(a)).toFixed(1)}px ${(size / 2 - distance * Math.cos(a)).toFixed(1)}px, transparent 0 ${radius}px, #000 ${radius + 0.6}px)`)
    .join(', ');
const nanoReel = (colour) => `<div class="disc ${colour}"></div><div class="boss"><i></i><i></i><i></i></div><div class="mark ${colour}">FC·12</div>`;
const nanoBlock = (action, icon, x, y) => button(action, icon, x, y, 54, 44, 'block', TOGGLE);

const nano = skin('nano', 'Nano', 'A miniature tape recorder cut from steel, seen from above: a mint and a red reel, machined keys, print as fine as on a watch.', ['reel', 'steel', 'light', 'miniature', 'red', 'mint', 'landscape', 'skeuomorphic'], {
  theme: theme({ background: '#d3d5d7', surface: '#f3f1ea', surfaceRaised: '#ffffff', foreground: '#1b1d20', muted: '#44484d', accent: '#a31d16', accentContrast: '#ffffff', border: '#7c8188', ok: '#0b5a2b', danger: '#8f1d16', focus: '#1f5fbf' }, HELVETICA, 2),
  width: 620,
  height: 576,
  resize: { stretchY: 490 },
  titleBar: '#c9ccd0',
  pad: 4,
  css: `
    body { background: linear-gradient(#dfe1e3, #c9cbce); font-family: ${HELVETICA}; }
    .plate { position: absolute; left: 10px; top: 8px; width: 600px; height: 390px; border-radius: 14px;
      background: repeating-linear-gradient(0deg, rgba(255,255,255,.2) 0 .5px, rgba(0,0,0,.05) .5px 1px, transparent 1px 2.5px), linear-gradient(115deg, #e6e8ea, #b9bdc2 48%, #dcdfe2 70%, #c2c6ca);
      box-shadow: 0 6px 14px rgba(0,0,0,.35), 0 0 0 1px #6f747a, inset 0 0 0 2px rgba(255,255,255,.7), inset 0 0 0 3px rgba(0,0,0,.12); }
    .pins { position: absolute; left: 3px; top: 70px; width: 9px; height: 200px; border-radius: 2px; background: repeating-linear-gradient(#c9a23a 0 3px, #2f6a43 3px 9px); box-shadow: 0 0 0 1px #1f4a2e; }
    .screw { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fafafa, #747980 75%); box-shadow: 0 0 0 1px rgba(0,0,0,.4), inset 0 0 0 3px rgba(255,255,255,.2); }
    .screw::after { content: ''; position: absolute; left: 1px; right: 1px; top: 4px; height: 1px; background: #33363a; transform: rotate(35deg); }
    .fine { position: absolute; font-size: 6.5px; font-weight: 700; letter-spacing: .13em; color: #2b2e32; white-space: nowrap; }
    .hair { position: absolute; border-top: 1px solid #2b2e32; opacity: .6; }
    .seatn { position: absolute; top: 22px; width: 216px; height: 216px; border-radius: 50%; background: radial-gradient(circle, #9da2a8 0 20px, #c6cace 20px 100px, #b0b5ba 100px); box-shadow: inset 0 2px 5px rgba(0,0,0,.3), 0 1px 0 rgba(255,255,255,.8); }
    .guide { position: absolute; left: 285px; top: 14px; width: 30px; height: 62px; border-radius: 3px 3px 12px 12px; background: linear-gradient(90deg, #aeb3b9, #f4f5f6 45%, #a3a8ae); box-shadow: 0 2px 4px rgba(0,0,0,.4), 0 0 0 1px #6f747a; }
    .guide::after { content: ''; position: absolute; left: 9px; top: 10px; width: 12px; height: 38px; border-radius: 2px; background: linear-gradient(#2b2e32 0 2px, transparent 2px 10px, #2b2e32 10px 12px, transparent 12px 26px, #2b2e32 26px 28px, transparent 28px); }
    .arcn { position: absolute; left: 262px; top: 78px; width: 76px; height: 76px; border-radius: 50%; border: 1px solid #2b2e32; opacity: .55; -webkit-mask-image: linear-gradient(#000 0 34%, transparent 34%); }
    .band { position: absolute; left: 196px; top: 236px; width: 208px; height: 18px; border: 1.5px solid #47322a; border-top: none; border-radius: 0 0 20px 20px; }
    .label { position: absolute; left: 150px; top: 258px; width: 320px; height: 26px; border-radius: 2px; background: #f3f1ea; box-shadow: 0 1px 2px rgba(0,0,0,.35), inset 0 0 0 1px rgba(0,0,0,.18); }
    .label::before { content: ''; position: absolute; left: 0; top: 0; width: 7px; height: 100%; background: #d8262d; }
    .dialn { position: absolute; left: 512px; top: 262px; width: 80px; height: 80px; border-radius: 50%; background: radial-gradient(circle, #f3f1ea 0 30px, #1b1d20 30px 31px, #cfd2d5 31px 35px, #8d9299 35px 37px, #e6e8ea 37px); box-shadow: 0 3px 5px rgba(0,0,0,.4), 0 0 0 1px #6f747a; }
    .post { position: absolute; width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff, #7d8288 70%); box-shadow: 0 2px 3px rgba(0,0,0,.5), 0 0 0 1px #5d6166; }
    .wound { position: absolute; inset: 0; border-radius: 50%; background: repeating-radial-gradient(circle, #4a342a 0 1.5px, #38271f 1.5px 3px); }
    .disc { position: absolute; inset: 0; border-radius: 50%; -webkit-mask-image: ${holes(210, 62, 22)}; -webkit-mask-composite: source-in; filter: drop-shadow(0 3px 4px rgba(0,0,0,.45)); }
    .disc.mint { background: radial-gradient(circle, #7fc4a6 0 30px, #9bdcc0 30px 99px, #6fb596 99px 102px, #8fd0b4 102px); }
    .disc.red { background: radial-gradient(circle, #b81d22 0 30px, #e02b31 30px 99px, #9c1a1e 99px 102px, #cf262c 102px); }
    .boss { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; margin: -27px; border-radius: 50%; background: radial-gradient(circle, #33363a 0 4px, #f6f6f4 4px 11px, #9a9fa5 11px 12.5px, #f1f1ee 12.5px); box-shadow: 0 1px 3px rgba(0,0,0,.45), 0 0 0 1px #7c8188; }
    .boss i { position: absolute; left: 24px; top: 5px; width: 6px; height: 44px; background: radial-gradient(circle at 50% 4px, #33363a 2.6px, transparent 3px), radial-gradient(circle at 50% 40px, #33363a 2.6px, transparent 3px); }
    .boss i:nth-child(2) { transform: rotate(60deg); } .boss i:nth-child(3) { transform: rotate(120deg); }
    .mark { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); font: 800 9px ${HELVETICA}; letter-spacing: .12em; color: rgba(255,255,255,.92); }
    .mark.mint { color: #1f5a41; }
    ${beds('#8f959c', '#f3f1ea', true)}
    .well { border-radius: 3px; box-shadow: inset 0 1px 3px rgba(0,0,0,.35), 0 1px 0 #fff; }
    .face { color: #23262a; } .face svg { width: 17px; height: 17px; }
    .puck { border-radius: 50%; background: radial-gradient(circle, #5d6166 0 3px, #f6f7f8 3px 8px, #9a9fa5 8px 9.5px, #e3e5e8 9.5px 62%, #9da2a8 62% 66%, #eff0f2 66%); box-shadow: 0 3px 5px rgba(0,0,0,.45), 0 0 0 1px #5d6166; }
    .puck svg { margin-top: 26px; width: 13px; height: 13px; }
    .puck.go { color: #fff; background: radial-gradient(circle, #e7373d 0 62%, #9c1a1e 62% 66%, #cf262c 66%); box-shadow: 0 3px 5px rgba(0,0,0,.45), 0 0 0 1px #6d1114; }
    .puck.go svg { margin-top: 0; width: 26px; height: 26px; filter: drop-shadow(0 1px 0 rgba(0,0,0,.3)); }
    .block { border-radius: 3px; background: linear-gradient(145deg, #f4f5f6, #b4b8bd 60%, #d5d8db); box-shadow: 0 2px 4px rgba(0,0,0,.4), 0 0 0 1px #5d6166, inset 0 0 0 1px rgba(255,255,255,.7); }
    .block::before { content: ''; position: absolute; right: 5px; top: 5px; width: 5px; height: 5px; border-radius: 50%; background: #6a2a2a; box-shadow: inset 0 1px 1px rgba(0,0,0,.5); }
    .small { border-radius: 50%; background: radial-gradient(circle at 38% 30%, #fff, #a3a8ae 68%, #7d8288); box-shadow: 0 2px 3px rgba(0,0,0,.45), 0 0 0 1px #5d6166; }
    ${STATES}
    .pressed .puck, .pressed .block, .pressed .small { box-shadow: 0 0 0 1px #5d6166, inset 0 3px 5px rgba(0,0,0,.4); }
    .active .puck.go { box-shadow: 0 0 0 1px #6d1114, 0 0 0 3px #c9ccd0, 0 0 0 4.5px #e02b31, 0 0 12px 3px rgba(224,43,49,.45); }
    .active .block::before { background: #ff3b30; box-shadow: 0 0 5px 1px rgba(255,59,48,.9); }
    .active .block { color: #a31d16; }
  `,
  art: `<div class="plate"><div class="pins"></div></div>
    ${[[22, 18], [589, 18], [22, 378], [589, 378], [300, 222]].map(([x, y]) => `<div class="screw" style="left:${x}px;top:${y}px"></div>`).join('')}
    <div class="seatn" style="left:82px"></div><div class="seatn" style="left:322px"></div>
    <div class="guide"></div><div class="arcn"></div><div class="band"></div>
    <div class="fine" style="left:46px;top:20px">SUPPLY REEL</div><div class="fine" style="left:520px;top:20px">TAKE-UP</div>
    <div class="fine" style="left:28px;top:246px">MODE</div><div class="fine" style="left:514px;top:246px">LEVEL</div><div class="fine" style="left:482px;top:354px">VOLUME</div>
    <div class="fine" style="left:28px;top:384px;opacity:.75">MINIATURE TAPE RECORDER · LOSSLESS</div>
    <div class="post" style="left:176px;top:240px"></div><div class="post" style="left:428px;top:240px"></div>
    <div class="label"></div><div class="dialn"></div>
    <div class="slot" style="left:148px;top:309px;width:324px;height:14px"></div>
    <div class="slot" style="left:480px;top:364px;width:116px;height:14px"></div>
    <div class="well" style="left:10px;top:408px;width:600px;height:158px"></div>`,
  buttons: [
    button('player.open', 'open', 168, 331, 54, 54, 'puck'),
    button('player.previous', 'previous', 222, 331, 54, 54, 'puck'),
    button('player.togglePlay', 'play', 276, 326, 68, 64, 'puck go', PLAY),
    button('player.next', 'next', 344, 331, 54, 54, 'puck'),
    button('player.stop', 'stop', 398, 331, 54, 54, 'puck'),
    nanoBlock('player.repeat', 'repeat', 26, 256),
    nanoBlock('player.shuffle', 'shuffle', 82, 256),
    nanoBlock('window.equalizer', 'equalizer', 26, 302),
    nanoBlock('app.playlist', 'list', 82, 302),
    button('app.skins', 'skins', 60, 346, 40, 36, 'small'),
  ],
  components: [
    { type: 'text', source: 'track.title', x: 164, y: 260, width: 218, height: 22, fontSize: 14, color: '#1b1d20' },
    { type: 'text', source: 'player.status', x: 386, y: 260, width: 78, height: 22, fontSize: 10, align: 'right', color: '#a31d16' },
    { type: 'time', source: 'position', x: 150, y: 288, width: 70, height: 16, fontSize: 12, color: '#1b1d20' },
    { type: 'text', source: 'track.artist', x: 222, y: 288, width: 176, height: 16, fontSize: 11, align: 'center', color: '#a31d16' },
    { type: 'time', source: 'duration', x: 400, y: 288, width: 70, height: 16, fontSize: 12, align: 'right', color: '#44484d' },
    { type: 'seekbar', x: 150, y: 312, width: 320, height: 8 },
    { type: 'spectrum', x: 526, y: 286, width: 52, height: 30, color: '#44484d' },
    { type: 'volume', x: 482, y: 367, width: 112, height: 8 },
    { type: 'playlist', x: 16, y: 412, width: 588, height: 150 },
  ],
  packs: [
    { name: 'tape-left', x: 95, y: 35, width: 190, height: 190, from: 190, to: 76, html: '<div class="wound"></div>' },
    { name: 'tape-right', x: 335, y: 35, width: 190, height: 190, from: 76, to: 190, html: '<div class="wound"></div>' },
  ],
  spinners: [
    { name: 'reel-left', x: 85, y: 25, width: 210, height: 210, period: 3200, html: nanoReel('mint') },
    { name: 'reel-right', x: 325, y: 25, width: 210, height: 210, period: 3200, html: nanoReel('red') },
  ],
});

// ---- "Silver": a silver front, smoked reels, a badge and knurled knobs

const silverReel = '<div class="smoke"><b></b><b style="transform:rotate(120deg)"></b><b style="transform:rotate(240deg)"></b><i></i></div>';
const silverLow = lower({ width: 380, y: 254, look: 'knob', playLook: 'knob', toggleLook: 'knob', big: 68, mid: 52, toggle: [44, 44], list: 150 });
const silver = skin('silver', 'Silver', 'A portable tape machine: a silver front, two smoked reels, a badge and knurled knobs.', ['reel', 'silver', 'light', 'portable', 'smoked', 'skeuomorphic'], {
  theme: theme({ background: '#d3d4d1', surface: '#ecece9', surfaceRaised: '#ffffff', foreground: '#1e1f1e', muted: '#4d4f4c', accent: '#8f1f17', accentContrast: '#ffffff', border: '#858783', ok: '#0b5a2b', danger: '#8f1f17', focus: '#1f5fbf' }, '"Gill Sans", "Gill Sans MT", "Helvetica Neue", sans-serif', 2),
  width: 380,
  height: silverLow.height,
  resize: silverLow.resize,
  css: `
    body { background: linear-gradient(150deg, #e9e9e6, #c4c5c1 60%, #dadbd8); box-shadow: inset 0 0 0 1px #9d9f9b, inset 0 2px 0 #fff; font-family: "Gill Sans", "Helvetica Neue", sans-serif; }
    .hex { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle, #6d6f6c 0 2px, #f4f4f2 2px 3px, #a9aba7 3px); box-shadow: 0 0 0 1px rgba(0,0,0,.3); }
    .vent { position: absolute; left: 172px; top: 60px; width: 36px; height: 60px; background: radial-gradient(circle, #1e1f1e 2.4px, transparent 2.8px) 0 0 / 12px 12px; opacity: .75; }
    .badge { position: absolute; left: 50px; top: 178px; width: 280px; height: 72px; background: linear-gradient(#f4f4f2, #dcdcd9); clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%); }
    .badge::after { content: ''; position: absolute; left: 30px; right: 30px; top: 50px; height: 1px; background: #1e1f1e; opacity: .5; }
    .wound { position: absolute; inset: 0; border-radius: 50%; background: repeating-radial-gradient(circle, #5a4a40 0 1.5px, #47392f 1.5px 3px); }
    .smoke { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, transparent 0 66px, rgba(40,42,40,.5) 66px 73px, rgba(20,21,20,.75) 73px 75px);
      box-shadow: inset 0 0 0 75px rgba(60,62,60,.22); filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); }
    .smoke b { position: absolute; left: 50%; top: 50%; width: 44px; height: 70px; margin-left: -22px; transform-origin: 50% 0; background: rgba(70,72,70,.6); border-radius: 0 0 10px 10px; }
    .smoke i { position: absolute; left: 50%; top: 50%; width: 50px; height: 50px; margin: -25px; border-radius: 50%; background: radial-gradient(circle, #6d6f6c 0 4px, #f4f4f2 4px 12px, #b8bab6 12px 14px, #e2e3e0 14px); box-shadow: 0 0 0 1px #6d6f6c; }
    ${beds('#a9aba7', '#ecece9', true)}
    .face { color: #f4f4f2; } .face svg { width: 17px; height: 17px; }
    .knob { border-radius: 50%; background: repeating-conic-gradient(#4a4c49 0 5deg, #1e1f1e 5deg 10deg); box-shadow: 0 2px 4px rgba(0,0,0,.45), 0 0 0 1px #000, inset 0 0 0 6px #2d2e2c, inset 0 0 0 7px #7f817d; }
    ${STATES}
    .pressed .knob { box-shadow: 0 0 0 1px #000, inset 0 0 0 6px #1c1d1b, inset 0 0 0 7px #7f817d; }
    .active .knob { color: #ff8a80; box-shadow: 0 2px 4px rgba(0,0,0,.45), 0 0 0 1px #000, inset 0 0 0 6px #2d2e2c, inset 0 0 0 7px #d2372b; }
  `,
  art: `<div class="hex" style="left:9px;top:9px"></div><div class="hex" style="right:9px;top:9px"></div><div class="hex" style="left:9px;top:160px"></div><div class="hex" style="right:9px;top:160px"></div>
    <div class="vent"></div><div class="badge"></div>${silverLow.art}`,
  buttons: silverLow.buttons,
  components: [...belowReels({ title: '#1e1f1e', artist: '#8f1f17', muted: '#4d4f4c' }), ...silverLow.components],
  packs: twoPacks,
  spinners: twoReels(silverReel),
});

// ---- "Lever": a grey front with white square keys, a scale and vents

const leverLow = lower({ width: 380, y: 142, look: 'tile', playLook: 'tile dot', toggleLook: 'peg', big: 60, mid: 60, toggle: [44, 44], list: 150 });
const lever = skin('lever', 'Lever', 'A grey front with white square keys, one marked red, a scale with a red pointer and vents.', ['grey', 'light', 'minimal', 'functional', 'keys', 'sixties'], {
  theme: theme({ background: '#b9bbbd', surface: '#e9e9e4', surfaceRaised: '#ffffff', foreground: '#1b1c1d', muted: '#3f4245', accent: '#8c1d12', accentContrast: '#ffffff', border: '#77797c', ok: '#0b5a2b', danger: '#8c1d12', focus: '#1f5fbf' }, HELVETICA, 1),
  width: 380,
  height: leverLow.height,
  resize: leverLow.resize,
  pad: 2,
  css: `
    body { background: linear-gradient(#c3c5c7, #adafb1); font-family: ${HELVETICA}; }
    .vents { position: absolute; right: 24px; top: 20px; width: 60px; height: 44px; background: repeating-linear-gradient(#55585b 0 2px, transparent 2px 6px); }
    .perf { position: absolute; left: 0; top: 0; width: 14px; height: 100%; background: radial-gradient(circle, #6d7073 1.2px, transparent 1.6px) 0 0 / 5px 5px; opacity: .7; }
    .scale { position: absolute; left: 24px; top: 78px; width: 332px; height: 52px; background: #e9e9e4; box-shadow: inset 0 1px 3px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.6); }
    .scale::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 5px; height: 5px; background: repeating-linear-gradient(90deg, #1b1c1d 0 1px, transparent 1px 8px); opacity: .55; }
    ${beds('#8f9194', '#e9e9e4', true)}
    .face { color: #1b1c1d; } .face svg { width: 20px; height: 20px; }
    .tile { border-radius: 3px; background: linear-gradient(160deg, #ffffff, #e0e0db); box-shadow: 0 0 0 1px #1b1c1d, 0 3px 3px rgba(0,0,0,.3), inset 0 0 0 4px rgba(255,255,255,.6), inset 0 -4px 6px rgba(0,0,0,.08); }
    .tile.dot svg { margin-top: -10px; }
    .tile.dot::after { content: ''; position: absolute; left: 50%; bottom: 9px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: #c9c9c4; }
    .peg { border-radius: 50%; background: linear-gradient(160deg, #fff, #d2d2cd); box-shadow: 0 0 0 1px #55585b, 0 2px 3px rgba(0,0,0,.3); }
    .peg svg { width: 16px; height: 16px; }
    ${STATES}
    .pressed .tile { box-shadow: 0 0 0 1px #1b1c1d, inset 0 3px 5px rgba(0,0,0,.3); }
    .active .tile.dot::after { background: #d2372b; box-shadow: 0 0 5px rgba(210,55,43,.9); }
    .active .peg { color: #fff; background: linear-gradient(160deg, #3a3c3e, #1b1c1d); box-shadow: 0 0 0 1px #000, 0 2px 3px rgba(0,0,0,.3); }
  `,
  art: `<div class="perf"></div><div class="vents"></div><div class="scale"></div>${leverLow.art}`,
  buttons: leverLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 24, y: 20, width: 260, height: 24, fontSize: 17, color: '#1b1c1d' },
    { type: 'text', source: 'track.artist', x: 24, y: 44, width: 260, height: 18, fontSize: 12, color: '#3f4245' },
    { type: 'time', source: 'position', x: 34, y: 84, width: 90, height: 34, fontSize: 24, color: '#1b1c1d' },
    { type: 'spectrum', x: 130, y: 88, width: 130, height: 28, color: '#8c1d12' },
    { type: 'text', source: 'player.status', x: 262, y: 86, width: 84, height: 14, fontSize: 10, align: 'right', color: '#8c1d12' },
    { type: 'time', source: 'duration', x: 262, y: 102, width: 84, height: 14, fontSize: 11, align: 'right', color: '#3f4245' },
    ...leverLow.components,
  ],
});

// ---- "Keys": a white keypad under a black display with green figures

const keysLow = lower({ width: 340, y: 150, look: 'cap', playLook: 'cap orange', toggleLook: 'cap', big: 60, mid: 60, toggle: [48, 44], list: 150 });
const keysSkin = skin('keys', 'Keys', 'A white keypad under a black display with green figures, and one orange key.', ['calculator', 'keypad', 'white', 'black', 'green', 'orange', 'minimal'], {
  theme: theme({ background: '#141614', surface: '#0c0e0c', surfaceRaised: '#2a2e2a', foreground: '#e9f5e4', muted: '#a3b59c', accent: '#6fe36a', accentContrast: '#031f02', border: '#3a403a', ok: '#6fe36a', danger: '#ff9d94', focus: '#ffd166' }, HELVETICA, 3, '"Menlo", "Consolas", monospace'),
  width: 340,
  height: keysLow.height,
  resize: keysLow.resize,
  pad: 3,
  css: `
    body { background: linear-gradient(170deg, #fbfbfa, #e6e6e3); box-shadow: inset 0 0 0 1px #c4c4c0, inset 0 2px 0 #fff; font-family: ${HELVETICA}; }
    .glass { position: absolute; left: 22px; top: 22px; width: 296px; height: 116px; border-radius: 8px; background: linear-gradient(#101210, #171a17); box-shadow: inset 0 2px 6px #000, 0 0 0 1px #000, 0 1px 0 1px #fff; }
    .tag { position: absolute; left: 34px; top: 30px; font-size: 7.5px; font-weight: 700; letter-spacing: .14em; color: #a3b59c; }
    ${beds('#141614', '#0c0e0c', false)}
    .slot { box-shadow: inset 0 1px 2px #000, 0 1px 0 #fff; } .well { border-radius: 8px; box-shadow: inset 0 2px 6px #000, 0 0 0 1px #000, 0 1px 0 1px #fff; }
    .face { color: #2a2e2a; } .face svg { width: 20px; height: 20px; }
    .cap { border-radius: 9px; background: linear-gradient(#ffffff, #efefec); box-shadow: 0 0 0 1px #b9b9b5, 0 2px 2px rgba(0,0,0,.14); }
    .cap.orange { color: #fff; background: linear-gradient(#ff7a2f, #f25c0a); box-shadow: 0 0 0 1px #b84300, 0 2px 2px rgba(0,0,0,.2); }
    ${STATES}
    .pressed .cap { box-shadow: 0 0 0 1px #b9b9b5, inset 0 2px 4px rgba(0,0,0,.2); }
    .active .cap { color: #0d5a0a; background: linear-gradient(#eafbe8, #cdf3ca); box-shadow: 0 0 0 1px #4fb84a, 0 2px 2px rgba(0,0,0,.14); }
    .active .cap.orange { color: #fff; background: linear-gradient(#ff7a2f, #f25c0a); box-shadow: 0 0 0 1px #b84300, 0 0 0 3px #fff, 0 0 0 4.5px #f25c0a; }
  `,
  art: `<div class="glass"></div><div class="tag">FLAC–1</div>${keysLow.art}`,
  buttons: keysLow.buttons,
  components: [
    { type: 'text', source: 'player.status', x: 200, y: 28, width: 106, height: 14, fontSize: 10, align: 'right', color: '#6fe36a' },
    { type: 'text', source: 'track.title', x: 34, y: 46, width: 272, height: 20, fontSize: 13, align: 'right', color: '#6fe36a' },
    { type: 'text', source: 'track.artist', x: 34, y: 66, width: 272, height: 16, fontSize: 11, align: 'right', color: '#a3b59c' },
    { type: 'spectrum', x: 34, y: 92, width: 120, height: 34, color: '#6fe36a' },
    { type: 'time', source: 'position', x: 160, y: 86, width: 146, height: 44, fontSize: 34, align: 'right', color: '#e9f5e4' },
    ...keysLow.components,
  ],
});

// ---- "Split": half white, half red, a thick black line around it

const splitLow = lower({ width: 380, y: 196, margin: 30, look: 'blob', playLook: 'blob', toggleLook: 'chip', big: 76, mid: 52, toggle: [44, 38], list: 150 });
const split = skin('split', 'Split', 'Half white, half red, a thick black line around it and two heavy black knobs.', ['bold', 'flat', 'red', 'white', 'black', 'graphic', 'light'], {
  theme: theme({ background: '#fbfaf7', surface: '#ffffff', surfaceRaised: '#ffffff', foreground: '#131313', muted: '#505050', accent: '#b5301b', accentContrast: '#ffffff', border: '#131313', ok: '#0b5a2b', danger: '#b5301b', focus: '#1f5fbf' }, '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif', 8),
  width: 380,
  height: splitLow.height,
  resize: splitLow.resize,
  css: `
    body { background: linear-gradient(90deg, #fbfaf7 0 50%, #e8452c 50%); font-family: "Avenir Next", "Helvetica Neue", sans-serif; }
    .card { position: absolute; left: 12px; top: 12px; right: 12px; bottom: 4px; border-radius: 26px; box-shadow: inset 0 0 0 4px #131313; }
    .paper { position: absolute; left: 30px; top: 30px; width: 320px; height: 152px; border-radius: 14px; background: #fff; box-shadow: inset 0 0 0 2.5px #131313; }
    .sun { position: absolute; left: 286px; top: 46px; width: 40px; height: 40px; border-radius: 50%; background: #ff3fa0; box-shadow: -14px 10px 0 #ffd91a; mix-blend-mode: multiply; }
    ${beds('#fff', '#fff', true)}
    .slot { box-shadow: inset 0 0 0 2px #131313; } .well { border-radius: 14px; box-shadow: inset 0 0 0 2.5px #131313; }
    .face { color: #fff; } .face svg { width: 38%; height: 38%; }
    .blob { border-radius: 50%; background: radial-gradient(circle at 38% 30%, #4a4a4a, #131313 70%); box-shadow: 0 5px 0 rgba(0,0,0,.25), 0 0 0 3px #fbfaf7, 0 0 0 5px #131313; }
    .chip { border-radius: 10px; color: #131313; background: #fff; box-shadow: inset 0 0 0 2px #131313; }
    .chip svg { width: 17px; height: 17px; }
    .hover .blob { background: radial-gradient(circle at 38% 30%, #666, #222 70%); } .hover .chip { background: #ffe9e4; }
    .pressed .blob { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0,0,0,.25), 0 0 0 3px #fbfaf7, 0 0 0 5px #131313; } .pressed .chip { color: #fff; background: #131313; }
    .active .blob { color: #ffd91a; box-shadow: 0 5px 0 rgba(0,0,0,.25), 0 0 0 3px #ffd91a, 0 0 0 5px #131313; }
    .active .chip { color: #fff; background: #131313; }
  `,
  art: `<div class="card"></div><div class="paper"></div><div class="sun"></div>${splitLow.art}`,
  buttons: splitLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 46, y: 42, width: 230, height: 26, fontSize: 18, color: '#131313' },
    { type: 'text', source: 'track.artist', x: 46, y: 68, width: 230, height: 18, fontSize: 12, color: '#b5301b' },
    { type: 'time', source: 'position', x: 46, y: 104, width: 110, height: 44, fontSize: 32, color: '#131313' },
    { type: 'spectrum', x: 164, y: 112, width: 90, height: 32, color: '#131313' },
    { type: 'text', source: 'player.status', x: 258, y: 112, width: 78, height: 14, fontSize: 10, align: 'right', color: '#b5301b' },
    { type: 'time', source: 'duration', x: 258, y: 130, width: 78, height: 14, fontSize: 11, align: 'right', color: '#505050' },
    ...splitLow.components,
  ],
});

// ---- "Patch": a white synthesiser, five keys in five colours, dotted wires

const patchLow = lower({ width: 380, y: 166, look: 'sq', playLook: 'sq', toggleLook: 'pot', big: 56, mid: 56, toggle: [44, 44], list: 150 });
const PATCH_COLOURS = ['#8b949c', '#f2b91e', '#4fc7c0', '#2f7fe0', '#e8502f'];
patchLow.buttons.slice(0, 5).forEach((b, i) => (b.look = `sq c${i}`));
const patch = skin('patch', 'Patch', 'A white synthesiser: five keys in five colours, small white knobs, grilles and dotted wires.', ['synthesiser', 'white', 'light', 'colourful', 'minimal', 'dots'], {
  theme: theme({ background: '#efefeb', surface: '#ffffff', surfaceRaised: '#ffffff', foreground: '#1a1b1c', muted: '#4c4f52', accent: '#1d5fb8', accentContrast: '#ffffff', border: '#9a9c9e', ok: '#0b5a2b', danger: '#a3231b', focus: '#b83216' }, HELVETICA, 3),
  width: 380,
  height: patchLow.height,
  resize: patchLow.resize,
  pad: 5,
  css: `
    body { background: linear-gradient(170deg, #f7f7f4, #e6e6e2); font-family: ${HELVETICA}; }
    .cone { position: absolute; top: 18px; width: 70px; height: 70px; border-radius: 50%; background: radial-gradient(circle, #2a2b2c 1.5px, transparent 1.9px) 0 0 / 7px 7px, #f7f7f4; box-shadow: inset 0 0 0 1px #c9c9c5; }
    .wire { position: absolute; height: 0; border-top: 2px dotted #1a1b1c; opacity: .7; }
    .drop { position: absolute; width: 0; border-left: 1.5px solid #1a1b1c; opacity: .5; }
    .strip { position: absolute; left: 100px; top: 18px; width: 180px; height: 70px; border-radius: 4px; background: #fff; box-shadow: inset 0 1px 3px rgba(0,0,0,.3), 0 1px 0 #fff; }
    ${beds('#cfcfcb', '#fff', true)}
    .face { color: #fff; } .face svg { width: 20px; height: 20px; filter: drop-shadow(0 1px 0 rgba(0,0,0,.3)); }
    .sq { border-radius: 5px; box-shadow: 0 0 0 1px rgba(0,0,0,.45), 0 3px 3px rgba(0,0,0,.25), inset 0 0 0 3px rgba(255,255,255,.3), inset 0 -5px 6px rgba(0,0,0,.14); }
    ${PATCH_COLOURS.map((c, i) => `.sq.c${i} { background: ${c}; }`).join(' ')}
    .pot { border-radius: 50%; color: #1a1b1c; background: radial-gradient(circle at 40% 30%, #fff, #d6d6d2 75%); box-shadow: 0 0 0 1px #9a9c9e, 0 2px 3px rgba(0,0,0,.25); }
    .pot svg { width: 16px; height: 16px; filter: none; }
    ${STATES}
    .pressed .sq { box-shadow: 0 0 0 1px rgba(0,0,0,.45), inset 0 3px 6px rgba(0,0,0,.35); }
    .active .sq { box-shadow: 0 0 0 1px rgba(0,0,0,.45), 0 0 0 3px #efefeb, 0 0 0 5px #1a1b1c, inset 0 0 0 3px rgba(255,255,255,.3); }
    .active .pot { color: #fff; background: radial-gradient(circle at 40% 30%, #4a8be0, #1d5fb8 75%); box-shadow: 0 0 0 1px #0f3f80, 0 2px 3px rgba(0,0,0,.25); }
  `,
  art: `<div class="cone" style="left:20px"></div><div class="cone" style="right:20px"></div><div class="strip"></div>
    <div class="wire" style="left:24px;top:150px;width:332px"></div>
    ${[78, 134, 190, 246, 302].map((x) => `<div class="drop" style="left:${x}px;top:152px;height:34px"></div>`).join('')}
    ${patchLow.art}`,
  buttons: patchLow.buttons,
  components: [
    { type: 'time', source: 'position', x: 110, y: 22, width: 80, height: 34, fontSize: 24, color: '#1a1b1c' },
    { type: 'text', source: 'player.status', x: 190, y: 26, width: 80, height: 14, fontSize: 10, align: 'right', color: '#1d5fb8' },
    { type: 'time', source: 'duration', x: 190, y: 40, width: 80, height: 14, fontSize: 11, align: 'right', color: '#4c4f52' },
    { type: 'spectrum', x: 110, y: 58, width: 160, height: 24, color: '#1d5fb8' },
    { type: 'text', source: 'track.title', x: 24, y: 98, width: 332, height: 24, fontSize: 17, align: 'center', color: '#1a1b1c' },
    { type: 'text', source: 'track.artist', x: 24, y: 122, width: 332, height: 18, fontSize: 12, align: 'center', color: '#4c4f52' },
    ...patchLow.components,
  ],
});

// ---- "Chrome": a smoke-grey cassette on black, the type in teal

const chromeLow = lower({ width: 400, y: 280, look: 'plate', playLook: 'plate', toggleLook: 'thin', big: 72, mid: 72, toggle: [46, 38], list: 150 });
const chromeSkin = skin('chrome', 'Chrome', 'A smoke-grey cassette on black: the type in teal, hubs with fine teeth, two red eyes.', ['cassette', 'dark', 'grey', 'teal', 'elegant', 'skeuomorphic'], {
  theme: theme({ background: '#161616', surface: '#0d0d0d', surfaceRaised: '#2c2c2b', foreground: '#f1f0ec', muted: '#aeada7', accent: '#49d6b6', accentContrast: '#002019', border: '#000000', ok: '#49d6b6', danger: '#ff9d94', focus: '#ffd166' }, '"Baskerville", "Georgia", "Times New Roman", serif'),
  width: 400,
  height: chromeLow.height,
  resize: chromeLow.resize,
  pad: 2,
  css: `
    body { background: radial-gradient(110% 60% at 50% 20%, #2a2a29, #0f0f0f 75%); font-family: Baskerville, Georgia, serif; }
    .shell { position: absolute; left: 20px; top: 18px; width: 360px; height: 230px; border-radius: 10px; background: linear-gradient(#6a6964, #55544f); box-shadow: 0 6px 12px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.3), inset 0 0 0 1px #2a2a28; }
    .arc { position: absolute; left: 30px; top: 22px; width: 300px; height: 300px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); -webkit-mask-image: linear-gradient(#000 0 52%, transparent 52%); }
    .label { position: absolute; left: 112px; top: 12px; width: 136px; height: 150px; background: linear-gradient(#262624, #1b1b1a); box-shadow: inset 0 0 0 1px #000; }
    .label::before { content: 'SUPER CHROME'; position: absolute; left: 0; right: 0; top: 8px; text-align: center; font-size: 8px; letter-spacing: .14em; color: #f1f0ec; }
    .label::after { content: 'FLAC'; position: absolute; left: 0; right: 0; top: 18px; text-align: center; font-size: 30px; letter-spacing: .04em; color: #49d6b6; }
    .gapw { position: absolute; left: 86px; top: 108px; width: 188px; height: 60px; border-radius: 30px; background: #161616; box-shadow: inset 0 3px 6px #000, 0 0 0 1px #3a3a38; }
    .gapw::after { content: ''; position: absolute; left: 70px; right: 70px; top: 26px; height: 8px; background: repeating-linear-gradient(90deg, #f1f0ec 0 2px, transparent 2px 5px); }
    .sixty { position: absolute; right: 22px; top: 118px; font-size: 26px; font-style: italic; color: #e3e2dd; }
    .mk { position: absolute; left: 22px; top: 130px; font-size: 9px; letter-spacing: .2em; color: #e3e2dd; }
    .base { position: absolute; left: 60px; bottom: 0; width: 240px; height: 42px; background: #4a4945; clip-path: polygon(5% 0, 95% 0, 100% 100%, 0 100%); }
    .base::after { content: ''; position: absolute; left: 60px; top: 14px; width: 120px; height: 14px; background: radial-gradient(circle, #161616 3px, #d2372b 3.4px 6px, transparent 6.4px) 0 0 / 120px 14px, radial-gradient(circle at 10% 50%, #161616 3px, #d2372b 3.4px 6px, transparent 6.4px), radial-gradient(circle at 90% 50%, #161616 3px, #d2372b 3.4px 6px, transparent 6.4px); }
    .gear { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, #161616 0 9px, transparent 9px), repeating-conic-gradient(#f1f0ec 0 10deg, #161616 10deg 20deg); box-shadow: inset 0 0 0 5px #f1f0ec, 0 0 0 2px #f1f0ec, 0 0 0 3px #161616; }
    ${beds('#0a0a0a', '#0d0d0d', false)}
    .face { color: #f1f0ec; } .face svg { width: 20px; height: 20px; }
    .plate { border-radius: 2px; background: linear-gradient(#3a3a38, #1f1f1e); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.18); }
    .thin { border-radius: 3px; color: #aeada7; } .thin svg { width: 18px; height: 18px; }
    ${STATES}
    .hover .thin { color: #fff; } .pressed .plate { box-shadow: 0 0 0 1px #000, inset 0 3px 5px rgba(0,0,0,.7); }
    .active .plate { color: #49d6b6; box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.18), inset 0 -3px 0 #49d6b6; }
    .active .thin { color: #49d6b6; box-shadow: inset 0 -2px 0 #49d6b6; }
  `,
  art: `<div class="shell"><div class="arc"></div><div class="label"></div><div class="gapw"></div><div class="mk">STEREO</div><div class="sixty">60</div><div class="base"></div></div>${chromeLow.art}`,
  buttons: chromeLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 20, y: 252, width: 250, height: 24, fontSize: 16, color: '#f1f0ec' },
    { type: 'time', source: 'position', x: 276, y: 252, width: 50, height: 24, fontSize: 13, align: 'right', color: '#49d6b6' },
    { type: 'time', source: 'duration', x: 330, y: 252, width: 50, height: 24, fontSize: 13, align: 'right', color: '#aeada7' },
    { type: 'text', source: 'track.artist', x: 136, y: 84, width: 128, height: 16, fontSize: 10, align: 'center', color: '#aeada7' },
    { type: 'text', source: 'player.status', x: 136, y: 184, width: 128, height: 14, fontSize: 10, align: 'center', color: '#49d6b6' },
    ...chromeLow.components,
  ],
  spinners: [
    { name: 'hub-left', x: 114, y: 134, width: 44, height: 44, period: 2600, html: '<div class="gear"></div>' },
    { name: 'hub-right', x: 242, y: 134, width: 44, height: 44, period: 2600, html: '<div class="gear"></div>' },
  ],
});

// ---- "Switch": soft white, round keys in cream, red and green, a lever and a rocker

const switchLow = lower({ width: 360, y: 150, look: 'bud', playLook: 'bud red', toggleLook: 'flip', big: 64, mid: 56, toggle: [48, 44], list: 150 });
switchLow.buttons[4].look = 'bud green';
const switchSkin = skin('switch', 'Switch', 'Soft white with round keys in cream, red and green, a lever and a black rocker.', ['white', 'light', 'soft', 'switches', 'minimal', 'sixties'], {
  theme: theme({ background: '#f1f0ec', surface: '#ffffff', surfaceRaised: '#ffffff', foreground: '#1d1d1b', muted: '#52524e', accent: '#a8321a', accentContrast: '#ffffff', border: '#a4a39e', ok: '#2f6a3c', danger: '#a8321a', focus: '#1f5fbf' }, HELVETICA, 3),
  width: 360,
  height: switchLow.height,
  resize: switchLow.resize,
  css: `
    body { background: radial-gradient(120% 80% at 30% 0%, #ffffff, #e9e8e3 70%); font-family: ${HELVETICA}; }
    .tray { position: absolute; left: 22px; top: 20px; width: 232px; height: 118px; border-radius: 6px; background: #fff; box-shadow: inset 0 1px 3px rgba(0,0,0,.3), 0 1px 0 #fff; }
    .leverarm { position: absolute; left: 274px; top: 28px; width: 62px; height: 34px; border-radius: 60% 40% 40% 60% / 50%; background: linear-gradient(#fff, #dcdbd6); box-shadow: 0 4px 6px rgba(0,0,0,.3), inset 0 -3px 5px rgba(0,0,0,.1); transform: rotate(-24deg); }
    .rock { position: absolute; left: 286px; top: 88px; width: 44px; height: 26px; border-radius: 13px 4px 4px 13px; background: linear-gradient(#3a3a38, #151514); box-shadow: 0 4px 5px rgba(0,0,0,.35); }
    .steps { position: absolute; left: 338px; top: 30px; width: 12px; height: 90px; background: repeating-linear-gradient(#1d1d1b 0 1px, transparent 1px 15px); opacity: .6; }
    ${beds('#d6d5d0', '#fff', true)}
    .face { color: #1d1d1b; } .face svg { width: 18px; height: 18px; }
    .bud { border-radius: 50%; background: radial-gradient(circle at 38% 28%, #ffffff, #e2e0d6 70%); box-shadow: 0 0 0 1px #b9b8b2, 0 4px 5px rgba(0,0,0,.2), inset 0 -3px 5px rgba(0,0,0,.08); }
    .bud.red { color: #fff; background: radial-gradient(circle at 38% 28%, #ee6a4c, #c13a1d 70%); box-shadow: 0 0 0 1px #8c2710, 0 4px 5px rgba(0,0,0,.25); }
    .bud.red svg { width: 24px; height: 24px; }
    .bud.green { color: #fff; background: radial-gradient(circle at 38% 28%, #6f9a78, #3f6a4a 70%); box-shadow: 0 0 0 1px #2c4d35, 0 4px 5px rgba(0,0,0,.25); }
    .flip { border-radius: 4px; background: linear-gradient(160deg, #fff, #ecebe5); box-shadow: 0 0 0 1px #8f8e89, 0 2px 3px rgba(0,0,0,.18), inset 0 0 0 3px rgba(255,255,255,.7); }
    .flip svg { width: 16px; height: 16px; margin-top: -8px; }
    .flip::after { content: ''; position: absolute; left: 50%; bottom: 6px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: #d2d1cb; }
    ${STATES}
    .pressed .bud, .pressed .flip { box-shadow: 0 0 0 1px #8f8e89, inset 0 3px 5px rgba(0,0,0,.25); }
    .active .bud.red { box-shadow: 0 0 0 1px #8c2710, 0 0 0 3px #f1f0ec, 0 0 0 4.5px #c13a1d; }
    .active .flip::after { background: #f2581c; box-shadow: 0 0 4px rgba(242,88,28,.9); }
  `,
  art: `<div class="tray"></div><div class="leverarm"></div><div class="rock"></div><div class="steps"></div>${switchLow.art}`,
  buttons: switchLow.buttons,
  components: display(34, 28, 208, { title: '#1d1d1b', artist: '#a8321a', time: '#1d1d1b', bars: '#52524e', muted: '#52524e' }).filter((c) => c.type !== 'spectrum').concat(switchLow.components),
});

// ---- "Gauge": two round instruments lit in cyan on navy

const gaugeLow = lower({ width: 380, y: 220, look: 'gloss', playLook: 'gloss hot', toggleLook: 'gloss', big: 72, mid: 54, toggle: [46, 46], list: 150 });
const gauge = skin('gauge', 'Gauge', 'Two round instruments lit in cyan on navy, as in a dashboard at night.', ['dashboard', 'instruments', 'dark', 'navy', 'cyan', 'glow'], {
  theme: theme({ background: '#131c2b', surface: '#0a111c', surfaceRaised: '#24324a', foreground: '#eaf3ff', muted: '#9fb2cc', accent: '#5fd8ff', accentContrast: '#001a24', border: '#05090f', ok: '#7fdca0', danger: '#ff9d94', focus: '#ffd166' }, '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif', 6),
  width: 380,
  height: gaugeLow.height,
  resize: gaugeLow.resize,
  css: `
    body { background: radial-gradient(120% 70% at 50% 0%, #1f2e47, #0f1724 70%); }
    .dialface { position: absolute; top: 18px; width: 164px; height: 164px; border-radius: 50%; background: radial-gradient(circle, #0a111c 0 62%, #101a2a 62%); box-shadow: inset 0 3px 10px #000, 0 0 0 3px #2a3a55, 0 0 0 4px #05090f, 0 0 18px rgba(95,216,255,.18); }
    .dialface::before { content: ''; position: absolute; inset: 8px; border-radius: 50%; background: repeating-conic-gradient(from 225deg, #5fd8ff 0 1.2deg, transparent 1.2deg 9deg);
      -webkit-mask-image: radial-gradient(circle, transparent 0 62px, #000 62px 72px, transparent 72px), conic-gradient(from 224deg, #000 0 272deg, transparent 272deg); -webkit-mask-composite: source-in; }
    .dialface::after { content: ''; position: absolute; inset: 8px; border-radius: 50%; background: conic-gradient(from 60deg, #ff6b60 0 36deg, transparent 36deg);
      -webkit-mask-image: radial-gradient(circle, transparent 0 66px, #000 66px 72px, transparent 72px); }
    ${beds('#070c14', '#0a111c', false)}
    .face { color: #eaf3ff; } .face svg { width: 18px; height: 18px; }
    .gloss { border-radius: 50%; background: radial-gradient(circle at 50% 18%, #3d5478, #111a29 70%); box-shadow: 0 0 0 1px #05090f, 0 3px 5px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.25); }
    .gloss.hot { color: #ff8a80; box-shadow: 0 0 0 1px #05090f, 0 3px 5px rgba(0,0,0,.6), inset 0 0 0 3px #ff6b60, inset 0 0 0 4px #05090f; }
    .gloss.hot svg { width: 26px; height: 26px; }
    ${STATES}
    .pressed .gloss { box-shadow: 0 0 0 1px #05090f, inset 0 3px 6px rgba(0,0,0,.8); }
    .active .gloss { color: #5fd8ff; box-shadow: 0 0 0 1px #05090f, 0 0 0 2.5px #5fd8ff, 0 0 10px 2px rgba(95,216,255,.5); }
    .active .gloss.hot { color: #fff; box-shadow: 0 0 0 1px #05090f, 0 0 14px 4px rgba(255,107,96,.55), inset 0 0 0 3px #ff6b60, inset 0 0 0 4px #05090f; }
  `,
  art: `<div class="dialface" style="left:22px"></div><div class="dialface" style="left:194px"></div>${gaugeLow.art}`,
  buttons: gaugeLow.buttons,
  components: [
    { type: 'time', source: 'position', x: 44, y: 76, width: 120, height: 44, fontSize: 30, align: 'center', color: '#eaf3ff' },
    { type: 'time', source: 'duration', x: 44, y: 122, width: 120, height: 16, fontSize: 11, align: 'center', color: '#9fb2cc' },
    { type: 'spectrum', x: 226, y: 74, width: 100, height: 44, color: '#5fd8ff' },
    { type: 'text', source: 'player.status', x: 216, y: 124, width: 120, height: 14, fontSize: 10, align: 'center', color: '#9fb2cc' },
    { type: 'text', source: 'track.title', x: 24, y: 186, width: 220, height: 24, fontSize: 16, color: '#eaf3ff' },
    { type: 'text', source: 'track.artist', x: 248, y: 190, width: 108, height: 18, fontSize: 12, align: 'right', color: '#5fd8ff' },
    ...gaugeLow.components,
  ],
});

// ---- "Ember": amber on black, small red keys, lines of segments

const emberLow = lower({ width: 320, y: 118, margin: 14, look: 'nub', playLook: 'nub', toggleLook: 'nub dim', big: 54, mid: 54, toggle: [40, 30], list: 160 });
const ember = skin('ember', 'Ember', 'Amber on black: lines of glowing segments, small red keys and narrow print.', ['dark', 'amber', 'segments', 'compact', 'nineties', 'red'], {
  theme: theme({ background: '#100d09', surface: '#060504', surfaceRaised: '#2a2117', foreground: '#f5c56b', muted: '#b88f47', accent: '#ff5a48', accentContrast: '#1c0300', border: '#3a2c18', ok: '#9fd96a', danger: '#ff8f85', focus: '#7fc4ff' }, '"Menlo", "Consolas", "Courier New", monospace', 1),
  width: 320,
  height: emberLow.height,
  resize: emberLow.resize,
  pad: 2,
  css: `
    body { background: linear-gradient(#17130d, #0c0a07); box-shadow: inset 0 0 0 1px #3a2c18, inset 0 0 0 2px #000; }
    .bar { position: absolute; left: 0; top: 0; width: 100%; height: 14px; background: repeating-linear-gradient(90deg, #b88f47 0 2px, transparent 2px 4px) 30px 5px / 260px 4px no-repeat, #1d170f; box-shadow: 0 1px 0 #000; }
    .pane { position: absolute; left: 12px; top: 22px; width: 296px; height: 86px; background: #060504; box-shadow: inset 0 0 0 1px #3a2c18, inset 0 2px 6px #000; }
    .seg { position: absolute; left: 14px; height: 6px; background: repeating-linear-gradient(90deg, #6b5226 0 3px, transparent 3px 5px); }
    ${beds('#060504', '#060504', false)}
    .slot { border-radius: 1px; box-shadow: inset 0 0 0 1px #3a2c18; } .well { border-radius: 1px; box-shadow: inset 0 0 0 1px #3a2c18, inset 0 2px 6px #000; }
    .face { color: #ff5a48; } .face svg { width: 18px; height: 18px; }
    .nub { border-radius: 2px; background: linear-gradient(#2a1410, #170a08); box-shadow: 0 0 0 1px #5a1f17, inset 0 1px 0 rgba(255,255,255,.12); }
    .nub.dim { color: #b88f47; background: linear-gradient(#221a10, #120e08); box-shadow: 0 0 0 1px #3a2c18; } .nub.dim svg { width: 15px; height: 15px; }
    ${STATES}
    .hover .nub { background: linear-gradient(#3d1c16, #20100c); }
    .pressed .nub { box-shadow: 0 0 0 1px #5a1f17, inset 0 2px 4px #000; }
    .active .nub { color: #1c0300; background: linear-gradient(#ff7b6c, #e23c2a); box-shadow: 0 0 0 1px #5a1f17, 0 0 8px rgba(255,90,72,.6); }
    .active .nub.dim { color: #1c0b00; background: linear-gradient(#f5c56b, #d99a2f); box-shadow: 0 0 0 1px #3a2c18, 0 0 8px rgba(245,197,107,.5); }
  `,
  art: `<div class="bar"></div><div class="pane"></div>${emberLow.art}`,
  buttons: emberLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 20, y: 26, width: 280, height: 18, fontSize: 12, color: '#f5c56b' },
    { type: 'text', source: 'track.artist', x: 20, y: 44, width: 180, height: 14, fontSize: 10, color: '#b88f47' },
    { type: 'text', source: 'player.status', x: 204, y: 44, width: 96, height: 14, fontSize: 10, align: 'right', color: '#ff5a48' },
    { type: 'time', source: 'position', x: 20, y: 62, width: 90, height: 40, fontSize: 28, color: '#f5c56b' },
    { type: 'spectrum', x: 116, y: 68, width: 130, height: 32, color: '#f5c56b' },
    { type: 'time', source: 'duration', x: 250, y: 86, width: 50, height: 14, fontSize: 10, align: 'right', color: '#b88f47' },
    ...emberLow.components,
  ],
});

// ---- "Click": the grey-green display of an early pocket player, and a ring of keys

const click = skin('click', 'Click', 'An early pocket player: a grey-green display with black print, a ring of keys and a button in its middle.', ['pocket player', 'light', 'monochrome', 'ring', 'display', 'two thousand'], {
  ...wheel,
  theme: theme({ background: '#eceded', surface: '#c7cdc0', surfaceRaised: '#e2e6dd', foreground: '#14160f', muted: '#3f4437', accent: '#14160f', accentContrast: '#c7cdc0', border: '#6f7566', ok: '#0b5a2b', danger: '#8f1d16', focus: '#1f5fbf' }, '"Geneva", "Verdana", "Helvetica Neue", sans-serif', 2),
  css: wheel.css
    .replace('linear-gradient(#f4f9fc, #dcebf5)', 'linear-gradient(#c3c9bc, #cdd3c6)')
    .replace('linear-gradient(#f7fafc, #c9dbe8); box-shadow: 0 1px 0 #9fb3c2;', 'none; box-shadow: 0 1.5px 0 #14160f;')
    .replace('linear-gradient(#7fe07a, #2f9a2a); box-shadow: 0 0 0 1px #2a2d30;', 'linear-gradient(90deg, #14160f 0 70%, transparent 70%); box-shadow: 0 0 0 1px #14160f;')
    .replace('linear-gradient(#b9bdc1, #a8acb0)', 'linear-gradient(#fbfbfb, #e4e5e5)')
    .replace("${beds('#cfd3d7', '#e8f1f8', true)}", '')
    .replace('.face { color: #fff; }', '.face { color: #8d9296; } .ringpad { box-shadow: inset 0 0 0 1px #b4b8bc, 0 1px 0 #fff !important; } .well { background: #c7cdc0 !important; }')
    .replace('.active .hub { color: #1a62a8; box-shadow: 0 0 0 1px #1a62a8, 0 0 0 3px rgba(26,98,168,.3); }', '.active .hub { color: #14160f; box-shadow: 0 0 0 1px #6f7566, 0 0 0 3px rgba(20,22,15,.25); }')
    .replace('.active .lite { color: #fff; background: #1a62a8; }', '.active .lite { color: #c7cdc0; background: #14160f; }'),
  components: [
    { type: 'text', source: 'player.status', x: 60, y: 24, width: 220, height: 18, fontSize: 12, align: 'center', color: '#14160f' },
    { type: 'text', source: 'track.title', x: 34, y: 56, width: 272, height: 24, fontSize: 15, color: '#14160f' },
    { type: 'text', source: 'track.artist', x: 34, y: 82, width: 272, height: 20, fontSize: 13, color: '#3f4437' },
    { type: 'spectrum', x: 34, y: 112, width: 272, height: 44, color: '#14160f' },
    ...wheel.components.filter((c) => ['seekbar', 'time', 'volume', 'playlist'].includes(c.type)).map((c) => (c.color ? { ...c, color: '#14160f' } : c)),
  ],
  overlays: undefined,
});
click.folder = 'click';
click.manifest = { id: 'io.github.krocon.click', name: 'Click', description: 'An early pocket player: a grey-green display with black print, a ring of keys and a button in its middle.', theme: click.theme };
click.keywords = ['pocket player', 'light', 'monochrome', 'ring', 'display'];

// ---- "Classic": an olive-grey cassette player, a speaker with the time on it, an orange key

const classicLow = lower({ width: 380, y: 296, look: 'slat', playLook: 'slat', toggleLook: 'tabk', big: 72, mid: 72, toggle: [46, 38], list: 150, seek: false });
const classic = skin('classic', 'Classic', 'An olive-grey cassette player: the time large on its speaker, a cassette with the cover, an orange key.', ['cassette', 'player', 'olive', 'grey', 'dark', 'cover', 'orange'], {
  theme: theme({ background: '#3c3d37', surface: '#0f0f0d', surfaceRaised: '#55564f', foreground: '#f5f5f0', muted: '#c9c9bf', accent: '#ff9a3d', accentContrast: '#221000', border: '#1a1a17', ok: '#9fd96a', danger: '#ffa39b', focus: '#7fc4ff' }, '"Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif', 4),
  width: 380,
  height: classicLow.height,
  resize: classicLow.resize,
  pad: 2,
  css: `
    body { background: linear-gradient(#6a6b63, #55564f); font-family: "Avenir Next", "Helvetica Neue", sans-serif; }
    .speaker { position: absolute; left: 20px; top: 16px; width: 340px; height: 96px; border-radius: 10px; background: radial-gradient(circle, #0f0f0d 1.6px, transparent 2px) 0 0 / 8px 8px, linear-gradient(#34352f, #2a2b26); box-shadow: inset 0 2px 6px rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.2); }
    .bayc { position: absolute; left: 20px; top: 122px; width: 340px; height: 122px; border-radius: 8px; background: #1a1a17; box-shadow: inset 0 3px 8px #000, 0 1px 0 rgba(255,255,255,.2); }
    .bayc::before, .bayc::after { content: ''; position: absolute; top: 40px; width: 5px; height: 40px; border-radius: 3px; background: #ff9a3d; }
    .bayc::before { left: 4px; } .bayc::after { right: 4px; }
    .shellc { position: absolute; left: 16px; top: 8px; width: 308px; height: 106px; border-radius: 6px; background: linear-gradient(#4a4b45 0 46%, #efece4 46%); box-shadow: 0 3px 6px rgba(0,0,0,.6), inset 0 0 0 1px #000; }
    .ninety { position: absolute; right: 14px; top: 52px; font-size: 28px; font-weight: 800; color: #6a6b63; }
    .eyec { position: absolute; left: 70px; top: 54px; width: 150px; height: 40px; border-radius: 20px; background: #1a1a17; box-shadow: inset 0 2px 4px #000; }
    .wave { position: absolute; left: 20px; top: 254px; width: 340px; height: 34px; border-radius: 6px; background: #0f0f0d; box-shadow: inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.2); }
    .blank { position: absolute; inset: 0; background: linear-gradient(135deg, #8a8b82, #55564f); display: grid; place-items: center; color: #f5f5f0; }
    .blank svg { width: 22px; height: 22px; }
    ${COG_CSS}
    ${beds('#1a1a17', '#0f0f0d', false)}
    .face { color: #f5f5f0; } .face svg { width: 20px; height: 20px; margin-top: -12px; }
    .slat { border-radius: 2px; background: repeating-linear-gradient(0deg, rgba(0,0,0,.25) 0 2px, transparent 2px 5px) 0 100% / 100% 16px no-repeat, linear-gradient(#77786f, #5a5b54); box-shadow: 0 0 0 1px #1a1a17, inset 0 1px 0 rgba(255,255,255,.25); }
    .tabk { border-radius: 4px; color: #f5f5f0; background: linear-gradient(#55564f, #3c3d37); box-shadow: 0 0 0 1px #1a1a17, inset 0 1px 0 rgba(255,255,255,.2); }
    .tabk svg { width: 17px; height: 17px; margin-top: 0; }
    ${STATES}
    .pressed .slat { transform: translateY(2px); box-shadow: 0 0 0 1px #1a1a17, inset 0 3px 5px rgba(0,0,0,.5); }
    .active .slat { transform: translateY(2px); color: #ffb86b; box-shadow: 0 0 0 1px #1a1a17, inset 0 3px 5px rgba(0,0,0,.45), inset 0 -3px 0 #ff9a3d; }
    .active .tabk { color: #221000; background: linear-gradient(#ffb86b, #f08a24); }
  `,
  art: `<div class="speaker"></div><div class="bayc"><div class="shellc"><div class="eyec"></div><div class="ninety">90</div></div></div><div class="wave"></div>${classicLow.art}`,
  buttons: classicLow.buttons,
  components: [
    { type: 'text', source: 'player.status', x: 34, y: 22, width: 312, height: 16, fontSize: 11, align: 'center', color: '#c9c9bf' },
    { type: 'time', source: 'position', x: 34, y: 36, width: 312, height: 60, fontSize: 48, align: 'center', color: '#f5f5f0' },
    { type: 'time', source: 'duration', x: 290, y: 90, width: 56, height: 16, fontSize: 11, align: 'right', color: '#c9c9bf' },
    { type: 'text', source: 'track.title', x: 90, y: 136, width: 240, height: 20, fontSize: 14, color: '#f5f5f0' },
    { type: 'text', source: 'track.artist', x: 90, y: 156, width: 240, height: 16, fontSize: 11, color: '#ff9a3d' },
    { type: 'spectrum', x: 34, y: 258, width: 312, height: 26, color: '#c3a8f5' },
    ...classicLow.components,
  ],
  overlays: [{ name: 'cover', x: 44, y: 136, width: 38, height: 38, source: 'track.cover', html: NOTE }],
  spinners: [smallHub('hub-left', 118, 190), smallHub('hub-right', 180, 190)],
});

// ---- "Radar": a silver deck with two speaker cones and a clear cassette

const radarLow = lower({ width: 360, y: 300, look: 'stub', playLook: 'stub', toggleLook: 'stub tiny', big: 60, mid: 60, toggle: [44, 34], list: 150 });
const radar = skin('radar', 'Radar', 'A silver deck with two speaker cones, a green window and a clear cassette.', ['deck', 'silver', 'light', 'speakers', 'cassette', 'skeuomorphic'], {
  theme: theme({ background: '#c9ccd0', surface: '#d6e4c8', surfaceRaised: '#eef5e6', foreground: '#151a12', muted: '#414b3a', accent: '#8c1d12', accentContrast: '#ffffff', border: '#7b8087', ok: '#0b5a2b', danger: '#8c1d12', focus: '#1f5fbf' }, HELVETICA, 2),
  width: 360,
  height: radarLow.height,
  resize: radarLow.resize,
  pad: 2,
  css: `
    body { background: repeating-linear-gradient(0deg, rgba(255,255,255,.2) 0 .5px, rgba(0,0,0,.04) .5px 1px, transparent 1px 2.5px), linear-gradient(#dcdfe2, #b6babf); box-shadow: inset 0 1px 0 #fff; font-family: ${HELVETICA}; }
    .cone { position: absolute; top: 20px; width: 96px; height: 96px; border-radius: 50%; background: radial-gradient(circle, #6d7278 0 12px, #1a1c1f 12px 14px, #3a3d41 14px 30px, #232528 30px 32px, #4a4e53 32px 44px, #1a1c1f 44px 46px, #e9ebed 46px); box-shadow: 0 0 0 1px #6d7278, inset 0 0 0 2px #fff, 0 2px 4px rgba(0,0,0,.3); }
    .lcd { position: absolute; left: 130px; top: 20px; width: 100px; height: 96px; border-radius: 3px; background: linear-gradient(#cfdfc0, #dde9d0); box-shadow: inset 0 2px 5px rgba(0,0,0,.45), 0 0 0 2px #2a2c2f, 0 1px 0 2px #fff; }
    .strip { position: absolute; left: 22px; top: 130px; width: 316px; height: 46px; background: #d6e4c8; box-shadow: inset 0 1px 3px rgba(0,0,0,.4), 0 1px 0 #fff; }
    .clear { position: absolute; left: 40px; top: 188px; width: 280px; height: 100px; border-radius: 6px; background: linear-gradient(rgba(255,255,255,.55), rgba(220,224,228,.5)); box-shadow: inset 0 0 0 1.5px #6d7278, inset 0 1px 0 #fff, 0 3px 5px rgba(0,0,0,.25); }
    .clear::before { content: ''; position: absolute; left: 14px; right: 14px; top: 10px; height: 16px; background: #fff; box-shadow: inset 0 0 0 1px #9a9fa6; background-image: repeating-linear-gradient(90deg, #8c1d12 0 1px, transparent 1px 12px); background-size: 100% 5px; background-repeat: no-repeat; background-position: 0 100%; }
    .clear::after { content: ''; position: absolute; left: 96px; top: 46px; width: 88px; height: 34px; border-radius: 3px; background: linear-gradient(90deg, #3a2417 0 60%, #1a1c1f 60%); box-shadow: inset 0 2px 3px rgba(0,0,0,.6); }
    .wound { position: absolute; inset: 0; border-radius: 50%; background: repeating-radial-gradient(circle, #5a4034 0 1.5px, #47322a 1.5px 3px); }
    ${COG_CSS}
    .cog.big i { left: 16px; top: 3px; height: 30px; background: linear-gradient(#f1ece0 0 8px, transparent 8px 22px, #f1ece0 22px); }
    ${beds('#9aa0a6', '#d6e4c8', true)}
    .face { color: #f1f2f3; } .face svg { width: 18px; height: 18px; }
    .stub { border-radius: 3px; background: linear-gradient(#3a3d41, #1a1c1f); box-shadow: 0 0 0 1px #000, 0 2px 2px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.25); }
    .stub.tiny svg { width: 15px; height: 15px; }
    ${STATES}
    .pressed .stub { transform: translateY(1px); box-shadow: 0 0 0 1px #000, inset 0 2px 4px rgba(0,0,0,.7); }
    .active .stub { color: #ffb0a8; box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.25), inset 0 -3px 0 #e2392b; }
  `,
  art: `<div class="cone" style="left:22px"></div><div class="cone" style="right:22px"></div><div class="lcd"></div><div class="strip"></div><div class="clear"></div>${radarLow.art}`,
  buttons: radarLow.buttons,
  components: [
    { type: 'time', source: 'position', x: 134, y: 28, width: 92, height: 34, fontSize: 24, align: 'center', color: '#151a12' },
    { type: 'spectrum', x: 140, y: 66, width: 80, height: 26, color: '#414b3a' },
    { type: 'time', source: 'duration', x: 134, y: 96, width: 92, height: 14, fontSize: 10, align: 'center', color: '#414b3a' },
    { type: 'text', source: 'track.title', x: 32, y: 134, width: 296, height: 20, fontSize: 14, color: '#151a12' },
    { type: 'text', source: 'track.artist', x: 32, y: 154, width: 200, height: 16, fontSize: 11, color: '#414b3a' },
    { type: 'text', source: 'player.status', x: 236, y: 154, width: 92, height: 16, fontSize: 10, align: 'right', color: '#8c1d12' },
    ...radarLow.components,
  ],
  packs: [
    { name: 'tape-left', x: 64, y: 216, width: 70, height: 70, from: 70, to: 40, html: '<div class="wound"></div>' },
    { name: 'tape-right', x: 226, y: 216, width: 70, height: 70, from: 40, to: 70, html: '<div class="wound"></div>' },
  ],
  spinners: [bigHub('hub-left', 81, 233), bigHub('hub-right', 243, 233)],
});

// ---- "Needle": black leather, one wide white meter whose needle shows the position

const needleLow = lower({ width: 380, y: 178, look: 'lug', playLook: 'lug lime', toggleLook: 'cornerk', big: 76, mid: 54, toggle: [48, 40], list: 150, seek: false });
const needleSkin = skin('needle', 'Needle', 'Black leather and one wide white meter: its needle shows where the track is, and pulling it seeks.', ['meter', 'leather', 'dark', 'needle', 'lime', 'skeuomorphic'], {
  theme: theme({ background: '#1d1e20', surface: '#0c0c0d', surfaceRaised: '#33353a', foreground: '#f4f4f1', muted: '#b4b5b1', accent: '#cfe84a', accentContrast: '#1a1f00', border: '#000000', ok: '#9fd96a', danger: '#ff9d94', focus: '#7fc4ff' }, '"Menlo", "Consolas", "Courier New", monospace', 2),
  width: 380,
  height: needleLow.height,
  resize: needleLow.resize,
  css: `
    body { background: radial-gradient(circle, rgba(255,255,255,.045) .7px, transparent 1px) 0 0 / 4px 4px, radial-gradient(circle, rgba(0,0,0,.45) .7px, transparent 1px) 2px 2px / 4px 4px, linear-gradient(#2a2b2e, #17181a); }
    .frame { position: absolute; left: 20px; top: 16px; width: 340px; height: 152px; border-radius: 6px; background: #0c0c0d; box-shadow: inset 0 0 0 1px #3a3c40, 0 0 0 1px #000, 0 1px 0 1px rgba(255,255,255,.1); }
    .dialw { position: absolute; left: 10px; top: 30px; width: 320px; height: 96px; background: linear-gradient(#ffffff, #ecebe4); box-shadow: inset 0 2px 5px rgba(0,0,0,.35); overflow: hidden; }
    .dialw::before { content: ''; position: absolute; inset: 0; background: repeating-conic-gradient(from -40.3deg at 50% 118%, #17181a 0 .6deg, transparent .6deg 5deg);
      -webkit-mask-image: radial-gradient(circle at 50% 118%, transparent 0 86px, #000 86px 96px, transparent 96px); }
    .dialw::after { content: ''; position: absolute; inset: 0; background: conic-gradient(from 14deg at 50% 118%, #d2372b 0 26deg, transparent 26deg);
      -webkit-mask-image: radial-gradient(circle at 50% 118%, transparent 0 78px, #000 78px 83px, transparent 83px); }
    .humph { position: absolute; left: 132px; top: 98px; width: 56px; height: 56px; border-radius: 50%; background: #17181a; }
    .vu { position: absolute; left: 14px; top: 8px; font: 700 13px "Helvetica Neue", Arial, sans-serif; color: #17181a; }
    .pointer { position: absolute; left: 3px; top: 0; width: 2px; height: 100%; background: #17181a; border-radius: 1px; }
    ${beds('#0c0c0d', '#0c0c0d', false)}
    .face { color: #f4f4f1; } .face svg { width: 18px; height: 18px; }
    .lug { border-radius: 50%; background: radial-gradient(circle at 50% 22%, #6a6d72, #26282b 75%); box-shadow: 0 0 0 1px #000, 0 0 0 4px #1c1d1f, 0 0 0 5px #000, 0 4px 6px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.3); }
    .lug.lime { color: #cfe84a; background: conic-gradient(from 30deg, #e9ebed, #84888d, #dfe1e4, #7a7e83, #e9ebed, #84888d, #dfe1e4, #7a7e83, #e9ebed); }
    .lug.lime svg { width: 28px; height: 28px; color: #2a2d31; }
    .cornerk { border-radius: 6px; background: linear-gradient(#3a3c40, #1f2022); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.2); }
    ${STATES}
    .pressed .lug { box-shadow: 0 0 0 1px #000, 0 0 0 4px #1c1d1f, 0 0 0 5px #000, inset 0 3px 6px rgba(0,0,0,.6); }
    .active .lug.lime { box-shadow: 0 0 0 1px #000, 0 0 0 4px #1c1d1f, 0 0 0 6px #cfe84a, 0 0 14px 3px rgba(207,232,74,.45), inset 0 1px 0 rgba(255,255,255,.3); }
    .active .lug.lime svg { color: #4a5a00; }
    .active .cornerk { color: #cfe84a; box-shadow: 0 0 0 1px #000, inset 0 0 0 1.5px #cfe84a; }
  `,
  art: `<div class="frame"><div class="dialw"><div class="vu">VU</div><div class="humph"></div></div></div>${needleLow.art}`,
  buttons: needleLow.buttons,
  components: [
    { type: 'text', source: 'track.title', x: 32, y: 22, width: 220, height: 20, fontSize: 13, color: '#f4f4f1' },
    { type: 'text', source: 'player.status', x: 256, y: 22, width: 92, height: 20, fontSize: 10, align: 'right', color: '#cfe84a' },
    { type: 'time', source: 'position', x: 32, y: 146, width: 80, height: 18, fontSize: 12, color: '#f4f4f1' },
    { type: 'text', source: 'track.artist', x: 112, y: 146, width: 156, height: 18, fontSize: 11, align: 'center', color: '#b4b5b1' },
    { type: 'time', source: 'duration', x: 268, y: 146, width: 80, height: 18, fontSize: 12, align: 'right', color: '#f4f4f1' },
    ...needleLow.components,
  ],
  needles: [{ name: 'pointer', x: 186, y: 54, width: 8, height: 106, pivotX: 4, pivotY: 106, from: -38, to: 38, rest: -38, html: '<div class="pointer"></div>' }],
});

// What every skin says about itself beyond its looks: words to find it by, and the row of
// its background that is drawn out when the window is made taller (it runs through the playlist).
const MORE = {
  hifi: { keywords: ['hi-fi', 'receiver', 'aluminium', 'amber', 'dark', 'skeuomorphic'], resize: { stretchY: 400 } },
  neon: { keywords: ['neon', 'synthwave', 'retro', 'dark', 'glow', 'eighties'], resize: { stretchY: 410 } },
  tape: { keywords: ['cassette', 'tape', 'light', 'seventies', 'orange', 'skeuomorphic'], resize: { stretchY: 440 } },
  vinyl: { keywords: ['turntable', 'record', 'vinyl', 'dark', 'soft', 'neumorphic', 'landscape'], resize: { stretchY: 340 } },
  panel: { keywords: ['minimal', 'light', 'functional', 'sixties', 'red'], resize: { stretchY: 440 } },
  reel: { keywords: ['reel', 'tape machine', 'light', 'minimal', 'landscape', 'sixties'], resize: { stretchY: 364 } },
  recorder: { keywords: ['recorder', 'pocket', 'dark', 'display', 'red'], resize: { stretchY: 500 } },
  deck: { keywords: ['cassette', 'deck', 'metal', 'dark', 'orange', 'skeuomorphic'], resize: { stretchY: 490 } },
  walk: { keywords: ['cassette', 'portable', 'orange', 'eighties', 'dark'], resize: { stretchY: 480 } },
  meter: { keywords: ['cassette', 'meter', 'steel', 'dark', 'red', 'skeuomorphic'], resize: { stretchY: 550 } },
  ferro: { keywords: ['cassette', 'black', 'dark', 'blue', 'skeuomorphic'], resize: { stretchY: 480 } },
  mixtape: { keywords: ['cassette', 'mixtape', 'light', 'blue', 'handwritten', 'pop'], resize: { stretchY: 490 } },
  system: { keywords: ['minimal', 'black', 'white', 'dots', 'reel', 'graphic'], resize: { stretchY: 500 } },
  console: { keywords: ['console', 'grey', 'light', 'soft', 'neumorphic', 'keys'], resize: { stretchY: 470 } },
  dial: { keywords: ['dial', 'knob', 'aluminium', 'light', 'minimal', 'green'], resize: { stretchY: 590 } },
};

const DESIGNS = [hifi, neon, tape, vinyl, panel, reelDeck, recorder, deck, walk, meter, ferro, mixtape, systemSkin, consoleSkin, dial, pocket, beat, stripe, amp, magnet, studio, crimson, mono, wheel, nano, silver, lever, keysSkin, split, patch, chromeSkin, switchSkin, gauge, ember, click, classic, radar, needleSkin];

// ---------------------------------------------------------------- rendering

const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; overflow: hidden; }
  body { position: relative; }
  .btn { position: absolute; }
  .face { position: absolute; display: grid; place-items: center; }
  svg { display: block; }
`;

function page(design, state, extra = '') {
  const buttons = design.buttons
    .map((b) => {
      // a state a button does not have looks like its normal one
      const shown = state === 'active' && !b.toggle ? 'normal' : state;
      const icon = shown === 'active' && b.activeIcon ? b.activeIcon : b.icon;
      const p = design.pad;
      return `<div class="btn ${shown}" style="left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px">
        <div class="face ${b.look}" style="inset:${p}px">${ICON[icon]}</div></div>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
    body { width: ${design.width}px; height: ${design.height}px; }
    ${design.css}</style>${design.art}${state === 'none' ? '' : buttons}${extra}`;
}

/** What the app draws on top: close enough to judge a design, not a copy of the app's CSS. */
function inUse(design) {
  const t = design.manifest.theme;
  const sample = {
    'track.title': 'When In Rome (I Do As The Romans Do)',
    'track.artist': 'Barbra Streisand',
    'track.details': 'FLAC · 44.1 kHz · 16 bit',
    'player.status': 'Playing',
    position: '1:24',
    duration: '3:00',
  };
  const box = (c) => `left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px;`;
  const parts = design.components.map((c) => {
    if (c.type === 'text' || c.type === 'time') {
      const font = c.type === 'time' ? t.fontMono : t.fontFamily;
      return `<p class="m" style="${box(c)}line-height:${c.height}px;font-size:${c.fontSize}px;color:${c.color};text-align:${c.align ?? 'left'};font-family:${font.replaceAll('"', "'")};font-variant-numeric:tabular-nums">${sample[c.source]}</p>`;
    }
    if (c.type === 'seekbar' || c.type === 'volume') {
      return `<div class="m" style="${box(c)}background:${t.surface};border:1px solid ${t.border};border-radius:${t.radius}px">
        <div style="position:absolute;left:${c.type === 'volume' ? 60 : 44}%;top:-1px;bottom:-1px;width:10px;background:${t.accent};border:1px solid ${t.accentContrast};border-radius:${t.radius}px"></div></div>`;
    }
    if (c.type === 'spectrum') {
      const bars = Array.from({ length: 24 }, (_, i) => {
        const h = 18 + Math.round(78 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));
        return `<i style="flex:1;height:${h}%;background:${c.color}"></i>`;
      }).join('');
      return `<div class="m" style="${box(c)}display:flex;align-items:flex-end;gap:2px">${bars}</div>`;
    }
    if (c.type === 'playlist') {
      const rows = ['Absent Minded Me', 'When In Rome (I Do As The Romans Do)', 'Fine And Dandy', 'Supper Time', 'Will He Like Me', 'How Does The Wine Taste', "I'm All Smiles", 'Autumn', 'My Lord And Master']
        .map(
          (title, i) =>
            `<div style="display:flex;gap:8px;padding:3px 6px;${i === 1 ? `color:${t.accent};font-weight:600` : ''}"><span style="color:${i === 1 ? t.accent : t.muted};width:18px;text-align:right">${i + 1}.</span><span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">Barbra Streisand – ${title}</span><span style="color:${i === 1 ? t.accent : t.muted}">3:0${i}</span></div>`,
        )
        .join('');
      return `<div class="m" style="${box(c)}overflow:hidden;font-size:12px;color:${t.foreground};font-family:${t.fontFamily.replaceAll('"', "'")}">${rows}</div>`;
    }
    return '';
  });
  return `<style>.m { position: absolute; margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }</style>${parts.join('\n')}`;
}

/** A needle as it lies in the window, turned by `angle` degrees around its pivot. */
function needleHtml(n, angle) {
  const origin = n.pivotX === undefined ? '50% 50%' : `${n.pivotX}px ${n.pivotY}px`;
  return `<div style="position:absolute;left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;transform-origin:${origin};transform:rotate(${angle}deg)">${n.html}</div>`;
}

function screenshot(html, width, height, scale, work, transparent = false) {
  const source = join(work, 'page.html');
  const target = join(work, 'shot.png');
  writeFileSync(source, html);
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${join(work, 'profile')}`,
      `--force-device-scale-factor=${scale}`,
      `--window-size=${width},${height}`,
      ...(transparent ? ['--default-background-color=00000000'] : []),
      `--screenshot=${target}`,
      pathToFileURL(source).href,
    ],
    { stdio: 'ignore' },
  );
  return readFileSync(target);
}

// ---------------------------------------------------------------- PNG: read, cut, write

function decodePng(buffer) {
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const colourType = body[9];
      if (body[8] !== 8 || (colourType !== 2 && colourType !== 6) || body[12] !== 0) {
        throw new Error('unexpected PNG flavour from the browser');
      }
      channels = colourType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      data.push(body);
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4, 255);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < width; x++) {
      line.copy(pixels, (y * width + x) * 4, x * channels, x * channels + channels);
    }
    previous = line;
  }
  return { width, height, pixels };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + body.length; i++) crc = CRC[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + body.length);
  return out;
}

/** Cuts a rectangle out of a decoded picture and writes it as a PNG, opaque unless `alpha`. */
function cut(image, x, y, width, height, alpha = false) {
  const n = alpha ? 4 : 3;
  const raw = Buffer.alloc(height * (width * n + 1));
  for (let row = 0; row < height; row++) {
    const line = row * (width * n + 1);
    // filter "sub": smooth artwork packs far better than unfiltered
    raw[line] = 1;
    for (let col = 0; col < width; col++) {
      const from = ((y + row) * image.width + x + col) * 4;
      for (let k = 0; k < n; k++) {
        const left = col > 0 ? image.pixels[from - 4 + k] : 0;
        raw[line + 1 + col * n + k] = (image.pixels[from + k] - left) & 255;
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, alpha ? 6 : 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- one skin

function build(design, mockDir) {
  const work = mkdtempSync(join(tmpdir(), 'fc-skin-'));
  const out = join(ROOT, 'skins', design.folder);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'assets'), { recursive: true });
  const shot = (state, extra, scale = SCALE) =>
    decodePng(screenshot(page(design, state, extra), design.width, design.height, scale, work));
  const whole = (image) => cut(image, 0, 0, image.width, image.height);

  writeFileSync(join(out, 'assets/background.png'), whole(shot('none')));

  // without its track list a skin ends just above it; the two wide ones keep their list
  const list = design.components.find((c) => c.type === 'playlist');
  const collapsedHeight = ['vinyl', 'reel'].includes(design.folder) || !list ? null : list.y - 8;

  const states = {};
  for (const state of ['normal', 'hover', 'pressed', 'active']) {
    states[state] = shot(state);
  }
  const components = design.components.map((c) => ({ ...c }));
  const buttons = design.buttons.map((b) => {
    const name = b.action.split('.')[1].replace('togglePlay', 'play');
    const files = {};
    for (const state of ['normal', 'hover', 'pressed', ...(b.toggle ? ['active'] : [])]) {
      const file = `assets/${name}${state === 'normal' ? '' : `-${state}`}.png`;
      const png = cut(states[state], b.x * SCALE, b.y * SCALE, b.width * SCALE, b.height * SCALE);
      writeFileSync(join(out, file), png);
      files[state] = file;
    }
    return { type: 'button', action: b.action, x: b.x, y: b.y, width: b.width, height: b.height, states: files };
  });

  // needles and spinners move: drawn alone on nothing, upright, and cut out with transparency
  const loose = (kind) => (list) =>
    (list ?? []).map((n) => {
      const html = `${page(design, 'none').replace(design.art, '')}<style>html, body { background: none !important; box-shadow: none !important; }</style>${needleHtml(n, 0)}`;
      const image = decodePng(screenshot(html, design.width, design.height, SCALE, work, true));
      const file = `assets/${n.name}.png`;
      writeFileSync(join(out, file), cut(image, n.x * SCALE, n.y * SCALE, n.width * SCALE, n.height * SCALE, true));
      const { name, html: _, ...placed } = n;
      return { type: kind, ...placed, states: { normal: file } };
    });
  const packs = loose('pack')(design.packs);
  const spinners = loose('spinner')(design.spinners);
  // pictures that lie on top of what turns
  const overlays = loose('image')(design.overlays);
  const needles = loose('needle')(design.needles);
  const turned =
    (design.packs ?? []).map((n) => `<div style="clip-path:circle(${(n.from + n.to) / 4}px at ${n.x + n.width / 2}px ${n.y + n.height / 2}px)">${needleHtml(n, 0)}</div>`).join('') +
    (design.spinners ?? []).map((n) => needleHtml(n, 25)).join('') +
    (design.overlays ?? []).map((n) => needleHtml(n, 0)).join('') +
    (design.needles ?? []).map((n) => needleHtml(n, (n.from + n.to) / 2)).join('');

  // the preview and the mock show the skin in use; one button is "on" to show that state too
  // the preview is large and shown small: WebP where `cwebp` is at hand, else PNG
  const previewPng = join(out, 'preview.png');
  writeFileSync(previewPng, whole(shot('normal', inUse(design) + turned)));
  let preview = 'preview.png';
  if (CWEBP) {
    execFileSync(CWEBP, ['-quiet', '-q', '82', previewPng, '-o', join(out, 'preview.webp')]);
    rmSync(previewPng);
    preview = 'preview.webp';
  }
  if (mockDir) {
    mkdirSync(mockDir, { recursive: true });
    writeFileSync(join(mockDir, `${design.folder}.png`), whole(shot('active', inUse(design) + turned)));
  }

  const manifest = {
    formatVersion: 1,
    ...design.manifest,
    version: '1.0.0',
    author: 'FLAC Commander',
    preview: 'preview.png',
    windows: {
      player: {
        layout: 'absolute',
        width: design.width,
        height: design.height,
        background: 'assets/background.png',
        ...(design.titleBar ? { titleBar: design.titleBar } : {}),
        ...(collapsedHeight ? { collapsedHeight } : {}),
        resize: design.resize ?? MORE[design.folder]?.resize,
        components: [...packs, ...spinners, ...overlays, ...components.filter((c) => c.type !== 'playlist'), ...buttons, ...components.filter((c) => c.type === 'playlist'), ...needles],
      },
    },
  };
  // id, name and description first: the order a reader expects
  const { id, name, description, theme } = design.manifest;
  const ordered = { formatVersion: 1, id, name, version: '1.0.0', author: 'FLAC Commander', description, keywords: design.keywords ?? MORE[design.folder]?.keywords, preview, theme, windows: manifest.windows };
  writeFileSync(join(out, 'skin.json'), `${JSON.stringify(ordered, null, 2)}\n`);
  rmSync(work, { recursive: true, force: true });
  console.log(`skins/${design.folder}: ${buttons.length} buttons, ${design.width} × ${design.height}`);
}

if (!CHROME) {
  console.error('No Chrome found. Set CHROME=/path/to/chrome.');
  process.exit(1);
}
const mockAt = process.argv.indexOf('--mock');
const mockDir = mockAt > 0 ? process.argv[mockAt + 1] : null;
const only = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--mock');
for (const design of DESIGNS) {
  if (only.length === 0 || only.includes(design.folder)) {
    build(design, mockDir);
  }
}
