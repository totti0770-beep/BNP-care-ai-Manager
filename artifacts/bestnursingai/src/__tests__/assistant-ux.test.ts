/**
 * Clinical Assistant UX: the intent is visible, missing patient values are
 * prominent and actionable, no safety information is folded, and nothing on
 * the answer card is hardcoded in one language.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const chat = src('components/ChatPage.tsx');
const i18n = src('i18n.ts');

const ENGINE_INTENTS = [
  'dose', 'dose_calculation', 'preparation', 'administration', 'renal_adjustment',
  'pediatric_dosing', 'antidote', 'monitoring', 'general_drug_info', 'full_drug_info',
];

describe('intent is exposed, never raw', () => {
  it('maps every engine ClinicalIntent value to a translation key', () => {
    const block = chat.slice(chat.indexOf('export const INTENT_KEYS'), chat.indexOf('};', chat.indexOf('export const INTENT_KEYS')));
    for (const v of ENGINE_INTENTS) expect(block).toMatch(new RegExp(`^\\s+${v}: 'intent`, 'm'));
  });

  it('renders the chip only when the intent is one the map knows', () => {
    expect(code(chat)).toMatch(/bnp\.intent && INTENT_KEYS\[bnp\.intent\] &&/);
    expect(code(chat)).not.toMatch(/\{bnp\.intent\}/);
  });
});

describe('missing patient values are prominent and actionable', () => {
  it('the card is an alert', () => {
    expect(code(chat)).toMatch(/bnp\.missingVariables\.length > 0 && \(\s*<div role="alert"/);
  });

  it('offers to open the patient editor from the card', () => {
    const c = code(chat);
    expect(c).toMatch(/onAddPatientValues && \(/);
    expect(c).toMatch(/onAddPatientValues=\{\(\) => setShowPatientCtx\(true\)\}/);
    expect(c).toMatch(/t\('doseAddPatientValues'\)/);
  });

  it('still says no figure was guessed', () => {
    expect(code(chat)).toMatch(/t\('doseNoGuess'\)/);
  });
});

describe('safety information is never folded', () => {
  it('the safety-alert banner is an alert', () => {
    expect(code(chat)).toMatch(/bnp\.safetyAlert && \(\s*<div role="alert"/);
  });

  it('safety alerts, warnings and flags render without a toggle', () => {
    const c = code(chat);
    const card = c.slice(c.indexOf('function BNPResponseCard'), c.indexOf('function ', c.indexOf('function BNPResponseCard') + 10));
    // The only collapsible in the answer is the reference regimen fields in DoseSections.
    expect(card).not.toMatch(/useState\(false\)/);
    expect(card).toMatch(/bnp\.safetyAlerts\.map/);
    expect(card).toMatch(/bnp\.safetyWarning\}/);
    expect(card).toMatch(/bnp\.contraindications\.map/);
    expect(card).toMatch(/bnp\.interactions\.map/);
  });

  it('the regimen fold hides reference fields only, primary ones stay open', () => {
    expect(code(chat)).toMatch(/showAll && rest\.map/);
    expect(code(chat)).toMatch(/primary\.map|\.filter\(\(?s\)? => s\.primary\)/);
  });
});

describe('no hardcoded English on the answer card', () => {
  it('flags headings and confidence label are translated', () => {
    const c = code(chat);
    expect(c).not.toMatch(/>Contraindications</);
    expect(c).not.toMatch(/Drug Interactions</);
    expect(c).toMatch(/t\(`confidence_\$\{bnp\.confidenceLabel\}`\)/);
  });
});

describe('i18n parity', () => {
  const keys = [
    'intentAskedFor', ...ENGINE_INTENTS.map((v) => 'intent' + v.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('')),
    'confidence_High', 'confidence_Medium', 'confidence_Low', 'doseAddPatientValues',
  ];
  it.each(keys)('%s exists in both EN and AR', (key) => {
    const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
    expect(matches.length).toBe(2);
  });
});
