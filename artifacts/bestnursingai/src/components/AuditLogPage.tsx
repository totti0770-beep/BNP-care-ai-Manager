import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '@/contexts/AuditLogContext';
import {
  ClipboardList,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
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
  const { logs, isLoading, refresh, exportLogs } = useAuditLog();
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

  const handleExport = () => {
    const blob = new Blob([exportLogs()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('logsExported'));
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-purple-400" />
            {t('auditLog')}
          </h2>
          <p className="text-gray-400 mt-1">{t('auditLogDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void refresh()}
            variant="outline"
            className="border-purple-500/30 text-white hover:bg-purple-600/20"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('refresh')}
          </Button>
          <Button
            onClick={handleExport}
            variant="outline"
            className="border-purple-500/30 text-white hover:bg-purple-600/20"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('export')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search')}
            className="pl-9 bg-[#12122a] border-purple-500/20 text-white"
          />
        </div>
        {(['all', 'rejected', 'alerts'] as const).map((key) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'border-purple-500/30 text-white hover:bg-purple-600/20'
            }
          >
            {t(`auditFilter_${key}`)}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-400">{t('loading')}</p>
      ) : filteredLogs.length === 0 ? (
        <p className="text-gray-400">{t('auditLogEmpty')}</p>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl bg-[#12122a] border border-purple-500/20 p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  {log.rejected ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  )}
                  <span className="text-white font-medium">{log.username}</span>
                  <span className="text-gray-500">·</span>
                  <span className="text-gray-400 font-mono text-xs">
                    {log.sessionId}
                  </span>
                </div>
                <span className="text-gray-500 text-xs">
                  {log.timestamp.toLocaleString()}
                </span>
              </div>

              <p className="text-gray-200 text-sm mt-3">{log.query}</p>

              {log.answer && (
                <p className="text-gray-400 text-sm mt-2 whitespace-pre-line line-clamp-4">
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
                      className="inline-flex items-center gap-1 text-xs text-gray-400 bg-purple-600/10 border border-purple-500/20 rounded px-2 py-0.5"
                    >
                      <FileText className="w-3 h-3" />
                      {c.document_name} · p.{c.page_number}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 font-mono">
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
