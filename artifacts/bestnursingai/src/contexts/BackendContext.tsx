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
import type { BNPResponse } from "@/types/bnp";
import {
  checkHealth,
  sendQuery as apiQuery,
  uploadDocument as apiUpload,
  listDocuments as apiListDocs,
  deleteDocument as apiDeleteDoc,
  type EngineDocument,
  type QueryOptions,
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
  /**
   * The engine can answer a clinical question: it has a corpus, embeddings and
   * a formulary. Gate clinical output on this, and nothing else.
   */
  isEngineAvailable: boolean;
  /**
   * The engine is up and answering HTTP, whether or not it is clinically ready.
   *
   * These were one flag, and that produced a deadlock: /health reports 503
   * `degraded` while `indexed_chunks == 0`, so a fresh deployment had uploads
   * disabled — and uploading is the only way to stop being at zero. The system
   * could not bootstrap its own corpus through its own interface, and the
   * upload screen failed silently while doing it.
   */
  isEngineReachable: boolean;
  /** Why the engine cannot answer clinically, verbatim from /health. */
  engineProblems: string[];
  isChecking: boolean;
  indexedChunks: number;
  openaiEnabled: boolean;
  engineDocuments: EngineDocument[];
  sendQuery: (question: string, opts?: QueryOptions) => Promise<BNPResponse | null>;
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
  const [isEngineReachable, setIsEngineReachable] = useState(false);
  const [engineProblems, setEngineProblems] = useState<string[]>([]);
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
      if (health) {
        // A body came back at all, so the engine is up and the gateway can
        // reach it — enough to list and upload documents.
        setIsEngineReachable(true);
        setIndexedChunks(health.indexed_chunks);
        setOpenaiEnabled(health.openai_enabled);
        setEngineProblems(health.problems ?? []);
        setIsEngineAvailable(health.status === "ok");
        await refreshDocuments();
      }
      setIsChecking(false);
    })();
  }, [refreshDocuments]);

  const sendQuery = useCallback(
    async (question: string, opts: QueryOptions = {}): Promise<BNPResponse | null> => {
      if (!isEngineAvailable) return null;
      const weight = opts.patientWeightKg ?? extractWeight(question);
      const result = await apiQuery(question, { ...opts, patientWeightKg: weight });
      return mapToBNP(result);
    },
    [isEngineAvailable]
  );

  const uploadToEngine = useCallback(
    async (file: File): Promise<{ filename: string; chunks: number } | null> => {
      // Reachable, not ready: indexing the first document is precisely what
      // moves the engine from degraded to ready, so gating this on readiness
      // is what made the corpus impossible to bootstrap.
      if (!isEngineReachable) return null;
      const result = await apiUpload(file);
      if (!result) return null;
      const chunks = indexedChunks + result.chunks_indexed;
      setIndexedChunks(chunks);
      // The engine may have just become able to answer. Re-read rather than
      // infer it, so the flag reflects the engine's own verdict.
      const health = await checkHealth();
      if (health) {
        setEngineProblems(health.problems ?? []);
        setIsEngineAvailable(health.status === "ok");
        setIndexedChunks(health.indexed_chunks);
      }
      await refreshDocuments();
      return { filename: result.filename, chunks: result.chunks_indexed };
    },
    [isEngineReachable, indexedChunks, refreshDocuments]
  );

  const removeFromEngine = useCallback(
    async (documentId: string): Promise<boolean> => {
      if (!isEngineReachable) return false;
      const ok = await apiDeleteDoc(documentId);
      if (ok) await refreshDocuments();
      return ok;
    },
    [isEngineReachable, refreshDocuments]
  );

  return (
    <BackendContext.Provider
      value={{
        isEngineAvailable,
        isEngineReachable,
        engineProblems,
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
