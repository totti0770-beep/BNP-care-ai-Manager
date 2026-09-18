import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  MessageSquare,
  Pill,
  Calculator,
  UserCircle,
  Quote,
  ClipboardList,
  ShieldCheck,
  Zap,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import DgLogo from '@/components/DgLogo';
import { useAuth } from '@/contexts/AuthContext';
import { useBackend } from '@/contexts/BackendContext';
import { usePatient } from '@/contexts/PatientContext';
import { useAuditLog } from '@/contexts/AuditLogContext';

/**
 * The first screen after sign-in.
 *
 * It used to be a logo, a strapline and four marketing pills, with no data and
 * no action — a nurse learned nothing about what the system could do and had
 * nowhere to go. It is now a console. Every figure on it is read from an
 * endpoint the app already calls for every user (`/health`, `/documents/`),
 * or from the audit trail for users who may read it. Nothing here is a number
 * the system does not measure: there is no refusal rate, no accuracy, no
 * adoption figure, because no endpoint produces one.
 */
interface Props {
  onAsk: (question: string) => void;
  onNavigate: (tab: string) => void;
}

const HomePage: React.FC<Props> = ({ onAsk, onNavigate }) => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const {
    isEngineAvailable,
    isChecking,
    engineProblems,
    indexedChunks,
    openaiEnabled,
    engineDocuments,
    formularyCounts,
  } = useBackend();
  const { patient, hasPatient } = usePatient();
  const canReadAudit = hasPermission('settings.manage');

  const [question, setQuestion] = useState('');
  const [placeholder, setPlaceholder] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    onAsk(q);
  };

  // Documents whose status the engine reports. An engine older than
  // 0004_document_lifecycle returns rows without one; those are counted in the
  // total only, never presumed approved.
  const approvedDocs = engineDocuments.filter((d) => d.status === 'approved').length;
  const pendingDocs = engineDocuments.filter((d) => d.status === 'pending').length;

  const quickActions = [
    {
      id: 'question',
      icon: MessageSquare,
      label: t('qaClinicalQuestion'),
      hint: t('qaClinicalQuestionHint'),
      run: () => onNavigate('chat'),
    },
    {
      id: 'medication',
      icon: Pill,
      label: t('qaMedication'),
      hint: t('qaMedicationHint'),
      run: () => onNavigate('medication-safety'),
    },
    {
      id: 'dose',
      icon: Calculator,
      label: t('qaDose'),
      hint: t('qaDoseHint'),
      run: () => setPlaceholder(t('homeAskPlaceholder')),
    },
    {
      id: 'patient',
      icon: UserCircle,
      label: t('qaPatientContext'),
      hint: t('qaPatientContextHint'),
      run: () => onNavigate('chat'),
    },
    {
      id: 'evidence',
      icon: Quote,
      label: t('qaEvidence'),
      hint: t('qaEvidenceHint'),
      run: () => onNavigate('citations'),
    },
    // The audit trail is admin-only on the engine. There is no per-user
    // history endpoint, so for a nurse this action would open a 403.
    ...(canReadAudit
      ? [
          {
            id: 'activity',
            icon: ClipboardList,
            label: t('qaRecentActivity'),
            hint: t('qaRecentActivityHint'),
            run: () => onNavigate('audit-log'),
          },
          {
            id: 'governance',
            icon: ShieldCheck,
            label: t('qaGovernance'),
            hint: t('qaGovernanceHint'),
            run: () => onNavigate('knowledge-governance'),
          },
        ]
      : []),
  ];

  return (
    <div className="flex-1 dg-page min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center gap-4">
          <DgLogo size={48} />
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--dg-text)]">
              {t('homeTitle')}
            </h1>
            <p className="text-[var(--dg-muted)] text-sm">{t('homeLead')}</p>
          </div>
        </header>

        {/* Degraded engine: said loudly, in the engine's own words, before the
            ask box — a nurse must not type a question into a system that will
            refuse it without knowing why. */}
        {!isChecking && !isEngineAvailable && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/10 p-4"
          >
            <div className="flex items-center gap-2 text-red-300 font-semibold">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              {t('homeDegradedTitle')}
            </div>
            <p className="text-red-200/80 text-sm mt-1">{t('homeDegradedBody')}</p>
            {engineProblems.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-red-200/90 list-disc ps-5">
                {engineProblems.map((p) => (
                  <li key={p} dir="ltr" className="text-start">{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Ask */}
        <form
          onSubmit={submit}
          className="rounded-2xl border border-[var(--dg-border-strong)] bg-[var(--dg-surface)] p-4"
        >
          <label htmlFor="home-ask" className="block text-sm font-semibold text-[var(--dg-text)] mb-2">
            {t('homeAskLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id="home-ask"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={placeholder ?? t('homeAskPlaceholder')}
              disabled={!isEngineAvailable}
              className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-[var(--dg-elevated)] border border-[var(--dg-border)] text-[var(--dg-text)] placeholder:text-[var(--dg-faint)] focus:outline-none focus:border-[var(--dg-accent)] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isEngineAvailable || !question.trim()}
              className="px-4 py-3 rounded-xl dg-gradient text-white font-medium flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              {t('homeAskButton')}
            </button>
          </div>
        </form>

        {/* Quick actions */}
        <section aria-labelledby="home-qa">
          <h2 id="home-qa" className="text-xs font-semibold text-[var(--dg-muted)] uppercase tracking-wider mb-3">
            {t('homeQuickActions')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {quickActions.map((qa) => {
              const Icon = qa.icon;
              return (
                <button
                  key={qa.id}
                  type="button"
                  onClick={qa.run}
                  className="text-start p-4 rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] hover:border-[var(--dg-border-strong)] hover:bg-[var(--dg-elevated)] transition-colors"
                >
                  <Icon className="w-5 h-5 text-[var(--dg-accent-strong)] mb-2" aria-hidden="true" />
                  <div className="text-[var(--dg-text)] font-medium text-sm">{qa.label}</div>
                  <div className="text-[var(--dg-muted)] text-xs mt-0.5">{qa.hint}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Patient context — the values that decide whether a dose is computed */}
        <section
          aria-labelledby="home-patient"
          className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-4"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h2 id="home-patient" className="text-sm font-semibold text-[var(--dg-text)] flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-[var(--dg-accent-strong)]" aria-hidden="true" />
                {t('homePatientTitle')}
              </h2>
              <p className="text-[var(--dg-muted)] text-xs mt-0.5">{t('homePatientHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--dg-border-strong)] text-[var(--dg-accent-strong)] hover:bg-[var(--dg-accent-soft)]"
            >
              {hasPatient ? t('homeEditPatient') : t('homeSetPatient')}
            </button>
          </div>
          {hasPatient ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {patient.patientWeightKg && (
                <span className="px-2.5 py-1 rounded-full bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] text-xs">
                  {t('ctxWeight')}: {t('ctxKg', { value: patient.patientWeightKg })}
                </span>
              )}
              {patient.age && (
                <span className="px-2.5 py-1 rounded-full bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] text-xs">
                  {t('ctxAge')}: {t('ctxYears', { value: patient.age })}
                </span>
              )}
              {(patient.conditions ?? []).map((c) => (
                <span key={`c-${c}`} className="px-2.5 py-1 rounded-full bg-[var(--dg-elevated)] text-[var(--dg-body)] text-xs border border-[var(--dg-border)]">
                  {c}
                </span>
              ))}
              {(patient.otherDrugs ?? []).map((d) => (
                <span key={`d-${d}`} className="px-2.5 py-1 rounded-full bg-[var(--dg-elevated)] text-[var(--dg-body)] text-xs border border-[var(--dg-border)]">
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[var(--dg-muted)] text-sm mt-3">{t('homePatientEmpty')}</p>
          )}
        </section>

        {/* System status — each tile is a value the engine reported */}
        <section aria-labelledby="home-status">
          <h2 id="home-status" className="text-xs font-semibold text-[var(--dg-muted)] uppercase tracking-wider mb-3">
            {t('homeSystemStatus')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--dg-text)] flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[var(--dg-accent-strong)]" aria-hidden="true" />
                  {t('statusEngine')}
                </span>
                {isChecking ? (
                  <span className="text-xs text-[var(--dg-muted)]">{t('statusEngineChecking')}</span>
                ) : isEngineAvailable ? (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('statusEngineLive')}
                  </span>
                ) : (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('statusEngineDegraded')}
                  </span>
                )}
              </div>
              <p className="text-[var(--dg-muted)] text-xs mt-2">{t('statusChunks', { count: indexedChunks })}</p>
              <p className="text-[var(--dg-muted)] text-xs">{openaiEnabled ? t('statusModelOn') : t('statusModelOff')}</p>
            </div>

            <div className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-4">
              <span className="text-sm font-medium text-[var(--dg-text)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--dg-accent-strong)]" aria-hidden="true" />
                {t('statusEvidence')}
              </span>
              <p className="text-[var(--dg-muted)] text-xs mt-2">{t('statusDocsTotal', { count: engineDocuments.length })}</p>
              <p className="text-[var(--dg-muted)] text-xs">{t('statusDocsApproved', { count: approvedDocs })}</p>
              {pendingDocs > 0 && (
                <p className="text-amber-400 text-xs">{t('statusDocsPending', { count: pendingDocs })}</p>
              )}
            </div>

            <div className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-4">
              <span className="text-sm font-medium text-[var(--dg-text)] flex items-center gap-2">
                <Pill className="w-4 h-4 text-[var(--dg-accent-strong)]" aria-hidden="true" />
                {t('statusFormulary')}
              </span>
              <p className="text-[var(--dg-muted)] text-xs mt-2">
                {formularyCounts
                  ? t('statusFormularyApproved', { approved: formularyCounts.approved, total: formularyCounts.total })
                  : t('statusFormularyUnknown')}
              </p>
            </div>
          </div>
        </section>

        {canReadAudit && <RecentActivity onOpenAudit={() => onNavigate('audit-log')} />}
      </div>
    </div>
  );
};

/** Admin-only: the last few rows of the audit trail this user may read. */
const RecentActivity: React.FC<{ onOpenAudit: () => void }> = ({ onOpenAudit }) => {
  const { t } = useTranslation();
  const { logs, isLoading } = useAuditLog();
  const recent = logs.slice(0, 5);

  return (
    <section aria-labelledby="home-recent" className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-recent" className="text-sm font-semibold text-[var(--dg-text)] flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[var(--dg-accent-strong)]" aria-hidden="true" />
          {t('homeRecentTitle')}
        </h2>
        <button
          type="button"
          onClick={onOpenAudit}
          className="text-xs text-[var(--dg-accent-strong)] hover:underline"
        >
          {t('homeOpenAudit')}
        </button>
      </div>
      {isLoading ? (
        <p className="text-[var(--dg-muted)] text-xs mt-3">{t('statusEngineChecking')}</p>
      ) : recent.length === 0 ? (
        <p className="text-[var(--dg-muted)] text-xs mt-3">{t('homeRecentEmpty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--dg-divider)]">
          {recent.map((row) => (
            <li key={row.id} className="py-2 flex items-start gap-3">
              <span
                className={`mt-0.5 text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                  row.rejected ? 'bg-red-500/15 text-red-300' : 'bg-green-500/15 text-green-300'
                }`}
              >
                {row.rejected ? t('homeRecentRefused') : t('homeRecentAnswered')}
              </span>
              <span className="text-sm text-[var(--dg-body)] truncate min-w-0 flex-1">{row.query}</span>
              {row.safetyAlerts.length > 0 && (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-label={t('secSafetyWarning')} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default HomePage;
