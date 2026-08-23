import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  fetchAllAuditLog,
  listAuditLog,
  verifyAuditChain,
  type AuditChainStatus,
  type EngineAuditEntry,
} from '@/services/clinicalApi';

/**
 * Read-only view of the clinical engine's audit log.
 *
 * This was previously an in-memory list that the browser appended to and that
 * vanished on refresh — it recorded nothing durable and nothing the server
 * could attest to. The authoritative log lives in the engine, is written before
 * any clinical answer is returned, and is fetched here.
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  sessionId: string;
  username: string;
  query: string;
  queryType: string | null;
  answer: string | null;
  answerHash: string | null;
  dose: string | null;
  confidence: number;
  confidenceLabel: string | null;
  rejected: boolean;
  rejectionReason: string | null;
  safetyAlerts: string[];
  citations: Array<{
    document_name: string;
    page_number: number;
    relevance_score: number;
  }>;
  clientIp: string | null;
  model: string | null;
  drugDbVersion: string | null;
}

interface AuditLogContextType {
  logs: AuditLogEntry[];
  isLoading: boolean;
  /** Whether the trail verifies as unaltered. null while unknown. */
  chainStatus: AuditChainStatus | null;
  refresh: () => Promise<void>;
  /**
   * True when the screen is showing a window rather than the whole trail, so
   * the UI can say so. An auditor filtering for a refusal that fell outside
   * the window must not read an empty result as "there were none".
   */
  truncated: boolean;
  /** How many rows the screen holds at most. */
  windowSize: number;
  /**
   * The complete trail as JSON, fetched page by page — not the window. Returns
   * null if it could not be assembled, so the caller reports a failure instead
   * of writing a short file that looks whole.
   */
  exportLogs: () => Promise<string | null>;
}

const AuditLogContext = createContext<AuditLogContextType | undefined>(undefined);

/**
 * How many of the most recent rows the screen holds. Rendering a hospital's
 * whole audit trail is neither useful nor fast; the export covers the rest.
 */
const WINDOW = 200;

function toEntry(row: EngineAuditEntry): AuditLogEntry {
  return {
    id: String(row.id),
    timestamp: new Date(row.timestamp),
    sessionId: row.session_id,
    username: row.username ?? 'unknown',
    query: row.query,
    queryType: row.query_type,
    answer: row.answer_text,
    answerHash: row.answer_hash,
    dose: row.dose_text,
    confidence: row.confidence,
    confidenceLabel: row.confidence_label,
    rejected: row.rejected,
    rejectionReason: row.rejection_reason,
    safetyAlerts: row.safety_alerts ?? [],
    citations: row.citations ?? [],
    clientIp: row.client_ip,
    model: row.model,
    drugDbVersion: row.drug_db_version,
  };
}

export const AuditLogProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chainStatus, setChainStatus] = useState<AuditChainStatus | null>(null);
  const [truncated, setTruncated] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const [rows, chain] = await Promise.all([
      listAuditLog(WINDOW),
      verifyAuditChain(),
    ]);
    setLogs(rows.map(toEntry));
    // A full page means there is at least one more row the screen is not
    // showing. Anything shorter is the whole trail.
    setTruncated(rows.length === WINDOW);
    setChainStatus(chain);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Exports the whole trail, not the window on screen. There is no
  // client-side delete either: the audit log is not the client's to erase.
  const exportLogs = useCallback(async () => {
    const { rows, complete } = await fetchAllAuditLog();
    if (!complete) return null;
    return JSON.stringify(rows.map(toEntry), null, 2);
  }, []);

  return (
    <AuditLogContext.Provider
      value={{
        logs,
        isLoading,
        chainStatus,
        refresh,
        exportLogs,
        truncated,
        windowSize: WINDOW,
      }}
    >
      {children}
    </AuditLogContext.Provider>
  );
};

export const useAuditLog = () => {
  const context = useContext(AuditLogContext);
  if (context === undefined) {
    throw new Error('useAuditLog must be used within an AuditLogProvider');
  }
  return context;
};
