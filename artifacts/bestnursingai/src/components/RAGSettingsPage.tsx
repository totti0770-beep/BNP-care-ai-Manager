import React from 'react';
import { useTranslation } from 'react-i18next';
import { useBackend } from '@/contexts/BackendContext';
import { SYSTEM_NAME } from '@/types/bnp';
import {
  Database,
  FileText,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

/**
 * Read-only view of the retrieval configuration.
 *
 * This page previously exposed a confidence-threshold slider, but that slider
 * tuned a browser-side simulation rather than the engine. Retrieval thresholds
 * are enforced server-side, where they can be audited and are not user-editable
 * — a nurse must not be able to lower the bar for what counts as a verified
 * clinical answer.
 */
const StatusRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  ok?: boolean;
}> = ({ icon, label, value, ok }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--dg-divider)] last:border-0">
    <div className="flex items-center gap-3">
      <span className="text-[var(--dg-accent-strong)]">{icon}</span>
      <span className="text-[var(--dg-body)] text-sm">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-[var(--dg-body)] text-sm font-medium">{value}</span>
      {ok !== undefined &&
        (ok ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400" />
        ))}
    </div>
  </div>
);

const RAGSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    isEngineAvailable,
    isChecking,
    indexedChunks,
    openaiEnabled,
    engineDocuments,
  } = useBackend();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--dg-text)]">{SYSTEM_NAME}</h1>
        <p className="text-[var(--dg-muted)] text-sm mt-1">{t('engineSubtitle')}</p>
      </div>

      <div className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] overflow-hidden">
        <StatusRow
          icon={<Cpu className="w-4 h-4" />}
          label="Engine"
          value={
            isChecking
              ? t('loading')
              : isEngineAvailable
                ? 'Connected'
                : t('engineUnavailableTitle')
          }
          ok={isChecking ? undefined : isEngineAvailable}
        />
        <StatusRow
          icon={<Database className="w-4 h-4" />}
          label="Indexed chunks"
          value={String(indexedChunks)}
          ok={indexedChunks > 0}
        />
        <StatusRow
          icon={<FileText className="w-4 h-4" />}
          label="Source documents"
          value={String(engineDocuments.length)}
          ok={engineDocuments.length > 0}
        />
        <StatusRow
          icon={<Cpu className="w-4 h-4" />}
          label="Response generation"
          value={openaiEnabled ? 'Enabled' : 'Disabled'}
          ok={openaiEnabled}
        />
      </div>

      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-600/10 border border-amber-500/30">
        <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-amber-200 text-sm leading-relaxed">
          <p className="font-semibold mb-1">{t('drugDbUnverified')}</p>
          <p className="text-amber-200/80">
            Retrieval thresholds and dose limits are enforced by the engine and
            cannot be changed from this screen.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RAGSettingsPage;
