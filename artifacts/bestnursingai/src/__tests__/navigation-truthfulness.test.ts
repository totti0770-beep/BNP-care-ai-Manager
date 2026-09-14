import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shell must not say things the system cannot back up, and must not
 * offer screens the server will refuse.
 *
 * Three findings from the 2026-09-14 web audit, each a small untruth on a
 * clinical product's chrome: a hardcoded document count, a search box that
 * searched nothing above a permanent "no conversations", and a "HIPAA Aware"
 * pill with no HIPAA artefact anywhere in the repository. Plus the governance
 * screens hidden behind a closed accordion, and clinical labels a nurse read in
 * the wrong language because they never became i18n keys.
 *
 * Source-scanning, like the rest of this suite: these check wiring and copy,
 * not pixels, and say so.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the sidebar states only what is measured', () => {
  it('carries no hardcoded badge count', () => {
    expect(code('components/Sidebar.tsx')).not.toMatch(/badge:\s*\d/);
  });

  it('has no recent-chats search that filters nothing', () => {
    const s = code('components/Sidebar.tsx');
    expect(s).not.toMatch(/recentChats/);
    expect(s).not.toMatch(/noConversations/);
    expect(s).not.toMatch(/searchQuery/);
  });

  it('does not offer upload to a user who cannot upload', () => {
    // The engine gates /documents/upload on documents.manage. Listing the
    // screen for everyone put a button in front of nurses that only 403s.
    const s = code('components/Sidebar.tsx');
    expect(s).toMatch(/canManageDocuments\s*\?\s*\[\{ id: 'upload'/);
  });
});

describe('governance screens are grouped, not buried', () => {
  it('has no collapsed "advanced features" accordion', () => {
    const s = code('components/Sidebar.tsx');
    expect(s).not.toMatch(/showAdvanced/);
    expect(s).not.toMatch(/advancedFeatures/);
  });

  it('names the three groups a nurse would recognise', () => {
    const s = code('components/Sidebar.tsx');
    for (const key of ['navClinical', 'navKnowledge', 'navGovernance']) {
      expect(s).toContain(`t('${key}')`);
    }
  });

  it('still gates formulary and audit on the permission the server enforces', () => {
    // Un-hiding these for a nurse would be a lie of a different shape: the
    // routes are require_admin on the engine.
    const s = code('components/Sidebar.tsx');
    expect(s).toMatch(/canManageSettings\s*\?\s*\[[\s\S]*?id: 'formulary'/);
    expect(s).toMatch(/canManageSettings\s*\?\s*\[[\s\S]*?id: 'audit-log'/);
  });

  it('marks the active item for assistive technology', () => {
    expect(code('components/Sidebar.tsx')).toMatch(/aria-current=\{isActive \? 'page' : undefined\}/);
  });
});

describe('the home page claims only what exists', () => {
  it('no longer asserts HIPAA', () => {
    expect(read('components/HomePage.tsx')).not.toMatch(/hipaaAware/);
    expect(read('i18n.ts')).not.toMatch(/HIPAA/);
  });

  it('the replacement claim is one the audit chain evidences', () => {
    expect(code('components/HomePage.tsx')).toMatch(/t\('auditTrail'\)/);
  });
});

describe('every clinical label in the chat is a translation key', () => {
  const HARDCODED = [
    'Patient Context',
    'Connecting...',
    'Live Engine ·',
    'Querying Clinical AI Engine',
    'Processing clinical context',
    'إيقاف التسجيل',
    'تحدّث بسؤالك',
    'حساب الجرعات · تحذيرات السلامة',
    'يمكنك التحدث بسؤالك',
  ];

  it('none of the previously hardcoded strings survive as literals', () => {
    const s = code('components/ChatPage.tsx');
    for (const literal of HARDCODED) {
      expect(s, `still hardcoded: ${literal}`).not.toContain(literal);
    }
  });

  it('the answer list is a live region', () => {
    // A clinical answer arrives asynchronously; without this a screen reader
    // is never told it did.
    const s = code('components/ChatPage.tsx');
    expect(s).toMatch(/aria-live="polite"/);
    expect(s).toMatch(/role="log"/);
  });

  it('the microphone has an accessible name in both states', () => {
    const s = code('components/ChatPage.tsx');
    expect(s).toMatch(/aria-label=\{isListening \? t\('micStop'\) : t\('micStart'\)\}/);
  });
});

describe('copy exists in both languages', () => {
  const KEYS = [
    'auditTrail', 'navClinical', 'navKnowledge', 'navGovernance',
    'patientContext', 'patientContextHint', 'engineConnecting', 'engineLive',
    'engineLiveModel', 'engineQuerying', 'engineProcessing', 'micStart',
    'micStop', 'chatConnectedSummary', 'chatCapabilities', 'chatVoiceHint',
    'answerRegion',
  ];
  it('every new key is present twice', () => {
    const i18n = read('i18n.ts');
    for (const key of KEYS) {
      expect(i18n.split(`${key}:`).length - 1, `${key} in both blocks`).toBe(2);
    }
  });
});
