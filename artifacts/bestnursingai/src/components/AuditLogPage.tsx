import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '@/contexts/AuditLogContext';
import {
  ClipboardList,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  XCircle,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

/**
 * Server-backed audit log. There is no "clear" action: the record of what
 * clinical guidance was given is not the client's to erase.
 */
const AuditLogPage: React.FC = () => {
  const { t } = useTranslation();
  const { logs, isLoading, chainStatus, refresh, exportLogs, truncated, windowSize } =
    useAuditLog();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'rejected' | 'alerts'>('all');

  const filteredLogs = logs.filter((log) => {
    const haystack = [
      log.sessionId,
      log.username,
      log.query,
      log.answer ?? '',
      log.queryType ?? '',
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = haystack.includes(searchQuery.toLowerCase());
    const matchesFilter =
      filter === 'all' ||
      (filter === 'rejected' && log.rejected) ||
      (filter === 'alerts' && log.safetyAlerts.length > 0);

    return matchesSearch && matchesFilter;
  });

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    // The export walks every page, so it is not instant on a busy trail — and
    // it must not fall back to the window on screen, which would produce a
    // short file indistinguishable from a complete one.
    const json = await exportLogs();
    setIsExporting(false);

    if (json === null) {
      toast.error(t('auditExportFailed'));
      return;
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('logsExported'));
  };

  return (
    <div className="flex-1 flex flex-col dg-page min-h-screen p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--dg-text)] flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-[var(--dg-accent-strong)]" />
            {t('auditLog')}
          </h2>
          <p className="text-[var(--dg-muted)] mt-1">{t('auditLogDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void refresh()}
            variant="outline"
            className="border-[var(--dg-border-strong)] text-[var(--dg-text)] hover:bg-[var(--dg-accent-soft)]"
          >
            <RefreshCw className="w-4 h-4 me-2" />
            {t('refresh')}
          </Button>
          <Button
            onClick={() => void handleExport()}
            disabled={isExporting}
            variant="outline"
            className="border-[var(--dg-border-strong)] text-[var(--dg-text)] hover:bg-[var(--dg-accent-soft)]"
          >
            <Download className="w-4 h-4 me-2" />
            {t('export')}
          </Button>
        </div>
      </div>

      {/* Integrity: whether the trail verifies as unaltered since it was
          written. Each row's hash covers the previous row's, so an edited or
          removed entry breaks every hash after it. */}
      {chainStatus && (
        <div
          className={`flex items-start gap-3 p-4 mb-4 rounded-xl border ${
            chainStatus.valid
              ? 'bg-green-600/10 border-green-500/30'
              : 'bg-red-600/15 border-red-500/40'
          }`}
        >
          {chainStatus.valid ? (
            <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm">
            <p
              className={`font-medium ${
                chainStatus.valid ? 'text-green-200' : 'text-red-200'
              }`}
            >
              {chainStatus.valid
                ? t('auditIntact', { count: chainStatus.rows_checked })
                : t('auditTampered')}
            </p>
            {!chainStatus.valid && (
              <p className="text-red-200/80 mt-1">
                {chainStatus.reason} (entry #{chainStatus.broken_at_id})
              </p>
            )}
            {chainStatus.valid && !!chainStatus.unchained_legacy_rows && (
              <p className="text-green-200/70 mt-1">
                {t('auditLegacyRows', { count: chainStatus.unchained_legacy_rows })}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dg-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search')}
            className="ps-9 bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-text)]"
          />
        </div>
        {(['all', 'rejected', 'alerts'] as const).map((key) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? 'dg-gradient hover:brightness-110'
                : 'border-[var(--dg-border-strong)] text-[var(--dg-text)] hover:bg-[var(--dg-accent-soft)]'
            }
          >
            {t(`auditFilter_${key}`)}
          </Button>
        ))}
      </div>

      {/* An auditor searching for one refusal must know whether they searched
          the trail or only the newest slice of it. */}
      {truncated && !isLoading && (
        <p className="text-amber-300/80 text-xs mb-3" role="note">
          {t('auditWindowed', { count: windowSize })}
        </p>
      )}

      {isLoading ? (
        <p className="text-[var(--dg-muted)]">{t('loading')}</p>
      ) : filteredLogs.length === 0 ? (
        <p className="text-[var(--dg-muted)]">{t('auditLogEmpty')}</p>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  {log.rejected ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  )}
                  <span className="text-[var(--dg-text)] font-medium">{log.username}</span>
                  <span className="text-[var(--dg-muted)]">·</span>
                  <span className="text-[var(--dg-muted)] font-mono text-xs">
                    {log.sessionId}
                  </span>
                </div>
                <span className="text-[var(--dg-muted)] text-xs">
                  {log.timestamp.toLocaleString()}
                </span>
              </div>

              <p className="text-[var(--dg-body)] text-sm mt-3">{log.query}</p>

              {log.answer && (
                <p className="text-[var(--dg-muted)] text-sm mt-2 whitespace-pre-line line-clamp-4">
                  {log.answer}
                </p>
              )}

              {log.dose && (
                <p className="text-cyan-300 text-xs mt-2 font-mono">{log.dose}</p>
              )}

              {log.safetyAlerts.length > 0 && (
                <div className="mt-3 space-y-1">
                  {log.safetyAlerts.map((alert, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-orange-400 mt-0.5 flex-shrink-0" />
                      <span className="text-orange-200 text-xs">{alert}</span>
                    </div>
                  ))}
                </div>
              )}

              {log.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {log.citations.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs text-[var(--dg-muted)] bg-[var(--dg-accent-faint)] border border-[var(--dg-border)] rounded px-2 py-0.5"
                    >
                      <FileText className="w-3 h-3" />
                      {c.document_name} · p.{c.page_number}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--dg-muted)] font-mono">
                {log.confidenceLabel && <span>confidence: {log.confidenceLabel}</span>}
                {log.model && <span>model: {log.model}</span>}
                {log.drugDbVersion && <span>drug-db: {log.drugDbVersion}</span>}
                {log.answerHash && <span>sha256: {log.answerHash.slice(0, 16)}…</span>}
                {log.clientIp && <span>ip: {log.clientIp}</span>}
              </div>

              {log.rejectionReason && (
                <p className="text-red-300 text-xs mt-2">{log.rejectionReason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditLogPage;
