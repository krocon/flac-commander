#!/usr/bin/env node
// Builds what the site takes from the repository (run from the repository root: `node site/build.mjs`):
//   1. site/img/skins/<id>.webp from skins/<id>/preview.* (PNG previews go through `cwebp` if it is on the PATH),
//      site/favicon.png and site/img/icon.png from the app icon.
//   2. the skin gallery in site/index.html (between the `skins:start` and `skins:end` markers) and the number of
//      skins (every element with `data-skins`) from skins/*/skin.json.
// `--no-images` skips step 1.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = dirname(fileURLToPath(import.meta.url));
const root = join(site, '..');
const skinsDir = join(root, 'skins');
const out = join(site, 'img', 'skins');
/** Shown first; the rest follows by name. */
const first = ['vinyl', 'reel'];
/** Counted, but not pictured: the preview of this skin is a small placeholder, not a picture of the player. */
const unpictured = ['retro'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Width and height of a PNG or WebP file, read from its header. */
function size(file) {
  const b = readFileSync(file);
  if (b.toString('latin1', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const n = b.readUInt32LE(21);
    return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)];
  }
  throw new Error(`${file}: unknown image format`);
}

function skins() {
  const list = [];
  for (const dir of readdirSync(skinsDir)) {
    const manifest = join(skinsDir, dir, 'skin.json');
    if (!existsSync(manifest)) continue;
    const skin = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!skin.preview) continue;
    list.push({ dir, skin, source: join(skinsDir, dir, skin.preview) });
  }
  const rank = (s) => (first.includes(s.dir) ? first.indexOf(s.dir) : first.length);
  return list.sort((a, b) => rank(a) - rank(b) || a.skin.name.localeCompare(b.skin.name));
}

/** Copies one preview and returns the file name it has in img/skins/. */
function image(entry, write) {
  const ext = extname(entry.source).toLowerCase();
  if (ext === '.webp') {
    if (write) copyFileSync(entry.source, join(out, `${entry.dir}.webp`));
    return `${entry.dir}.webp`;
  }
  if (!write) return existsSync(join(out, `${entry.dir}.webp`)) ? `${entry.dir}.webp` : `${entry.dir}${ext}`;
  try {
    execFileSync('cwebp', ['-quiet', '-q', '86', '-sharp_yuv', entry.source, '-o', join(out, `${entry.dir}.webp`)]);
    return `${entry.dir}.webp`;
  } catch {
    copyFileSync(entry.source, join(out, `${entry.dir}${ext}`));
    return `${entry.dir}${ext}`;
  }
}

const write = !process.argv.includes('--no-images');
if (write) {
  mkdirSync(out, { recursive: true });
  copyFileSync(join(root, 'src-tauri', 'icons', '128x128@2x.png'), join(site, 'img', 'icon.png'));
  copyFileSync(join(root, 'src-tauri', 'icons', '128x128.png'), join(site, 'favicon.png'));
}

const list = skins();
const cards = list
  .filter((entry) => !unpictured.includes(entry.dir))
  .map((entry) => {
    const { skin } = entry;
    const file = image(entry, write);
    const [w, h] = size(write || existsSync(join(out, file)) ? join(out, file) : entry.source);
    const words = [skin.name, skin.description ?? '', ...(skin.keywords ?? [])].join(' ').toLowerCase();
    return (
      `        <figure class="sk" data-k="${esc(words)}">` +
      `<img src="img/skins/${file}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="The skin ${esc(skin.name)}">` +
      `<figcaption><b>${esc(skin.name)}</b><span>${esc(skin.description ?? '')}</span></figcaption></figure>`
    );
  })
  .join('\n');

const file = join(site, 'index.html');
const page = readFileSync(file, 'utf8');
if (!page.includes('<!-- skins:start -->')) throw new Error('index.html: skin markers not found');
const next = page
  .replace(/(<!-- skins:start -->)[\s\S]*?(<!-- skins:end -->)/, (_, a, b) => `${a}\n${cards}\n        ${b}`)
  .replace(/data-count="\d+" data-skins/g, `data-count="${list.length}" data-skins`)
  .replace(/(<([a-z]+)[^>]*\sdata-skins[^>]*>)[^<]*(<\/\2>)/g, (_, a, _tag, c) => `${a}${list.length}${c}`);
writeFileSync(file, next);
console.log(`index.html: ${list.length} skins${write ? ', images copied' : ''}`);
