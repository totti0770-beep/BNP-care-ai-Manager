import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Medication Safety renders the engine's projection and computes nothing.
 *
 * The property that matters is on the server (see the engine's
 * test_formulary_lookup.py): an unapproved drug arrives with no clinical
 * fields. These source-scanning checks pin the client side of that contract —
 * that it branches on `clinical_data_withheld`, never fills a withheld value,
 * never folds safety information away, and is reachable by every user.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the lookup is the nurse-safe read', () => {
  it('calls /formulary/lookup, not the admin listing', () => {
    const api = code('services/clinicalApi.ts');
    expect(api).toMatch(/authFetch\(`\/formulary\/lookup\?q=\$\{encodeURIComponent\(q\)\}`\)/);
  });

  it('treats 503 as "formulary unavailable", distinct from a generic error', () => {
    const api = code('services/clinicalApi.ts');
    expect(api).toMatch(/res\.status === 503/);
    expect(api).toMatch(/kind: "unavailable"/);
  });

  it('is in the Clinical group for every user, not behind a permission', () => {
    const s = code('components/Sidebar.tsx');
    const clinical = s.slice(s.indexOf('const clinicalItems'), s.indexOf('const knowledgeItems'));
    expect(clinical).toContain("id: 'medication-safety'");
    expect(clinical).not.toMatch(/canManage/);
  });
});

describe('the screen computes nothing', () => {
  const page = code('components/MedicationSafetyPage.tsx');

  it('contains no arithmetic on a clinical value', () => {
    // Multiplying or dividing a dose in React is the S1/S3 defect class.
    expect(page).not.toMatch(/adult_max_daily\s*[*\/+-]/);
    expect(page).not.toMatch(/overdose_threshold\w*\s*[*\/+-]\s*\w/);
    expect(page).not.toMatch(/patientWeightKg|\.age\b/);
  });

  it('branches on clinical_data_withheld and says why', () => {
    expect(page).toMatch(/drug\.clinical_data_withheld \?/);
    expect(page).toContain("t('msWithheldPending')");
    expect(page).toContain("t('msWithheldRejected')");
  });

  it('renders regimen labels through the same map the assistant uses', () => {
    expect(page).toMatch(/import \{ REGIMEN_LABEL_KEYS \} from '@\/components\/ChatPage'/);
    expect(code('components/ChatPage.tsx')).toMatch(/export const REGIMEN_LABEL_KEYS/);
  });

  it('never folds safety information behind the show-more toggle', () => {
    // Contraindications, interactions, warnings and antidote must sit outside
    // the `showAll &&` block; only reference regimen fields fold.
    const foldStart = page.indexOf('{showAll && (');
    const foldEnd = page.indexOf(')}', foldStart);
    const folded = page.slice(foldStart, foldEnd);
    for (const key of ['msContraindications', 'msInteractions', 'msWarnings', 'msAntidote']) {
      expect(folded, `${key} must not be folded`).not.toContain(key);
      expect(page).toContain(`t('${key}')`);
    }
  });

  it('has loading, idle, empty, unavailable and error states', () => {
    for (const key of ['msIdle', 'msSearching', 'msNoMatches', 'msFormularyDown', 'msError', 'msUnavailable']) {
      expect(page).toContain(`t('${key}'`);
    }
    expect(page).toMatch(/aria-live="polite"/);
    expect(page).toMatch(/role="alert"/);
  });

  it('shows provenance on every card, approved or not', () => {
    const cardStart = page.indexOf('const DrugCard');
    const branchAt = page.indexOf('drug.clinical_data_withheld ?', cardStart);
    const provenanceAt = page.indexOf('provenance', cardStart);
    expect(provenanceAt).toBeGreaterThan(-1);
    expect(page.indexOf('{provenance}', cardStart)).toBeLessThan(branchAt);
  });
});

describe('copy exists in both languages', () => {
  const KEYS = [
    'navMedicationSafety', 'msTitle', 'msLead', 'msSearchLabel', 'msSearchPlaceholder', 'msIdle',
    'msSearching', 'msNoMatches', 'msNoMatchesHint', 'msUnavailable', 'msFormularyDown', 'msError',
    'msStatusApproved', 'msStatusPending', 'msStatusRejected', 'msWithheldPending', 'msWithheldRejected',
    'msMaxDaily', 'msOverdoseThreshold', 'msRoute', 'msFrequency', 'msAntidote', 'msContraindications',
    'msInteractions', 'msWarnings', 'msShowMore', 'msShowLess',
  ];
  it('every new key is present twice', () => {
    const i18n = read('i18n.ts');
    for (const key of KEYS) {
      expect(i18n.split(`${key}:`).length - 1, `${key} in both blocks`).toBe(2);
    }
  });
});
