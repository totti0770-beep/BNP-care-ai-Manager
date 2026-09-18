/**
 * Engine Health shows what the engine reports and nothing it does not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePrometheus } from '../lib/prometheus';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const page = code(src('components/RAGSettingsPage.tsx'));
const api = code(src('services/clinicalApi.ts'));
const backend = code(src('contexts/BackendContext.tsx'));
const i18n = src('i18n.ts');

// A slice of what services/metrics.py renders, including the histogram family
// the parser must skip.
const SAMPLE = `# HELP bnp_uptime_seconds Seconds since the engine started.
# TYPE bnp_uptime_seconds gauge
bnp_uptime_seconds 4211
# HELP bnp_indexed_chunks Number of retrievable chunks.
# TYPE bnp_indexed_chunks gauge
bnp_indexed_chunks 3765
# HELP bnp_queries_refused_total Queries refused by any safety gate.
# TYPE bnp_queries_refused_total counter
bnp_queries_refused_total 12
# HELP bnp_query_duration_seconds Clinical query latency.
# TYPE bnp_query_duration_seconds histogram
bnp_query_duration_seconds_bucket{le="0.5"} 3
bnp_query_duration_seconds_bucket{le="+Inf"} 9
bnp_query_duration_seconds_sum 4.210
bnp_query_duration_seconds_count 9
`;

describe('the Prometheus reader', () => {
  const samples = parsePrometheus(SAMPLE);

  it('returns counters and gauges with the engine\'s own HELP text', () => {
    expect(samples.map((s) => s.name)).toEqual(['bnp_uptime_seconds', 'bnp_indexed_chunks', 'bnp_queries_refused_total']);
    expect(samples[2]).toEqual({
      name: 'bnp_queries_refused_total', kind: 'counter', value: 12,
      help: 'Queries refused by any safety gate.',
    });
    expect(samples[0].kind).toBe('gauge');
  });

  it('skips histogram families entirely, buckets, sum and count alike', () => {
    expect(samples.some((s) => s.name.startsWith('bnp_query_duration_seconds'))).toBe(false);
  });

  it('ignores labelled samples and unparseable lines', () => {
    expect(parsePrometheus('# TYPE x counter\nx{a="b"} 1\ngarbage line\n')).toEqual([]);
  });

  it('computes nothing: values are returned as written', () => {
    expect(parsePrometheus('# TYPE n gauge\nn 1e3\n')[0].value).toBe(1000);
  });
});

describe('the metrics fetch', () => {
  it('reads /metrics as text, never JSON', () => {
    const fn = api.slice(api.indexOf('export async function fetchMetricsText'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/authFetch\(`\/metrics`\)/);
    expect(body).toMatch(/res\.text\(\)/);
    expect(body).not.toMatch(/res\.json\(\)/);
  });
});

describe('the page', () => {
  it('shows the engine\'s problems verbatim as an alert', () => {
    expect(page).toMatch(/engineProblems\.length > 0 && \(\s*<div role="alert"/);
    expect(page).toMatch(/engineProblems\.map\(\(p, i\) => <li key=\{i\}>\{p\}<\/li>\)/);
  });

  it('reads health fields from the context, not from literals', () => {
    for (const f of ['engineHealth.database', 'engineHealth?.drug_db_version', 'engineHealth?.version', 'formularyCounts', 'formularyReviewStatus']) {
      expect(page).toContain(f);
    }
    expect(backend).toMatch(/engineHealth: EngineHealth \| null;/);
    expect(backend).toMatch(/setEngineHealth\(health\)/);
  });

  it('carries no invented figures', () => {
    expect(page).not.toMatch(/\d+(\.\d+)?%/);
    expect(page).not.toMatch(/uptime|availability|99\./i);
    expect(page).not.toMatch(/value=['"][A-Z][a-z]+['"]/);   // no literal 'Connected' etc.
  });

  it('captions counters as per-process tallies and uses the HELP text', () => {
    expect(page).toMatch(/ehMetricsCaption/);
    expect(page).toMatch(/\{s\.help\}/);
    expect(page).not.toMatch(/toFixed|\/ *s\.value|\* *100/);
  });

  it('does not list the chunk count twice', () => {
    expect(page).toMatch(/SHOWN_ELSEWHERE = new Set\(\['bnp_indexed_chunks'\]\)/);
  });

  it('refresh re-reads health and metrics together', () => {
    expect(page).toMatch(/Promise\.all\(\[recheckHealth\(\), loadMetrics\(\)\]\)/);
  });

  it('has one h1 with the navigation name and no hardcoded English labels', () => {
    expect(page.match(/<h1/g)?.length).toBe(1);
    expect(page).toMatch(/<h1[^>]*>\{t\('navEngineHealth'\)\}<\/h1>/);
    expect(page).not.toMatch(/label="[A-Za-z ]+"/);
    expect(page).not.toMatch(/Retrieval thresholds and dose limits/);
  });
});

describe('i18n parity', () => {
  const keys = [
    'ehStatusOk', 'ehStatusDegraded', 'ehProblems', 'ehHealthSection', 'ehEngine', 'ehDatabase', 'ehConnected',
    'ehNotConnected', 'ehUnknown', 'ehIndexedChunks', 'ehSourceDocuments', 'ehGeneration', 'ehEnabled',
    'ehDisabled', 'ehFormulary', 'ehFormularyCounts', 'ehFormularyReview', 'ehFormularyVersion',
    'ehEngineVersion', 'ehMetricsSection', 'ehMetricsCaption', 'ehMetricsUnavailable', 'ehMetricsEmpty',
    'ehMetricName', 'ehMetricValue', 'ehEnforcedByEngine',
  ];
  it.each(keys)('%s exists in both EN and AR', (key) => {
    const matches = i18n.match(new RegExp(`^\\s+${key}: '`, 'gm')) ?? [];
    expect(matches.length).toBe(2);
  });
});
