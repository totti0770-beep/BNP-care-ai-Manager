import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { listAuditLog, type EngineAuditEntry } from '@/services/clinicalApi';

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
  refresh: () => Promise<void>;
  exportLogs: () => string;
}

const AuditLogContext = createContext<AuditLogContextType | undefined>(undefined);

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

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const rows = await listAuditLog();
    setLogs(rows.map(toEntry));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Export reflects exactly what the server holds. There is no client-side
  // delete: the audit log is not the client's to erase.
  const exportLogs = useCallback(() => JSON.stringify(logs, null, 2), [logs]);

  return (
    <AuditLogContext.Provider value={{ logs, isLoading, refresh, exportLogs }}>
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
