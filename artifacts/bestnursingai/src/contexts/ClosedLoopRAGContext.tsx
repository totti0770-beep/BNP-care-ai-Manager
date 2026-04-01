import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuditLog } from './AuditLogContext';
import { useAuth } from './AuthContext';

interface VectorDocument {
  id: string;
  content: string;
  sourceId: string;
  sourceName: string;
  pageNumber: number;
  isOfficialOnly: boolean;
  embedding?: number[];
}

interface SearchResult {
  document: VectorDocument;
  similarity: number;
}

interface RAGResponse {
  answer: string;
  sources: {
    documentName: string;
    pageNumber: number;
    similarity: number;
  }[];
  confidenceLevel: number;
  sessionId: string;
  rejected: boolean;
  rejectionReason?: string;
}

interface ClosedLoopRAGContextType {
  documents: VectorDocument[];
  confidenceThreshold: number;
  setConfidenceThreshold: (threshold: number) => void;
  addDocument: (doc: Omit<VectorDocument, 'id'>) => void;
  removeDocument: (id: string) => void;
  searchDocuments: (query: string, topK?: number) => SearchResult[];
  generateResponse: (query: string) => RAGResponse;
  getDocumentById: (id: string) => VectorDocument | undefined;
}

const ClosedLoopRAGContext = createContext<ClosedLoopRAGContextType | undefined>(undefined);

const DEMO_DOCUMENTS: VectorDocument[] = [
  {
    id: '1',
    content: 'Nursing Protocol for Medication Administration: Verify patient identity using two identifiers before administering any medication.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health - Nursing Guidelines',
    pageNumber: 15,
    isOfficialOnly: true,
  },
  {
    id: '2',
    content: 'Patient Safety Standards: All clinical staff must perform hand hygiene before and after patient contact. Use alcohol-based sanitizer or soap and water.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health - Patient Safety',
    pageNumber: 8,
    isOfficialOnly: true,
  },
  {
    id: '3',
    content: 'Critical Care Nursing: Monitor vital signs every 15 minutes for ICU patients. Document any changes immediately in the electronic health record.',
    sourceId: '2',
    sourceName: 'American Nurses Association - Critical Care',
    pageNumber: 42,
    isOfficialOnly: true,
  },
  {
    id: '4',
    content: 'WHO Guidelines for Infection Prevention: Standard precautions should be applied to all patients regardless of their diagnosis or presumed infection status.',
    sourceId: '3',
    sourceName: 'WHO Infection Prevention Guidelines',
    pageNumber: 5,
    isOfficialOnly: true,
  },
];

const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const generateEmbedding = (text: string): number[] => {
  const vector = new Array(128).fill(0);
  for (let i = 0; i < text.length; i++) {
    vector[i % 128] += text.charCodeAt(i) / 1000;
  }
  return vector;
};

export const ClosedLoopRAGProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { addLog } = useAuditLog();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<VectorDocument[]>(DEMO_DOCUMENTS);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);

  const addDocument = useCallback((doc: Omit<VectorDocument, 'id'>) => {
    const newDoc: VectorDocument = {
      ...doc,
      id: Date.now().toString(),
      embedding: generateEmbedding(doc.content),
    };
    setDocuments(prev => [...prev, newDoc]);
    toast.success(t('documentAddedToKnowledgeBase'));
  }, [t]);

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    toast.success(t('documentRemovedFromKnowledgeBase'));
  }, [t]);

  const getDocumentById = useCallback((id: string): VectorDocument | undefined => {
    return documents.find(d => d.id === id);
  }, [documents]);

  const searchDocuments = useCallback((query: string, topK: number = 5): SearchResult[] => {
    const queryEmbedding = generateEmbedding(query);

    const results = documents
      .filter(doc => doc.isOfficialOnly)
      .map(doc => ({
        document: doc,
        similarity: cosineSimilarity(queryEmbedding, doc.embedding || generateEmbedding(doc.content)),
      }))
      .filter(result => result.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return results;
  }, [documents]);

  const generateResponse = useCallback((query: string): RAGResponse => {
    const sessionId = `session-${Date.now()}`;

    addLog({
      sessionId,
      userId: user?.id || 'anonymous',
      action: 'query',
      details: { query },
    });

    const searchResults = searchDocuments(query, 5);

    if (searchResults.length === 0 || searchResults[0].similarity < confidenceThreshold) {
      const rejectionReason = t('insufficientContext');

      addLog({
        sessionId,
        userId: user?.id || 'anonymous',
        action: 'response',
        details: {
          query,
          rejectionReason,
          confidenceLevel: searchResults[0]?.similarity || 0,
        },
      });

      return {
        answer: '',
        sources: [],
        confidenceLevel: searchResults[0]?.similarity || 0,
        sessionId,
        rejected: true,
        rejectionReason,
      };
    }

    const topResult = searchResults[0];
    const answer = `Based on ${topResult.document.sourceName} (Page ${topResult.document.pageNumber}): ${topResult.document.content}`;

    const response: RAGResponse = {
      answer,
      sources: searchResults.map(r => ({
        documentName: r.document.sourceName,
        pageNumber: r.document.pageNumber,
        similarity: r.similarity,
      })),
      confidenceLevel: topResult.similarity,
      sessionId,
      rejected: false,
    };

    addLog({
      sessionId,
      userId: user?.id || 'anonymous',
      action: 'response',
      details: {
        query,
        response: answer,
        sourceDocument: topResult.document.sourceName,
        pageNumber: topResult.document.pageNumber,
        cosineSimilarity: topResult.similarity,
        confidenceLevel: topResult.similarity,
      },
    });

    return response;
  }, [searchDocuments, confidenceThreshold, addLog, user, t]);

  return (
    <ClosedLoopRAGContext.Provider
      value={{
        documents,
        confidenceThreshold,
        setConfidenceThreshold,
        addDocument,
        removeDocument,
        searchDocuments,
        generateResponse,
        getDocumentById,
      }}
    >
      {children}
    </ClosedLoopRAGContext.Provider>
  );
};

export const useClosedLoopRAG = () => {
  const context = useContext(ClosedLoopRAGContext);
  if (context === undefined) {
    throw new Error('useClosedLoopRAG must be used within a ClosedLoopRAGProvider');
  }
  return context;
};
