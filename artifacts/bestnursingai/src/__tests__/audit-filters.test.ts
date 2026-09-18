/**
 * Audit: filters narrow the loaded window and say so; CSV is a full
 * projection of the same complete fetch as JSON and is safe to open in a
 * spreadsheet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUDIT_CSV_COLUMNS, CSV_BOM, csvCell, toCsv } from '../lib/auditCsv';
import type { AuditLogEntry } from '../contexts/AuditLogContext';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const page = code(src('components/AuditLogPage.tsx'));
const ctx = code(src('contexts/AuditLogContext.tsx'));
const i18n = src('i18n.ts');

const row = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: '7',
  timestamp: new Date('2026-09-14T22:01:44.000Z'),
  sessionId: 's-1',
  username: 'nurse@hospital.example',
  query: 'vancomycin dose',
  queryType: 'drug',
  answer: 'Line one\nLine two, with a comma',
  answerHash: 'abc',
  dose: null,
  confidence: 0.82,
  confidenceLabel: 'High',
  rejected: false,
  rejectionReason: null,
  safetyAlerts: ['Overdose threshold', 'Renal'],
  citations: [
    { document_name: 'JSH.pdf', page_number: 4, relevance_score: 0.9, chunk_id: 'c-1' },
    { document_name: 'Old.pdf', page_number: 2, relevance_score: 0.5 },
  ],
  clientIp: '10.0.0.1',
  model: 'gpt',
  drugDbVersion: '627d-v642',
  ...over,
});

describe('CSV cells', () => {
  it('quotes commas, quotes and newlines per RFC 4180', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('one\ntwo')).toBe('"one\ntwo"');
  });

  it('neutralises formula leaders', () => {
    for (const lead of ['=', '+', '-', '@']) {
      expect(csvCell(`${lead}SUM(A1)`)).toBe(`'${lead}SUM(A1)`);
    }
  });

  it('writes null as empty and dates as ISO', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('the CSV document', () => {
  const csv = toCsv([row()]);

  it('starts with a byte-order mark and the fixed header', () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1).split('\r\n')[0]).toBe(AUDIT_CSV_COLUMNS.join(','));
  });

  it('carries every field the JSON export carries', () => {
    const keys: Array<keyof AuditLogEntry> = [
      'id', 'timestamp', 'sessionId', 'username', 'query', 'queryType', 'answer', 'answerHash',
      'dose', 'confidence', 'confidenceLabel', 'rejected', 'rejectionReason', 'safetyAlerts',
      'citations', 'clientIp', 'model', 'drugDbVersion',
    ];
    expect(AUDIT_CSV_COLUMNS.length).toBe(keys.length);
  });

  it('joins lists with a bar and writes citations as document:page[:chunk]', () => {
    const line = csv.slice(1).split('\r\n')[1];
    expect(line).toContain('Overdose threshold | Renal');
    expect(line).toContain('JSH.pdf:4:c-1 | Old.pdf:2');
    expect(line).toContain('2026-09-14T22:01:44.000Z');
    expect(line).toContain('"Line one\nLine two, with a comma"');
  });

  it('a nurse-typed formula does not survive as a formula', () => {
    const line = toCsv([row({ query: '=HYPERLINK("x")' })]).slice(1).split('\r\n')[1];
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('export refuses a partial trail in either format', () => {
  it('rows come from one complete fetch and both formats derive from it', () => {
    expect(ctx).toMatch(/const exportRows = useCallback/);
    expect(ctx).toMatch(/if \(!complete\) return null;/);
    expect(ctx).toMatch(/const rows = await exportRows\(\);\s*return rows === null \? null : JSON\.stringify/);
    expect(page).toMatch(/const rows = await exportRows\(\);/);
    expect(page).toMatch(/if \(rows === null\) \{\s*toast\.error\(t\('auditExportFailed'\)\)/);
    expect(page).toMatch(/format === 'csv' \? toCsv\(rows\) : JSON\.stringify\(rows, null, 2\)/);
  });
});

describe('filters narrow the loaded window and say so', () => {
  it('date, user and type filters apply to `logs`, never to a new fetch', () => {
    expect(page).toMatch(/log\.timestamp >= dayStart\(fromDate\)/);
    expect(page).toMatch(/log\.timestamp <= dayEnd\(toDate\)/);
    expect(page).toMatch(/log\.username === userFilter/);
    expect(page).toMatch(/log\.queryType === typeFilter/);
    expect(page).not.toMatch(/listAuditLog\(/);
  });

  it('the user list is derived from the loaded rows', () => {
    expect(page).toMatch(/new Set\(logs\.map\(\(l\) => l\.username\)\)/);
  });

  it('the caption states shown-of-loaded and keeps the windowed notice', () => {
    expect(page).toMatch(/auditFilteredNote', \{ shown: filteredLogs\.length, loaded: logs\.length \}/);
    expect(page).toMatch(/auditWindowed/);
  });

  it('the search input is labelled and its icon is decorative', () => {
    expect(page).toMatch(/aria-label=\{t\('search'\)\}/);
    expect(page).toMatch(/<Search [^>]*aria-hidden="true"/);
  });
});

describe('i18n parity', () => {
  const keys = [
    'auditFilters', 'auditFrom', 'auditTo', 'auditUser', 'auditAllUsers', 'auditQueryType',
    'auditType_all', 'auditType_drug', 'auditType_protocol', 'auditType_general',
    'auditFilteredNote', 'auditClearFilters', 'exportJson', 'exportCsv',
  ];
  it.each(keys)('%s exists in both EN and AR', (key) => {
    const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
    expect(matches.length).toBe(2);
  });
});
