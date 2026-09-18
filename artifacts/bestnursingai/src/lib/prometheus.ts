/**
 * A reader for the engine's /metrics text, limited to what a screen may show.
 *
 * The engine renders Prometheus text format: `# HELP name text`, `# TYPE name
 * kind`, then sample lines. Only counter and gauge families are returned;
 * histograms and summaries are skipped whole, because their `_bucket{le=…}`
 * lines are not a number a reader can act on without a query language.
 *
 * Nothing is derived here: no rates, no percentages, no averages. The HELP
 * text is returned so a screen can caption each figure in the engine's own
 * words rather than in words authored elsewhere.
 */
export interface MetricSample {
  name: string;
  kind: 'counter' | 'gauge';
  help: string;
  value: number;
}

const HELP = /^# HELP (\S+) (.*)$/;
const TYPE = /^# TYPE (\S+) (\S+)$/;
const SAMPLE = /^([A-Za-z_:][A-Za-z0-9_:]*)(\{[^}]*\})?\s+(-?[0-9.]+(?:[eE][-+]?\d+)?|[+-]Inf|NaN)$/;

export function parsePrometheus(text: string): MetricSample[] {
  const help = new Map<string, string>();
  const kind = new Map<string, string>();
  const out: MetricSample[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    let m = HELP.exec(line);
    if (m) { help.set(m[1], m[2]); continue; }
    m = TYPE.exec(line);
    if (m) { kind.set(m[1], m[2]); continue; }
    if (line.startsWith('#')) continue;
    m = SAMPLE.exec(line);
    if (!m) continue;
    const [, name, labels, value] = m;
    const k = kind.get(name);
    // A labelled sample belongs to a histogram/summary family or a
    // dimensioned series; neither is a single figure. Skip.
    if (labels || (k !== 'counter' && k !== 'gauge')) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    out.push({ name, kind: k, help: help.get(name) ?? '', value: n });
  }
  return out;
}
