// Draws the graphics of the built-in "Retro" skin (skins/retro/assets). Everything is drawn
// here, pixel by pixel: no artwork of others. Run with `node scripts/make-retro-skin.mjs`;
// the results are committed.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../skins/retro/assets');

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const C = {
  panel: hex('#3a4152'),
  panelLight: hex('#5b6478'),
  panelDark: hex('#1c202b'),
  panelMid: hex('#2f3545'),
  face: hex('#4a5266'),
  facePressed: hex('#333a4a'),
  glyph: hex('#e4e8f0'),
  lit: hex('#5dff7a'),
  lcd: hex('#0b120b'),
  lcdLine: hex('#132013'),
  stripe: hex('#ffcc33'),
};

class Image {
  constructor(width, height, fill) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    this.rect(0, 0, width, height, fill);
  }
  set(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set([r, g, b, 255], (y * this.width + x) * 4);
  }
  rect(x, y, w, h, colour) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, colour);
  }
  /** A raised (or, with `sunken`, recessed) frame of one pixel. */
  bevel(x, y, w, h, sunken = false) {
    const [tl, br] = sunken ? [C.panelDark, C.panelLight] : [C.panelLight, C.panelDark];
    this.rect(x, y, w, 1, tl);
    this.rect(x, y, 1, h, tl);
    this.rect(x, y + h - 1, w, 1, br);
    this.rect(x + w - 1, y, 1, h, br);
  }
  /** Draws rows of '#' as pixels. */
  glyph(x, y, rows, colour) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && this.set(x + i, y + j, colour)));
  }
  png() {
    const raw = Buffer.alloc((this.width * 4 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      const row = this.data.subarray(y * this.width * 4, (y + 1) * this.width * 4);
      raw.set(row, y * (this.width * 4 + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header.set([8, 6, 0, 0, 0], 8); // 8 bit RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}

const GLYPHS = {
  previous: ['#....#', '#...##', '#..###', '#.####', '#..###', '#...##', '#....#'],
  play: ['#.....', '##....', '###...', '####..', '###...', '##....', '#.....'],
  pause: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##'],
  stop: ['######', '######', '######', '######', '######', '######', '######'],
  next: ['#....#', '##...#', '###..#', '####.#', '###..#', '##...#', '#....#'],
  open: ['...#...', '..###..', '.#####.', '#######', '.......', '#######', '#######'],
  repeat: ['.#####..', '#.....#.', '#....###', '#.....#.', '.#......', '###....#', '.#.....#', '..#####.'],
  shuffle: ['##...##.', '..#.#..#', '...#....', '..#.#..#', '##...##.', '.......#'],
  skins: ['#######', '#.....#', '#.###.#', '#.###.#', '#.....#', '#######'],
};

function button(name, width, height, { pressed = false, lit = false } = {}) {
  const img = new Image(width, height, pressed ? C.facePressed : C.face);
  img.bevel(0, 0, width, height, pressed);
  const rows = GLYPHS[name];
  const x = Math.floor((width - rows[0].length) / 2) + (pressed ? 1 : 0);
  const y = Math.floor((height - rows.length) / 2) + (pressed ? 1 : 0);
  img.glyph(x, y, rows, lit ? C.lit : C.glyph);
  return img;
}

function background() {
  const [w, h] = [320, 440];
  const img = new Image(w, h, C.panel);
  img.bevel(0, 0, w, h);
  // title strip with three stripes, as on hi-fi fronts of the nineties
  img.rect(2, 2, w - 4, 14, C.panelMid);
  for (const y of [5, 8, 11]) img.rect(8, y, w - 16, 1, C.stripe);
  img.rect(120, 3, 80, 12, C.panelMid);
  // display
  img.rect(8, 22, 304, 72, C.lcd);
  img.bevel(8, 22, 304, 72, true);
  for (let y = 25; y < 92; y += 3) img.rect(10, y, 300, 1, C.lcdLine);
  // playlist well
  img.rect(8, 164, 304, 268, C.lcd);
  img.bevel(8, 164, 304, 268, true);
  return img;
}

mkdirSync(OUT, { recursive: true });
const files = { 'background.png': background() };
for (const name of ['previous', 'stop', 'next', 'open', 'skins']) {
  files[`${name}.png`] = button(name, 30, 24);
  files[`${name}-pressed.png`] = button(name, 30, 24, { pressed: true });
}
files['play.png'] = button('play', 30, 24);
files['play-pressed.png'] = button('play', 30, 24, { pressed: true });
files['play-active.png'] = button('pause', 30, 24, { lit: true });
for (const name of ['repeat', 'shuffle']) {
  files[`${name}.png`] = button(name, 30, 24);
  files[`${name}-pressed.png`] = button(name, 30, 24, { pressed: true });
  files[`${name}-active.png`] = button(name, 30, 24, { pressed: true, lit: true });
}
// preview: the background scaled down by 2 (nearest neighbour)
const bg = files['background.png'];
const preview = new Image(160, 220, C.panel);
for (let y = 0; y < 220; y++)
  for (let x = 0; x < 160; x++) {
    const at = (y * 2 * bg.width + x * 2) * 4;
    preview.set(x, y, bg.data.subarray(at, at + 3));
  }
writeFileSync(join(OUT, '../preview.png'), preview.png());
for (const [name, img] of Object.entries(files)) writeFileSync(join(OUT, name), img.png());
console.log(`${Object.keys(files).length + 1} files written to skins/retro`);
