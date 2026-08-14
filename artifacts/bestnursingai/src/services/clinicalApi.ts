/**
 * BNP Clinical AI Engine — API Client
 *
 * Requests go to /bnp-api, which the API server reverse-proxies to the engine.
 * The API server authenticates each request as the signed-in user from the
 * server-side session, so no engine credential or token exists in the browser
 * and the engine's audit log records the individual nurse.
 *
 * All methods return null on failure. Callers must surface that as an error —
 * there is deliberately no local fallback that answers clinical questions.
 */

const BASE = "/bnp-api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngineQueryResponse {
  session_id: string;
  query_type: "drug" | "protocol" | "general";
  answer: string;
  dose?: string | null;
  indication?: string | null;
  safety_warning?: string | null;
  safety_alert: boolean;
  confidence_label: "High" | "Medium" | "Low";
  safety_alerts?: string[];
  contraindications?: string[];
  interactions?: string[];
  nursing_notes?: string[];
  citations: Array<{
    document_name: string;
    page_number: number;
    relevance_score: number;
    excerpt: string;
  }>;
  confidence: number;
  rejected: boolean;
  rejection_reason?: string | null;
  processing_time_ms: number;
  context_validation?: string | null;
}

export interface EngineDocument {
  id: string;
  filename: string;
  upload_date: string;
  chunk_count: number;
  uploaded_by: string;
}

export interface EngineHealth {
  status: string;
  service: string;
  version: string;
  indexed_chunks: number;
  openai_enabled: boolean;
  database: boolean;
}

// ── Transport ─────────────────────────────────────────────────────────────────

/** The session cookie is the only credential; the gateway supplies the rest. */
async function authFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response | null> {
  return fetch(`${BASE}${path}`, { ...init, credentials: "include" });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns null if the engine is unreachable or reports itself unhealthy.
 * A degraded engine (for example, one that cannot reach its embedding model)
 * reports status !== "ok" and is treated as unavailable.
 */
export async function checkHealth(): Promise<EngineHealth | null> {
  try {
    const res = await fetch(`${BASE}/health`, {
      credentials: "include",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const health: EngineHealth = await res.json();
    return health.status === "ok" ? health : null;
  } catch {
    return null;
  }
}

export interface QueryOptions {
  patientWeightKg?: number;
  drugName?: string;
  otherDrugs?: string[];
  conditions?: string[];
  age?: number;
}

/** Send a clinical query. Returns null on any failure. */
export async function sendQuery(
  question: string,
  opts: QueryOptions = {}
): Promise<EngineQueryResponse | null> {
  try {
    const res = await authFetch("/query/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        patient_weight_kg: opts.patientWeightKg ?? null,
        drug_name: opts.drugName ?? null,
        other_drugs: opts.otherDrugs ?? [],
        conditions: opts.conditions ?? [],
        age: opts.age ?? null,
        top_k: 5,
      }),
    });
    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Upload a PDF to the engine. Returns result or null on failure. */
export async function uploadDocument(
  file: File
): Promise<{ document_id: string; filename: string; chunks_indexed: number } | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await authFetch("/documents/upload", { method: "POST", body: form });
    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** List all documents indexed in the engine. */
export async function listDocuments(): Promise<EngineDocument[]> {
  try {
    const res = await authFetch("/documents/");
    if (!res || !res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Delete a document from the engine (admin only). */
export async function deleteDocument(documentId: string): Promise<boolean> {
  try {
    const res = await authFetch(`/documents/${documentId}`, { method: "DELETE" });
    return res?.ok ?? false;
  } catch {
    return false;
  }
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface EngineAuditEntry {
  id: number;
  session_id: string;
  user_id: number | null;
  username: string | null;
  query: string;
  query_type: string | null;
  confidence: number;
  confidence_label: string | null;
  rejected: boolean;
  rejection_reason: string | null;
  answer_text: string | null;
  answer_hash: string | null;
  dose_text: string | null;
  citations: Array<{
    document_name: string;
    page_number: number;
    relevance_score: number;
  }> | null;
  safety_alerts: string[] | null;
  client_ip: string | null;
  model: string | null;
  drug_db_version: string | null;
  timestamp: string;
}

/**
 * Admin-only. Returns [] when unavailable or when the caller is not an admin —
 * the server, not the client, decides who may read this.
 */
export async function listAuditLog(
  limit = 200
): Promise<EngineAuditEntry[]> {
  try {
    const res = await authFetch(`/auth/audit-log?limit=${limit}`);
    if (!res || !res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export interface AuditChainStatus {
  valid: boolean;
  reason?: string;
  broken_at_id?: number;
  rows_checked: number;
  unchained_legacy_rows?: number;
}

/**
 * Verify that the audit trail has not been altered since it was written.
 * Admin-only; returns null when unavailable.
 */
export async function verifyAuditChain(): Promise<AuditChainStatus | null> {
  try {
    const res = await authFetch("/auth/audit-log/verify");
    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
