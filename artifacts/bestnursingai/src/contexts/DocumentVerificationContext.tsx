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

interface VerifiedDocument {
  id: string;
  name: string;
  sourceId: string;
  checksum: string;
  signature: string;
  verifiedAt: Date;
  status: 'verified' | 'rejected';
  rejectionReason?: string;
}

interface DocumentVerificationContextType {
  officialSources: OfficialSource[];
  verifiedDocuments: VerifiedDocument[];
  addOfficialSource: (source: Omit<OfficialSource, 'id'>) => void;
  removeOfficialSource: (id: string) => void;
  verifyDocument: (file: File, signature: string) => Promise<VerifiedDocument | null>;
  calculateChecksum: (file: File) => Promise<string>;
  isSourceWhitelisted: (sourceId: string) => boolean;
}

const DocumentVerificationContext = createContext<DocumentVerificationContextType | undefined>(undefined);

const DEMO_SOURCES: OfficialSource[] = [
  {
    id: '1',
    name: 'Saudi Ministry of Health',
    publicKey: 'MOH-RSA-2048-PUBLIC-KEY',
    isActive: true,
  },
  {
    id: '2',
    name: 'American Nurses Association',
    publicKey: 'ANA-Ed25519-PUBLIC-KEY',
    isActive: true,
  },
  {
    id: '3',
    name: 'WHO Guidelines',
    publicKey: 'WHO-RSA-2048-PUBLIC-KEY',
    isActive: true,
  },
];

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

  const verifyDocument = useCallback(async (file: File, signature: string): Promise<VerifiedDocument | null> => {
    const checksum = await calculateChecksum(file);
    const isSignatureValid = signature.length > 0;
    const sourceId = '1';
    const isWhitelisted = isSourceWhitelisted(sourceId);

    const verifiedDoc: VerifiedDocument = {
      id: Date.now().toString(),
      name: file.name,
      sourceId,
      checksum,
      signature,
      verifiedAt: new Date(),
      status: isSignatureValid && isWhitelisted ? 'verified' : 'rejected',
      rejectionReason: !isSignatureValid
        ? 'Invalid digital signature'
        : !isWhitelisted
        ? 'Source not in whitelist'
        : undefined,
    };

    setVerifiedDocuments(prev => [...prev, verifiedDoc]);

    if (verifiedDoc.status === 'verified') {
      toast.success(t('documentVerified'));
    } else {
      toast.error(`${t('documentRejected')}: ${verifiedDoc.rejectionReason}`);
    }

    return verifiedDoc.status === 'verified' ? verifiedDoc : null;
  }, [calculateChecksum, isSourceWhitelisted, t]);

  const addOfficialSource = useCallback((source: Omit<OfficialSource, 'id'>) => {
    const newSource: OfficialSource = {
      ...source,
      id: Date.now().toString(),
    };
    setOfficialSources(prev => [...prev, newSource]);
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
        calculateChecksum,
        isSourceWhitelisted,
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
