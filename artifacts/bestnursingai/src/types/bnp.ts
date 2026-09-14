export const SYSTEM_NAME = 'BNP Clinical AI Engine';

/**
 * A clinical answer. Only ever produced by the Clinical AI Engine — there is no
 * client-side path that synthesises one of these.
 */
/**
 * One labelled field of a reference regimen.
 *
 * `primary` marks what a nurse needs while drawing up the dose. The rest is
 * collapsed, never dropped.
 */
export interface DoseSection {
  label: string;
  text: string;
  primary: boolean;
}

export interface BNPResponse {
  answer: string;
  dose?: string;
  /** `dose` as labelled fields, when the engine could split it. */
  doseSections?: DoseSection[];
  /** Why no number was computed. Accompanies `doseSections`. */
  doseNotice?: string;
  /** What the question asked for. Advisory only. */
  intent?: string;
  /** Patient values the calculation needed and did not have. */
  missingVariables?: string[];
  indication?: string;
  safetyWarning?: string;
  safetyAlert: boolean;
  confidenceLabel?: 'High' | 'Medium' | 'Low';
  safetyAlerts?: string[];
  contraindications?: string[];
  interactions?: string[];
  nursingNotes?: string[];
  sources: {
    documentName: string;
    pageNumber: number;
    similarity: number;
    excerpt?: string;
    /** Present when the engine recorded which stored passage was cited. */
    chunkId?: string;
    documentId?: string;
  }[];
  confidenceLevel: number;
  sessionId?: string;
  queryType?: string;
  rejected: boolean;
  rejectionReason?: string;
  notFound: boolean;
  contextValidation?: string;
}
