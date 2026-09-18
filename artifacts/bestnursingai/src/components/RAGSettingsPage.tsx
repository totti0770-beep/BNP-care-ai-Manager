import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBackend } from '@/contexts/BackendContext';
import { fetchMetricsText } from '@/services/clinicalApi';
import { parsePrometheus, type MetricSample } from '@/lib/prometheus';
import { Button } from '@/components/ui/button';
import {
  Database,
  FileText,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Activity,
  Pill,
  AlertCircle,
  Gauge,
} from 'lucide-react';

/**
 * Engine Health: what the engine reports about itself, and nothing else.
 *
 * This page previously exposed a confidence-threshold slider, but that slider
 * tuned a browser-side simulation rather than the engine. Retrieval thresholds
 * are enforced server-side, where they can be audited and are not user-editable
 * — a nurse must not be able to lower the bar for what counts as a verified
 * clinical answer.
 *
 * Every figure here is read from /health or from the /metrics text the engine
 * renders. The counters are per-process and start again at every restart, and
 * nothing scrapes them, so they are shown as what they are — a running tally
 * since the last start — never as a rate, an availability, or a percentage.
 */
const StatusRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  ok?: boolean;
}> = ({ icon, label, value, ok }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--dg-divider)] last:border-0">
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-[var(--dg-accent-strong)]" aria-hidden="true">{icon}</span>
      <span className="text-[var(--dg-body)] text-sm">{label}</span>
    </div>
    <div className="flex items-center gap-2 text-end">
      <span className="text-[var(--dg-body)] text-sm font-medium break-words">{value}</span>
      {ok !== undefined &&
        (ok ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" aria-hidden="true" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400" aria-hidden="true" />
        ))}
    </div>
  </div>
);

/** Metrics the /health rows already show; listing them twice adds nothing. */
const SHOWN_ELSEWHERE = new Set(['bnp_indexed_chunks']);

type MetricsState =
  | { status: 'loading' }
  | { status: 'ok'; samples: MetricSample[] }
  | { status: 'unavailable' };

const RAGSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    isEngineAvailable,
    isEngineReachable,
    isChecking,
    indexedChunks,
    openaiEnabled,
    engineDocuments,
    engineProblems,
    engineHealth,
    formularyCounts,
    formularyReviewStatus,
    recheckHealth,
  } = useBackend();

  const [metrics, setMetrics] = useState<MetricsState>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMetrics = useCallback(async () => {
    const text = await fetchMetricsText();
    if (text === null) {
      setMetrics({ status: 'unavailable' });
      return;
    }
    setMetrics({ status: 'ok', samples: parsePrometheus(text).filter((s) => !SHOWN_ELSEWHERE.has(s.name)) });
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const refreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([recheckHealth(), loadMetrics()]);
    setIsRefreshing(false);
  };

  const statusValue = isChecking
    ? t('loading')
    : !isEngineReachable
      ? t('engineUnavailableTitle')
      : engineHealth?.status === 'ok'
        ? t('ehStatusOk')
        : t('ehStatusDegraded');

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--dg-text)]">{t('navEngineHealth')}</h1>
          <p className="text-[var(--dg-muted)] text-sm mt-1">{t('engineSubtitle')}</p>
        </div>
        <Button
          onClick={() => void refreshAll()}
          disabled={isRefreshing}
          variant="outline"
          className="border-[var(--dg-border-strong)] text-[var(--dg-text)] hover:bg-[var(--dg-accent-soft)]"
        >
          <RefreshCw className={`w-4 h-4 me-2 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t('refresh')}
        </Button>
      </div>

      {/* The engine's reasons, verbatim, when it says it cannot answer. */}
      {engineProblems.length > 0 && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-red-600/10 border border-red-500/30">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-red-200">
            <p className="font-semibold mb-1">{t('ehProblems')}</p>
            <ul className="list-disc ps-5 space-y-0.5">
              {engineProblems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        </div>
      )}

      <section aria-labelledby="eh-health" className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] overflow-hidden">
        <h2 id="eh-health" className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--dg-muted)] bg-[var(--dg-accent-faint)] border-b border-[var(--dg-border)]">
          {t('ehHealthSection')}
        </h2>
        <StatusRow
          icon={<Cpu className="w-4 h-4" />}
          label={t('ehEngine')}
          value={statusValue}
          ok={isChecking ? undefined : isEngineAvailable}
        />
        <StatusRow
          icon={<Database className="w-4 h-4" />}
          label={t('ehDatabase')}
          value={engineHealth ? (engineHealth.database ? t('ehConnected') : t('ehNotConnected')) : t('ehUnknown')}
          ok={engineHealth ? engineHealth.database : undefined}
        />
        <StatusRow
          icon={<Database className="w-4 h-4" />}
          label={t('ehIndexedChunks')}
          value={String(indexedChunks)}
          ok={indexedChunks > 0}
        />
        <StatusRow
          icon={<FileText className="w-4 h-4" />}
          label={t('ehSourceDocuments')}
          value={String(engineDocuments.length)}
          ok={engineDocuments.length > 0}
        />
        <StatusRow
          icon={<Activity className="w-4 h-4" />}
          label={t('ehGeneration')}
          value={openaiEnabled ? t('ehEnabled') : t('ehDisabled')}
          ok={openaiEnabled}
        />
        <StatusRow
          icon={<Pill className="w-4 h-4" />}
          label={t('ehFormulary')}
          value={
            formularyCounts
              ? t('ehFormularyCounts', { approved: formularyCounts.approved, total: formularyCounts.total })
              : t('ehUnknown')
          }
          ok={formularyCounts ? formularyCounts.approved === formularyCounts.total && formularyCounts.total > 0 : undefined}
        />
        {formularyReviewStatus && (
          <StatusRow icon={<Pill className="w-4 h-4" />} label={t('ehFormularyReview')} value={formularyReviewStatus} />
        )}
        {engineHealth?.drug_db_version && (
          <StatusRow icon={<Pill className="w-4 h-4" />} label={t('ehFormularyVersion')} value={engineHealth.drug_db_version} />
        )}
        {engineHealth?.version && (
          <StatusRow icon={<Cpu className="w-4 h-4" />} label={t('ehEngineVersion')} value={engineHealth.version} />
        )}
      </section>

      <section aria-labelledby="eh-metrics" className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] overflow-hidden">
        <h2 id="eh-metrics" className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--dg-muted)] bg-[var(--dg-accent-faint)] border-b border-[var(--dg-border)] flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5" aria-hidden="true" /> {t('ehMetricsSection')}
        </h2>
        <p className="px-4 py-2 text-xs text-[var(--dg-muted)] border-b border-[var(--dg-divider)]">{t('ehMetricsCaption')}</p>
        <div aria-live="polite">
          {metrics.status === 'loading' ? (
            <p className="px-4 py-3 text-sm text-[var(--dg-muted)]">{t('loading')}</p>
          ) : metrics.status === 'unavailable' ? (
            <p role="status" className="px-4 py-3 text-sm text-[var(--dg-muted)]">{t('ehMetricsUnavailable')}</p>
          ) : metrics.samples.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--dg-muted)]">{t('ehMetricsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t('ehMetricName')}</th>
                    <th scope="col">{t('ehMetricValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.samples.map((s) => (
                    <tr key={s.name} className="border-b border-[var(--dg-divider)] last:border-0">
                      <td className="px-4 py-2 align-top">
                        <div className="font-mono text-xs text-[var(--dg-text)]">{s.name}</div>
                        {/* The description is the engine's own HELP line. */}
                        {s.help && <div className="text-xs text-[var(--dg-muted)]" dir="ltr">{s.help}</div>}
                      </td>
                      <td className="px-4 py-2 align-top text-end font-medium text-[var(--dg-body)] whitespace-nowrap">
                        {s.value.toLocaleString()}
                        <span className="ms-1 text-[10px] uppercase text-[var(--dg-muted)]">{s.kind}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-600/10 border border-amber-500/30">
        <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-amber-200 text-sm leading-relaxed">
          <p className="font-semibold mb-1">{t('drugDbUnverified')}</p>
          <p className="text-amber-200/80">{t('ehEnforcedByEngine')}</p>
        </div>
      </div>
    </div>
  );
};

export default RAGSettingsPage;
