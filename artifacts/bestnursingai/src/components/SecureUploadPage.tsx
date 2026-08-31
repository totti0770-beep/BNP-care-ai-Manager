import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useBackend } from '@/contexts/BackendContext';
import {
  Shield,
  Upload,
  Lock,
  Key,
  CheckCircle,
  AlertTriangle,
  Fingerprint,
  FileText,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const SecureUploadPage: React.FC = () => {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const {
    isEngineReachable,
    engineProblems,
    uploadToEngine,
    engineDocuments,
    removeFromEngine,
    refreshDocuments,
  } = useBackend();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const canUpload = hasPermission('documents.manage');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canUpload) { toast.error(t('noPermission')); return; }
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length > 0) setPendingFile(files[0]);
  }, [canUpload, t]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = '';
  };

  /**
   * Index the file in the engine, and report what actually happened.
   *
   * This used to run only `if (isEngineAvailable)` and fall through silently
   * otherwise, recording the file in a browser-memory list instead. Because
   * /health reports `degraded` until a corpus exists, that branch was never
   * taken on a fresh deployment: the upload made no request at all, showed no
   * error, and left an operator believing a document had been accepted. The
   * engine only has to be reachable for indexing to be possible, and a failure
   * is now always visible.
   */
  const handleUpload = async () => {
    if (!pendingFile) return;
    setIsVerifying(true);
    try {
      const result = await uploadToEngine(pendingFile);
      if (result) {
        toast.success(t('indexedSegmentsToast', { count: result.chunks }));
        setPendingFile(null);
      } else {
        toast.error(t('uploadFailedEngine'));
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const cancelPending = () => {
    setPendingFile(null);
  };

  return (
    <div className="flex-1 flex flex-col dg-page min-h-screen p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[var(--dg-text)] flex items-center gap-3">
          <Shield className="w-8 h-8 text-[var(--dg-accent-strong)]" />
          {t('secureUpload')}
        </h2>
        <p className="text-[var(--dg-muted)] mt-1">{t('secureUploadDescription')}</p>
      </div>

      {/* What upload actually does.
          This previously showed four steps — digital signature, checksum,
          whitelist check, and an "OfficialOnly Tag" — with green ticks, as
          though a provenance pipeline ran. Only the checksum and the indexing
          are real: there is no signature validation and no whitelist check
          anywhere in the codebase. Steps that do not execute are marked as not
          enforced rather than dropped, so the gap stays visible. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Lock, label: t('checksum'), sub: 'SHA-256', enforced: true },
          { icon: CheckCircle, label: t('indexing'), sub: t('indexingSub'), enforced: true },
          { icon: Fingerprint, label: t('digitalSignature'), sub: t('notEnforced'), enforced: false },
          { icon: Key, label: t('whitelistCheck'), sub: t('notEnforced'), enforced: false },
        ].map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.label}
              className={`rounded-xl p-4 border text-center ${
                step.enforced
                  ? 'bg-[var(--dg-surface)] border-[var(--dg-border)]'
                  : 'bg-[#12121c] border-gray-600/30 opacity-70'
              }`}
            >
              <div
                className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
                  step.enforced ? 'bg-[var(--dg-accent-soft)]' : 'bg-gray-600/20'
                }`}
              >
                <Icon
                  className={`w-6 h-6 ${step.enforced ? 'text-[var(--dg-accent-strong)]' : 'text-[var(--dg-muted)]'}`}
                />
              </div>
              <p className={`font-medium text-sm ${step.enforced ? 'text-[var(--dg-text)]' : 'text-[var(--dg-muted)]'}`}>
                {step.label}
              </p>
              <p className={`text-xs mt-1 ${step.enforced ? 'text-[var(--dg-muted)]' : 'text-amber-400/80'}`}>
                {step.sub}
              </p>
            </div>
          );
        })}
      </div>

      {/* Selected file preview */}
      {pendingFile ? (
        <div className="bg-[var(--dg-surface)] rounded-xl p-6 border border-[var(--dg-border-strong)] mb-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-[var(--dg-text)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[var(--dg-text)] font-medium truncate">{pendingFile.name}</p>
              <p className="text-[var(--dg-muted)] text-sm">
                {(pendingFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <button onClick={cancelPending} className="text-[var(--dg-muted)] hover:text-red-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={cancelPending}
              variant="outline"
              className="flex-1 border-gray-600 text-[var(--dg-body)] hover:bg-gray-800"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isVerifying}
              className="flex-1 dg-gradient hover:brightness-110"
            >
              {isVerifying ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('uploading')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  {t('upload')}
                </span>
              )}
            </Button>
          </div>
        </div>
      ) : (
        /* Drop zone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer mb-6 ${
            isDragging
              ? 'border-[var(--dg-accent)] bg-[var(--dg-accent-faint)]'
              : 'border-[var(--dg-border-strong)] bg-[var(--dg-surface)]/50 hover:border-[var(--dg-border-strong)] hover:bg-[var(--dg-surface)]/80'
          } ${!canUpload && 'opacity-50 cursor-not-allowed'}`}
          onClick={() => canUpload && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
            disabled={!canUpload}
          />
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl dg-gradient flex items-center justify-center">
            <Upload className="w-10 h-10 text-[var(--dg-text)]" />
          </div>
          <h3 className="text-xl font-semibold text-[var(--dg-text)] mb-2">{t('dragDropSecure')}</h3>
          <p className="text-[var(--dg-muted)] mb-4">{t('or')}</p>
          <Button
            disabled={!canUpload}
            className="dg-gradient hover:brightness-110"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          >
            {t('browseSecure')}
          </Button>
          <div className="mt-6 space-y-1 text-sm text-[var(--dg-muted)]">
            <p>{t('maxFileSize')}: 50MB</p>
            <p>{t('supportedFormats')}: PDF only</p>
          </div>
        </div>
      )}

      {/* Uploaded documents list — from engine DB (persistent) */}
      {engineDocuments.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-[var(--dg-text)] mb-3">
            {t('indexedDocumentsInDb')}
            <span className="text-sm text-[var(--dg-muted)] font-normal ms-2">({engineDocuments.length})</span>
          </h3>
          <div className="space-y-2">
            {engineDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-xl border bg-green-900/10 border-green-500/20"
              >
                <FileText className="w-5 h-5 flex-shrink-0 text-green-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--dg-text)] text-sm font-medium truncate">{doc.filename}</p>
                  <p className="text-[var(--dg-muted)] text-xs">
                    {doc.chunk_count} {t('segments')} ·{' '}
                    {new Date(doc.upload_date).toLocaleDateString()} ·{' '}
                    <span className="text-green-400">{t('indexedPermanent')}</span>
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const ok = await removeFromEngine(doc.id);
                    if (ok) toast.success(t('documentDeleted'));
                    else toast.error(t('documentDeleteFailed'));
                  }}
                  className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-[var(--dg-muted)] hover:text-red-400"
                  title={t('delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Why the assistant still refuses clinical questions, in the engine's
          own words. An empty corpus is the expected state here, not a fault —
          and uploading is what clears it, so the message must not read as a
          reason the screen cannot be used. */}
      {engineProblems.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-600/10 border border-amber-500/30">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-200 font-medium">{t('engineNotReadyYet')}</p>
            <ul className="text-amber-200/80 mt-1 list-disc list-inside">
              {engineProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Reachability is the one thing that genuinely blocks indexing. */}
      {!isEngineReachable && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-600/10 border border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">{t('engineUnreachableUpload')}</p>
        </div>
      )}

      {!canUpload && (
        <div className="mt-6 p-4 rounded-xl bg-yellow-600/10 border border-yellow-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <p className="text-yellow-400">{t('uploadPermissionRequired')}</p>
        </div>
      )}
    </div>
  );
};

export default SecureUploadPage;
