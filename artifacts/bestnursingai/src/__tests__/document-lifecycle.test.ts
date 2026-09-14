import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The screen must not tell an operator that a document is indexed when it is not.
 *
 * Upload and publish used to be the same act, so every row in this list could
 * honestly carry an "indexed in the database" badge. They are now separate: a
 * staged document is stored, unindexed, and unable to reach a nurse until an
 * admin approves it. A badge that still said "indexed" would be the same shape
 * of untruth the upload screen was cured of in #6 — a control reporting work
 * that has not happened.
 *
 * These assertions read source text rather than render, matching the suite the
 * previous passes built. They check wiring, not pixels, and are honest about
 * being that.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Comments stripped: they quote the very strings being asserted about. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the lifecycle reaches the client', () => {
  it('the wire type carries the governance fields', () => {
    const api = code('services/clinicalApi.ts');
    expect(api).toMatch(/status\?: "pending" \| "approved" \| "retired" \| "superseded"/);
    expect(api).toMatch(/expiry_date\?:/);
    expect(api).toMatch(/approved_by\?:/);
  });

  it('there is an approve call, and it sends an approver', () => {
    const api = code('services/clinicalApi.ts');
    expect(api).toMatch(/export async function approveDocument/);
    expect(api).toContain('/approve');
    expect(api).toMatch(/approved_by: approvedBy/);
  });

  it('BackendContext exposes approval and re-reads the list afterwards', () => {
    const ctx = code('contexts/BackendContext.tsx');
    expect(ctx).toMatch(/approveInEngine/);
    expect(ctx).toMatch(/apiApproveDoc\(documentId, approvedBy, sourceNote\)/);
    expect(ctx).toMatch(/if \(ok\) await refreshDocuments\(\)/);
  });
});

describe('the status badge tells the truth', () => {
  it('the indexed badge is conditional, not unconditional', () => {
    // The defect this guards: `{t('indexedInDatabase')}` rendered for every
    // row regardless of state. It must now sit inside a branch on doc.status.
    const page = code('components/DocumentsPage.tsx');
    expect(page).toMatch(/doc\.status === 'pending'/);
    expect(page).toMatch(/docPendingApproval/);

    const badgeAt = page.indexOf("t('indexedInDatabase')");
    const branchAt = page.indexOf("doc.status === 'pending'");
    expect(badgeAt).toBeGreaterThan(-1);
    expect(branchAt).toBeGreaterThan(-1);
    expect(branchAt).toBeLessThan(badgeAt);
  });

  it('a superseded or retired document is labelled as such', () => {
    const page = code('components/DocumentsPage.tsx');
    expect(page).toMatch(/docSuperseded/);
    expect(page).toMatch(/docRetired/);
  });

  it('an approver and an expiry date are shown when present', () => {
    const page = code('components/DocumentsPage.tsx');
    expect(page).toMatch(/doc\.approved_by &&/);
    expect(page).toMatch(/doc\.expiry_date &&/);
  });
});

describe('approving is an explicit, attributed act', () => {
  it('the approve control appears only for a pending document', () => {
    const page = code('components/DocumentsPage.tsx');
    expect(page).toMatch(/canUpload && doc\.status === 'pending'/);
  });

  it('it refuses to proceed with no name to record', () => {
    // The engine and a CHECK constraint both reject a nameless approval; the
    // UI should say so rather than send a request that will fail.
    const page = code('components/DocumentsPage.tsx');
    expect(page).toMatch(/approveNeedsIdentity/);
    expect(page).toMatch(/user\?\.name \|\| user\?\.email/);
  });

  it('upload no longer claims the document was indexed', () => {
    const page = code('components/DocumentsPage.tsx');
    expect(page).toMatch(/stagedPendingApproval/);
    expect(page).not.toMatch(/toast\.success\(t\('indexedSegmentsToast'/);
  });
});

describe('copy exists in both languages', () => {
  const KEYS = [
    'stagedPendingApproval',
    'docPendingApproval',
    'docSuperseded',
    'docRetired',
    'docExpires',
    'docApprovedBy',
    'approve',
    'approving',
    'approveDocumentTitle',
    'documentApproved',
    'approveFailed',
    'approveNeedsIdentity',
  ];

  it('every new key is present twice', () => {
    // i18n.test.ts enforces EN/AR parity across the file; this checks the keys
    // are there to be paired at all.
    const i18n = read('i18n.ts');
    for (const key of KEYS) {
      const occurrences = i18n.split(`${key}:`).length - 1;
      expect(occurrences, `${key} should appear in both blocks`).toBe(2);
    }
  });
});
