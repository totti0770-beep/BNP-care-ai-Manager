/**
 * Clinical Evidence Explorer: a citation can be opened to the exact stored
 * passage, and the rules about who may read what stay on the engine.
 *
 * Source-scanning tests in the repository's convention. Each pins a property
 * that a later edit could quietly drop: the chunk id travelling through the
 * mapping, the passage coming from the engine's endpoint rather than being
 * reconstructed in the browser, the refusal being shown in the engine's words,
 * and the two citation renderings sharing one component.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const api = src('services/clinicalApi.ts');
const backend = src('contexts/BackendContext.tsx');
const types = src('types/bnp.ts');
const chat = src('components/ChatPage.tsx');
const audit = src('components/AuditLogPage.tsx');
const auditCtx = src('contexts/AuditLogContext.tsx');
const list = src('components/CitationList.tsx');
const dialog = src('components/EvidencePassage.tsx');
const explorer = src('components/CitationsPage.tsx');
const i18n = src('i18n.ts');

describe('citation ids reach the screen', () => {
  it('the query contract carries chunk_id and document_id', () => {
    expect(api).toMatch(/chunk_id\?: string \| null;\s*document_id\?: string \| null;/);
  });

  it('the mapping passes them through as chunkId / documentId', () => {
    expect(code(backend)).toMatch(/chunkId: c\.chunk_id \?\? undefined/);
    expect(code(backend)).toMatch(/documentId: c\.document_id \?\? undefined/);
    expect(types).toMatch(/chunkId\?: string;/);
  });

  it('audit rows keep their chunk_id too', () => {
    expect(auditCtx).toMatch(/chunk_id\?: string \| null;/);
  });
});

describe('the passage comes from the engine', () => {
  it('reads GET /documents/chunks/{id} and nothing else', () => {
    expect(code(api)).toMatch(/authFetch\(`\/documents\/chunks\/\$\{encodeURIComponent\(chunkId\)\}`\)/);
  });

  it('distinguishes forbidden, not-found and error rather than collapsing them', () => {
    const c = code(api);
    expect(c).toMatch(/res\.status === 403/);
    expect(c).toMatch(/res\.status === 404/);
    expect(c).toMatch(/kind: "forbidden"; detail: string \| null/);
  });

  it('shows the engine\'s own refusal text on a 403', () => {
    expect(code(dialog)).toMatch(/state\.outcome\.detail/);
    expect(code(dialog)).toMatch(/role="alert"/);
  });

  it('never computes validity in the browser — it renders currently_valid and retired', () => {
    const c = code(dialog);
    expect(c).toMatch(/chunk\.currently_valid/);
    expect(c).toMatch(/chunk\.retired/);
    expect(c).not.toMatch(/expiry_date\s*[<>]/);
    expect(c).not.toMatch(/new Date\(\)\s*[<>]/);
  });

  it('the passage text is rendered as a quotation with direction detected', () => {
    expect(dialog).toMatch(/<blockquote[\s\S]*dir="auto"[\s\S]*\{chunk\.content\}/);
  });
});

describe('one citation renderer for the assistant and the audit trail', () => {
  it('ChatPage renders sources through CitationList', () => {
    expect(chat).toMatch(/import CitationList from '@\/components\/CitationList'/);
    expect(code(chat)).toMatch(/<CitationList citations=\{bnp\.sources\} \/>/);
    expect(code(chat)).not.toMatch(/Relevance:/);
  });

  it('AuditLogPage renders citations through CitationList with chunk ids', () => {
    expect(audit).toMatch(/import CitationList from '@\/components\/CitationList'/);
    expect(code(audit)).toMatch(/chunkId: c\.chunk_id \?\? undefined/);
  });

  it('the open button exists only when a chunk id is present', () => {
    expect(code(list)).toMatch(/c\.chunkId \?\s*\(/);
    expect(code(list)).toMatch(/aria-label=/);
  });

  it('CitationList owns the dialog so no page needs new hooks to open a passage', () => {
    expect(list).toMatch(/<EvidencePassageDialog chunkId=\{openChunk\}/);
  });
});

describe('the explorer tells the truth about each document', () => {
  it('badges follow the engine-reported status and a missing status carries no badge', () => {
    const c = code(explorer);
    expect(c).toMatch(/source\.status === 'approved'/);
    expect(c).toMatch(/source\.status === 'pending'/);
    expect(c).toMatch(/source\.status === 'retired' \|\| source\.status === 'superseded'/);
    expect(c).toMatch(/: null\}/);
  });

  it('offers a status filter with counts drawn from the list itself', () => {
    expect(code(explorer)).toMatch(/aria-pressed=\{statusFilter === f\}/);
    expect(code(explorer)).toMatch(/countFor\(f\)/);
  });

  it('asks for the audit trail only when the user may read it', () => {
    const c = code(explorer);
    expect(c).toMatch(/canReadAudit = hasPermission\('settings\.manage'\)/);
    expect(c).toMatch(/if \(!canReadAudit\) return;/);
  });
});

describe('i18n parity', () => {
  const keys = [
    'evViewPassage', 'evPassageTitle', 'evPassageDescription', 'evPage', 'evRelevance',
    'evVersion', 'evApprovedBy', 'evEffective', 'evExpires', 'evCurrentlyValid',
    'evNotCurrent', 'evRetired', 'evForbidden', 'evNotFound', 'evError', 'evStatus',
    'evFilter_all', 'evFilter_approved', 'evFilter_pending', 'evFilter_retired',
    'evFilter_superseded', 'evNoDocsMatching', 'evExplorerHint',
    'docStatus_approved', 'docStatus_pending', 'docStatus_retired', 'docStatus_superseded',
  ];

  it.each(keys)('%s exists in both EN and AR', (key) => {
    const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
    expect(matches.length).toBe(2);
  });
});
