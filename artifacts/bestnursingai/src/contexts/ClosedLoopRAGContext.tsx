import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuditLog } from './AuditLogContext';
import { useAuth } from './AuthContext';

interface VectorDocument {
  id: string;
  content: string;
  sourceId: string;
  sourceName: string;
  pageNumber: number;
  isOfficialOnly: boolean;
  embedding?: number[];
}

interface SearchResult {
  document: VectorDocument;
  similarity: number;
}

export interface BNPResponse {
  answer: string;
  dose?: string;
  safetyWarning?: string;
  safetyAlert: boolean;
  sources: { documentName: string; pageNumber: number; similarity: number }[];
  confidenceLevel: number;
  sessionId: string;
  rejected: boolean;
  rejectionReason?: string;
  notFound: boolean;
}

interface ClosedLoopRAGContextType {
  documents: VectorDocument[];
  confidenceThreshold: number;
  setConfidenceThreshold: (threshold: number) => void;
  addDocument: (doc: Omit<VectorDocument, 'id'>) => void;
  removeDocument: (id: string) => void;
  searchDocuments: (query: string, topK?: number) => SearchResult[];
  generateResponse: (query: string) => BNPResponse;
  getDocumentById: (id: string) => VectorDocument | undefined;
}

const ClosedLoopRAGContext = createContext<ClosedLoopRAGContextType | undefined>(undefined);

// ── System identity ──────────────────────────────────────────────────────────
const SYSTEM_NAME = 'BNP Clinical AI Engine';

// ── Demo knowledge base ───────────────────────────────────────────────────────
const DEMO_DOCUMENTS: VectorDocument[] = [
  {
    id: '1',
    content: 'Medication Administration Protocol: Verify patient identity using two identifiers (full name + MRN) before administering any medication. Use the 10 Rights of Medication Administration. Document all administrations within 30 minutes.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health – Nursing Guidelines',
    pageNumber: 15,
    isOfficialOnly: true,
  },
  {
    id: '2',
    content: 'Patient Safety Standards: All clinical staff must perform hand hygiene using the WHO 5 Moments before and after patient contact. Use alcohol-based sanitizer (at least 60% ethanol) or soap and water for visibly soiled hands. Non-compliance must be reported.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health – Patient Safety',
    pageNumber: 8,
    isOfficialOnly: true,
  },
  {
    id: '3',
    content: 'Critical Care Nursing: Monitor vital signs every 15 minutes for ICU patients. Immediately document and report: HR >120 or <50 bpm, SBP <90 or >180 mmHg, SpO2 <92%, RR >30 or <8 breaths/min, Temperature >38.5°C or <36°C. Escalate using SBAR to the attending physician.',
    sourceId: '2',
    sourceName: 'American Nurses Association – Critical Care',
    pageNumber: 42,
    isOfficialOnly: true,
  },
  {
    id: '4',
    content: 'WHO Guidelines for Infection Prevention: Standard precautions (gloves, gown, mask, eye protection) must be applied to ALL patients regardless of diagnosis. Contact precautions required for MRSA, VRE, and C. difficile. Droplet precautions for influenza and COVID-19.',
    sourceId: '3',
    sourceName: 'WHO Infection Prevention Guidelines',
    pageNumber: 5,
    isOfficialOnly: true,
  },
  {
    id: '5',
    content: 'Paracetamol (Acetaminophen) Dosing: Adults: 500–1000 mg every 4–6 hours, maximum 4000 mg/day (3000 mg/day in elderly or hepatic impairment). Pediatric: 10–15 mg/kg every 4–6 hours, maximum 5 doses/24 h. OVERDOSE WARNING: Hepatotoxicity risk above therapeutic dose. Antidote: N-acetylcysteine (NAC). Contraindicated in severe hepatic failure.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health – Drug Formulary',
    pageNumber: 23,
    isOfficialOnly: true,
  },
  {
    id: '6',
    content: 'Morphine Dosing: Adults IV/SC: 2–4 mg every 3–4 hours (titrate to pain). Epidural: 1–5 mg. OVERDOSE WARNING: Risk of respiratory depression, hypotension, and arrest. Antidote: Naloxone 0.4–2 mg IV (repeat every 2–3 min as needed). Contraindicated in respiratory depression, increased ICP, and severe bronchial asthma.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health – Drug Formulary',
    pageNumber: 87,
    isOfficialOnly: true,
  },
  {
    id: '7',
    content: 'Fall Prevention Protocol: Assess ALL patients using Morse Fall Scale on admission, every 12 hours, and after any fall. Score ≥45: HIGH RISK – activate yellow fall-risk band, lower bed, raise side rails, schedule hourly rounding, place non-slip footwear, post fall-risk sign. Score 25–44: MODERATE RISK. Score <25: LOW RISK. Document assessment in EHR within 1 hour.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health – Patient Safety',
    pageNumber: 34,
    isOfficialOnly: true,
  },
  {
    id: '8',
    content: 'Insulin Administration: ALWAYS perform a double-check with a second licensed nurse before any insulin dose. Use U-100 insulin syringes only. Verify type (rapid/short/intermediate/long-acting), dose, route, time, and patient identity. Monitor blood glucose 30–60 min after administration. HYPOGLYCEMIA ALERT: If glucose <70 mg/dL, administer 15 g fast-acting carbohydrates or IV Dextrose 50% per protocol.',
    sourceId: '1',
    sourceName: 'Saudi Ministry of Health – Drug Formulary',
    pageNumber: 102,
    isOfficialOnly: true,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
};

const generateEmbedding = (text: string): number[] => {
  const vector = new Array(128).fill(0);
  const tokens = text.toLowerCase().split(/\W+/);
  tokens.forEach((token, ti) => {
    for (let ci = 0; ci < token.length; ci++) {
      vector[(ti * 7 + ci * 3) % 128] += token.charCodeAt(ci) / 1000;
    }
  });
  return vector;
};

// ── Query classification helpers ──────────────────────────────────────────────
const MEDICATION_KEYWORDS = [
  'dose', 'dosage', 'mg', 'medication', 'drug', 'medicine', 'paracetamol',
  'morphine', 'insulin', 'antibiotic', 'ml', 'mcg', 'kg', 'prescri',
  'جرعة', 'دواء', 'دواء', 'مضاد', 'أنسولين', 'مورفين', 'باراسيتامول',
];
const PROTOCOL_KEYWORDS = [
  'protocol', 'procedure', 'steps', 'guideline', 'how to', 'process',
  'standard', 'checklist', 'policy', 'practice',
  'بروتوكول', 'إجراء', 'خطوات', 'سياسة', 'كيف', 'معيار',
];
const RISK_KEYWORDS = [
  'risk', 'danger', 'emergency', 'critical', 'overdose', 'alert',
  'warning', 'toxic', 'death', 'lethal', 'severe', 'urgent', 'fall',
  'خطر', 'طوارئ', 'حرج', 'تحذير', 'جرعة زائدة', 'سقوط',
];

const classify = (query: string) => {
  const q = query.toLowerCase();
  return {
    isMedication: MEDICATION_KEYWORDS.some(k => q.includes(k)),
    isProtocol: PROTOCOL_KEYWORDS.some(k => q.includes(k)),
    isRisk: RISK_KEYWORDS.some(k => q.includes(k)),
  };
};

// Extract weight from query (e.g. "70 kg", "70kg", "weight 70")
const extractWeight = (query: string): number | null => {
  const match = query.match(/(\d+(?:\.\d+)?)\s*(?:kg|كجم|kilogram)/i)
    || query.match(/weight\s+(?:of\s+)?(\d+(?:\.\d+)?)/i)
    || query.match(/(?:وزن\s+)(\d+(?:\.\d+)?)/i);
  return match ? parseFloat(match[1]) : null;
};

// ── Response builder ──────────────────────────────────────────────────────────
function buildBNPAnswer(
  query: string,
  topResults: SearchResult[],
): Pick<BNPResponse, 'answer' | 'dose' | 'safetyWarning' | 'safetyAlert'> {
  const { isMedication, isProtocol, isRisk } = classify(query);
  const weight = extractWeight(query);
  const top = topResults[0];
  const content = top.document.content;

  // ── Answer ────────────────────────────────────────────────────────────────
  let answer = '';
  if (isProtocol) {
    // Format as numbered steps by splitting on ". " or ":" boundaries
    const sentences = content.split(/(?<=[.:])\s+/).filter(Boolean);
    answer = sentences.map((s, i) => `${i + 1}. ${s.trim()}`).join('\n');
  } else {
    answer = content;
  }

  // ── Dose ─────────────────────────────────────────────────────────────────
  let dose: string | undefined;
  if (isMedication && weight) {
    // Extract per-kg dosing if present
    const perKgMatch = content.match(/(\d+(?:\.\d+)?)\s*(?:–|-)\s*(\d+(?:\.\d+)?)\s*mg\/kg/i);
    if (perKgMatch) {
      const lo = parseFloat(perKgMatch[1]);
      const hi = parseFloat(perKgMatch[2]);
      dose = `Patient weight: ${weight} kg\n`
        + `Calculated range: ${(lo * weight).toFixed(1)} mg – ${(hi * weight).toFixed(1)} mg\n`
        + `Safe dosage range: ${lo}–${hi} mg/kg per dose`;
    } else {
      const mgMatch = content.match(/(\d+)\s*(?:–|-)\s*(\d+)\s*mg/i);
      if (mgMatch) {
        dose = `Patient weight: ${weight} kg\n`
          + `Standard range from source: ${mgMatch[1]}–${mgMatch[2]} mg per dose\n`
          + `(Weight-based titration: consult pharmacist for exact calculation)`;
      }
    }
  } else if (isMedication && !weight) {
    const mgMatch = content.match(/\d+(?:\.\d+)?\s*(?:–|-)\s*\d+(?:\.\d+)?\s*mg(?:\/kg)?[^.]*\./i);
    if (mgMatch) {
      dose = mgMatch[0].trim();
    }
  }

  // ── Safety Warning ────────────────────────────────────────────────────────
  let safetyWarning: string | undefined;
  const overdoseMatch = content.match(/(?:OVERDOSE|WARNING|ALERT|contraindicated|hypoglycemia)[^.]*\./gi);
  if (overdoseMatch) {
    safetyWarning = overdoseMatch.map(w => `• ${w.trim()}`).join('\n');
  } else if (isRisk) {
    safetyWarning = '• Follow your institution\'s emergency escalation policy.\n• Document and report any adverse events immediately.';
  }

  const safetyAlert = isRisk || (isMedication && !!safetyWarning);

  return { answer, dose, safetyWarning, safetyAlert };
}

// ── Provider ──────────────────────────────────────────────────────────────────
export const ClosedLoopRAGProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { addLog } = useAuditLog();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<VectorDocument[]>(() =>
    DEMO_DOCUMENTS.map(d => ({ ...d, embedding: generateEmbedding(d.content) }))
  );
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.45);

  const addDocument = useCallback((doc: Omit<VectorDocument, 'id'>) => {
    setDocuments(prev => [
      ...prev,
      { ...doc, id: Date.now().toString(), embedding: generateEmbedding(doc.content) },
    ]);
    toast.success(t('documentAddedToKnowledgeBase'));
  }, [t]);

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    toast.success(t('documentRemovedFromKnowledgeBase'));
  }, [t]);

  const getDocumentById = useCallback((id: string) => documents.find(d => d.id === id), [documents]);

  const searchDocuments = useCallback((query: string, topK = 5): SearchResult[] => {
    const qEmb = generateEmbedding(query);
    return documents
      .filter(d => d.isOfficialOnly)
      .map(d => ({ document: d, similarity: cosineSimilarity(qEmb, d.embedding!) }))
      .filter(r => r.similarity > 0.1)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }, [documents]);

  const generateResponse = useCallback((query: string): BNPResponse => {
    const sessionId = `bnp-${Date.now()}`;

    addLog({ sessionId, userId: user?.id || 'anonymous', action: 'query', details: { query } });

    const results = searchDocuments(query, 5);
    const topConfidence = results[0]?.similarity ?? 0;

    // ── Not found ──────────────────────────────────────────────────────────
    if (results.length === 0 || topConfidence < confidenceThreshold) {
      const resp: BNPResponse = {
        answer: 'Not found in provided medical sources.',
        safetyAlert: false,
        sources: [],
        confidenceLevel: topConfidence,
        sessionId,
        rejected: true,
        notFound: true,
        rejectionReason: t('insufficientContext'),
      };
      addLog({ sessionId, userId: user?.id || 'anonymous', action: 'response', details: { query, ...resp } });
      return resp;
    }

    // ── Build structured BNP answer ────────────────────────────────────────
    const { answer, dose, safetyWarning, safetyAlert } = buildBNPAnswer(query, results);

    const resp: BNPResponse = {
      answer,
      dose,
      safetyWarning,
      safetyAlert,
      sources: results.map(r => ({
        documentName: r.document.sourceName,
        pageNumber: r.document.pageNumber,
        similarity: r.similarity,
      })),
      confidenceLevel: topConfidence,
      sessionId,
      rejected: false,
      notFound: false,
    };

    addLog({
      sessionId,
      userId: user?.id || 'anonymous',
      action: 'response',
      details: { query, response: answer, confidenceLevel: topConfidence },
    });

    return resp;
  }, [searchDocuments, confidenceThreshold, addLog, user, t]);

  return (
    <ClosedLoopRAGContext.Provider
      value={{ documents, confidenceThreshold, setConfidenceThreshold, addDocument, removeDocument, searchDocuments, generateResponse, getDocumentById }}
    >
      {children}
    </ClosedLoopRAGContext.Provider>
  );
};

export const useClosedLoopRAG = () => {
  const ctx = useContext(ClosedLoopRAGContext);
  if (!ctx) throw new Error('useClosedLoopRAG must be used within a ClosedLoopRAGProvider');
  return ctx;
};

export { SYSTEM_NAME };
