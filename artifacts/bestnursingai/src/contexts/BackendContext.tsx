/**
 * BackendContext — bridges the BestNursingAI web app to the Clinical AI Engine.
 *
 * On mount it checks engine health. If the engine is available it:
 *  - Provides sendQuery() that calls the real API and maps to BNPResponse format
 *  - Provides uploadToEngine() for real PDF indexing
 *  - Provides engineDocuments list
 *
 * If the engine is unreachable all methods silently return null and the caller
 * falls back to the local ClosedLoopRAGContext.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import type { BNPResponse } from "@/contexts/ClosedLoopRAGContext";
import {
  checkHealth,
  sendQuery as apiQuery,
  uploadDocument as apiUpload,
  listDocuments as apiListDocs,
  deleteDocument as apiDeleteDoc,
  type EngineDocument,
} from "@/services/clinicalApi";

// ── Weight extraction helper (mirrors engine logic) ───────────────────────────
function extractWeight(question: string): number | undefined {
  const m = question.match(/(\d+(?:\.\d+)?)\s*kg/i);
  return m ? parseFloat(m[1]) : undefined;
}

// ── Map engine response → local BNPResponse ───────────────────────────────────
function mapToBNP(engine: Awaited<ReturnType<typeof apiQuery>>): BNPResponse {
  if (!engine) {
    return {
      answer: "Engine unavailable — falling back to local knowledge base.",
      sources: [],
      confidenceLevel: 0,
      queryType: "general",
      safetyAlert: false,
      notFound: true,
      rejected: false,
    };
  }
  if (engine.rejected) {
    return {
      answer: engine.rejection_reason ?? "Query rejected by safety layer.",
      sources: [],
      confidenceLevel: engine.confidence,
      queryType: mapQueryType(engine.query_type),
      safetyAlert: false,
      notFound: false,
      rejected: true,
      rejectionReason: engine.rejection_reason ?? undefined,
    };
  }
  const notFound =
    !engine.answer ||
    engine.answer.toLowerCase().includes("not found in provided medical sources");

  return {
    answer: engine.answer,
    dose: engine.dose ?? undefined,
    indication: engine.indication ?? undefined,
    safetyWarning: engine.safety_warning ?? undefined,
    safetyAlert: engine.safety_alert,
    confidenceLabel: engine.confidence_label ?? "Low",
    safetyAlerts: engine.safety_alerts?.length ? engine.safety_alerts : undefined,
    contraindications: engine.contraindications?.length ? engine.contraindications : undefined,
    interactions: engine.interactions?.length ? engine.interactions : undefined,
    nursingNotes: engine.nursing_notes?.length ? engine.nursing_notes : undefined,
    sources: engine.citations.map((c) => ({
      documentName: c.document_name,
      pageNumber: c.page_number,
      similarity: c.relevance_score,
      excerpt: c.excerpt,
    })),
    confidenceLevel: engine.confidence,
    queryType: mapQueryType(engine.query_type),
    notFound,
    rejected: false,
    contextValidation: engine.context_validation ?? undefined,
  };
}

function mapQueryType(t: string): "medication" | "protocol" | "general" {
  if (t === "drug") return "medication";
  if (t === "protocol") return "protocol";
  return "general";
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface BackendContextType {
  isEngineAvailable: boolean;
  isChecking: boolean;
  indexedChunks: number;
  openaiEnabled: boolean;
  engineDocuments: EngineDocument[];
  sendQuery: (question: string) => Promise<BNPResponse | null>;
  uploadToEngine: (file: File) => Promise<{ filename: string; chunks: number } | null>;
  removeFromEngine: (documentId: string) => Promise<boolean>;
  refreshDocuments: () => Promise<void>;
}

const BackendContext = createContext<BackendContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const BackendProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isEngineAvailable, setIsEngineAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [indexedChunks, setIndexedChunks] = useState(0);
  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [engineDocuments, setEngineDocuments] = useState<EngineDocument[]>([]);
  const initDone = useRef(false);

  const refreshDocuments = useCallback(async () => {
    const docs = await apiListDocs();
    setEngineDocuments(docs);
  }, []);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    (async () => {
      setIsChecking(true);
      const health = await checkHealth();
      if (health && health.status === "ok") {
        setIsEngineAvailable(true);
        setIndexedChunks(health.indexed_chunks);
        setOpenaiEnabled(health.openai_enabled);
        await refreshDocuments();
      }
      setIsChecking(false);
    })();
  }, [refreshDocuments]);

  const sendQuery = useCallback(
    async (question: string): Promise<BNPResponse | null> => {
      if (!isEngineAvailable) return null;
      const weight = extractWeight(question);
      const result = await apiQuery(question, weight);
      return mapToBNP(result);
    },
    [isEngineAvailable]
  );

  const uploadToEngine = useCallback(
    async (file: File): Promise<{ filename: string; chunks: number } | null> => {
      if (!isEngineAvailable) return null;
      const result = await apiUpload(file);
      if (!result) return null;
      setIndexedChunks((prev) => prev + result.chunks_indexed);
      await refreshDocuments();
      return { filename: result.filename, chunks: result.chunks_indexed };
    },
    [isEngineAvailable, refreshDocuments]
  );

  const removeFromEngine = useCallback(
    async (documentId: string): Promise<boolean> => {
      if (!isEngineAvailable) return false;
      const ok = await apiDeleteDoc(documentId);
      if (ok) await refreshDocuments();
      return ok;
    },
    [isEngineAvailable, refreshDocuments]
  );

  return (
    <BackendContext.Provider
      value={{
        isEngineAvailable,
        isChecking,
        indexedChunks,
        openaiEnabled,
        engineDocuments,
        sendQuery,
        uploadToEngine,
        removeFromEngine,
        refreshDocuments,
      }}
    >
      {children}
    </BackendContext.Provider>
  );
};

export const useBackend = (): BackendContextType => {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error("useBackend must be used within BackendProvider");
  return ctx;
};
