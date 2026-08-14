import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentVerification } from '@/contexts/DocumentVerificationContext';
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
  const { verifyDocument, officialSources } = useDocumentVerification();
  const { hasPermission } = useAuth();
  const { isEngineAvailable, uploadToEngine, engineDocuments, removeFromEngine, refreshDocuments } = useBackend();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [signature, setSignature] = useState('');
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

  const handleUpload = async () => {
    if (!pendingFile) return;
    setIsVerifying(true);

    // Upload to engine first (real indexing)
    if (isEngineAvailable) {
      const result = await uploadToEngine(pendingFile);
      if (result) {
        toast.success(t('indexedSegmentsToast', { count: result.chunks }));
      } else {
        toast.error(t('uploadFailedEngine'));
      }
    }

    // Always also record locally (for UI display)
    await verifyDocument(pendingFile, signature);
    setIsVerifying(false);
    setSignature('');
    setPendingFile(null);
  };

  const cancelPending = () => {
    setPendingFile(null);
    setSignature('');
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Shield className="w-8 h-8 text-purple-400" />
          {t('secureUpload')}
        </h2>
        <p className="text-gray-400 mt-1">{t('secureUploadDescription')}</p>
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
                  ? 'bg-[#1a1a2e] border-purple-500/20'
                  : 'bg-[#12121c] border-gray-600/30 opacity-70'
              }`}
            >
              <div
                className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
                  step.enforced ? 'bg-purple-600/20' : 'bg-gray-600/20'
                }`}
              >
                <Icon
                  className={`w-6 h-6 ${step.enforced ? 'text-purple-400' : 'text-gray-500'}`}
                />
              </div>
              <p className={`font-medium text-sm ${step.enforced ? 'text-white' : 'text-gray-400'}`}>
                {step.label}
              </p>
              <p className={`text-xs mt-1 ${step.enforced ? 'text-gray-500' : 'text-amber-400/80'}`}>
                {step.sub}
              </p>
            </div>
          );
        })}
      </div>

      {/* Selected file preview */}
      {pendingFile ? (
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-purple-500/30 mb-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{pendingFile.name}</p>
              <p className="text-gray-400 text-sm">
                {(pendingFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <button onClick={cancelPending} className="text-gray-500 hover:text-red-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Optional signature */}
          <div>
            <Label className="text-gray-300 mb-1 block text-sm">
              {t('digitalSignature')}
              <span className="text-gray-500 text-xs ml-2">({t('optional')})</span>
            </Label>
            <Input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={t('enterDigitalSignature')}
              className="bg-[#0f0f1a] border-purple-500/30 text-white font-mono text-sm"
            />
            <p className="text-gray-500 text-xs mt-1">{t('signatureHelp')}</p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={cancelPending}
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isVerifying}
              className="flex-1 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500"
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
              ? 'border-purple-500 bg-purple-600/10'
              : 'border-purple-500/30 bg-[#1a1a2e]/50 hover:border-purple-500/50 hover:bg-[#1a1a2e]/80'
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
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <Upload className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('dragDropSecure')}</h3>
          <p className="text-gray-400 mb-4">{t('or')}</p>
          <Button
            disabled={!canUpload}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          >
            {t('browseSecure')}
          </Button>
          <div className="mt-6 space-y-1 text-sm text-gray-500">
            <p>{t('maxFileSize')}: 50MB</p>
            <p>{t('supportedFormats')}: PDF only</p>
          </div>
        </div>
      )}

      {/* Uploaded documents list — from engine DB (persistent) */}
      {engineDocuments.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">
            {t('indexedDocumentsInDb')}
            <span className="text-sm text-gray-400 font-normal ml-2">({engineDocuments.length})</span>
          </h3>
          <div className="space-y-2">
            {engineDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-xl border bg-green-900/10 border-green-500/20"
              >
                <FileText className="w-5 h-5 flex-shrink-0 text-green-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{doc.filename}</p>
                  <p className="text-gray-400 text-xs">
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
                  className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-gray-500 hover:text-red-400"
                  title={t('delete')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The "whitelisted sources" chips were rendered as green ticks, which
          read as verified trust anchors for MOH/WHO/ANA. Nothing validates a
          signature against them, so they are stated as a pending configuration
          rather than an enforced control. */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-600/10 border border-amber-500/30">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="text-amber-200 font-medium">{t('provenanceNotEnforced')}</p>
          <p className="text-amber-200/80 mt-1">{t('provenanceNotEnforcedBody')}</p>
        </div>
      </div>

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
