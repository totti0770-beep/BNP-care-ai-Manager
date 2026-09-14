import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pill,
  Search,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react';
import { useBackend } from '@/contexts/BackendContext';
import { lookupFormulary, type FormularyLookupMatch, type LookupOutcome } from '@/services/clinicalApi';
import { REGIMEN_LABEL_KEYS } from '@/components/ChatPage';

/**
 * Medication Safety — a nurse's read of the formulary.
 *
 * Until now every medication-safety output (approval status, regimen,
 * contraindications, interactions, antidote, high-alert flag) was reachable
 * only by asking a question in the chat: the capability existed and the
 * workflow did not. This screen is the workflow.
 *
 * It computes nothing. Every value is the engine's, from the same in-memory
 * formulary the clinical pipeline answers from, via `GET /formulary/lookup` —
 * the nurse-safe projection, in which an unapproved drug arrives with its name,
 * status and source and no clinical fields at all. The withholding happens on
 * the server; this file renders what it is handed and says plainly when the
 * engine withheld something.
 */

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; matches: FormularyLookupMatch[]; q: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error' };

const MIN_CHARS = 2;

const MedicationSafetyPage: React.FC = () => {
  const { t } = useTranslation();
  const { isEngineReachable } = useBackend();
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  // Debounced search. Two characters is the engine's own minimum.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < MIN_CHARS) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    const handle = window.setTimeout(async () => {
      const outcome: LookupOutcome = await lookupFormulary(needle);
      if (cancelled) return;
      if (outcome.kind === 'ok') setState({ kind: 'results', matches: outcome.matches, q: needle });
      else if (outcome.kind === 'unavailable') setState({ kind: 'unavailable', reason: outcome.reason });
      else setState({ kind: 'error' });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q]);

  return (
    <div className="flex-1 dg-page min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--dg-text)] flex items-center gap-3">
            <Pill className="w-7 h-7 text-[var(--dg-accent-strong)]" aria-hidden="true" />
            {t('msTitle')}
          </h1>
          <p className="text-[var(--dg-muted)] text-sm mt-1">{t('msLead')}</p>
        </header>

        {!isEngineReachable && (
          <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200 text-sm">
            <AlertTriangle className="w-4 h-4 inline me-2" aria-hidden="true" />
            {t('msUnavailable')}
          </div>
        )}

        <div>
          <label htmlFor="ms-search" className="block text-sm font-semibold text-[var(--dg-text)] mb-2">
            {t('msSearchLabel')}
          </label>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dg-muted)]" aria-hidden="true" />
            <input
              id="ms-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('msSearchPlaceholder')}
              disabled={!isEngineReachable}
              autoComplete="off"
              className="w-full ps-10 pe-4 py-3 rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border-strong)] text-[var(--dg-text)] placeholder:text-[var(--dg-faint)] focus:outline-none focus:border-[var(--dg-accent)] disabled:opacity-50"
            />
          </div>
        </div>

        <div aria-live="polite" aria-busy={state.kind === 'loading'}>
          {state.kind === 'idle' && (
            <p className="text-[var(--dg-muted)] text-sm">{t('msIdle')}</p>
          )}
          {state.kind === 'loading' && (
            <p className="text-[var(--dg-muted)] text-sm">{t('msSearching')}</p>
          )}
          {state.kind === 'unavailable' && (
            <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200 text-sm">
              {t('msFormularyDown')}
              {state.reason && <span dir="ltr" className="block mt-1 opacity-80">{state.reason}</span>}
            </div>
          )}
          {state.kind === 'error' && (
            <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200 text-sm">
              {t('msError')}
            </div>
          )}
          {state.kind === 'results' && state.matches.length === 0 && (
            <div className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-4">
              <p className="text-[var(--dg-text)] text-sm font-medium">{t('msNoMatches', { q: state.q })}</p>
              <p className="text-[var(--dg-muted)] text-xs mt-1">{t('msNoMatchesHint')}</p>
            </div>
          )}
          {state.kind === 'results' && state.matches.length > 0 && (
            <ul className="space-y-4">
              {state.matches.map((m) => (
                <li key={m.drug_id}>
                  <DrugCard drug={m} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: FormularyLookupMatch['review_status'] }> = ({ status }) => {
  const { t } = useTranslation();
  if (status === 'approved') {
    return (
      <span className="text-xs px-2 py-1 rounded-full bg-green-500/15 text-green-300 flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        {t('msStatusApproved')}
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="text-xs px-2 py-1 rounded-full bg-red-500/15 text-red-300 flex items-center gap-1">
        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
        {t('msStatusRejected')}
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 flex items-center gap-1">
      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
      {t('msStatusPending')}
    </span>
  );
};

const ListBlock: React.FC<{ title: string; items: string[]; tone?: 'danger' | 'warn' | 'plain' }> = ({
  title,
  items,
  tone = 'plain',
}) => {
  if (items.length === 0) return null;
  const color =
    tone === 'danger' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-[var(--dg-body)]';
  return (
    <div>
      <h4 className={`text-xs font-semibold uppercase tracking-wide mb-1 ${color}`}>{title}</h4>
      <ul className="list-disc ps-5 space-y-0.5 text-sm text-[var(--dg-body)]">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
};

const DrugCard: React.FC<{ drug: FormularyLookupMatch }> = ({ drug }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const primary = drug.regimen_sections.filter((s) => s.primary);
  const secondary = drug.regimen_sections.filter((s) => !s.primary);
  const provenance = [drug.source_name, drug.source_edition, drug.source_ref].filter(Boolean).join(' · ');

  return (
    <article className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-4 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[var(--dg-text)] break-words">{drug.generic_name}</h3>
          {drug.name_ar && <p className="text-[var(--dg-muted)] text-sm">{drug.name_ar}</p>}
          <p className="text-[var(--dg-muted)] text-xs mt-1 flex items-center gap-1 flex-wrap">
            <BookOpen className="w-3 h-3" aria-hidden="true" />
            <span>{provenance}</span>
            <span>· {t('formularyVersion')} {drug.version}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {drug.high_risk && (
            <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-300 flex items-center gap-1 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              {t('formularyHighAlert')}
            </span>
          )}
          <StatusBadge status={drug.review_status} />
        </div>
      </header>

      {drug.clinical_data_withheld ? (
        // The engine sent no clinical fields. Say so; do not render empty rows.
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200 text-sm">
          <AlertTriangle className="w-4 h-4 inline me-2" aria-hidden="true" />
          {drug.review_status === 'rejected' ? t('msWithheldRejected') : t('msWithheldPending')}
        </div>
      ) : (
        <>
          {(drug.adult_max_daily !== null ||
            drug.overdose_threshold_absolute !== null ||
            drug.overdose_threshold_per_kg !== null ||
            drug.route ||
            drug.frequency) && (
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {drug.adult_max_daily !== null && (
                <div>
                  <dt className="text-[var(--dg-muted)] text-xs">{t('msMaxDaily')}</dt>
                  <dd className="text-[var(--dg-text)] font-medium" dir="ltr">
                    {drug.adult_max_daily} {drug.unit}
                  </dd>
                </div>
              )}
              {(drug.overdose_threshold_absolute !== null || drug.overdose_threshold_per_kg !== null) && (
                <div>
                  <dt className="text-red-300 text-xs">{t('msOverdoseThreshold')}</dt>
                  <dd className="text-red-200 font-medium" dir="ltr">
                    {drug.overdose_threshold_per_kg !== null
                      ? `${drug.overdose_threshold_per_kg} ${drug.unit}/kg`
                      : `${drug.overdose_threshold_absolute} ${drug.unit}`}
                  </dd>
                </div>
              )}
              {drug.route && (
                <div>
                  <dt className="text-[var(--dg-muted)] text-xs">{t('msRoute')}</dt>
                  <dd className="text-[var(--dg-text)]">{drug.route}</dd>
                </div>
              )}
              {drug.frequency && (
                <div>
                  <dt className="text-[var(--dg-muted)] text-xs">{t('msFrequency')}</dt>
                  <dd className="text-[var(--dg-text)]" dir="ltr">{drug.frequency}</dd>
                </div>
              )}
            </dl>
          )}

          {primary.length > 0 && (
            <div className="space-y-2">
              {primary.map((s) => (
                <div key={s.label}>
                  <h4 className="text-xs font-semibold text-[var(--dg-accent-strong)] uppercase tracking-wide">
                    {REGIMEN_LABEL_KEYS[s.label] ? t(REGIMEN_LABEL_KEYS[s.label]) : s.label}
                  </h4>
                  <p className="text-sm text-[var(--dg-body)] whitespace-pre-line" dir="ltr">{s.text}</p>
                </div>
              ))}
            </div>
          )}

          {secondary.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="text-xs text-[var(--dg-accent-strong)] flex items-center gap-1 hover:underline"
              >
                {showAll ? t('msShowLess') : t('msShowMore', { count: secondary.length })}
                {showAll ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
              </button>
              {showAll && (
                <div className="space-y-2 mt-2">
                  {secondary.map((s) => (
                    <div key={s.label}>
                      <h4 className="text-xs font-semibold text-[var(--dg-muted)] uppercase tracking-wide">
                        {REGIMEN_LABEL_KEYS[s.label] ? t(REGIMEN_LABEL_KEYS[s.label]) : s.label}
                      </h4>
                      <p className="text-sm text-[var(--dg-body)] whitespace-pre-line" dir="ltr">{s.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Safety information is never folded away. */}
          <ListBlock title={t('msContraindications')} items={drug.contraindications} tone="danger" />
          <ListBlock title={t('msInteractions')} items={drug.interactions} tone="warn" />
          <ListBlock title={t('msWarnings')} items={drug.warnings} tone="warn" />
          {drug.antidote && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide mb-1 text-[var(--dg-accent-strong)]">{t('msAntidote')}</h4>
              <p className="text-sm text-[var(--dg-body)]">{drug.antidote}</p>
            </div>
          )}

          {drug.reviewed_by && (
            <p className="text-[var(--dg-muted)] text-xs">
              {t('formularyReviewedBy')} {drug.reviewed_by}
              {drug.reviewed_at ? ` · ${new Date(drug.reviewed_at).toLocaleDateString()}` : ''}
            </p>
          )}
        </>
      )}
    </article>
  );
};

export default MedicationSafetyPage;
