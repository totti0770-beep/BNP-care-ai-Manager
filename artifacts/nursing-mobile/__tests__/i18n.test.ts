import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Locale parity.
 *
 * A missing Arabic key silently falls back to English and vice versa, which for
 * this app means a nurse could see a safety message in a language they do not
 * read — the exact failure this i18n work exists to remove. Parsed from source
 * rather than imported, because importing pulls in React Native.
 */
function extractKeys(block: string): Set<string> {
  return new Set(
    [...block.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*):/gm)].map((m) => m[1]!),
  );
}

const source = readFileSync(join(__dirname, '..', 'i18n.ts'), 'utf8');
const enBlock = source.slice(source.indexOf('const en = {'), source.indexOf('const ar:'));
const arBlock = source.slice(source.indexOf('const ar:'), source.indexOf('const deviceLanguage'));

const enKeys = extractKeys(enBlock);
const arKeys = extractKeys(arBlock);

describe('mobile locales', () => {
  it('defines a meaningful number of strings', () => {
    expect(enKeys.size).toBeGreaterThan(50);
  });

  it('has no English key missing from Arabic', () => {
    const missing = [...enKeys].filter((k) => !arKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('has no Arabic key missing from English', () => {
    const missing = [...arKeys].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('keeps the safety-critical refusal in both languages', () => {
    // The dose block is the string a nurse must be able to read.
    for (const key of ['doseBlocked', 'doseBlockedDefault', 'safetyAlertActive']) {
      expect(enKeys.has(key), `${key} missing from en`).toBe(true);
      expect(arKeys.has(key), `${key} missing from ar`).toBe(true);
    }
  });
});
