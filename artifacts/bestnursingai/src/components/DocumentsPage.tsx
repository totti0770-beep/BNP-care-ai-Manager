import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Upload,
  Search,
  Trash2,
  AlertTriangle,
  Zap,
  Database,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useBackend } from '@/contexts/BackendContext';

const DocumentsPage: React.FC = () => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const {
    isEngineAvailable,
    engineDocuments,
    uploadToEngine,
    removeFromEngine,
    refreshDocuments,
    indexedChunks,
  } = useBackend();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canUpload = hasPermission('documents.manage');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.type !== 'application/pdf') {
      toast.error(t('pdfOnly'));
      return;
    }

    setIsUploading(true);
    const result = await uploadToEngine(file);
    if (result) {
      toast.success(t('indexedSegmentsToast', { count: result.chunks }));
    } else {
      toast.error(t('uploadFailedEngine'));
    }
    setIsUploading(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshDocuments();
    setIsRefreshing(false);
    toast.success(t('listRefreshed'));
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    setIsDeleting(true);
    const ok = await removeFromEngine(confirmDeleteId);
    if (ok) {
      toast.success(t('documentDeleted'));
    } else {
      toast.error(t('deleteFailedPermissions'));
    }
    setConfirmDeleteId(null);
    setIsDeleting(false);
  };

  const filteredDocuments = engineDocuments.filter(doc =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const confirmDoc = engineDocuments.find(d => d.id === confirmDeleteId);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && confirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-red-500/40 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">{t('confirmDeleteTitle')}</h3>
                <p className="text-gray-400 text-sm">
                  {t('confirmDeleteBody', { count: confirmDoc.chunk_count })}
                </p>
                <p className="text-red-400 text-sm font-medium mt-2 break-all">
                  "{confirmDoc.filename}"
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => setConfirmDeleteId(null)}
                variant="outline"
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
                disabled={isDeleting}
              >
                <X className="w-4 h-4 me-2" />
                {t('cancel')}
              </Button>
              <Button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 me-2" />
                    {t('deletePermanently')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('documents')}</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-gray-400 text-sm">
              {t('documentCountLabel', { count: engineDocuments.length })}
            </p>
            {isEngineAvailable && (
              <span className="flex items-center gap-1.5 text-xs text-purple-400">
                <Database className="w-3 h-3" />
                {t('indexedChunksLabel', { count: indexedChunks })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="border-purple-500/30 text-gray-300 hover:bg-purple-600/10"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
            disabled={!canUpload || isUploading || !isEngineAvailable}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!canUpload || isUploading || !isEngineAvailable}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('uploading')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {t('upload')} PDF
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Engine offline warning */}
      {!isEngineAvailable && (
        <div className="mb-6 p-4 rounded-xl bg-yellow-600/10 border border-yellow-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-400 text-sm">
            {t('engineOfflineDocuments')}
          </p>
        </div>
      )}

      {/* Search */}
      {engineDocuments.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search')}
            className="ps-10 bg-[#1a1a2e] border-purple-500/30 text-white placeholder:text-gray-500"
          />
        </div>
      )}

      {/* Documents list */}
      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#1a1a2e] border border-purple-500/30 flex items-center justify-center mb-4">
            <FileText className="w-10 h-10 text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('noDocuments')}</h3>
          <p className="text-gray-400 mb-6">
            {searchQuery ? t('noSearchResults') : t('uploadToStart')}
          </p>
          {canUpload && isEngineAvailable && !searchQuery && (
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500"
            >
              <Upload className="w-4 h-4 me-2" />
              {t('uploadFirstDocument')}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-4 p-4 rounded-xl border bg-[#1a1a2e] border-purple-500/20 hover:border-purple-500/40 transition-colors"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-white" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-white font-medium truncate">{doc.filename}</h4>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs flex items-center gap-1 text-purple-400">
                    <Zap className="w-3 h-3" />
                    {doc.chunk_count} {t('segments')}
                  </span>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-gray-400 text-xs">{formatDate(doc.upload_date)}</span>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    {t('indexedInDatabase')}
                  </span>
                </div>
              </div>

              {/* Delete action */}
              {canUpload && (
                <button
                  onClick={() => setConfirmDeleteId(doc.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors group flex-shrink-0"
                  title={t('deleteDocument')}
                >
                  <Trash2 className="w-5 h-5 text-gray-500 group-hover:text-red-400 transition-colors" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
