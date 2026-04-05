import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import SHA256 from 'crypto-js/sha256';

interface OfficialSource {
  id: string;
  name: string;
  publicKey: string;
  isActive: boolean;
}

export interface VerifiedDocument {
  id: string;
  name: string;
  size: string;
  sourceId: string;
  checksum: string;
  signature: string;
  verifiedAt: Date;
  status: 'verified' | 'rejected';
  rejectionReason?: string;
  fileUrl?: string;
  fileObject?: File;
}

interface DocumentVerificationContextType {
  officialSources: OfficialSource[];
  verifiedDocuments: VerifiedDocument[];
  addOfficialSource: (source: Omit<OfficialSource, 'id'>) => void;
  removeOfficialSource: (id: string) => void;
  verifyDocument: (file: File, signature?: string) => Promise<VerifiedDocument | null>;
  removeDocument: (id: string) => void;
  calculateChecksum: (file: File) => Promise<string>;
  isSourceWhitelisted: (sourceId: string) => boolean;
  downloadDocument: (doc: VerifiedDocument) => void;
}

const DocumentVerificationContext = createContext<DocumentVerificationContextType | undefined>(undefined);

const DEMO_SOURCES: OfficialSource[] = [
  { id: '1', name: 'Saudi Ministry of Health', publicKey: 'MOH-RSA-2048-PUBLIC-KEY', isActive: true },
  { id: '2', name: 'American Nurses Association', publicKey: 'ANA-Ed25519-PUBLIC-KEY', isActive: true },
  { id: '3', name: 'WHO Guidelines', publicKey: 'WHO-RSA-2048-PUBLIC-KEY', isActive: true },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const DocumentVerificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [officialSources, setOfficialSources] = useState<OfficialSource[]>(DEMO_SOURCES);
  const [verifiedDocuments, setVerifiedDocuments] = useState<VerifiedDocument[]>([]);

  const calculateChecksum = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const checksum = SHA256(content).toString();
        resolve(checksum);
      };
      reader.readAsBinaryString(file);
    });
  }, []);

  const isSourceWhitelisted = useCallback((sourceId: string): boolean => {
    return officialSources.some(s => s.id === sourceId && s.isActive);
  }, [officialSources]);

  const verifyDocument = useCallback(async (file: File, signature: string = ''): Promise<VerifiedDocument | null> => {
    const checksum = await calculateChecksum(file);
    const sourceId = '1';
    const isWhitelisted = isSourceWhitelisted(sourceId);
    const fileUrl = URL.createObjectURL(file);

    const verifiedDoc: VerifiedDocument = {
      id: Date.now().toString(),
      name: file.name,
      size: formatFileSize(file.size),
      sourceId,
      checksum,
      signature,
      verifiedAt: new Date(),
      status: isWhitelisted ? 'verified' : 'rejected',
      rejectionReason: !isWhitelisted ? 'Source not in whitelist' : undefined,
      fileUrl,
      fileObject: file,
    };

    setVerifiedDocuments(prev => [...prev, verifiedDoc]);

    if (verifiedDoc.status === 'verified') {
      toast.success(t('documentVerified'));
    } else {
      toast.error(`${t('documentRejected')}: ${verifiedDoc.rejectionReason}`);
    }

    return verifiedDoc.status === 'verified' ? verifiedDoc : null;
  }, [calculateChecksum, isSourceWhitelisted, t]);

  const removeDocument = useCallback((id: string) => {
    setVerifiedDocuments(prev => {
      const doc = prev.find(d => d.id === id);
      if (doc?.fileUrl) URL.revokeObjectURL(doc.fileUrl);
      return prev.filter(d => d.id !== id);
    });
  }, []);

  const downloadDocument = useCallback((doc: VerifiedDocument) => {
    if (!doc.fileUrl) {
      toast.error('File not available for download');
      return;
    }
    const a = document.createElement('a');
    a.href = doc.fileUrl;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Downloading: ${doc.name}`);
  }, []);

  const addOfficialSource = useCallback((source: Omit<OfficialSource, 'id'>) => {
    setOfficialSources(prev => [...prev, { ...source, id: Date.now().toString() }]);
    toast.success(t('sourceAdded'));
  }, [t]);

  const removeOfficialSource = useCallback((id: string) => {
    setOfficialSources(prev => prev.filter(s => s.id !== id));
    toast.success(t('sourceRemoved'));
  }, [t]);

  return (
    <DocumentVerificationContext.Provider
      value={{
        officialSources,
        verifiedDocuments,
        addOfficialSource,
        removeOfficialSource,
        verifyDocument,
        removeDocument,
        calculateChecksum,
        isSourceWhitelisted,
        downloadDocument,
      }}
    >
      {children}
    </DocumentVerificationContext.Provider>
  );
};

export const useDocumentVerification = () => {
  const context = useContext(DocumentVerificationContext);
  if (context === undefined) {
    throw new Error('useDocumentVerification must be used within a DocumentVerificationProvider');
  }
  return context;
};
