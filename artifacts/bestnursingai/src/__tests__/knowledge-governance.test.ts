/**
 * Document lifecycle and formulary governance: every action is an engine
 * endpoint that already existed, nothing is computed in the browser, and the
 * screen says what the engine cannot show rather than showing an empty box.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const api = code(src('services/clinicalApi.ts'));
const backend = code(src('contexts/BackendContext.tsx'));
const page = code(src('components/KnowledgeGovernancePage.tsx'));
const formulary = code(src('components/FormularyPage.tsx'));
const upload = code(src('components/SecureUploadPage.tsx'));
const documents = code(src('components/DocumentsPage.tsx'));
const i18n = src('i18n.ts');

describe('supersede uses the engine route as it is declared', () => {
  it('POSTs with replacement_id as a query parameter', () => {
    expect(api).toMatch(/\/documents\/\$\{encodeURIComponent\(documentId\)\}\/supersede\?replacement_id=\$\{encodeURIComponent\(replacementId\)\}/);
    const fn = api.slice(api.indexOf('export async function supersedeDocument'));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toMatch(/method: "POST"/);
  });

  it('the context re-reads documents and health after supersede and retire', () => {
    const sup = backend.slice(backend.indexOf('const supersedeInEngine'), backend.indexOf('return ('));
    expect(sup).toMatch(/Promise\.all\(\[refreshDocuments\(\), recheckHealth\(\)\]\)/);
    const rem = backend.slice(backend.indexOf('const removeFromEngine'), backend.indexOf('const supersedeInEngine'));
    expect(rem).toMatch(/recheckHealth\(\)/);
  });

  it('health is applied in one place', () => {
    expect(backend.match(/setIsEngineAvailable\(health\.status === "ok"\)/g)?.length).toBe(1);
    expect(backend).toMatch(/const applyHealth = useCallback/);
  });
});

describe('the governance screen', () => {
  it('is guarded on the same permission the sidebar uses', () => {
    expect(page).toMatch(/hasPermission\('settings\.manage'\)/);
    expect(page).toMatch(/if \(!canGovern\)/);
  });

  it('offers only approved documents as replacements and never the document itself', () => {
    expect(page).toMatch(/approved\.filter\(\(d\) => d\.id !== supersedeOf\)/);
  });

  it('has no Retired section and says why', () => {
    expect(page).not.toMatch(/status === 'retired'/);
    expect(page).toMatch(/kgRetiredNote/);
  });

  it('retire reuses the truthful confirm copy', () => {
    expect(page).toMatch(/confirmDeleteTitle/);
    expect(page).toMatch(/confirmDeleteBody/);
    expect(page).toMatch(/deletePermanently/);
  });

  it('the lifecycle record renders row fields only, computing nothing', () => {
    const rec = page.slice(page.indexOf('const Record'), page.indexOf('const Card'));
    for (const f of ['upload_date', 'uploaded_by', 'version', 'approved_by', 'effective_date', 'expiry_date', 'superseded_by', 'source_note']) {
      expect(rec).toContain(`doc.${f}`);
    }
    expect(rec).not.toMatch(/new Date\(\)/);
    expect(rec).not.toMatch(/Date\.now/);
  });

  it('approval refuses to proceed with no name to record', () => {
    expect(page).toMatch(/approveNeedsIdentity/);
    expect(page).toMatch(/user\?\.name \|\| user\?\.email/);
  });

  it('passes an explicit direction to the Radix select', () => {
    expect(page).toMatch(/dir=\{isRTL \? 'rtl' : 'ltr'\}/);
  });

  it('is reachable from the Documents screen for an admin', () => {
    expect(documents).toMatch(/onNavigate\('knowledge-governance'\)/);
  });
});

describe('the upload screen no longer claims indexing', () => {
  it('reports staging, like the Documents screen', () => {
    expect(upload).toMatch(/stagedPendingApproval/);
    expect(upload).not.toMatch(/indexedSegmentsToast/);
  });
});

describe('formulary review: search, filter and retire', () => {
  it('search filters the loaded rows client-side and says so', () => {
    expect(formulary).toMatch(/const visible = drugs\.filter/);
    expect(formulary).toMatch(/formularyFilteredNote/);
    expect(formulary).not.toMatch(/listFormulary\([^)]*search/);
  });

  it('retire calls the engine with reason and retired_by and shows the engine detail on failure', () => {
    expect(api).toMatch(/\/formulary\/\$\{encodeURIComponent\(drugId\)\}\/retire/);
    expect(api).toMatch(/retired_by: string;/);
    expect(formulary).toMatch(/retireReason\.trim\(\)\.length < 4 \|\| retiredBy\.trim\(\)\.length < 2/);
    expect(formulary).toMatch(/outcome\.detail/);
  });
});

describe('i18n parity', () => {
  const keys = [
    'kgTitle', 'kgDescription', 'kgNotPermitted', 'kgPending', 'kgApproved', 'kgSuperseded', 'kgRetiredNote',
    'kgNoPending', 'kgNoApproved', 'kgNoSuperseded', 'kgApprove', 'kgSourceNote', 'kgSupersede',
    'kgChooseReplacement', 'kgChooseReplacementShort', 'kgNoReplacement', 'kgConfirmSupersede',
    'kgSupersedeSuccess', 'kgSupersedeFailed', 'kgRetire', 'kgLifecycle', 'kgLifecycleUploaded',
    'kgLifecycleVersion', 'kgLifecycleStatus', 'kgLifecycleApproved', 'kgLifecycleEffective',
    'kgLifecycleExpiry', 'kgLifecycleReplacedBy', 'kgLifecycleNote', 'kgUpload', 'kgManageLink',
    'formularySearch', 'formularyHighAlertOnly', 'formularyFilteredNote', 'formularyNoMatch',
    'formularyRetire', 'formularyRetireHint', 'formularyRetireReason', 'formularyRetiredBy',
    'formularyRetireSupersededBy', 'formularyRetireConfirm', 'formularyRetireSuccess', 'formularyRetireFailed',
  ];
  it.each(keys)('%s exists in both EN and AR', (key) => {
    const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
    expect(matches.length).toBe(2);
  });
});
