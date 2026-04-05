import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Upload, Search, Download, Trash2, Eye, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useDocumentVerification } from '@/contexts/DocumentVerificationContext';
import { useAuth } from '@/contexts/AuthContext';

const DocumentsPage: React.FC = () => {
  const { t } = useTranslation();
  const { verifiedDocuments, removeDocument, downloadDocument, verifyDocument } = useDocumentVerification();
  const { hasPermission } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const canUpload = hasPermission('documents.manage');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.type !== 'application/pdf') {
      toast.error('الملفات المدعومة: PDF فقط');
      return;
    }

    setIsUploading(true);
    await new Promise(resolve => setTimeout(resolve, 1200));
    await verifyDocument(file);
    setIsUploading(false);
  };

  const filteredDocuments = verifiedDocuments.filter(doc =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('documents')}</h2>
          <p className="text-gray-400 text-sm mt-1">
            {verifiedDocuments.length} {t('documentCount', { count: verifiedDocuments.length }).replace(/^\d+\s*/, '')}
            {verifiedDocuments.length === 0 && ' — لا توجد وثائق'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
            disabled={!canUpload || isUploading}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!canUpload || isUploading}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جارٍ الرفع...
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

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('search')}
          className="pl-10 bg-[#1a1a2e] border-purple-500/30 text-white placeholder:text-gray-500"
        />
      </div>

      {/* Documents list */}
      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#1a1a2e] border border-purple-500/30 flex items-center justify-center mb-4">
            <FileText className="w-10 h-10 text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('noDocuments')}</h3>
          <p className="text-gray-400 mb-6">ارفع وثيقة PDF للبدء</p>
          {canUpload && (
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500"
            >
              <Upload className="w-4 h-4 mr-2" />
              رفع أول وثيقة
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                doc.status === 'verified'
                  ? 'bg-[#1a1a2e] border-purple-500/20 hover:border-purple-500/40'
                  : 'bg-red-900/10 border-red-500/20 hover:border-red-500/30'
              }`}
            >
              {/* Icon */}
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                doc.status === 'verified'
                  ? 'bg-gradient-to-br from-red-500 to-red-600'
                  : 'bg-gray-700'
              }`}>
                <FileText className="w-6 h-6 text-white" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-white font-medium truncate">{doc.name}</h4>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-gray-400 text-xs">{doc.size}</span>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-gray-400 text-xs">{formatDate(doc.verifiedAt)}</span>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className={`text-xs flex items-center gap-1 ${
                    doc.status === 'verified' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {doc.status === 'verified'
                      ? <><CheckCircle className="w-3 h-3" /> موثق</>
                      : <><XCircle className="w-3 h-3" /> مرفوض</>
                    }
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {doc.status === 'verified' && (
                  <button
                    onClick={() => downloadDocument(doc)}
                    className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors group"
                    title="تحميل الملف"
                  >
                    <Download className="w-5 h-5 text-gray-400 group-hover:text-purple-400" />
                  </button>
                )}
                {doc.fileUrl && (
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors group"
                    title="فتح الملف"
                  >
                    <Eye className="w-5 h-5 text-gray-400 group-hover:text-purple-400" />
                  </a>
                )}
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors group"
                  title="حذف الملف"
                >
                  <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
