// Derive a dark-theme DevWorks mark from the full-colour logo on white.
//
//   node scripts/derive-logo.mjs
//
// Source : src/assets/devworks-logo-source.png  (1254² RGB, white background,
//          "DW" monogram over a "DevWorks" wordmark + tagline lockup)
// Output : src/assets/devworks-mark.png  (transparent, light-on-dark, monogram
//          only — the wordmark/tagline are illegible at header size and the
//          header already prints "DevWorks LLC" as text)
//
// Treatment: crop to the monogram, then flatten to two inks — the brand's dark
// navy becomes the dashboard's primary text colour, its blue becomes the accent
// — so both halves of the two-tone mark stay legible on #0B0F14. The white
// ground goes fully transparent; only a ~1px feather at the ink edges is
// partially transparent, so there's no grey haze and no internal gradient mud.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const SRC = new URL('../src/assets/devworks-logo-source.png', import.meta.url);
const OUT = new URL('../src/assets/devworks-mark.png', import.meta.url);
const OUT_H = 168; // export height in px (~6× the 28px header slot → crisp on retina/wall)

// Monogram ink bounding box in the source (measured), plus breathing room so
// the strokes don't sit flush against the asset edge.
const BOX = { x: 353, y: 339, w: 594, h: 294 };
const PAD = 20;

// Target palette (from src/theme.ts).
const LIGHT = [231, 233, 238]; // #E7E9EE  — was dark navy
const ACCENT = [76, 141, 255]; // #4C8DFF  — was brand blue

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

const png = PNG.sync.read(fs.readFileSync(SRC));
const src = (x, y) => {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};

const x0 = BOX.x - PAD;
const y0 = BOX.y - PAD;
const W = BOX.w + PAD * 2;
const H = BOX.h + PAD * 2;
const out = new PNG({ width: W, height: H });

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const [r, g, b] = src(x0 + x, y0 + y);
    const L = luma(r, g, b);
    // Flat ink with a narrow anti-alias feather:
    //   L <= 150            solid ink
    //   150 < L < 240       edge feather, alpha ramps 1 -> 0
    //   L >= 240            white ground -> transparent
    let a = L <= 150 ? 1 : L >= 240 ? 0 : (240 - L) / 90;
    if (a < 0.06) a = 0;
    // Hue class from the source pixel: the navy outline/`</>` vs the blue fill
    // and wing. Measured: blue ink has (b - r) > 35 with b > 95.
    const isBlue = b - r > 30 && b > 95;
    const [cr, cg, cb] = isBlue ? ACCENT : LIGHT;
    const i = (y * W + x) * 4;
    out.data[i] = cr;
    out.data[i + 1] = cg;
    out.data[i + 2] = cb;
    out.data[i + 3] = Math.round(a * 255);
  }
}

const fullResPath = new URL('../src/assets/.devworks-mark.full.png', import.meta.url);
fs.writeFileSync(fullResPath, PNG.sync.write(out));

// Downscale to OUT_H with sips (preserves alpha), then drop the full-res temp.
execFileSync('sips', ['-z', String(OUT_H), String(Math.round((OUT_H * W) / H)),
  fullResPath.pathname, '--out', OUT.pathname], { stdio: 'ignore' });
fs.unlinkSync(fullResPath);

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`wrote ${OUT.pathname}  (${Math.round((OUT_H * W) / H)}×${OUT_H}, ${kb} KB)`);
