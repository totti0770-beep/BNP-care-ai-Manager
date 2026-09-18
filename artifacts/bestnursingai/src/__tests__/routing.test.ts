/**
 * Routing: the screen is the URL fragment, every screen is routable, gated
 * screens are gated from one table, and nothing about a patient is ever in a
 * URL.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHash, parseHash, ROUTE_PERMISSION, TAB_IDS, CHUNK_ID } from '../lib/router';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const app = code(src('App.tsx'));
const sidebar = code(src('components/Sidebar.tsx'));
const router = code(src('lib/router.ts'));
const login = code(src('components/LoginScreen.tsx'));
const citations = code(src('components/CitationsPage.tsx'));
const i18n = src('i18n.ts');

describe('parseHash / buildHash', () => {
  it('round-trips every tab id', () => {
    for (const id of TAB_IDS) expect(parseHash(buildHash(id)).tab).toBe(id);
  });

  it('treats empty, unknown and malformed hashes as Home', () => {
    for (const h of ['', '#', '#/', '#/nope', '#garbage', '#/../etc']) expect(parseHash(h).tab).toBe('home');
  });

  it('aliases the old new-chat id to Home', () => {
    expect(parseHash('#/new-chat').tab).toBe('home');
    expect(buildHash('new-chat')).toBe('#/home');
  });

  it('carries query parameters without touching them', () => {
    const r = parseHash('#/citations?chunk=c-1&x=y');
    expect(r.tab).toBe('citations');
    expect(r.params.get('chunk')).toBe('c-1');
    expect(buildHash('citations', { chunk: 'c 1' })).toBe('#/citations?chunk=c+1');
  });

  it('accepts only bounded opaque chunk ids', () => {
    expect(CHUNK_ID.test('abc-123_X')).toBe(true);
    expect(CHUNK_ID.test('')).toBe(false);
    expect(CHUNK_ID.test('a b')).toBe(false);
    expect(CHUNK_ID.test('x'.repeat(129))).toBe(false);
  });
});

describe('every screen is routable and every route is a screen', () => {
  it('TAB_IDS equals the set of case labels in App.tsx', () => {
    const cases = [...app.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]).sort();
    expect(cases).toEqual([...TAB_IDS].sort());
  });

  it('App derives the screen from the hash and navigates by pushing', () => {
    expect(app).toMatch(/const \{ route, navigate, replace \} = useHashRoute\(\)/);
    expect(app).toMatch(/const activeTab = route\.tab/);
    expect(app).not.toMatch(/useState\('home'\)/);
    expect(router).toMatch(/window\.location\.hash = buildHash\(tab, params\)/);
  });

  it('the sidebar sends home, not the retired new-chat id', () => {
    expect(sidebar).not.toMatch(/'new-chat'/);
  });
});

describe('gating mirrors the engine from one table', () => {
  it('admin screens and upload are the gated ones', () => {
    expect(ROUTE_PERMISSION).toEqual({
      formulary: 'settings.manage',
      'audit-log': 'settings.manage',
      'knowledge-governance': 'settings.manage',
      'rag-settings': 'settings.manage',
      upload: 'documents.manage',
    });
  });

  it('App renders NotPermitted from that table before any page', () => {
    const fn = app.slice(app.indexOf('const renderContent'), app.indexOf('switch (activeTab)'));
    expect(fn).toMatch(/ROUTE_PERMISSION\[activeTab\]/);
    expect(fn).toMatch(/if \(need && !hasPermission\(need\)\)/);
    expect(fn).toMatch(/<NotPermitted/);
  });

  it('the sidebar checks no permission string the table does not know', () => {
    const inSidebar = [...sidebar.matchAll(/hasPermission\('([^']+)'\)/g)].map((m) => m[1]);
    const known = new Set(Object.values(ROUTE_PERMISSION));
    for (const p of inSidebar) expect(known.has(p)).toBe(true);
    expect(sidebar).toMatch(/ROUTE_PERMISSION\[id\]/);
  });

  it('an unauthenticated visitor never sees a page whatever the hash', () => {
    expect(app.indexOf('if (!isAuthenticated)')).toBeLessThan(app.indexOf('const renderContent'));
    expect(app).toMatch(/if \(!isAuthenticated\) \{\s*return <LoginScreen \/>;/);
  });
});

describe('sign-in keeps the requested screen', () => {
  it('the OIDC button stashes the hash before leaving the origin', () => {
    expect(login).toMatch(/stashReturnHash\(\);\s*login\(\);/);
  });

  it('App applies the stash once, by replace, only when the hash is empty', () => {
    expect(app).toMatch(/const stashed = consumeReturnHash\(\);\s*if \(stashed && !window\.location\.hash\)/);
    expect(app).toMatch(/history\.replaceState\(null, '', stashed\)/);
  });

  it('only a fragment is ever stored, and only a hash-shaped one is consumed', () => {
    expect(router).toMatch(/sessionStorage\.setItem\(RETURN_HASH_KEY, h\)/);
    expect(router).toMatch(/h\.startsWith\('#\/'\) \? h : null/);
  });
});

describe('deep links carry no patient data', () => {
  it('the only parameter read from a URL is the chunk id, validated', () => {
    expect(app).toMatch(/route\.params\.get\('chunk'\)/);
    expect(app).toMatch(/CHUNK_ID\.test\(rawChunk\)/);
    expect(app.match(/route\.params\.get\(/g)?.length).toBe(1);
  });

  it('no navigation call carries parameters, and the router names no patient field', () => {
    // navigate('chat') is fine; navigate('chat', { weight: … }) would put a
    // patient value in the address bar and the browser history.
    for (const s of [app, sidebar, citations]) {
      for (const m of s.matchAll(/\b(navigate|replace)\(([^)]*)\)/g)) {
        expect(m[2], m[0]).not.toContain(',');
      }
    }
    expect(router).not.toMatch(/weight|\bage\b|conditions|drugs|patient/i);
  });

  it('closing the evidence viewer replaces rather than pushes, so Back does not reopen it', () => {
    expect(app).toMatch(/onCloseEvidence=\{\(\) => replace\('citations'\)\}/);
    expect(citations).toMatch(/<EvidencePassageDialog chunkId=\{evidenceChunkId\}/);
  });
});

describe('i18n parity', () => {
  it.each(['notPermittedTitle', 'notPermittedBody', 'backToHome'])('%s exists in both EN and AR', (key) => {
    const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
    expect(matches.length).toBe(2);
  });
});
