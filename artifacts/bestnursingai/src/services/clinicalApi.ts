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

export interface FormularyCounts {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

export interface EngineHealth {
  status: string;
  service: string;
  version: string;
  indexed_chunks: number;
  openai_enabled: boolean;
  database: boolean;
  drug_db_version?: string;
  drug_db_review_status?: string;
  formulary?: FormularyCounts;
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

/** The endpoint's hard per-request ceiling. Asking for more is a 422. */
export const AUDIT_PAGE_MAX = 500;

/**
 * One page of the audit log, newest first.
 *
 * Admin-only. Returns [] when unavailable or when the caller is not an admin —
 * the server, not the client, decides who may read this.
 */
export async function listAuditLog(
  limit = 200,
  offset = 0
): Promise<EngineAuditEntry[]> {
  try {
    const res = await authFetch(
      `/auth/audit-log?limit=${limit}&offset=${offset}`
    );
    if (!res || !res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Every audit row, by walking the pages.
 *
 * The screen shows a recent window because rendering the whole trail is not
 * useful, but an export that quietly stopped at that window would be a
 * compliance artefact missing the rows an auditor came for. `cap` is a
 * runaway guard, and the caller is told when it was hit rather than being
 * handed a short file that looks complete.
 */
export async function fetchAllAuditLog(
  cap = 20_000
): Promise<{ rows: EngineAuditEntry[]; complete: boolean }> {
  const rows: EngineAuditEntry[] = [];

  while (rows.length < cap) {
    const page = await listAuditLog(AUDIT_PAGE_MAX, rows.length);
    rows.push(...page);
    if (page.length < AUDIT_PAGE_MAX) return { rows, complete: true };
  }

  return { rows, complete: false };
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

// ── Formulary ─────────────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface FormularyDrug {
  drug_id: string;
  generic_name: string;
  name_ar: string | null;
  unit: string;
  auto_calculate: boolean;
  dose_per_kg: string | number | null;
  adult_flat_min: string | number | null;
  adult_flat_max: string | number | null;
  adult_max_dose: string | number | null;
  adult_max_daily: string | number | null;
  pediatric_min_per_kg: string | number | null;
  pediatric_max_per_kg: string | number | null;
  overdose_threshold_absolute: string | number | null;
  overdose_threshold_per_kg: string | number | null;
  frequency: string | null;
  route: string | null;
  antidote: string | null;
  reference_regimen: string | null;
  high_risk: boolean;
  source_name: string;
  source_edition: string | null;
  source_ref: string | null;
  imported_from_file: string | null;
  imported_at: string | null;
  imported_by: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewer_license: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  version: number;
}

export interface FormularyListing {
  summary: FormularyCounts;
  drugs: FormularyDrug[];
}

export interface ImportRowOutcome {
  row: number;
  drug: string;
  action: "inserted" | "updated" | "unchanged" | "rejected";
  reason: string | null;
  changed_fields: string[];
}

export interface ImportReport {
  file_name: string;
  sha256: string;
  dry_run: boolean;
  already_imported: boolean;
  unknown_columns: string[];
  missing_columns: string[];
  summary: {
    total: number;
    inserted: number;
    updated: number;
    unchanged: number;
    rejected: number;
  };
  rows: ImportRowOutcome[];
}

/** Admin-only. Returns null when unavailable or the caller is not an admin. */
/**
 * One page of the review queue, plus the counts across the whole formulary.
 *
 * `limit` and `offset` are always sent. The endpoint defaults to 200 rows and
 * says nothing about the rest, so omitting them silently truncated a 627-drug
 * formulary to its first 200 — and a pharmacist scrolling to the bottom of a
 * `pending` queue would have concluded the review was finished.
 */
export async function listFormulary(
  status?: ReviewStatus,
  page: { limit: number; offset: number } = { limit: 100, offset: 0 }
): Promise<FormularyListing | null> {
  try {
    const params = new URLSearchParams({
      limit: String(page.limit),
      offset: String(page.offset),
    });
    if (status) params.set("status", status);
    const res = await authFetch(`/formulary?${params}`);
    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Upload a formulary file. `dryRun` defaults to true: the operator reads the
 * rejection report before anything is written.
 *
 * Returns the report, or a string describing why the file could not be read at
 * all. Never throws — a failed import must not look like a successful one.
 */
export async function importFormulary(
  file: File,
  options: { mapping?: File; dryRun?: boolean } = {}
): Promise<ImportReport | { error: string }> {
  const form = new FormData();
  form.append("file", file);
  if (options.mapping) form.append("mapping", options.mapping);
  form.append("dry_run", String(options.dryRun ?? true));

  try {
    const res = await authFetch("/formulary/import", {
      method: "POST",
      body: form,
    });
    if (!res) return { error: "The engine is unreachable." };
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: body?.detail ?? `Import failed (${res.status}).` };
    }
    return body as ImportReport;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed." };
  }
}

export interface ReviewDecision {
  decision: ReviewStatus;
  reviewed_by: string;
  reviewer_license: string;
  note?: string;
  source_name?: string;
  source_edition?: string;
  source_ref?: string;
}

/** Record a pharmacist's decision on one drug. Returns null on failure. */
export async function reviewFormularyDrug(
  drugId: string,
  decision: ReviewDecision
): Promise<{ drug: string; review_status: ReviewStatus; summary: FormularyCounts } | null> {
  try {
    const res = await authFetch(`/formulary/${drugId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decision),
    });
    if (!res || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** The URL of the sign-off packet. A plain link so the browser downloads it. */
export function reviewPacketUrl(status: ReviewStatus | "all" = "pending"): string {
  return `${BASE}/formulary/review-packet.xlsx?status=${status}`;
}
