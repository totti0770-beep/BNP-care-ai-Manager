export const SYSTEM_NAME = 'BNP Clinical AI Engine';

/**
 * A clinical answer. Only ever produced by the Clinical AI Engine — there is no
 * client-side path that synthesises one of these.
 */
export interface BNPResponse {
  answer: string;
  dose?: string;
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
  }[];
  confidenceLevel: number;
  sessionId?: string;
  queryType?: string;
  rejected: boolean;
  rejectionReason?: string;
  notFound: boolean;
  contextValidation?: string;
}
