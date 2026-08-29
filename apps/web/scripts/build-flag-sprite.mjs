// One-off generator: builds apps/web/lib/phone/countries.ts + apps/web/public/flags.webp
// Run from this scratchpad (needs sharp + world-countries + flag-icons installed here).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const REPO = 'C:/Users/Laxman/OneDrive/Documents/Github/jobportal';
const FLAGS = path.resolve('../flagsrc/package/flags/4x3');
const WC = JSON.parse(fs.readFileSync('./node_modules/world-countries/countries.json', 'utf8'));

// Display cell is 20x15 CSS px; the sprite is drawn at 2x so it stays crisp on
// retina without a second asset.
const CELL_W = 20;
const CELL_H = 15;
const SCALE = 2;
const COLS = 16;

const have = new Set(
  fs.readdirSync(FLAGS).filter((f) => f.endsWith('.svg')).map((f) => f.replace('.svg', '')),
);

// world-countries splits `idd` arbitrarily, and for a few territories with
// SEVERAL suffixes the root alone is a fragment rather than a code. Verified
// individually against ITU assignment; every other multi-suffix entry (+1 for
// the NANP, +7 for RU/KZ) is genuinely a one-digit code and needs no override.
const DIAL_OVERRIDE = {
  SH: '+290', // Saint Helena (Ascension is +247, Tristan da Cunha +290)
  EH: '+212', // Western Sahara dials through Morocco
  VA: '+39', // Vatican City: +379 is assigned but unused; numbers dial via Italy
};

function dial(c) {
  const iso2 = String(c.cca2 || '').toUpperCase();
  if (DIAL_OVERRIDE[iso2]) return DIAL_OVERRIDE[iso2];
  const root = c.idd?.root;
  const suf = c.idd?.suffixes;
  if (!root) return null;
  // Exactly one suffix means it is part of the number (India: +9 & "1" -> +91).
  // Many suffixes are area codes inside a shared code (US/CA share +1), so the
  // root alone is the country's dial code.
  if (Array.isArray(suf) && suf.length === 1) {
    const digits = (root + suf[0]).replace('+', '');
    // Always JOIN - the root alone can be a meaningless fragment, because
    // world-countries splits idd arbitrarily (Finland is root "+3" suffix "58",
    // Åland root "+3" suffix "5818").
    //
    // No real country calling code exceeds 4 digits (+1876 Jamaica is a valid
    // NANP one), so anything longer means the tail is an AREA code rather than
    // part of the country code: Åland is +358 18, and leaving it fused would
    // have had the user type their local number without the 18.
    if (digits.length <= 4) return '+' + digits;
    return '+' + digits.slice(0, 3);
  }
  return root;
}

const rows = [];
for (const c of WC) {
  const iso = String(c.cca2 || '').toLowerCase();
  const d = dial(c);
  if (!iso || !d || !have.has(iso)) continue;
  rows.push({ iso: iso.toUpperCase(), file: iso, name: c.name.common, dial: d });
}
rows.sort((a, b) => a.name.localeCompare(b.name, 'en'));
rows.forEach((r, i) => {
  r.col = i % COLS;
  r.row = Math.floor(i / COLS);
});

const ROWS = Math.ceil(rows.length / COLS);
console.log(`countries: ${rows.length}  grid: ${COLS}x${ROWS}`);

// ---- sprite
const W = COLS * CELL_W * SCALE;
const H = ROWS * CELL_H * SCALE;
const tiles = await Promise.all(
  rows.map(async (r) => ({
    input: await sharp(path.join(FLAGS, `${r.file}.svg`), { density: 300 })
      .resize(CELL_W * SCALE, CELL_H * SCALE, { fit: 'fill' })
      .png()
      .toBuffer(),
    left: r.col * CELL_W * SCALE,
    top: r.row * CELL_H * SCALE,
  })),
);
const out = path.join(REPO, 'apps/web/public/flags.webp');
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(tiles)
  .webp({ quality: 88 })
  .toFile(out);
console.log(`sprite: ${out}  ${W}x${H}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);

// ---- data module
const lines = rows.map((r) => `  ['${r.iso}', ${JSON.stringify(r.name)}, '${r.dial}', ${r.col}, ${r.row}],`);
const ts = `// GENERATED FILE - do not edit by hand.
//
// Built by scripts/build-flag-sprite.mjs from \`world-countries\` (dial codes and
// names) and \`flag-icons\` (MIT, the flag artwork). Regenerate that way rather
// than editing, or the sprite offsets below will stop matching flags.webp.
//
// Flag EMOJI are deliberately not used. Windows ships no flag glyphs, so
// U+1F1EE U+1F1F3 renders as the letters "IN" - measured in a real browser
// here, 0 coloured pixels out of 336 - and CLAUDE.md section 2 bans emoji as UI
// elements besides. The artwork is a single sprite fetched once, which keeps it
// out of the JS bundle entirely and so off the 150 KB first-load budget.

/** ISO 3166-1 alpha-2, English name, dial code, and sprite cell. */
export type Country = readonly [iso: string, name: string, dial: string, col: number, row: number];

/** Cell size in CSS pixels. The sprite itself is drawn at 2x for retina. */
export const FLAG_W = ${CELL_W};
export const FLAG_H = ${CELL_H};
export const FLAG_COLS = ${COLS};
export const FLAG_ROWS = ${ROWS};
export const FLAG_SPRITE_URL = '/flags.webp';

/** The default, per the owner: India. */
export const DEFAULT_COUNTRY_ISO = 'IN';

export const COUNTRIES: readonly Country[] = [
${lines.join('\n')}
];

/**
 * Inline style positioning one flag out of the sprite.
 *
 * background-size is expressed in CSS pixels of the WHOLE sheet, which is what
 * scales the 2x artwork back down to a crisp \${FLAG_W}x\${FLAG_H} cell.
 */
export function flagStyle(col: number, row: number) {
  return {
    width: \`\${FLAG_W}px\`,
    height: \`\${FLAG_H}px\`,
    backgroundImage: \`url(\${FLAG_SPRITE_URL})\`,
    backgroundSize: \`\${FLAG_COLS * FLAG_W}px \${FLAG_ROWS * FLAG_H}px\`,
    backgroundPosition: \`-\${col * FLAG_W}px -\${row * FLAG_H}px\`,
  } as const;
}

/** Look up by ISO code. Falls back to the default rather than returning null. */
export function countryByIso(iso: string): Country {
  const hit = COUNTRIES.find((c) => c[0] === iso.toUpperCase());
  if (hit) return hit;
  const fallback = COUNTRIES.find((c) => c[0] === DEFAULT_COUNTRY_ISO);
  if (!fallback) throw new Error('country list is missing its default');
  return fallback;
}

/**
 * Match on name prefix, interior word, ISO code, or dial code. A leading "+" is
 * ignored so both "91" and "+91" find India.
 */
export function searchCountries(q: string): readonly Country[] {
  const needle = q.trim().toLowerCase().replace(/^\\+/, '');
  if (!needle) return COUNTRIES;
  return COUNTRIES.filter(([iso, name, d]) => {
    const n = name.toLowerCase();
    return (
      n.startsWith(needle) ||
      n.includes(' ' + needle) ||
      iso.toLowerCase().startsWith(needle) ||
      d.replace('+', '').startsWith(needle)
    );
  });
}
`;
const tsOut = path.join(REPO, 'apps/web/lib/phone/countries.ts');
fs.mkdirSync(path.dirname(tsOut), { recursive: true });
fs.writeFileSync(tsOut, ts, 'utf8');
console.log(`data: ${tsOut}  ${rows.length} rows`);
const india = rows.find((r) => r.iso === 'IN');
console.log('India ->', india);
