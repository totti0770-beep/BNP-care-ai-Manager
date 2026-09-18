import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Hash routing without a router dependency.
 *
 * The app used to hold the current screen in component state, so a refresh
 * always landed on Home, the Back button did nothing, and no screen could be
 * linked to. A fragment (`#/audit-log`) never leaves the browser: the gateway
 * serves the SPA for every non-file path already and nothing server-side
 * changes. The fragment carries a screen id and, for the evidence viewer, a
 * chunk id — never a patient value.
 *
 * Permission gating here mirrors the engine's RBAC; it never replaces it. The
 * engine refuses the underlying routes for a nurse regardless of what the
 * screen shows, so this only spares a user a page of buttons that would 403.
 */
export const TAB_IDS = [
  'home',
  'chat',
  'medication-safety',
  'citations',
  'documents',
  'upload',
  'formulary',
  'audit-log',
  'knowledge-governance',
  'rag-settings',
  'settings',
] as const;

export type TabId = (typeof TAB_IDS)[number];

/** Screens whose engine routes require a permission; same strings the sidebar checks. */
export const ROUTE_PERMISSION: Partial<Record<TabId, string>> = {
  formulary: 'settings.manage',
  'audit-log': 'settings.manage',
  'knowledge-governance': 'settings.manage',
  'rag-settings': 'settings.manage',
  upload: 'documents.manage',
};

/** Older ids that still arrive from a button or a bookmark. */
const ALIASES: Record<string, TabId> = { 'new-chat': 'home' };

export interface Route {
  tab: TabId;
  params: URLSearchParams;
}

const isTabId = (v: string): v is TabId => (TAB_IDS as readonly string[]).includes(v);

/** `#/tab?k=v` → route. Anything unrecognised is Home. */
export function parseHash(hash: string): Route {
  const body = hash.replace(/^#\/?/, '');
  const q = body.indexOf('?');
  const rawTab = q === -1 ? body : body.slice(0, q);
  const params = new URLSearchParams(q === -1 ? '' : body.slice(q + 1));
  const tab = ALIASES[rawTab] ?? (isTabId(rawTab) ? rawTab : 'home');
  return { tab, params };
}

export function buildHash(tab: string, params?: Record<string, string>): string {
  const resolved = ALIASES[tab] ?? (isTabId(tab) ? tab : 'home');
  const qs = params ? new URLSearchParams(params).toString() : '';
  return `#/${resolved}${qs ? `?${qs}` : ''}`;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const getSnapshot = () => window.location.hash;
const getServerSnapshot = () => '';

export function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const route = useMemo(() => parseHash(hash), [hash]);

  /** Pushes a history entry, so Back returns to the previous screen. */
  const navigate = useCallback((tab: string, params?: Record<string, string>) => {
    window.location.hash = buildHash(tab, params);
  }, []);

  /** Replaces the current entry: closing a dialog must not be undone by Back. */
  const replace = useCallback((tab: string, params?: Record<string, string>) => {
    window.history.replaceState(null, '', buildHash(tab, params));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);

  return { route, navigate, replace };
}

// ── Surviving sign-in ────────────────────────────────────────────────────────
//
// Password sign-in reloads the page in place and keeps the fragment. The OIDC
// flow leaves the origin with `returnTo=/`, and a fragment never reaches the
// server, so the requested screen is stashed here before leaving and applied
// once after. Only a hash is stored — a screen id and at most a chunk id.

const RETURN_HASH_KEY = 'bnp.returnHash';

export function stashReturnHash(): void {
  try {
    const h = window.location.hash;
    if (h && h !== '#/' && h !== '#/home') sessionStorage.setItem(RETURN_HASH_KEY, h);
  } catch {
    /* storage unavailable: land on Home, which is the pre-router behaviour */
  }
}

/** Returns the stashed hash once, or null. */
export function consumeReturnHash(): string | null {
  try {
    const h = sessionStorage.getItem(RETURN_HASH_KEY);
    if (h) sessionStorage.removeItem(RETURN_HASH_KEY);
    return h && h.startsWith('#/') ? h : null;
  } catch {
    return null;
  }
}

/** A chunk id is opaque but bounded; anything else is not looked up. */
export const CHUNK_ID = /^[A-Za-z0-9_-]{1,128}$/;
