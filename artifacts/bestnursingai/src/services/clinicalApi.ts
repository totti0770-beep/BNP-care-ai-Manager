/**
 * BNP Clinical AI Engine — API Client
 * Proxied via Vite: /bnp-api/* → http://localhost:8000/*
 *
 * Auto-authenticates on first call, caches JWT in sessionStorage.
 * All methods return null on network/auth failure so the UI can fall back gracefully.
 */

const BASE = "/bnp-api";

// Engine credentials — maps to the production admin account
const ENGINE_CREDS = { username: "clinicadmin", password: "Admin@123" };
const TOKEN_KEY = "bnp_engine_token";

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

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function authenticate(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ENGINE_CREDS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token: string = data.access_token;
    setToken(token);
    return token;
  } catch {
    return null;
  }
}

async function getAuthToken(): Promise<string | null> {
  return getToken() ?? authenticate();
}

async function authFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response | null> {
  let token = await getAuthToken();
  if (!token) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };

  let res = await fetch(`${BASE}${path}`, { ...init, headers });

  // Token expired — re-auth once
  if (res.status === 401) {
    clearToken();
    token = await authenticate();
    if (!token) return null;
    headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  }

  return res;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns null if the engine is unreachable. */
export async function checkHealth(): Promise<EngineHealth | null> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** Send a clinical query. Returns null on any failure. */
export async function sendQuery(
  question: string,
  patientWeightKg?: number
): Promise<EngineQueryResponse | null> {
  try {
    const res = await authFetch("/query/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        patient_weight_kg: patientWeightKg ?? null,
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
