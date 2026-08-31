import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Theme-token integrity.
 *
 * The shadcn colour tokens shipped as scaffold: 68 declarations reading
 * `--background: red; /*replace with H S L *\/`, consumed through
 * `@theme inline { --color-background: hsl(var(--background)); }`. `hsl(red)`
 * is not a valid colour, so the browser dropped every one of those
 * declarations and each shadcn component fell back to its unstyled light
 * default.
 *
 * Twelve of the thirteen screens hid this, because they write `var(--dg-*)`
 * directly and never touch a shadcn token. FormularyPage does not — it is
 * built from Card/Button/text-muted-foreground — so it alone rendered white on
 * a dark app, which is how the defect was finally seen, on a phone, in
 * production.
 *
 * These tests fail on the shapes that caused it rather than on appearance,
 * which no unit test can judge.
 */
const CSS = readFileSync(join(__dirname, '..', 'index.css'), 'utf8');

describe('index.css theme tokens', () => {
  it('leaves no unfilled scaffold placeholder', () => {
    const placeholders = CSS.match(/--[a-z0-9-]+:\s*red\s*;/g) ?? [];
    expect(placeholders).toEqual([]);
  });

  it('never wraps a token in hsl(), because the palette is hex', () => {
    // `hsl(var(--x))` only works when --x holds a bare "H S L" triplet. The
    // BNP palette is hex, so this wrapper is what silently voids a rule.
    const wrapped = CSS.match(/hsl\(var\(--[a-z0-9-]+\)\)/g) ?? [];
    expect(wrapped).toEqual([]);
  });

  it('resolves every shadcn colour token against the --dg-* palette', () => {
    // One source of truth: a shadcn component and a hand-styled screen must
    // not be able to disagree about what "surface" means.
    const theme = CSS.slice(
      CSS.indexOf('@theme inline {'),
      CSS.indexOf('\n}', CSS.indexOf('@theme inline {')),
    );
    const mapped = theme.match(/--color-[a-z0-9-]+:\s*var\(--[a-z0-9-]+\)/g) ?? [];
    expect(mapped.length).toBeGreaterThan(30);

    for (const token of ['--background', '--card', '--muted-foreground', '--primary', '--border']) {
      const decl = new RegExp(`\\${token}:\\s*(var\\(--dg-[a-z0-9-]+\\)|#[0-9a-f]{3,8})\\s*;`, 'i');
      expect(CSS, `${token} must resolve to a dg token or a literal colour`).toMatch(decl);
    }
  });

  it('keeps light mode as an override of the dark default', () => {
    // Dark is the product's default. Light works by redefining the dg tokens
    // under [data-theme="light"], so the shadcn tokens follow for free — and
    // there is no second palette to keep in step.
    expect(CSS).toContain('[data-theme="light"]');
    expect(CSS).not.toMatch(/^\.dark\s*\{/m);
  });
});

describe('ThemeContext', () => {
  const SOURCE = readFileSync(
    join(__dirname, '..', 'contexts', 'ThemeContext.tsx'),
    'utf8',
  );

  it('drives both theme switches', () => {
    // `data-theme` drives the dg palette; the `dark` class is what Tailwind's
    // `dark:` variant matches. Setting only the first leaves every `dark:`
    // utility in components/ui/ dead.
    expect(SOURCE).toContain("setAttribute('data-theme', 'light')");
    expect(SOURCE).toMatch(/classList\.toggle\('dark'/);
  });
});
