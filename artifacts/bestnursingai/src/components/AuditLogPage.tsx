import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '@/contexts/AuditLogContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  ClipboardList,
  Download,
  Trash2,
  Search,
  Calendar,
  User,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  LogIn,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const AuditLogPage: React.FC = () => {
  const { t } = useTranslation();
  const { logs, exportLogs, clearLogs } = useAuditLog();
  const { hasPermission } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');

  const canManageLogs = hasPermission('settings.manage');

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'query': return <Search className="w-4 h-4" />;
      case 'response': return <FileText className="w-4 h-4" />;
      case 'document_verified': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'document_rejected': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'permission_changed': return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'login': return <LogIn className="w-4 h-4 text-blue-400" />;
      case 'logout': return <LogOut className="w-4 h-4 text-gray-400" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'query': return 'text-blue-400';
      case 'response': return 'text-purple-400';
      case 'document_verified': return 'text-green-400';
      case 'document_rejected': return 'text-red-400';
      case 'permission_changed': return 'text-yellow-400';
      case 'login': return 'text-blue-400';
      case 'logout': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.userId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(log.details).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterAction === 'all' || log.action === filterAction;

    return matchesSearch && matchesFilter;
  });

  const handleExport = () => {
    const data = exportLogs();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('logsExported'));
  };

  const handleClear = () => {
    if (confirm(t('confirmClearLogs'))) {
      clearLogs();
      toast.success(t('logsCleared'));
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-purple-400" />
            {t('auditLog')}
          </h2>
          <p className="text-gray-400 mt-1">{t('auditLogDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            variant="outline"
            className="border-purple-500/30 text-white hover:bg-purple-600/20"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('export')}
          </Button>
          {canManageLogs && (
            <Button
              onClick={handleClear}
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('clear')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <p className="text-gray-400 text-sm">{t('totalLogs')}</p>
          <p className="text-2xl font-bold text-white">{logs.length}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <p className="text-gray-400 text-sm">{t('queries')}</p>
          <p className="text-2xl font-bold text-blue-400">
            {logs.filter(l => l.action === 'query').length}
          </p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <p className="text-gray-400 text-sm">{t('responses')}</p>
          <p className="text-2xl font-bold text-purple-400">
            {logs.filter(l => l.action === 'response').length}
          </p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <p className="text-gray-400 text-sm">{t('documentsVerified')}</p>
          <p className="text-2xl font-bold text-green-400">
            {logs.filter(l => l.action === 'document_verified').length}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchLogs')}
            className="pl-10 bg-[#1a1a2e] border-purple-500/30 text-white placeholder:text-gray-500"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="bg-[#1a1a2e] border border-purple-500/30 text-white rounded-lg px-4 py-2"
        >
          <option value="all">{t('allActions')}</option>
          <option value="query">{t('queries')}</option>
          <option value="response">{t('responses')}</option>
          <option value="document_verified">{t('documentsVerified')}</option>
          <option value="document_rejected">{t('documentsRejected')}</option>
          <option value="login">{t('logins')}</option>
          <option value="logout">{t('logouts')}</option>
        </select>
      </div>

      <div className="space-y-2 overflow-y-auto flex-1">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="w-16 h-16 text-gray-600 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">{t('noLogs')}</h3>
            <p className="text-gray-400">{t('noLogsDescription')}</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="p-4 rounded-xl bg-[#1a1a2e] border border-purple-500/20 hover:border-purple-500/40 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-[#0f0f1a] ${getActionColor(log.action)}`}>
                    {getActionIcon(log.action)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium capitalize ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="text-gray-500">•</span>
                      <span className="text-gray-400 text-sm">{log.sessionId}</span>
                    </div>
                    {log.details.query && (
                      <p className="text-white text-sm mt-1">{log.details.query}</p>
                    )}
                    {log.details.response && (
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{log.details.response}</p>
                    )}
                    {log.details.rejectionReason && (
                      <p className="text-red-400 text-sm mt-1">{log.details.rejectionReason}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.userId}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                      {log.details.confidenceLevel && (
                        <span className="text-purple-400">
                          {t('confidence')}: {(log.details.confidenceLevel * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;
