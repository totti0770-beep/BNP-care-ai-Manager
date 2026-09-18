/**
 * Accessibility, RTL and small screens: every icon-only control has a name,
 * every input has a label, every screen has exactly one h1, no app text is
 * hardcoded in one language, and the layouts that broke at 375px are fixed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(__dirname, '..');
const src = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const components = readdirSync(join(root, 'components'))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => `components/${f}`);

/** Screens App.tsx can render, plus the two full-page states. */
const PAGES = [
  'components/HomePage.tsx', 'components/ChatPage.tsx', 'components/MedicationSafetyPage.tsx',
  'components/SecureUploadPage.tsx', 'components/DocumentsPage.tsx', 'components/KnowledgeGovernancePage.tsx',
  'components/CitationsPage.tsx', 'components/SettingsPage.tsx', 'components/AuditLogPage.tsx',
  'components/FormularyPage.tsx', 'components/RAGSettingsPage.tsx', 'components/LoginScreen.tsx',
  'components/NotPermitted.tsx',
];

/** A <button …> … </button> whose content is a single <Icon …/> and nothing else. */
// Attributes may contain arrow functions, so `>` is allowed when it follows `=`.
const ATTRS = String.raw`((?:=>|[^>])*?)`;
const ICON_ONLY_BUTTON = new RegExp(String.raw`<(?:button|Button)\b${ATTRS}>\s*<[A-Z][A-Za-z0-9]*\b(?:=>|[^>])*\/>\s*<\/(?:button|Button)>`, 'g');

describe('icon-only controls have an accessible name', () => {
  it.each(components)('%s', (file) => {
    const s = code(src(file));
    for (const m of s.matchAll(ICON_ONLY_BUTTON)) {
      expect(m[1], m[0].slice(0, 120)).toMatch(/aria-label=|title=/);
    }
  });
});

describe('text inputs have a label', () => {
  it.each(components)('%s', (file) => {
    const s = code(src(file));
    for (const m of s.matchAll(new RegExp(String.raw`<(?:Input|input)\b${ATTRS}\/?>`, 'g'))) {
      const attrs = m[1];
      if (/type="(?:checkbox|file|hidden)"/.test(attrs)) continue;
      const before = s.slice(Math.max(0, m.index! - 400), m.index!);
      const labelled =
        /aria-label=|aria-labelledby=/.test(attrs) ||
        /\bid="[^"]+"/.test(attrs) && /htmlFor=/.test(before) ||
        /<label\b[^>]*>(?:(?!<\/label>)[\s\S])*$/.test(before);
      expect(labelled, `${file}: ${m[0].slice(0, 100)}`).toBe(true);
    }
  });
});

describe('each screen has exactly one h1, and the sidebar brand is not one', () => {
  it.each(PAGES)('%s', (file) => {
    expect(code(src(file)).match(/<h1\b/g)?.length ?? 0).toBe(1);
  });

  it('Sidebar.tsx', () => {
    expect(code(src('components/Sidebar.tsx'))).not.toMatch(/<h1\b/);
  });
});

describe('no hardcoded app copy in either language', () => {
  // Text nodes: `>Some words<` with a capital first letter and at least two
  // words, outside {t(...)} — allowing the product name and language autonyms.
  const ALLOW = /^(BNP|DecisionGuard|English|العربية|PDF)$/;
  it.each(components.filter((f) => !f.includes('/ui/')))('%s', (file) => {
    const s = code(src(file));
    for (const m of s.matchAll(/>\s*([A-Z][a-z]+(?:\s+[A-Za-z()]+){1,})\s*</g)) {
      expect(ALLOW.test(m[1]), `${file}: "${m[1]}"`).toBe(true);
    }
  });
});

describe('no unsupported claims in the chrome', () => {
  it('the assistant footer no longer promises "No Hallucination"', () => {
    const s = code(src('components/ChatPage.tsx'));
    expect(s).not.toMatch(/No Hallucination|RAG-Only/);
    expect(s).toMatch(/t\('chatFooterNote'\)/);
  });
});

describe('small screens', () => {
  it('the settings rail becomes a strip below md', () => {
    const s = code(src('components/SettingsPage.tsx'));
    expect(s).toMatch(/w-full md:w-64/);
    expect(s).toMatch(/flex md:flex-col[^"]*overflow-x-auto/);
    expect(s).not.toMatch(/"w-64 /);
  });

  it('the sidebar follows the viewport across the breakpoint', () => {
    const s = code(src('App.tsx'));
    expect(s).toMatch(/matchMedia\('\(min-width: 768px\)'\)/);
    expect(s).toMatch(/mq\.addEventListener\('change', onChange\)/);
  });

  it('a skip link moves focus to main without touching the hash', () => {
    const s = code(src('App.tsx'));
    expect(s).toMatch(/e\.preventDefault\(\);\s*document\.getElementById\('main'\)\?\.focus\(\)/);
    expect(s).toMatch(/<main\s+id="main"\s+tabIndex=\{-1\}/);
  });

  it('a new screen starts at the top, and the chat scrolls its own list only', () => {
    expect(code(src('App.tsx'))).toMatch(/document\.getElementById\('main'\)\?\.scrollTo\(\{ top: 0 \}\);\s*\}, \[activeTab\]\)/);
    const chat = code(src('components/ChatPage.tsx'));
    expect(chat).not.toMatch(/scrollIntoView/);
    expect(chat).toMatch(/list\.scrollTo\(\{ top: list\.scrollHeight/);
  });

  it('list rows and page gutters adapt', () => {
    expect(code(src('components/DocumentsPage.tsx'))).toMatch(/flex items-center gap-4 flex-wrap p-4/);
    for (const f of ['components/DocumentsPage.tsx', 'components/CitationsPage.tsx', 'components/AuditLogPage.tsx']) {
      expect(code(src(f))).toMatch(/min-h-screen p-4 md:p-6/);
    }
  });
});

describe('RTL in the primitives the app renders', () => {
  it('dialog close and select item use logical offsets', () => {
    expect(src('components/ui/dialog.tsx')).toMatch(/absolute end-4 top-4/);
    expect(src('components/ui/select.tsx')).toMatch(/ps-2 pe-8/);
    expect(src('components/ui/select.tsx')).toMatch(/absolute end-2 flex/);
  });

  it('the RTL test now covers them', () => {
    expect(src('__tests__/rtl.test.ts')).toMatch(/RENDERED_PRIMITIVES = \['dialog\.tsx', 'select\.tsx'\]/);
  });
});

describe('i18n parity', () => {
  const i18n = src('i18n.ts');
  it.each(['skipToContent', 'a11yAddCondition', 'a11yAddDrug', 'a11yCancelUpload', 'a11yRemoveItem', 'a11ySend', 'chatFooterNote', 'pcWeight', 'pcAge', 'pcConditions', 'pcDrugs', 'phWeight', 'phAge', 'phConditions', 'phDrugs', 'phAsk', 'phListening'])('%s exists in both EN and AR', (key) => {
    const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
    expect(matches.length).toBe(2);
  });
});
