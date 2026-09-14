import React, { createContext, useContext, useMemo, useState } from 'react';
import type { QueryOptions } from '@/services/clinicalApi';

/**
 * The patient values a clinical question is asked about.
 *
 * These decide whether the engine computes a dose at all — a weight-based
 * regimen with no weight is refused, not guessed — so they have to be where a
 * nurse can see and set them, not inside one collapsed control at the bottom
 * of the chat. Home and the assistant now read the same values.
 *
 * Deliberately memory-only. Nothing here touches localStorage, a cookie, or
 * the server: this is a shared clinical workstation, and the next nurse must
 * not inherit the previous patient. A reload clears it, which is the point.
 */
interface PatientContextType {
  patient: QueryOptions;
  setPatient: (next: QueryOptions) => void;
  clearPatient: () => void;
  /** True when at least one value is set. */
  hasPatient: boolean;
  /** How many values are set, for a badge. */
  count: number;
}

const PatientContext = createContext<PatientContextType | undefined>(undefined);

export const PatientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [patient, setPatient] = useState<QueryOptions>({});

  const value = useMemo<PatientContextType>(() => {
    const count =
      (patient.patientWeightKg ? 1 : 0) +
      (patient.age ? 1 : 0) +
      (patient.conditions?.length ?? 0) +
      (patient.otherDrugs?.length ?? 0);
    return {
      patient,
      setPatient,
      clearPatient: () => setPatient({}),
      hasPatient: count > 0,
      count,
    };
  }, [patient]);

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
};

export const usePatient = (): PatientContextType => {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatient must be used within PatientProvider');
  return ctx;
};
