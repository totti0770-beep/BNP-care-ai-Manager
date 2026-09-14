import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The home screen is a console, and every number on it is measured.
 *
 * Source-scanning, like the rest of this suite. These pin three things: that
 * the poster is gone and the console reads from real endpoints; that no tile
 * shows a figure the system does not produce; and that patient context is
 * shared, visible, and still session-only.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('home is a console, not a poster', () => {
  const home = code('components/HomePage.tsx');

  it('has an ask box wired to the assistant', () => {
    expect(home).toMatch(/onAsk\(q\)/);
    expect(home).toMatch(/htmlFor="home-ask"/);
  });

  it('reads status from the backend context, not from constants', () => {
    for (const field of ['isEngineAvailable', 'engineProblems', 'indexedChunks', 'engineDocuments', 'formularyCounts']) {
      expect(home, field).toContain(field);
    }
  });

  it('the old marketing pills are gone', () => {
    expect(home).not.toMatch(/evidenceBased|realTime|citedSources|auditTrail/);
  });

  it('shows the degraded reasons verbatim, as an alert, before the ask box', () => {
    expect(home).toMatch(/role="alert"/);
    const alertAt = home.indexOf('role="alert"');
    const askAt = home.indexOf('id="home-ask"');
    expect(alertAt).toBeGreaterThan(-1);
    expect(alertAt).toBeLessThan(askAt);
    expect(home).toMatch(/engineProblems\.map/);
  });

  it('disables asking while the engine cannot answer', () => {
    expect(home).toMatch(/disabled=\{!isEngineAvailable\}/);
  });
});

describe('no invented metric', () => {
  const home = code('components/HomePage.tsx');

  it('never counts a document as approved without the engine saying so', () => {
    expect(home).toMatch(/d\.status === 'approved'/);
    expect(home).not.toMatch(/status !== 'pending'/);
  });

  it('contains no refusal rate, accuracy, adoption or outcome figure', () => {
    for (const word of ['refusalRate', 'accuracy', 'adoption', 'outcome', 'compliance', 'uptime', '%']) {
      expect(home, word).not.toContain(word);
    }
  });

  it('formulary status comes from /health and falls back to "not reported"', () => {
    expect(home).toMatch(/formularyCounts\s*\?/);
    expect(home).toContain("t('statusFormularyUnknown')");
  });

  it('recent activity is offered only to a user the engine lets read it', () => {
    expect(home).toMatch(/canReadAudit && <RecentActivity/);
    expect(home).toMatch(/hasPermission\('settings\.manage'\)/);
  });
});

describe('patient context is shared, visible, and never stored', () => {
  it('is a memory-only provider', () => {
    const ctx = code('contexts/PatientContext.tsx');
    expect(ctx).toMatch(/useState<QueryOptions>\(\{\}\)/);
    for (const store of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'fetch(']) {
      expect(ctx, store).not.toContain(store);
    }
  });

  it('the assistant reads it from the provider, not its own state', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/usePatient\(\)/);
    expect(chat).not.toMatch(/useState<QueryOptions>\(\{\}\)/);
  });

  it('is shown as chips before the input, not behind a toggle', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/t\('ctxEmpty'\)/);
    expect(chat).toMatch(/t\('ctxKg', \{ value: patientOpts\.patientWeightKg \}\)/);
    expect(chat).toMatch(/aria-expanded=\{showPatientCtx\}/);
  });

  it('the home console reads the same values', () => {
    expect(code('components/HomePage.tsx')).toMatch(/usePatient\(\)/);
  });

  it('is provided once, above both screens', () => {
    const app = code('App.tsx');
    expect(app.split('<PatientProvider>').length - 1).toBe(1);
  });
});

describe('a question from home is asked once', () => {
  it('App carries it and clears it on consumption', () => {
    const app = code('App.tsx');
    expect(app).toMatch(/pendingQuestion/);
    expect(app).toMatch(/onInitialQuestionConsumed=\{\(\) => setPendingQuestion\(null\)\}/);
  });

  it('ChatPage consumes before sending, so a re-render cannot resend', () => {
    const chat = code('components/ChatPage.tsx');
    const consumeAt = chat.indexOf('onInitialQuestionConsumed?.()');
    const sendAt = chat.indexOf('void sendMessage(initialQuestion)');
    expect(consumeAt).toBeGreaterThan(-1);
    expect(consumeAt).toBeLessThan(sendAt);
  });
});

describe('navigation labels are the ones a nurse would recognise', () => {
  it('uses the product names, not component names', () => {
    const s = code('components/Sidebar.tsx');
    for (const key of ['navClinicalAssistant', 'navClinicalEvidence', 'navEngineHealth', 'navAccount']) {
      expect(s).toContain(`t('${key}')`);
    }
    expect(s).not.toContain("t('closedLoopRAG')");
  });
});

describe('copy exists in both languages', () => {
  const KEYS = [
    'navClinicalAssistant', 'navClinicalEvidence', 'navEngineHealth', 'navAccount',
    'homeTitle', 'homeLead', 'homeAskLabel', 'homeAskPlaceholder', 'homeAskButton',
    'homeQuickActions', 'qaClinicalQuestion', 'qaMedication', 'qaDose', 'qaPatientContext',
    'qaEvidence', 'qaRecentActivity', 'homePatientTitle', 'homePatientHint', 'homePatientEmpty',
    'homeSystemStatus', 'statusEngine', 'statusChunks', 'statusEvidence', 'statusFormulary',
    'statusFormularyApproved', 'statusFormularyUnknown', 'homeDegradedTitle', 'homeDegradedBody',
    'homeRecentTitle', 'ctxEmpty', 'ctxEmptyHint', 'ctxAdd', 'ctxEdit', 'ctxDone', 'ctxClear',
    'ctxKg', 'ctxYears',
  ];
  it('every new key is present twice', () => {
    const i18n = read('i18n.ts');
    for (const key of KEYS) {
      expect(i18n.split(`${key}:`).length - 1, `${key} in both blocks`).toBe(2);
    }
  });
});
