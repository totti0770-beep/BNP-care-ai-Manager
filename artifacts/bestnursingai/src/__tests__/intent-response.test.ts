import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The client must carry what the engine now decides, and change nothing else.
 *
 * The engine gained two fields: `intent`, which says what the question asked
 * for, and `missing_variables`, which is non-empty exactly when a calculation
 * was requested without the patient values it needs. In that case the engine
 * computes nothing and guesses nothing, so the dose card is empty — and an
 * empty card with no explanation is the failure mode this panel exists to
 * prevent.
 *
 * Everything about the dose panel itself is deliberately untouched. The
 * narrowing of `dose_sections` to the fields a question asked about happens in
 * the router, so `DoseSections` keeps rendering whatever it is handed and its
 * existing tests keep passing without a line being edited. These assertions are
 * additive for the same reason.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Comments stripped: they quote the shapes being described. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the new engine fields reach the client', () => {
  it('the wire type declares both', () => {
    const api = code('services/clinicalApi.ts');
    expect(api).toMatch(/intent\?:/);
    expect(api).toMatch(/missing_variables\?:/);
  });

  it('BackendContext maps them onto the response', () => {
    const ctx = code('contexts/BackendContext.tsx');
    expect(ctx).toMatch(/intent: engine\.intent/);
    expect(ctx).toMatch(/missingVariables: engine\.missing_variables/);
  });

  it('the domain type carries them', () => {
    const types = code('types/bnp.ts');
    expect(types).toMatch(/intent\?: string/);
    expect(types).toMatch(/missingVariables\?: string\[\]/);
  });
});

describe('a refused calculation explains itself', () => {
  it('renders a panel when values are missing', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/bnp\.missingVariables/);
    expect(chat).toMatch(/doseNeedsValues/);
  });

  it('says plainly that nothing was estimated', () => {
    // The whole point of the empty dose card is that the engine refused to
    // guess. Leaving that unsaid reads as a bug rather than as a safeguard.
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/doseNoGuess/);
  });

  it('names each missing value in the reader’s language', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/MISSING_VARIABLE_KEYS/);
    expect(chat).toContain('patient_weight_kg');
    expect(chat).toContain('age');
  });
});

describe('the dose panel is not disturbed', () => {
  // Narrowing happens server-side precisely so these stay true.
  it('still renders the sections it is handed', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/<DoseSections sections=\{bnp\.doseSections\}/);
    expect(chat).toMatch(/bedside\.length \? bedside : sections/);
  });

  it('still has no monospace face on the dose body', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).not.toMatch(/whitespace-pre-line font-mono/);
  });
});

describe('copy exists in both languages', () => {
  const KEYS = ['doseNeedsValues', 'doseNoGuess', 'varWeight', 'varAge'];

  it('every new key is present twice', () => {
    // i18n.test.ts enforces EN/AR parity across the file; this checks the keys
    // are there to be paired at all.
    const i18n = read('i18n.ts');
    for (const key of KEYS) {
      const occurrences = i18n.split(`${key}:`).length - 1;
      expect(occurrences, `${key} should appear in both blocks`).toBe(2);
    }
  });
});
