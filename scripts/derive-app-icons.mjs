// Derive PWA/home-screen icons from the existing dark-theme DevWorks mark —
// no new art, just the same asset composited onto an opaque square.
//
//   node scripts/derive-app-icons.mjs
//
// Source: src/assets/devworks-mark.png (light-on-transparent monogram, built
//         by scripts/derive-logo.mjs — see that file for the full pipeline).
//
// Why a solid background: devworks-mark.png is light ink meant to sit on the
// dashboard's #0B0F14 background (src/theme.ts BG). A home screen can have a
// light wallpaper, and transparent-background icons inherit whatever's behind
// them — on a light background the light ink would nearly disappear. Baking
// the same #0B0F14 fill into the icon itself keeps it legible everywhere and
// matches the manifest's theme/background colour, so there's no flash of a
// mismatched colour on launch.
//
// Maskable icon: Android can crop a "maskable" icon to a circle, squircle, or
// other shape, keeping only a centered "safe zone" (a circle 80% of the
// canvas diameter). The mark is scaled down further for that variant so its
// corners can't be clipped — see MASKABLE_SCALE below.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const MARK = new URL('../src/assets/devworks-mark.png', import.meta.url);
const OUT_DIR = new URL('../public/icons/', import.meta.url);

const BG = [0x0b, 0x0f, 0x14]; // matches src/theme.ts BG / the manifest background_color

// [name, canvas size, mark width as a fraction of the canvas]
const TARGETS = [
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['icon-maskable-512.png', 512, 0.45], // stays inside the ~80%-diameter safe zone
  ['apple-touch-icon.png', 180, 0.62],
  ['favicon-32.png', 32, 0.68], // a hair larger — thin strokes need it at 32px
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const markMeta = PNG.sync.read(fs.readFileSync(MARK));
const markAspect = markMeta.width / markMeta.height;

for (const [name, canvasSize, markFraction] of TARGETS) {
  const markW = Math.round(canvasSize * markFraction);
  const markH = Math.round(markW / markAspect);

  const resizedPath = new URL(`.${name}.mark.png`, OUT_DIR);
  execFileSync('sips', ['-z', String(markH), String(markW), MARK.pathname, '--out', resizedPath.pathname], {
    stdio: 'ignore',
  });
  const mark = PNG.sync.read(fs.readFileSync(resizedPath));
  fs.unlinkSync(resizedPath);

  const canvas = new PNG({ width: canvasSize, height: canvasSize });
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = BG[0];
    canvas.data[i + 1] = BG[1];
    canvas.data[i + 2] = BG[2];
    canvas.data[i + 3] = 255;
  }

  const offX = Math.round((canvasSize - mark.width) / 2);
  const offY = Math.round((canvasSize - mark.height) / 2);
  for (let y = 0; y < mark.height; y++) {
    for (let x = 0; x < mark.width; x++) {
      const si = (y * mark.width + x) * 4;
      const a = mark.data[si + 3] / 255;
      if (a === 0) continue;
      const di = ((offY + y) * canvasSize + (offX + x)) * 4;
      for (let c = 0; c < 3; c++) {
        canvas.data[di + c] = Math.round(mark.data[si + c] * a + canvas.data[di + c] * (1 - a));
      }
    }
  }

  const outPath = new URL(name, OUT_DIR);
  fs.writeFileSync(outPath, PNG.sync.write(canvas));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`wrote ${outPath.pathname}  (${canvasSize}×${canvasSize}, ${kb} KB)`);
}
