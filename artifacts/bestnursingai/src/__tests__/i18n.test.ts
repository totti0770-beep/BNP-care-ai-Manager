import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Locale parity.
 *
 * A key present in one language and not the other falls back silently, so a
 * user can be shown a clinical section header — or a safety refusal — in a
 * language they did not choose. Parsed from source so this stays a pure test.
 */
function extractKeys(block: string): Set<string> {
  return new Set(
    [...block.matchAll(/^\s{6}([a-zA-Z][a-zA-Z0-9_]*):/gm)].map((m) => m[1]!),
  );
}

const source = readFileSync(join(__dirname, '..', 'i18n.ts'), 'utf8');
const enStart = source.indexOf('  en: {');
const arStart = source.indexOf('  ar: {');
// Stop at the i18next init call, or its config keys (escapeValue, order …)
// would be counted as Arabic translations.
const resourcesEnd = source.indexOf('.init(');

const enKeys = extractKeys(source.slice(enStart, arStart));
const arKeys = extractKeys(source.slice(arStart, resourcesEnd));

describe('web locales', () => {
  it('defines a meaningful number of strings', () => {
    expect(enKeys.size).toBeGreaterThan(150);
  });

  it('has no English key missing from Arabic', () => {
    expect([...enKeys].filter((k) => !arKeys.has(k))).toEqual([]);
  });

  it('has no Arabic key missing from English', () => {
    expect([...arKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('translates the clinical section headers a nurse reads', () => {
    for (const key of [
      'secAnswer',
      'secDose',
      'secSafetyWarning',
      'secNursingNotes',
      'notFoundInSources',
    ]) {
      expect(enKeys.has(key), `${key} missing from en`).toBe(true);
      expect(arKeys.has(key), `${key} missing from ar`).toBe(true);
    }
  });
});
