/**
 * The navigation is the product map the owner specified: CLINICAL, KNOWLEDGE,
 * GOVERNANCE, ACCOUNT, with the governance group visible only to a user the
 * engine will actually serve those screens to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sidebar = code(src('components/Sidebar.tsx'));
const app = code(src('App.tsx'));
const home = code(src('components/HomePage.tsx'));
const i18n = src('i18n.ts');

const slice = (from: string, to: string) => sidebar.slice(sidebar.indexOf(from), sidebar.indexOf(to));

describe('the four groups carry the mandated screens', () => {
  it('CLINICAL: Clinical Intelligence, Clinical Assistant, Medication Safety', () => {
    const s = slice('const clinicalItems', 'const knowledgeItems');
    expect(s).toMatch(/id: 'home', label: t\('navClinicalIntelligence'\)/);
    expect(s).toMatch(/id: 'chat'/);
    expect(s).toMatch(/id: 'medication-safety'/);
    expect(s).not.toMatch(/canManage/);
  });

  it('KNOWLEDGE: Clinical Evidence then Documents, nothing gated', () => {
    const s = slice('const knowledgeItems', 'const governanceItems');
    expect(s.indexOf("id: 'citations'")).toBeLessThan(s.indexOf("id: 'documents'"));
    expect(s).not.toMatch(/canManage/);
    expect(s).not.toMatch(/id: 'upload'/);
  });

  it('GOVERNANCE: Formulary Review, Audit, Knowledge Governance, Engine Health, admin only', () => {
    const s = slice('const governanceItems', 'const groups');
    expect(s).toMatch(/canManageSettings\s*\?/);
    for (const id of ['formulary', 'audit-log', 'knowledge-governance', 'rag-settings']) {
      expect(s).toContain(`id: '${id}'`);
    }
    expect(s).toMatch(/navFormularyReview/);
    expect(s).toMatch(/navAudit'/);
    expect(s).toMatch(/navKnowledgeGovernance/);
  });

  it('ACCOUNT: Settings', () => {
    expect(sidebar).toMatch(/renderItem\(\{ id: 'settings'/);
  });
});

describe('every destination is routable', () => {
  it('App renders knowledge-governance and keeps upload reachable', () => {
    expect(app).toMatch(/case 'knowledge-governance':\s*return <KnowledgeGovernancePage/);
    expect(app).toMatch(/case 'upload':/);
  });

  it('the Home console offers governance only to an admin', () => {
    const block = home.slice(home.indexOf('canReadAudit'), home.indexOf('return ('));
    expect(block).toMatch(/id: 'governance'/);
    expect(block).toMatch(/onNavigate\('knowledge-governance'\)/);
  });
});

describe('i18n parity', () => {
  it.each(['navClinicalIntelligence', 'navFormularyReview', 'navAudit', 'navKnowledgeGovernance', 'qaGovernance', 'qaGovernanceHint'])(
    '%s exists in both EN and AR',
    (key) => {
      const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
      expect(matches.length).toBe(2);
    },
  );
});
