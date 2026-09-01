import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The corpus must be bootstrappable through the app's own interface.
 *
 * It was not. `/health` reports 503 `degraded` while `indexed_chunks == 0`
 * (main.py), `checkHealth()` collapsed any non-200 into `null`, and
 * `BackendContext` set `isEngineAvailable` only on `status === "ok"`. The
 * upload screen then ran its indexing branch only `if (isEngineAvailable)`,
 * so on a fresh deployment it made no request at all and fell through to a
 * browser-memory recorder — showing no error while the operator believed a
 * document had been accepted.
 *
 *   no documents → degraded → upload disabled → no documents
 *
 * Uploading is the one action that breaks that cycle, so it must depend on the
 * engine being *reachable*, never on it being clinically *ready*. These tests
 * scan source because the failure was structural: every unit involved behaved
 * exactly as written, and only their composition was wrong.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * Comments stripped, because these assertions are about what the code does.
 * The comments deliberately quote the defective expressions to explain the
 * defect, and a scan that cannot tell prose from code would fail on the very
 * documentation that keeps the fix understandable.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('engine reachability is distinct from clinical readiness', () => {
  it('checkHealth returns a degraded body instead of null', () => {
    const api = code('services/clinicalApi.ts');
    // 503 carries the `problems` array; discarding it is what erased the
    // difference between "not ready yet" and "not there at all".
    expect(api).toMatch(/res\.status !== 503/);
    expect(api).not.toMatch(/return health\.status === "ok" \? health : null/);
  });

  it('BackendContext exposes both flags', () => {
    const ctx = code('contexts/BackendContext.tsx');
    expect(ctx).toContain('isEngineReachable');
    expect(ctx).toContain('engineProblems');
    // Readiness still means what it says.
    expect(ctx).toMatch(/setIsEngineAvailable\(health\.status === "ok"\)/);
  });

  it('gates uploading on reachability, and querying on readiness', () => {
    const ctx = code('contexts/BackendContext.tsx');

    const upload = ctx.slice(ctx.indexOf('const uploadToEngine'));
    const uploadBody = upload.slice(0, upload.indexOf('const removeFromEngine'));
    expect(uploadBody).toMatch(/if \(!isEngineReachable\) return null/);
    expect(uploadBody).not.toMatch(/if \(!isEngineAvailable\)/);

    const query = ctx.slice(ctx.indexOf('const sendQuery'));
    const queryBody = query.slice(0, query.indexOf('const uploadToEngine'));
    expect(queryBody).toMatch(/if \(!isEngineAvailable\) return null/);
  });
});

describe('the upload screen cannot fail silently', () => {
  const page = code('components/SecureUploadPage.tsx');

  it('never guards the upload behind clinical readiness', () => {
    expect(page).not.toMatch(/if \(isEngineAvailable\)/);
  });

  it('always reports the outcome', () => {
    const handler = page.slice(page.indexOf('const handleUpload'));
    const body = handler.slice(0, handler.indexOf('const cancelPending'));
    // Exactly one success path and one failure path, both user-visible.
    expect(body).toMatch(/toast\.success/);
    expect(body).toMatch(/toast\.error/);
  });

  it('records nothing in browser memory as a substitute for indexing', () => {
    // The local recorder let a failed upload look like a successful one.
    expect(page).not.toContain('verifyDocument');
    expect(page).not.toContain('DocumentVerification');
  });
});

describe('the browser-only provenance surface is gone', () => {
  it('has no dangling references', () => {
    for (const f of ['App.tsx', 'components/Sidebar.tsx']) {
      const source = code(f);
      expect(source, `${f} still references the deleted surface`).not.toMatch(
        /DocumentVerification|OfficialSourcesPage|official-sources/,
      );
    }
  });
});

describe('providers are mounted once', () => {
  it('does not wrap App in a second AuthProvider', () => {
    // Two instances each ran useReplitAuth(), so every page load fetched
    // /api/auth/user twice and two independent session states existed. Only the
    // inner one was ever read.
    const main = code('main.tsx');
    expect(main).not.toMatch(/<AuthProvider>/);
    expect(code('App.tsx')).toMatch(/<AuthProvider>/);
  });
});

describe('the settings screen shows nothing that does not work', () => {
  const page = code('components/SettingsPage.tsx');

  it('drives the theme through ThemeContext, not a local copy', () => {
    // It held its own `useState('dark')`, so the picker highlighted a button
    // and changed nothing while the sidebar's toggle worked. Two sources of
    // truth for one setting, and the authoritative-looking one was inert.
    expect(page).toMatch(/useTheme\(\)/);
    expect(page).not.toMatch(/useState\(['"]dark['"]\)/);
  });

  it('has no notification settings', () => {
    // Four toggles configuring a system that does not exist: a grep for
    // nodemailer|sendgrid|smtp|firebase|expo-notifications|webpush across
    // artifacts/ and lib/ returns nothing.
    expect(page).not.toMatch(/notifications/i);
  });
});
