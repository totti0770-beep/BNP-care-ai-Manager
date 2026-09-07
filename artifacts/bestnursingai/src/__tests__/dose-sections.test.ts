import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The dose panel must not be a wall of monospace text.
 *
 * A drug whose figures nobody signed off gets no calculated number — correct,
 * and deliberate. What the engine quotes instead is the hospital's reference
 * regimen, which `tools/convert_jsh_workbooks.py` assembles as
 * `Label: value | Label: value` from the workbook columns. For vancomycin that
 * is 6,162 characters across 11 fields, the longest row in the formulary, and
 * 434 of the 620 shipped rows are over 1,000 characters.
 *
 * All of it arrived as one string, captioned "Safe range", printed in a single
 * `<p>` with `font-mono` and no clamp — the only section in the answer card
 * using a monospace face. The nurse got a page of scrolling where a dose
 * belongs.
 *
 * The fix keeps every character and changes how it arrives: the engine splits
 * on the labels it wrote itself, and the panel opens the bedside fields while
 * folding the reference ones behind one toggle. These scan source because the
 * defect was structural — each piece behaved as written.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Comments stripped: they quote the defective expressions to explain them. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the dose panel renders fields, not a blob', () => {
  it('drops the monospace face the dose section alone carried', () => {
    const chat = code('components/ChatPage.tsx');
    // The Answer section's line was identical minus this class.
    expect(chat).not.toMatch(/whitespace-pre-line font-mono/);
    expect(chat).not.toMatch(/font-mono[^"]*>\{bnp\.dose\}/);
  });

  it('renders the structured sections when the engine sends them', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/bnp\.doseSections/);
    expect(chat).toMatch(/<DoseSections sections=\{bnp\.doseSections\}/);
  });

  it('still renders the flat string when it does not', () => {
    // An engine deployed before this change, and every computed dose, which is
    // a short line with nothing to split.
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/\{bnp\.dose\}/);
  });

  it('shows the reason a dose was not calculated alongside the fields', () => {
    // Rendering sections instead of the flat string would otherwise drop the
    // one line saying why there is no number.
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/bnp\.doseNotice/);
  });

  it('folds only the non-bedside fields, and never an empty panel', () => {
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/filter\(\(s\) => s\.primary\)/);
    // A regimen with nothing marked primary must show everything rather than
    // hide all of it behind the toggle.
    expect(chat).toMatch(/bedside\.length \? bedside : sections/);
  });

  it('reads the regimen left-to-right even on an Arabic page', () => {
    // English clinical text with figures in it, inside an RTL document.
    const chat = code('components/ChatPage.tsx');
    expect(chat).toMatch(/dir="ltr"/);
  });
});

describe('the field carries through the client', () => {
  it('the engine response type declares the sections and the notice', () => {
    const api = code('services/clinicalApi.ts');
    expect(api).toMatch(/dose_sections\?:/);
    expect(api).toMatch(/dose_notice\?:/);
  });

  it('BackendContext maps both onto the response', () => {
    const ctx = code('contexts/BackendContext.tsx');
    expect(ctx).toMatch(/doseSections: engine\.dose_sections/);
    expect(ctx).toMatch(/doseNotice: engine\.dose_notice/);
  });
});

describe('regimen labels are translated, not printed raw', () => {
  const LABELS = [
    'regTherapeuticClass',
    'regIndications',
    'regDosageForm',
    'regAdultDosing',
    'regPediatricDosing',
    'regRenalHepatic',
    'regAdministration',
    'regPrescriberAuthority',
    'regAdditionalNotes',
    'regPackageSize',
    'regFinalConcentration',
    'regFinalVolume',
    'regDiluents',
    'regPreparation',
  ];

  it('every label the engine can emit has a key', () => {
    // The engine's vocabulary is closed and mirrors its own converter, so an
    // untranslated label means the two have drifted.
    const chat = read('components/ChatPage.tsx');
    for (const key of LABELS) expect(chat).toContain(key);
  });

  it('the toggle and every label exist in both languages', () => {
    // i18n.test.ts already enforces EN/AR parity across the whole file; this
    // checks the keys are actually there to be paired.
    const i18n = read('i18n.ts');
    for (const key of [...LABELS, 'doseShowDetails', 'doseHideDetails']) {
      const occurrences = i18n.split(`${key}:`).length - 1;
      expect(occurrences, `${key} should appear in both blocks`).toBe(2);
    }
  });
});
