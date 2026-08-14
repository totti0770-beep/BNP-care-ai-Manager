/**
 * Nursing AI Mobile — Clinical Engine API Client
 *
 * Requests go to /bnp-api on the API server, which reverse-proxies them to the
 * clinical engine and authenticates each one as the signed-in nurse. The only
 * credential the device holds is a session token in the keychain — there is no
 * shared engine account.
 */
import { API_ORIGIN, clearSessionToken, getSessionToken } from "./session";

const BASE = `${API_ORIGIN}/bnp-api`;

/** Returns null when there is no session, so callers can prompt for sign-in. */
async function authFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  // The session expired or was revoked server-side; force a fresh sign-in
  // rather than silently retrying with another identity.
  if (res.status === 401) {
    await clearSessionToken();
    return null;
  }

  return res;
}

export interface ClinicalQueryResponse {
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

// ── Drug Calculator result type ───────────────────────────────────────────────

export interface DrugCalcResult {
  answer: string;
  dose?: string;
  indication?: string;
  safetyAlert: boolean;
  confidenceLabel?: "High" | "Medium" | "Low";
  rejected: boolean;
  rejectionReason?: string;
  safetyAlerts: string[];
  contraindications: string[];
  nursingNotes: string[];
  contextValidation?: string;
  source?: string;
}

export async function calculateDrug(
  drugName: string,
  patientWeightKg?: number
): Promise<DrugCalcResult | null> {
  try {
    const question = patientWeightKg
      ? `What is the dose of ${drugName} for a patient weighing ${patientWeightKg} kg?`
      : `What is the dose and indication of ${drugName}?`;

    const res = await authFetch("/query/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        drug_name: drugName,
        patient_weight_kg: patientWeightKg ?? null,
        top_k: 5,
      }),
    });
    if (!res || !res.ok) return null;
    const data: ClinicalQueryResponse = await res.json();

    const topCitation = data.citations?.[0];

    return {
      answer: data.answer,
      dose: data.dose ?? undefined,
      indication: data.indication ?? undefined,
      safetyAlert: data.safety_alert,
      confidenceLabel: data.confidence_label,
      rejected: data.rejected,
      rejectionReason: data.rejection_reason ?? undefined,
      safetyAlerts: data.safety_alerts ?? [],
      contraindications: data.contraindications ?? [],
      nursingNotes: data.nursing_notes ?? [],
      contextValidation: data.context_validation ?? undefined,
      source: topCitation
        ? `${topCitation.document_name} — ص ${topCitation.page_number}`
        : undefined,
    };
  } catch {
    return null;
  }
}

export async function queryEngine(
  question: string,
  patientWeightKg?: number
): Promise<ClinicalQueryResponse | null> {
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

export async function checkEngineHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
