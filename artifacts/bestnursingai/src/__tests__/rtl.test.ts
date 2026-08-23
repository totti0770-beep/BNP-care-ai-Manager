import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Direction-safety.
 *
 * Arabic is this app's primary language, so a physical direction class is not
 * a cosmetic slip — `ml-80` on the main pane put the 320px gutter on the left
 * while the sidebar sat on the right, and the sidebar covered the screen the
 * nurse was reading. Tailwind v4 logical utilities (ms/me, ps/pe, start/end,
 * border-s/border-e, text-start/text-end) mirror themselves from the `dir`
 * attribute, so using them is what makes one layout correct in both languages.
 *
 * Scanned from source rather than rendered: this catches the class before it
 * reaches a screen, and no test renders every screen in both directions.
 */
const SRC = join(__dirname, '..');

/**
 * Physical classes that have a logical counterpart. `-x-`/`-y-` are left alone
 * (`mx-2` is already direction-neutral), and a `md:` prefix does not hide a
 * match because the pattern anchors on a word boundary.
 */
const PHYSICAL =
  /\b(?:ml|mr|pl|pr)-(?:\d|\[)|\btext-(?:left|right)\b|\bborder-[lr]\b|(?<![-\w])(?:left|right)-\d/;

/**
 * Decorative, symmetric background ornaments. Mirroring a blurred circle
 * changes nothing anyone can perceive, and they are aria-hidden.
 */
const DECORATIVE = /rounded-full blur-3xl|translate-x-1\/2/;

/** Every .tsx under src/, except the generated shadcn primitives in ui/. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'ui' || entry.name === '__tests__' ? [] : sources(path);
    }
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('layout direction', () => {
  it('uses logical direction utilities, not physical ones', () => {
    const offenders: string[] = [];

    for (const file of sources(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (PHYSICAL.test(line) && !DECORATIVE.test(line)) {
            offenders.push(`${file.slice(SRC.length + 1)}:${i + 1} ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });

  it('builds no Tailwind class name at runtime', () => {
    // `border-${isRTL ? 'l' : 'r'}` type-checks, renders, and produces no
    // border at all: Tailwind scans source text, so a class assembled from an
    // expression is never generated. Silent, and invisible in review.
    const offenders: string[] = [];

    for (const file of sources(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /\b(?:bg|text|border|w|h|p[xytblrse]?|m[xytblrse]?|rounded|grid-cols|gap)-\$\{/g,
      )) {
        offenders.push(`${file.slice(SRC.length + 1)}: ${match[0]}…`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
