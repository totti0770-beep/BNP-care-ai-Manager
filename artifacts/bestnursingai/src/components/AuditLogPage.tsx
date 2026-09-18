import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import CitationList from '@/components/CitationList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { toCsv } from '@/lib/auditCsv';

type QueryTypeFilter = 'all' | 'drug' | 'protocol' | 'general';
const QUERY_TYPES: QueryTypeFilter[] = ['all', 'drug', 'protocol', 'general'];

/** Start of the day in local time, as the date input gives it. */
const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
/** End of the day in local time, inclusive. */
const dayEnd = (iso: string) => new Date(`${iso}T23:59:59.999`);

/**
 * Server-backed audit log. There is no "clear" action: the record of what
 * clinical guidance was given is not the client's to erase.
 */
const AuditLogPage: React.FC = () => {
  const { t } = useTranslation();
  const { logs, isLoading, chainStatus, refresh, exportRows, truncated, windowSize } =
    useAuditLog();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'rejected' | 'alerts'>('all');
  // These narrow the rows already on screen — the window the engine returned,
  // not the trail. The engine's list takes only limit/offset, so a filter that
  // pretended to search the whole trail would be lying; the caption under the
  // bar says how many of the loaded rows match.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<QueryTypeFilter>('all');

  const usernames = useMemo(
    () => [...new Set(logs.map((l) => l.username))].sort((a, b) => a.localeCompare(b)),
    [logs],
  );

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
    const matchesFrom = fromDate === '' || log.timestamp >= dayStart(fromDate);
    const matchesTo = toDate === '' || log.timestamp <= dayEnd(toDate);
    const matchesUser = userFilter === 'all' || log.username === userFilter;
    const matchesType = typeFilter === 'all' || log.queryType === typeFilter;

    return matchesSearch && matchesFilter && matchesFrom && matchesTo && matchesUser && matchesType;
  });

  const filtersActive =
    searchQuery !== '' || filter !== 'all' || fromDate !== '' || toDate !== '' ||
    userFilter !== 'all' || typeFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setFilter('all');
    setFromDate('');
    setToDate('');
    setUserFilter('all');
    setTypeFilter('all');
  };

  const [isExporting, setIsExporting] = useState<'json' | 'csv' | null>(null);

  const handleExport = async (format: 'json' | 'csv') => {
    setIsExporting(format);
    // The export walks every page, so it is not instant on a busy trail — and
    // it must not fall back to the window on screen, which would produce a
    // short file indistinguishable from a complete one. Both formats are
    // projections of the same complete fetch.
    const rows = await exportRows();
    setIsExporting(null);

    if (rows === null) {
      toast.error(t('auditExportFailed'));
      return;
    }

    const body = format === 'csv' ? toCsv(rows) : JSON.stringify(rows, null, 2);
    const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json';
    const blob = new Blob([body], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.${format}`;
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
            onClick={() => void handleExport('json')}
            disabled={isExporting !== null}
            variant="outline"
            className="border-[var(--dg-border-strong)] text-[var(--dg-text)] hover:bg-[var(--dg-accent-soft)]"
          >
            <Download className="w-4 h-4 me-2" aria-hidden="true" />
            {t('exportJson')}
          </Button>
          <Button
            onClick={() => void handleExport('csv')}
            disabled={isExporting !== null}
            variant="outline"
            className="border-[var(--dg-border-strong)] text-[var(--dg-text)] hover:bg-[var(--dg-accent-soft)]"
          >
            <Download className="w-4 h-4 me-2" aria-hidden="true" />
            {t('exportCsv')}
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

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dg-muted)]" aria-hidden="true" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3" role="group" aria-label={t('auditFilters')}>
        <label className="text-xs text-[var(--dg-muted)] flex flex-col gap-1">
          {t('auditFrom')}
          <Input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-text)]"
          />
        </label>
        <label className="text-xs text-[var(--dg-muted)] flex flex-col gap-1">
          {t('auditTo')}
          <Input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-text)]"
          />
        </label>
        <label className="text-xs text-[var(--dg-muted)] flex flex-col gap-1">
          {t('auditUser')}
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="h-9 rounded-md border border-[var(--dg-border)] bg-[var(--dg-surface)] px-3 text-sm text-[var(--dg-text)]"
          >
            <option value="all">{t('auditAllUsers')}</option>
            {usernames.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--dg-muted)] flex flex-col gap-1">
          {t('auditQueryType')}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as QueryTypeFilter)}
            className="h-9 rounded-md border border-[var(--dg-border)] bg-[var(--dg-surface)] px-3 text-sm text-[var(--dg-text)]"
          >
            {QUERY_TYPES.map((k) => (
              <option key={k} value={k}>{t(`auditType_${k}`)}</option>
            ))}
          </select>
        </label>
      </div>

      {/* A filter narrows the loaded window, never the trail. Saying how many
          of the loaded rows match keeps an empty result from reading as
          "there were none". */}
      {!isLoading && logs.length > 0 && (
        <p className="text-[var(--dg-muted)] text-xs mb-3 flex items-center gap-3 flex-wrap" aria-live="polite">
          <span>{t('auditFilteredNote', { shown: filteredLogs.length, loaded: logs.length })}</span>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="underline hover:text-[var(--dg-text)]">
              {t('auditClearFilters')}
            </button>
          )}
        </p>
      )}

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
                <div className="mt-3">
                  <CitationList
                    variant="pills"
                    citations={log.citations.map((c) => ({
                      documentName: c.document_name,
                      pageNumber: c.page_number,
                      chunkId: c.chunk_id ?? undefined,
                    }))}
                  />
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
