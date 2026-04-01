import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentVerification } from '@/contexts/DocumentVerificationContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Shield,
  Upload,
  Lock,
  Key,
  CheckCircle,
  AlertTriangle,
  Fingerprint,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const SecureUploadPage: React.FC = () => {
  const { t } = useTranslation();
  const { verifyDocument, officialSources } = useDocumentVerification();
  const { hasPermission } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [signature, setSignature] = useState('');

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

    if (!canUpload) {
      toast.error(t('noPermission'));
      return;
    }

    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf'
    );

    if (files.length > 0) {
      await processFile(files[0]);
    }
  }, [canUpload]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    if (!signature) {
      toast.error(t('enterSignature'));
      return;
    }

    setIsVerifying(true);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await verifyDocument(file, signature);

    setIsVerifying(false);
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

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { icon: Fingerprint, label: t('digitalSignature'), sub: 'RSA-2048 / Ed25519' },
          { icon: Lock, label: t('checksum'), sub: 'SHA-256' },
          { icon: Key, label: t('whitelistCheck'), sub: t('officialSources') },
          { icon: CheckCircle, label: t('indexing'), sub: 'OfficialOnly Tag', iconClass: 'text-green-400' },
        ].map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-600/20 flex items-center justify-center">
                <Icon className={`w-6 h-6 ${step.iconClass || 'text-purple-400'}`} />
              </div>
              <p className="text-white font-medium text-sm">{step.label}</p>
              <p className="text-gray-500 text-xs mt-1">{step.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-6 border border-purple-500/20 mb-6">
        <Label className="text-white mb-2 block">{t('digitalSignature')}</Label>
        <Input
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder={t('enterDigitalSignature')}
          className="bg-[#0f0f1a] border-purple-500/30 text-white font-mono"
        />
        <p className="text-gray-500 text-sm mt-2">{t('signatureHelp')}</p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
          isDragging
            ? 'border-purple-500 bg-purple-600/10'
            : 'border-purple-500/30 bg-[#1a1a2e]/50 hover:border-purple-500/50'
        } ${!canUpload && 'opacity-50 cursor-not-allowed'}`}
      >
        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
          {isVerifying ? (
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Upload className="w-10 h-10 text-white" />
          )}
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          {isVerifying ? t('verifying') : t('dragDropSecure')}
        </h3>
        <p className="text-gray-400 mb-4">{t('or')}</p>
        <label className={`inline-block ${!canUpload && 'pointer-events-none'}`}>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
            disabled={!canUpload}
          />
          <Button
            disabled={!canUpload || isVerifying}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500"
          >
            {t('browseSecure')}
          </Button>
        </label>
        <div className="mt-6 space-y-1 text-sm text-gray-500">
          <p>{t('maxFileSize')}: 50MB</p>
          <p>{t('supportedFormats')}: PDF only</p>
          <p className="flex items-center justify-center gap-2 mt-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            {t('unsignedDocumentWarning')}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-semibold text-white mb-4">{t('whitelistedSources')}</h3>
        <div className="flex flex-wrap gap-2">
          {officialSources.filter(s => s.isActive).map((source) => (
            <span
              key={source.id}
              className="px-3 py-1.5 rounded-full bg-green-600/20 text-green-400 text-sm flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {source.name}
            </span>
          ))}
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
