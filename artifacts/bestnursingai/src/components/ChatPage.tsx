import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BNPResponse, DoseSection, SYSTEM_NAME } from '@/types/bnp';
import { useBackend } from '@/contexts/BackendContext';
import { usePatient } from '@/contexts/PatientContext';
import {
  Send, Bot, User, Shield, AlertTriangle, BookOpen,
  Pill, Activity, ShieldAlert, Info, Zap, ClipboardList,
  XCircle, ArrowLeftRight, CheckCircle2, Stethoscope,
  BarChart2, AlertCircle, UserCircle, ChevronDown, ChevronUp, X, Plus,
  Mic, MicOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CitationList from '@/components/CitationList';
import type { QueryOptions } from '@/services/clinicalApi';

// ── Voice Input Hook ──────────────────────────────────────────────────────────
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() =>
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
  const recognitionRef = useRef<SpeechRec | null>(null);

  const start = useCallback(() => {
    if (!isSupported || isListening) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec: SpeechRec = new SR();
    rec.lang = 'ar-SA';
    rec.interimResults = true;
    rec.continuous = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as ArrayLike<{ [i: number]: { transcript: string } }>)
        .map((r) => r[0].transcript)
        .join('');
      onTranscript(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [isSupported, isListening, onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, isSupported, start, stop };
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  bnp?: BNPResponse;
  fromEngine?: boolean;
}

const SUGGESTED = [
  { en: 'Paracetamol dose for 70 kg adult', ar: 'جرعة الباراسيتامول لمريض 70 كجم' },
  { en: 'Morphine overdose antidote', ar: 'ترياق جرعة المورفين الزائدة' },
  { en: 'Vancomycin loading dose', ar: 'جرعة التحميل للفانكومايسين' },
  { en: 'Hand hygiene protocol steps', ar: 'خطوات بروتوكول نظافة اليدين' },
  { en: 'Insulin double-check procedure', ar: 'إجراء التحقق المزدوج للإنسولين' },
  { en: 'Fall prevention assessment', ar: 'تقييم الوقاية من السقوط' },
];

// The engine labels regimen fields in English, from the closed set its own
// workbook converter writes. Translating the heading touches no clinical text —
// the value underneath is the hospital's, verbatim, in either language.
export const REGIMEN_LABEL_KEYS: Record<string, string> = {
  'Therapeutic class': 'regTherapeuticClass',
  'Indications': 'regIndications',
  'Dosage form and strength': 'regDosageForm',
  'Adult dosing': 'regAdultDosing',
  'Pediatric dosing': 'regPediatricDosing',
  'Renal/hepatic adjustment': 'regRenalHepatic',
  'Administration': 'regAdministration',
  'Prescriber authority': 'regPrescriberAuthority',
  'Additional notes': 'regAdditionalNotes',
  'Package size / initial strength': 'regPackageSize',
  'Final concentration': 'regFinalConcentration',
  'Final volume': 'regFinalVolume',
  'Diluents': 'regDiluents',
  'Preparation, administration and stability': 'regPreparation',
};

// The engine names each missing value after the request field that supplies it,
// so the client can map one onto its own input without a second table.
const MISSING_VARIABLE_KEYS: Record<string, string> = {
  patient_weight_kg: 'varWeight',
  age: 'varAge',
};

// What the engine understood the question to be asking for. The values are
// the engine's ClinicalIntent enum; an intent this map does not know is not
// shown rather than shown raw, so a new engine value never leaks an
// identifier onto a clinical screen.
export const INTENT_KEYS: Record<string, string> = {
  dose: 'intentDose',
  dose_calculation: 'intentDoseCalculation',
  preparation: 'intentPreparation',
  administration: 'intentAdministration',
  renal_adjustment: 'intentRenalAdjustment',
  pediatric_dosing: 'intentPediatricDosing',
  antidote: 'intentAntidote',
  monitoring: 'intentMonitoring',
  general_drug_info: 'intentGeneralDrugInfo',
  full_drug_info: 'intentFullDrugInfo',
};

function RegimenField({ section }: { section: DoseSection }) {
  const { t } = useTranslation();
  const key = REGIMEN_LABEL_KEYS[section.label];
  return (
    <div>
      {section.label && (
        <div className="text-cyan-300/70 text-[11px] font-semibold uppercase tracking-wide mb-0.5">
          {key ? t(key) : section.label}
        </div>
      )}
      {/* The regimen is English clinical text with figures in it, so it reads
          left-to-right even when the page does not. */}
      <p dir="ltr" className="text-[var(--dg-body)] text-sm leading-relaxed whitespace-pre-line">
        {section.text}
      </p>
    </div>
  );
}

/**
 * A reference regimen, as fields rather than as a wall of text.
 *
 * The bedside fields are open; the reference ones are one click away. Nothing is
 * truncated — vancomycin's regimen is 6,162 characters and every one of them is
 * still reachable here.
 */
function DoseSections({ sections }: { sections: DoseSection[] }) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const bedside = sections.filter((s) => s.primary);
  // A regimen with nothing marked primary would otherwise render an empty panel
  // with everything hidden behind a toggle. Show all of it instead.
  const open = bedside.length ? bedside : sections;
  const rest = bedside.length ? sections.filter((s) => !s.primary) : [];

  return (
    <div className="space-y-3">
      {open.map((s, i) => <RegimenField key={`open-${i}`} section={s} />)}
      {showAll && rest.map((s, i) => <RegimenField key={`rest-${i}`} section={s} />)}
      {rest.length > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-cyan-300/80 hover:text-cyan-200 transition-colors"
        >
          {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showAll ? t('doseHideDetails') : t('doseShowDetails', { count: rest.length })}
        </button>
      )}
    </div>
  );
}

// ── BNP structured response renderer ─────────────────────────────────────────
function BNPResponseCard({
  bnp,
  fromEngine,
  onAddPatientValues,
}: {
  bnp: BNPResponse;
  fromEngine?: boolean;
  /** Opens the patient-context editor. Offered from the missing-values card. */
  onAddPatientValues?: () => void;
}) {
  const { t } = useTranslation();
  if (bnp.notFound) {
    return (
      <div className="flex items-start gap-2 mt-1 p-3 rounded-xl bg-yellow-600/10 border border-yellow-500/30">
        <Info className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
        <p className="text-yellow-200 text-sm">{t('notFoundInSources')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-1">
      {/* Engine badge + Confidence label */}
      {fromEngine && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-[var(--dg-accent-strong)]" />
            <span className="text-[var(--dg-accent-strong)] text-xs font-medium">{t('liveEngine')}</span>
          </div>
          {bnp.confidenceLabel && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
              bnp.confidenceLabel === 'High'
                ? 'bg-green-600/15 border-green-500/40 text-green-300'
                : bnp.confidenceLabel === 'Medium'
                ? 'bg-yellow-600/15 border-yellow-500/40 text-yellow-300'
                : 'bg-red-600/15 border-red-500/40 text-red-300'
            }`}>
              <BarChart2 className="w-2.5 h-2.5" />
              {t(`confidence_${bnp.confidenceLabel}`)} {t('confidenceSuffix')}
            </div>
          )}
          {/* The intent is advisory: it says which part of the record answered,
              never whether the safety layer ran. Shown so a nurse can see the
              question was read the way they meant it. */}
          {bnp.intent && INTENT_KEYS[bnp.intent] && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-[var(--dg-accent-faint)] border-[var(--dg-border)] text-[var(--dg-muted)]">
              <Stethoscope className="w-2.5 h-2.5" />
              {t('intentAskedFor')}: {t(INTENT_KEYS[bnp.intent])}
            </span>
          )}
        </div>
      )}

      {/* Context Validation warning */}
      {bnp.contextValidation && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-600/10 border border-amber-500/30">
          <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-amber-200 text-xs leading-relaxed">{bnp.contextValidation}</p>
        </div>
      )}

      {/* Safety Alert banner */}
      {bnp.safetyAlert && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 border border-red-500/40">
          <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-red-300 text-xs font-semibold uppercase tracking-wide">{t('safetyAlertActive')}</span>
        </div>
      )}

      {/* Answer section */}
      <div className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--dg-accent-faint)] border-b border-[var(--dg-border)]">
          <Activity className="w-3.5 h-3.5 text-[var(--dg-accent-strong)]" />
          <span className="text-[var(--dg-accent-strong)] text-xs font-semibold uppercase tracking-wide">{t('secAnswer')}</span>
        </div>
        <div className="px-4 py-3">
          <p className="text-[var(--dg-body)] text-sm leading-relaxed whitespace-pre-line">{bnp.answer}</p>
        </div>
      </div>

      {/* The calculation needs patient values it was not given. Shown above the
          dose card because it explains why that card is empty — the engine
          refused to guess rather than falling back to an adult figure. */}
      {bnp.missingVariables && bnp.missingVariables.length > 0 && (
        <div role="alert" className="rounded-xl bg-[var(--dg-surface)] border border-amber-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-600/10 border-b border-amber-500/30">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-300 text-xs font-semibold uppercase tracking-wide">
              {t('doseNeedsValues')}
            </span>
          </div>
          <ul className="px-4 py-3 space-y-1.5">
            {bnp.missingVariables.map((v, i) => (
              <li key={i} className="text-amber-200 text-sm leading-relaxed">
                • {t(MISSING_VARIABLE_KEYS[v] ?? 'doseNeedsValues')}
              </li>
            ))}
          </ul>
          <p className="px-4 pb-3 text-[var(--dg-muted)] text-xs leading-relaxed">
            {t('doseNoGuess')}
          </p>
          {onAddPatientValues && (
            <div className="px-4 pb-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAddPatientValues}
                className="border-amber-500/40 text-amber-200 hover:bg-amber-600/10"
              >
                <Plus className="w-3.5 h-3.5 me-1" />
                {t('doseAddPatientValues')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dose section */}
      {(bnp.doseSections?.length || bnp.dose) && (
        <div className="rounded-xl bg-[var(--dg-surface)] border border-cyan-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-cyan-600/10 border-b border-cyan-500/20">
            <Pill className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-cyan-300 text-xs font-semibold uppercase tracking-wide">{t('secDose')}</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {bnp.doseSections?.length ? (
              <>
                {bnp.doseNotice && (
                  <p className="text-[var(--dg-body)] text-sm leading-relaxed">{bnp.doseNotice}</p>
                )}
                <DoseSections sections={bnp.doseSections} />
              </>
            ) : (
              // An engine that does not send sections yet, or a computed dose,
              // which is a short line and needs no structure.
              <p className="text-[var(--dg-body)] text-sm leading-relaxed whitespace-pre-line">{bnp.dose}</p>
            )}
          </div>
        </div>
      )}

      {/* Indication section */}
      {bnp.indication && (
        <div className="rounded-xl bg-[var(--dg-surface)] border border-teal-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-teal-600/10 border-b border-teal-500/20">
            <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-teal-300 text-xs font-semibold uppercase tracking-wide">{t('secIndication')}</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-[var(--dg-body)] text-sm leading-relaxed whitespace-pre-line">{bnp.indication}</p>
          </div>
        </div>
      )}

      {/* Safety Warning section */}
      {bnp.safetyWarning && (
        <div className="rounded-xl bg-[var(--dg-surface)] border border-red-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-red-600/10 border-b border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-300 text-xs font-semibold uppercase tracking-wide">{t('secSafetyWarning')}</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-red-200 text-sm leading-relaxed whitespace-pre-line">{bnp.safetyWarning}</p>
          </div>
        </div>
      )}

      {/* Safety Alerts list */}
      {bnp.safetyAlerts && bnp.safetyAlerts.length > 0 && (
        <div className="rounded-xl bg-[var(--dg-surface)] border border-orange-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-600/10 border-b border-orange-500/20">
            <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-orange-300 text-xs font-semibold uppercase tracking-wide">{t('secSafetyAlerts')}</span>
          </div>
          <ul className="px-4 py-3 space-y-1.5">
            {bnp.safetyAlerts.map((alert, i) => (
              <li key={i} className="text-orange-200 text-sm leading-relaxed">{alert}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Contraindications & Interactions */}
      {((bnp.contraindications && bnp.contraindications.length > 0) ||
        (bnp.interactions && bnp.interactions.length > 0)) && (
        <div className="rounded-xl bg-[var(--dg-surface)] border border-yellow-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-600/10 border-b border-yellow-500/20">
            <XCircle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-yellow-300 text-xs font-semibold uppercase tracking-wide">{t('secClinicalFlags')}</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {bnp.contraindications && bnp.contraindications.length > 0 && (
              <div>
                <p className="text-yellow-400 text-xs font-semibold mb-1.5">{t('msContraindications')}</p>
                <ul className="space-y-0.5">
                  {bnp.contraindications.map((c, i) => (
                    <li key={i} className="text-[var(--dg-body)] text-xs flex items-center gap-1.5">
                      <span className="text-yellow-500">•</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {bnp.interactions && bnp.interactions.length > 0 && (
              <div>
                <p className="text-yellow-400 text-xs font-semibold mb-1.5 flex items-center gap-1">
                  <ArrowLeftRight className="w-3 h-3" /> {t('msInteractions')}
                </p>
                <ul className="space-y-0.5">
                  {bnp.interactions.map((d, i) => (
                    <li key={i} className="text-[var(--dg-body)] text-xs flex items-center gap-1.5">
                      <span className="text-yellow-500">⇄</span> {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nursing Notes */}
      {bnp.nursingNotes && bnp.nursingNotes.length > 0 && (
        <div className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--dg-accent-faint)] border-b border-[var(--dg-border)]">
            <ClipboardList className="w-3.5 h-3.5 text-[var(--dg-accent-strong)]" />
            <span className="text-[var(--dg-accent-strong)] text-xs font-semibold uppercase tracking-wide">{t('secNursingNotes')}</span>
          </div>
          <ul className="px-4 py-3 space-y-1.5">
            {bnp.nursingNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-[var(--dg-body)] text-xs leading-relaxed">
                <CheckCircle2 className="w-3 h-3 text-[var(--dg-accent-strong)] mt-0.5 flex-shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources */}
      {bnp.sources.length > 0 && (
        <div className="rounded-xl bg-[var(--dg-surface)] border border-green-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-600/10 border-b border-green-500/20">
            <BookOpen className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-300 text-xs font-semibold uppercase tracking-wide">{t('secSources')}</span>
          </div>
          <div className="px-4 py-3">
            <CitationList citations={bnp.sources} />
          </div>
        </div>
      )}

      {/* Confidence */}
      <div className="flex items-center gap-2 px-1">
        <div className="h-1 flex-1 rounded-full bg-gray-800">
          <div
            className={`h-1 rounded-full transition-all ${
              bnp.confidenceLevel >= 0.7 ? 'bg-green-500' :
              bnp.confidenceLevel >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(bnp.confidenceLevel * 100, 100)}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${
          bnp.confidenceLevel >= 0.7 ? 'text-green-400' :
          bnp.confidenceLevel >= 0.5 ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {(bnp.confidenceLevel * 100).toFixed(0)}% confidence
        </span>
      </div>
    </div>
  );
}

// ── Patient context panel ─────────────────────────────────────────────────────
function PatientContextPanel({
  opts, onChange,
}: {
  opts: QueryOptions;
  onChange: (o: QueryOptions) => void;
}) {
  const { t } = useTranslation();
  const [conditionInput, setConditionInput] = useState('');
  const [drugInput, setDrugInput] = useState('');

  const addCondition = () => {
    const v = conditionInput.trim();
    if (!v) return;
    onChange({ ...opts, conditions: [...(opts.conditions ?? []), v] });
    setConditionInput('');
  };

  const addDrug = () => {
    const v = drugInput.trim();
    if (!v) return;
    onChange({ ...opts, otherDrugs: [...(opts.otherDrugs ?? []), v] });
    setDrugInput('');
  };

  const removeCondition = (i: number) =>
    onChange({ ...opts, conditions: opts.conditions?.filter((_, idx) => idx !== i) });

  const removeDrug = (i: number) =>
    onChange({ ...opts, otherDrugs: opts.otherDrugs?.filter((_, idx) => idx !== i) });

  return (
    <div className="border border-[var(--dg-border)] rounded-xl p-4 bg-[var(--dg-surface)] space-y-4">
      <p className="text-[var(--dg-accent-strong)] text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
        <UserCircle className="w-3.5 h-3.5" aria-hidden="true" /> {t('patientContextHint')}
      </p>

      {/* Weight + Age */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pc-weight" className="text-[var(--dg-muted)] text-xs mb-1 block">{t('pcWeight')}</label>
          <Input
            id="pc-weight"
            type="number"
            min={1} max={300}
            placeholder={t('phWeight')}
            value={opts.patientWeightKg ?? ''}
            onChange={e => onChange({ ...opts, patientWeightKg: e.target.value ? Number(e.target.value) : undefined })}
            className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-text)] text-sm h-8"
          />
        </div>
        <div>
          <label htmlFor="pc-age" className="text-[var(--dg-muted)] text-xs mb-1 block">{t('pcAge')}</label>
          <Input
            id="pc-age"
            type="number"
            min={0} max={120}
            placeholder={t('phAge')}
            value={opts.age ?? ''}
            onChange={e => onChange({ ...opts, age: e.target.value ? Number(e.target.value) : undefined })}
            className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-text)] text-sm h-8"
          />
        </div>
      </div>

      {/* Conditions */}
      <div>
        <label htmlFor="pc-condition" className="text-[var(--dg-muted)] text-xs mb-1 block">{t('pcConditions')}</label>
        <div className="flex gap-2">
          <Input
            id="pc-condition"
            placeholder={t('phConditions')}
            value={conditionInput}
            onChange={e => setConditionInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCondition(); } }}
            className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-text)] text-sm h-8 flex-1"
          />
          <button
            onClick={addCondition}
            aria-label={t('a11yAddCondition')}
            className="w-8 h-8 rounded-lg bg-[var(--dg-accent-soft)] hover:bg-[var(--dg-border-strong)] text-[var(--dg-accent-strong)] flex items-center justify-center transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {(opts.conditions ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {opts.conditions!.map((c, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 text-xs">
                {c}
                <button type="button" onClick={() => removeCondition(i)} aria-label={`${t('a11yRemoveItem')}: ${c}`}><X className="w-3 h-3" aria-hidden="true" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Other drugs */}
      <div>
        <label htmlFor="pc-drug" className="text-[var(--dg-muted)] text-xs mb-1 block">{t('pcDrugs')}</label>
        <div className="flex gap-2">
          <Input
            id="pc-drug"
            placeholder={t('phDrugs')}
            value={drugInput}
            onChange={e => setDrugInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDrug(); } }}
            className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-text)] text-sm h-8 flex-1"
          />
          <button
            onClick={addDrug}
            aria-label={t('a11yAddDrug')}
            className="w-8 h-8 rounded-lg bg-[var(--dg-accent-soft)] hover:bg-[var(--dg-border-strong)] text-[var(--dg-accent-strong)] flex items-center justify-center transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {(opts.otherDrugs ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {opts.otherDrugs!.map((d, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-600/20 border border-orange-500/30 text-orange-300 text-xs">
                {d}
                <button type="button" onClick={() => removeDrug(i)} aria-label={`${t('a11yRemoveItem')}: ${d}`}><X className="w-3 h-3" aria-hidden="true" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface ChatPageProps {
  /** A question carried in from the home console, asked once on arrival. */
  initialQuestion?: string | null;
  onInitialQuestionConsumed?: () => void;
}

const ChatPage: React.FC<ChatPageProps> = ({ initialQuestion, onInitialQuestionConsumed }) => {
  const { t } = useTranslation();
  const { isEngineAvailable, isChecking, indexedChunks, openaiEnabled, sendQuery } = useBackend();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showPatientCtx, setShowPatientCtx] = useState(false);
  // Shared with the home console, and memory-only: see contexts/PatientContext.
  const { patient: patientOpts, setPatient: setPatientOpts, clearPatient, hasPatient: hasPatientCtx } = usePatient();
  // The list scrolls itself. scrollIntoView() on a sentinel scrolled every
  // scrollable ancestor too, and on a phone that pulled the page container
  // up by the strip reserved for the sidebar toggle — an offset that then
  // outlived this screen and hid the next screen's title under the toggle.
  const listRef = useRef<HTMLDivElement>(null);

  const { isListening, isSupported: voiceSupported, start: startVoice, stop: stopVoice } =
    useVoiceInput((transcript) => setInput(transcript));

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleMicClick = () => {
    if (isListening) {
      stopVoice();
    } else {
      setInput('');
      startVoice();
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;
    if (isListening) stopVoice();

    const userMsg: Message = {
      id: Date.now().toString(),
      content: text.trim(),
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // There is no local fallback. If the engine cannot answer, the app says so
    // rather than synthesising clinical guidance in the browser.
    const engineResult = isEngineAvailable
      ? await sendQuery(text.trim(), patientOpts)
      : null;

    const bnp: BNPResponse = engineResult ?? {
      answer: t('engineUnavailableBody'),
      safetyAlert: true,
      sources: [],
      confidenceLevel: 0,
      rejected: true,
      rejectionReason: t('engineUnavailableTitle'),
      notFound: true,
    };

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: '',
      sender: 'ai',
      timestamp: new Date(),
      bnp,
      fromEngine: engineResult !== null,
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsTyping(false);
  };

  useEffect(() => {
    if (!initialQuestion) return;
    onInitialQuestionConsumed?.();
    void sendMessage(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Engine status badge
  const engineBadge = isChecking ? (
    <span className="px-3 py-1 rounded-full bg-gray-600/20 text-[var(--dg-muted)] text-xs flex items-center gap-1">
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
      {t('engineConnecting')}
    </span>
  ) : isEngineAvailable ? (
    <span className="px-3 py-1 rounded-full bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] text-xs flex items-center gap-1">
      <Zap className="w-3 h-3" />
      {openaiEnabled
        ? t('engineLiveModel', { count: indexedChunks, model: 'GPT-4o' })
        : t('engineLive', { count: indexedChunks })}
    </span>
  ) : (
    <span className="px-3 py-1 rounded-full bg-red-600/20 text-red-300 text-xs flex items-center gap-1">
      <AlertTriangle className="w-3 h-3" />
      {t('engineUnavailableTitle')}
    </span>
  );

  return (
    <div className="flex-1 flex flex-col dg-page h-screen">

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--dg-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg dg-gradient flex items-center justify-center">
            <Bot className="w-5 h-5 text-[var(--dg-text)]" />
          </div>
          <div>
            <h1 className="text-[var(--dg-text)] font-semibold">{SYSTEM_NAME}</h1>
            <p className="text-[var(--dg-muted)] text-xs">
              {t('engineSubtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {engineBadge}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 space-y-5"
        role="log"
        aria-live="polite"
        aria-label={t('answerRegion')}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <div className="w-20 h-20 rounded-2xl dg-gradient flex items-center justify-center mb-4 shadow-lg shadow-[rgba(0,166,166,0.2)]">
              <Bot className="w-10 h-10 text-[var(--dg-text)]" />
            </div>
            <h3 className="text-xl font-semibold text-[var(--dg-text)] mb-1">{SYSTEM_NAME}</h3>
            <p className="text-[var(--dg-muted)] text-sm mb-1">
              {isEngineAvailable
                ? t('chatConnectedSummary', { count: indexedChunks })
                : t('engineUnavailableBody')}
            </p>
            <p className="text-[var(--dg-muted)] text-xs mb-4">
              {t('chatCapabilities')}
            </p>
            {voiceSupported && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--dg-accent-strong)]/70 bg-[var(--dg-accent-faint)] border border-[var(--dg-border)] rounded-full px-3 py-1.5 mb-5">
                <Mic className="w-3 h-3" />
                {t('chatVoiceHint')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {SUGGESTED.map((s) => (
                <button
                  key={s.en}
                  onClick={() => sendMessage(s.en)}
                  className="flex flex-col items-start px-3 py-2.5 rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] hover:border-[var(--dg-border-strong)] hover:bg-[var(--dg-elevated)] transition-all text-start"
                >
                  <span className="text-[var(--dg-body)] text-xs leading-snug">{s.ar}</span>
                  <span className="text-[var(--dg-muted)] text-[10px] mt-0.5 leading-snug">{s.en}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.sender === 'user'
                  ? 'dg-gradient'
                  : msg.bnp?.safetyAlert
                  ? 'bg-gradient-to-br from-red-600 to-orange-600'
                  : msg.bnp?.notFound
                  ? 'bg-gradient-to-br from-yellow-600 to-orange-500'
                  : msg.fromEngine
                  ? 'dg-gradient'
                  : 'bg-gradient-to-br from-gray-600 to-gray-700'
              }`}>
                {msg.sender === 'user' ? <User className="w-4 h-4 text-[var(--dg-text)]" /> : <Bot className="w-4 h-4 text-[var(--dg-text)]" />}
              </div>

              <div className={`max-w-[78%] ${msg.sender === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {msg.sender === 'user' ? (
                  <div className="dg-gradient text-white rounded-2xl rounded-tr-sm px-4 py-3">
                    <p className="text-sm">{msg.content}</p>
                  </div>
                ) : (
                  msg.bnp && (
                    <BNPResponseCard
                      bnp={msg.bnp}
                      fromEngine={msg.fromEngine}
                      onAddPatientValues={() => setShowPatientCtx(true)}
                    />
                  )
                )}
                <span className="text-xs text-[var(--dg-muted)] mt-1 px-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isEngineAvailable
                ? 'dg-gradient'
                : 'bg-gradient-to-br from-gray-600 to-gray-700'
            }`}>
              <Bot className="w-4 h-4 text-[var(--dg-text)]" />
            </div>
            <div className="bg-[var(--dg-surface)] rounded-2xl px-4 py-3 border border-[var(--dg-border)]">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-[var(--dg-accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-[var(--dg-accent)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-[var(--dg-accent)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-[var(--dg-muted)] text-xs ms-2">
                  {isEngineAvailable ? t('engineQuerying') : t('engineProcessing')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[var(--dg-border)] space-y-2">
        {/* Patient context — always visible, never buried.
            These values decide whether a dose is computed at all, so a nurse
            has to see what is set before asking, not discover a collapsed
            control afterwards. The editor itself still folds away. */}
        {isEngineAvailable && (
          <div className="rounded-xl border border-[var(--dg-border)] bg-[var(--dg-surface)] p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-xs font-semibold text-[var(--dg-accent-strong)] flex items-center gap-1.5">
                  <UserCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('patientContext')}
                </span>
                {hasPatientCtx ? (
                  <>
                    {patientOpts.patientWeightKg && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] text-xs">
                        {t('ctxKg', { value: patientOpts.patientWeightKg })}
                      </span>
                    )}
                    {patientOpts.age && (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] text-xs">
                        {t('ctxYears', { value: patientOpts.age })}
                      </span>
                    )}
                    {(patientOpts.conditions ?? []).map((c) => (
                      <span key={`c-${c}`} className="px-2 py-0.5 rounded-full bg-[var(--dg-elevated)] border border-[var(--dg-border)] text-[var(--dg-body)] text-xs">
                        {c}
                      </span>
                    ))}
                    {(patientOpts.otherDrugs ?? []).map((d) => (
                      <span key={`d-${d}`} className="px-2 py-0.5 rounded-full bg-[var(--dg-elevated)] border border-[var(--dg-border)] text-[var(--dg-body)] text-xs">
                        {d}
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="text-xs text-[var(--dg-muted)]">
                    {t('ctxEmpty')} — {t('ctxEmptyHint')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasPatientCtx && (
                  <button
                    type="button"
                    onClick={clearPatient}
                    className="text-xs px-2.5 py-1 rounded-lg text-[var(--dg-muted)] hover:text-red-300"
                  >
                    {t('ctxClear')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPatientCtx(v => !v)}
                  aria-expanded={showPatientCtx}
                  className="text-xs px-3 py-1 rounded-lg border border-[var(--dg-border-strong)] text-[var(--dg-accent-strong)] hover:bg-[var(--dg-accent-soft)] flex items-center gap-1"
                >
                  {showPatientCtx ? t('ctxDone') : hasPatientCtx ? t('ctxEdit') : t('ctxAdd')}
                  {showPatientCtx ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
                </button>
              </div>
            </div>
            {showPatientCtx && (
              <PatientContextPanel opts={patientOpts} onChange={setPatientOpts} />
            )}
          </div>
        )}

        <div className={`flex items-center gap-2 bg-[var(--dg-surface)] rounded-xl border p-2 transition-all duration-300 ${
          isListening ? 'border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]' : 'border-[var(--dg-border-strong)]'
        }`}>
          {/* Mic button */}
          {voiceSupported && (
            <button
              onClick={handleMicClick}
              disabled={isTyping}
              title={isListening ? t('micStop') : t('micStart')}
              aria-label={isListening ? t('micStop') : t('micStart')}
              className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
                isListening
                  ? 'bg-red-500/20 text-red-400 animate-pulse hover:bg-red-500/30'
                  : 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] hover:bg-[var(--dg-border-strong)]'
              } disabled:opacity-40`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? t('phListening') : t('phAsk')}
            aria-label={t('phAsk')}
            className="flex-1 bg-transparent border-0 text-[var(--dg-text)] placeholder:text-[var(--dg-faint)] focus-visible:ring-0 shadow-none text-sm"
            disabled={isTyping}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            aria-label={t('a11ySend')}
            className="dg-gradient hover:brightness-110 text-white px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {/* The footer used to promise "No Hallucination". No system can
            promise that; what this one does is refuse to answer without a
            cited, approved source, and that is what the line now says. */}
        <p className="text-center text-[var(--dg-muted)] text-xs">
          {SYSTEM_NAME} · {t('chatFooterNote')}
        </p>
      </div>
    </div>
  );
};

export default ChatPage;
