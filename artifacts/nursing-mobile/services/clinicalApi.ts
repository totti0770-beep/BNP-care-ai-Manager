/**
 * Nursing AI Mobile — Clinical Engine API Client
 *
 * Routes through the BestNursingAI Vite proxy (/bnp-api → localhost:8000).
 * Accessible via: https://{REPLIT_DEV_DOMAIN}/bnp-api
 * Falls back to direct localhost on native development.
 */

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "localhost";
const BASE = `https://${DOMAIN}/bnp-api`;

const ENGINE_CREDS = { username: "clinicadmin", password: "Admin@123" };
const TOKEN_KEY = "bnp_mobile_token";

let cachedToken: string | null = null;

async function storeToken(token: string) {
  try {
    const { default: AsyncStorage } = await import(
      "@react-native-async-storage/async-storage"
    );
    await AsyncStorage.setItem(TOKEN_KEY, token);
    cachedToken = token;
  } catch {
    cachedToken = token;
  }
}

async function loadToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const { default: AsyncStorage } = await import(
      "@react-native-async-storage/async-storage"
    );
    const t = await AsyncStorage.getItem(TOKEN_KEY);
    if (t) cachedToken = t;
    return t;
  } catch {
    return null;
  }
}

async function clearToken() {
  cachedToken = null;
  try {
    const { default: AsyncStorage } = await import(
      "@react-native-async-storage/async-storage"
    );
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {}
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
    await storeToken(token);
    return token;
  } catch {
    return null;
  }
}

async function getAuthToken(): Promise<string | null> {
  const stored = await loadToken();
  return stored ?? authenticate();
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

  if (res.status === 401) {
    await clearToken();
    token = await authenticate();
    if (!token) return null;
    headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${BASE}${path}`, { ...init, headers });
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
