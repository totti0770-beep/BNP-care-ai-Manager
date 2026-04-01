import React, { createContext, useContext, useState, useCallback } from 'react';

interface AuditLogEntry {
  id: string;
  timestamp: Date;
  sessionId: string;
  userId: string;
  action: 'query' | 'response' | 'document_verified' | 'document_rejected' | 'permission_changed' | 'login' | 'logout';
  details: {
    query?: string;
    response?: string;
    sourceDocument?: string;
    pageNumber?: number;
    cosineSimilarity?: number;
    confidenceLevel?: number;
    rejectionReason?: string;
    metadata?: Record<string, unknown>;
  };
}

interface AuditLogContextType {
  logs: AuditLogEntry[];
  addLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;
  getLogsBySession: (sessionId: string) => AuditLogEntry[];
  getLogsByUser: (userId: string) => AuditLogEntry[];
  getLogsByAction: (action: AuditLogEntry['action']) => AuditLogEntry[];
  exportLogs: () => string;
  clearLogs: () => void;
}

const AuditLogContext = createContext<AuditLogContextType | undefined>(undefined);

export const AuditLogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  const addLog = useCallback((entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
    const newLog: AuditLogEntry = {
      ...entry,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setLogs(prev => [newLog, ...prev]);
  }, []);

  const getLogsBySession = useCallback((sessionId: string): AuditLogEntry[] => {
    return logs.filter(log => log.sessionId === sessionId);
  }, [logs]);

  const getLogsByUser = useCallback((userId: string): AuditLogEntry[] => {
    return logs.filter(log => log.userId === userId);
  }, [logs]);

  const getLogsByAction = useCallback((action: AuditLogEntry['action']): AuditLogEntry[] => {
    return logs.filter(log => log.action === action);
  }, [logs]);

  const exportLogs = useCallback((): string => {
    return JSON.stringify(logs, null, 2);
  }, [logs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <AuditLogContext.Provider
      value={{
        logs,
        addLog,
        getLogsBySession,
        getLogsByUser,
        getLogsByAction,
        exportLogs,
        clearLogs,
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
