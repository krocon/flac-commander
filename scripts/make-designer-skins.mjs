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
        radial-gradient(circle, #0d0e10 0 60px, transparent 60px),
        conic-gradient(from 35deg, rgba(255,255,255,.13), transparent 11%, transparent 39%, rgba(255,255,255,.13) 50%, transparent 61%, transparent 89%, rgba(255,255,255,.13)),
        repeating-radial-gradient(circle, #0b0c0d 0 1.2px, #18191c 1.2px 2.7px);
      box-shadow: 0 5px 12px rgba(0,0,0,.6), 0 0 0 1px #050506; }
    .record::after { content: ''; position: absolute; inset: 22px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 0 0 34px rgba(255,255,255,.012); }
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
  spinners: [{ name: 'label', x: 112, y: 134, width: 96, height: 96, period: 1800, html: '<div class="disc-label"></div>' }],
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

const reelHtml = (pack) => `
  <div class="reel">
    <div class="tape" style="inset:${112 - pack}px"></div>
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
    .reel .tape { position: absolute; border-radius: 50%; background: repeating-radial-gradient(circle, #40302a 0 1.5px, #32251f 1.5px 3px); box-shadow: 0 0 0 1px #1d1512; }
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
    { name: 'reel-left', x: 38, y: 18, width: 224, height: 224, period: 3200, html: reelHtml(96) },
    { name: 'reel-right', x: 378, y: 18, width: 224, height: 224, period: 3200, html: reelHtml(48) },
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
  pad: 2,
  css: `
    body { background:
        radial-gradient(circle, rgba(0,0,0,.10) .6px, transparent .9px) 0 0 / 5px 5px,
        radial-gradient(circle, rgba(255,255,255,.10) .6px, transparent .9px) 2px 3px / 7px 7px,
        linear-gradient(160deg, #f7742a, #e55a12);
      font-family: "Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif; }
    .edge { position: absolute; left: 0; top: 0; width: 12px; height: 100%; background: linear-gradient(90deg, #8d8d8a, #b9b9b5 50%, #777774); box-shadow: 1px 0 2px rgba(0,0,0,.35); }
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
    <div class="edge"></div>
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

const DESIGNS = [hifi, neon, tape, vinyl, panel, reelDeck, recorder, deck, walk];

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
  const spinners = loose('spinner')(design.spinners);
  const needles = loose('needle')(design.needles);
  const turned =
    (design.spinners ?? []).map((n) => needleHtml(n, 25)).join('') +
    (design.needles ?? []).map((n) => needleHtml(n, (n.from + n.to) / 2)).join('');

  // the preview and the mock show the skin in use; one button is "on" to show that state too
  writeFileSync(join(out, 'preview.png'), whole(shot('normal', inUse(design) + turned)));
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
        components: [...spinners, ...components.filter((c) => c.type !== 'playlist'), ...buttons, ...components.filter((c) => c.type === 'playlist'), ...needles],
      },
    },
  };
  // id, name and description first: the order a reader expects
  const { id, name, description, theme } = design.manifest;
  const ordered = { formatVersion: 1, id, name, version: '1.0.0', author: 'FLAC Commander', description, preview: 'preview.png', theme, windows: manifest.windows };
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
