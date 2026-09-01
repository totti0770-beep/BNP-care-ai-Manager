import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The admin password had to be changeable from inside the app.
 *
 * `POST /api/auth/password` has existed and been correct since the credentials
 * login shipped — it requires the current password, applies the weak-password
 * policy, and deletes every other session on success. Nothing called it. The
 * settings screen instead rendered a *disabled* input containing `********`
 * under a "Password" label: a control implying a managed credential that
 * offered no way to manage it. The only route to a change was a hand-written
 * curl, so in practice the bootstrap password — readable by anyone who can see
 * the deploy configuration — was permanent.
 *
 * These tests scan source, like the suites beside them, because the defect was
 * a missing connection rather than a wrong computation.
 */
const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/** Comments stripped: they quote the old shape to explain it. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the password can be changed from the app', () => {
  it('AuthContext posts to the endpoint that already existed', () => {
    const ctx = code('contexts/AuthContext.tsx');
    expect(ctx).toContain('changePassword');
    expect(ctx).toMatch(/fetch\('\/api\/auth\/password'/);
    // Same contract as loginWithPassword: a message to show, or null.
    expect(ctx).toMatch(/if \(res\.ok\) return null/);
  });

  it('the settings screen drives it through the context', () => {
    const page = code('components/SettingsPage.tsx');
    expect(page).toMatch(/changePassword\s*\}\s*=\s*useAuth\(\)|changePassword.*=.*useAuth/s);
    expect(page).toMatch(/await changePassword\(/);
  });

  it('no longer shows a disabled password field that does nothing', () => {
    const page = code('components/SettingsPage.tsx');
    expect(page).not.toContain('********');
  });

  it('compares the confirmation before making a request', () => {
    const page = code('components/SettingsPage.tsx');
    const handler = page.slice(page.indexOf('const handleChangePassword'));
    const body = handler.slice(0, handler.indexOf('const sections'));
    const mismatch = body.indexOf('newPassword !== confirmPassword');
    const request = body.indexOf('await changePassword(');
    expect(mismatch).toBeGreaterThan(-1);
    // A typo must not cost a round trip, and must not read as a wrong password.
    expect(mismatch).toBeLessThan(request);
  });

  it('hides the section where accounts have no password', () => {
    // An OIDC account has a null hash, so the server answers "the current
    // password is not correct" — true, and misleading to someone who never set
    // one.
    const page = code('components/SettingsPage.tsx');
    expect(page).toMatch(/!oidcAvailable.*id: 'security'/s);
  });
});
