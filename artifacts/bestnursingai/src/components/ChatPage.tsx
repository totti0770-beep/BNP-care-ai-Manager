import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useClosedLoopRAG, BNPResponse, SYSTEM_NAME } from '@/contexts/ClosedLoopRAGContext';
import { useBackend } from '@/contexts/BackendContext';
import {
  Send, Bot, User, Shield, AlertTriangle, BookOpen,
  Pill, Activity, ShieldAlert, Info, Zap, ClipboardList,
  XCircle, ArrowLeftRight, CheckCircle2, Stethoscope,
  BarChart2, AlertCircle, UserCircle, ChevronDown, ChevronUp, X, Plus,
  Mic, MicOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

// ── BNP structured response renderer ─────────────────────────────────────────
function BNPResponseCard({ bnp, fromEngine }: { bnp: BNPResponse; fromEngine?: boolean }) {
  if (bnp.notFound) {
    return (
      <div className="flex items-start gap-2 mt-1 p-3 rounded-xl bg-yellow-600/10 border border-yellow-500/30">
        <Info className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
        <p className="text-yellow-200 text-sm">Not found in provided medical sources.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-1">
      {/* Engine badge + Confidence label */}
      {fromEngine && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-violet-400" />
            <span className="text-violet-400 text-xs font-medium">Live Clinical Engine</span>
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
              {bnp.confidenceLabel} Confidence
            </div>
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 border border-red-500/40">
          <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-red-300 text-xs font-semibold uppercase tracking-wide">Safety Alert Active</span>
        </div>
      )}

      {/* Answer section */}
      <div className="rounded-xl bg-[#12122a] border border-purple-500/20 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-600/10 border-b border-purple-500/20">
          <Activity className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-purple-300 text-xs font-semibold uppercase tracking-wide">Answer</span>
        </div>
        <div className="px-4 py-3">
          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{bnp.answer}</p>
        </div>
      </div>

      {/* Dose section */}
      {bnp.dose && (
        <div className="rounded-xl bg-[#12122a] border border-cyan-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-cyan-600/10 border-b border-cyan-500/20">
            <Pill className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-cyan-300 text-xs font-semibold uppercase tracking-wide">Dose</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line font-mono">{bnp.dose}</p>
          </div>
        </div>
      )}

      {/* Indication section */}
      {bnp.indication && (
        <div className="rounded-xl bg-[#12122a] border border-teal-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-teal-600/10 border-b border-teal-500/20">
            <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-teal-300 text-xs font-semibold uppercase tracking-wide">Indication</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{bnp.indication}</p>
          </div>
        </div>
      )}

      {/* Safety Warning section */}
      {bnp.safetyWarning && (
        <div className="rounded-xl bg-[#12122a] border border-red-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-red-600/10 border-b border-red-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-300 text-xs font-semibold uppercase tracking-wide">Safety Warning</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-red-200 text-sm leading-relaxed whitespace-pre-line">{bnp.safetyWarning}</p>
          </div>
        </div>
      )}

      {/* Safety Alerts list */}
      {bnp.safetyAlerts && bnp.safetyAlerts.length > 0 && (
        <div className="rounded-xl bg-[#12122a] border border-orange-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-600/10 border-b border-orange-500/20">
            <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-orange-300 text-xs font-semibold uppercase tracking-wide">Safety Alerts</span>
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
        <div className="rounded-xl bg-[#12122a] border border-yellow-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-600/10 border-b border-yellow-500/20">
            <XCircle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-yellow-300 text-xs font-semibold uppercase tracking-wide">Clinical Flags</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {bnp.contraindications && bnp.contraindications.length > 0 && (
              <div>
                <p className="text-yellow-400 text-xs font-semibold mb-1.5">Contraindications</p>
                <ul className="space-y-0.5">
                  {bnp.contraindications.map((c, i) => (
                    <li key={i} className="text-gray-300 text-xs flex items-center gap-1.5">
                      <span className="text-yellow-500">•</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {bnp.interactions && bnp.interactions.length > 0 && (
              <div>
                <p className="text-yellow-400 text-xs font-semibold mb-1.5 flex items-center gap-1">
                  <ArrowLeftRight className="w-3 h-3" /> Drug Interactions
                </p>
                <ul className="space-y-0.5">
                  {bnp.interactions.map((d, i) => (
                    <li key={i} className="text-gray-300 text-xs flex items-center gap-1.5">
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
        <div className="rounded-xl bg-[#12122a] border border-violet-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-violet-600/10 border-b border-violet-500/20">
            <ClipboardList className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-violet-300 text-xs font-semibold uppercase tracking-wide">Nursing Notes</span>
          </div>
          <ul className="px-4 py-3 space-y-1.5">
            {bnp.nursingNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-300 text-xs leading-relaxed">
                <CheckCircle2 className="w-3 h-3 text-violet-400 mt-0.5 flex-shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources */}
      {bnp.sources.length > 0 && (
        <div className="rounded-xl bg-[#12122a] border border-green-500/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-600/10 border-b border-green-500/20">
            <BookOpen className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-300 text-xs font-semibold uppercase tracking-wide">Sources</span>
          </div>
          <div className="px-4 py-3 space-y-1.5">
            {bnp.sources.map((src, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-green-500 text-xs mt-0.5">[{i + 1}]</span>
                <div>
                  <p className="text-gray-300 text-xs">{src.documentName}</p>
                  <p className="text-gray-500 text-xs">
                    Page {src.pageNumber} · Relevance: {(src.similarity * 100).toFixed(0)}%
                  </p>
                  {src.excerpt && (
                    <p className="text-gray-600 text-xs mt-0.5 line-clamp-2 italic">"{src.excerpt}"</p>
                  )}
                </div>
              </div>
            ))}
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
    <div className="border border-purple-500/20 rounded-xl p-4 bg-[#12122a] space-y-4">
      <p className="text-purple-300 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
        <UserCircle className="w-3.5 h-3.5" /> Patient Context (optional — enables safety checks)
      </p>

      {/* Weight + Age */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Weight (kg)</label>
          <Input
            type="number"
            min={1} max={300}
            placeholder="e.g. 70"
            value={opts.patientWeightKg ?? ''}
            onChange={e => onChange({ ...opts, patientWeightKg: e.target.value ? Number(e.target.value) : undefined })}
            className="bg-[#0f0f1a] border-purple-500/30 text-white text-sm h-8"
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Age (years)</label>
          <Input
            type="number"
            min={0} max={120}
            placeholder="e.g. 45"
            value={opts.age ?? ''}
            onChange={e => onChange({ ...opts, age: e.target.value ? Number(e.target.value) : undefined })}
            className="bg-[#0f0f1a] border-purple-500/30 text-white text-sm h-8"
          />
        </div>
      </div>

      {/* Conditions */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">Patient Conditions (for contraindication check)</label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. severe liver disease"
            value={conditionInput}
            onChange={e => setConditionInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCondition(); } }}
            className="bg-[#0f0f1a] border-purple-500/30 text-white text-sm h-8 flex-1"
          />
          <button
            onClick={addCondition}
            className="w-8 h-8 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 flex items-center justify-center transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {(opts.conditions ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {opts.conditions!.map((c, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-600/20 border border-yellow-500/30 text-yellow-300 text-xs">
                {c}
                <button onClick={() => removeCondition(i)}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Other drugs */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">Other Medications (for interaction check)</label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. warfarin, aspirin"
            value={drugInput}
            onChange={e => setDrugInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDrug(); } }}
            className="bg-[#0f0f1a] border-purple-500/30 text-white text-sm h-8 flex-1"
          />
          <button
            onClick={addDrug}
            className="w-8 h-8 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 flex items-center justify-center transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {(opts.otherDrugs ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {opts.otherDrugs!.map((d, i) => (
              <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-600/20 border border-orange-500/30 text-orange-300 text-xs">
                {d}
                <button onClick={() => removeDrug(i)}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { generateResponse, confidenceThreshold } = useClosedLoopRAG();
  const { isEngineAvailable, isChecking, indexedChunks, openaiEnabled, sendQuery } = useBackend();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showPatientCtx, setShowPatientCtx] = useState(false);
  const [patientOpts, setPatientOpts] = useState<QueryOptions>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { isListening, isSupported: voiceSupported, start: startVoice, stop: stopVoice } =
    useVoiceInput((transcript) => setInput(transcript));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasPatientCtx =
    !!(patientOpts.patientWeightKg || patientOpts.age ||
       (patientOpts.conditions ?? []).length ||
       (patientOpts.otherDrugs ?? []).length);

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

    let bnp: BNPResponse;
    let fromEngine = false;

    if (isEngineAvailable) {
      // Use real Clinical AI Engine with patient context
      const engineResult = await sendQuery(text.trim(), patientOpts);
      if (engineResult) {
        bnp = engineResult;
        fromEngine = true;
      } else {
        bnp = generateResponse(text.trim());
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 600));
      bnp = generateResponse(text.trim());
    }

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: '',
      sender: 'ai',
      timestamp: new Date(),
      bnp,
      fromEngine,
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Engine status badge
  const engineBadge = isChecking ? (
    <span className="px-3 py-1 rounded-full bg-gray-600/20 text-gray-400 text-xs flex items-center gap-1">
      <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
      Connecting...
    </span>
  ) : isEngineAvailable ? (
    <span className="px-3 py-1 rounded-full bg-violet-600/20 text-violet-300 text-xs flex items-center gap-1">
      <Zap className="w-3 h-3" />
      Live Engine · {indexedChunks} chunks{openaiEnabled ? ' · GPT-4o' : ''}
    </span>
  ) : (
    <span className="px-3 py-1 rounded-full bg-green-600/20 text-green-400 text-xs flex items-center gap-1">
      <Shield className="w-3 h-3" />
      {t('offlineOnly')}
    </span>
  );

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] h-screen">

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-purple-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-semibold">{SYSTEM_NAME}</h2>
            <p className="text-gray-400 text-xs">
              Hospital-Grade · RAG-Only · Confidence ≥{(confidenceThreshold * 100).toFixed(0)}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {engineBadge}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
              <Bot className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-1">{SYSTEM_NAME}</h3>
            <p className="text-gray-400 text-sm mb-1">
              {isEngineAvailable
                ? `متصل بالمحرك السريري · ${indexedChunks} مقطع مفهرس`
                : 'الإجابات مستندة حصراً إلى الوثائق الطبية المعتمدة'}
            </p>
            <p className="text-gray-600 text-xs mb-4">
              حساب الجرعات · تحذيرات السلامة · مراجع موثّقة
            </p>
            {voiceSupported && (
              <div className="flex items-center gap-1.5 text-xs text-purple-400/70 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1.5 mb-5">
                <Mic className="w-3 h-3" />
                يمكنك التحدث بسؤالك بالضغط على زر الميكروفون
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {SUGGESTED.map((s) => (
                <button
                  key={s.en}
                  onClick={() => sendMessage(s.en)}
                  className="flex flex-col items-start px-3 py-2.5 rounded-xl bg-[#1a1a2e] border border-purple-500/20 hover:border-purple-500/50 hover:bg-[#1f1f35] transition-all text-left"
                >
                  <span className="text-gray-300 text-xs leading-snug">{s.ar}</span>
                  <span className="text-gray-600 text-[10px] mt-0.5 leading-snug">{s.en}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-br from-purple-500 to-violet-600'
                  : msg.bnp?.safetyAlert
                  ? 'bg-gradient-to-br from-red-600 to-orange-600'
                  : msg.bnp?.notFound
                  ? 'bg-gradient-to-br from-yellow-600 to-orange-500'
                  : msg.fromEngine
                  ? 'bg-gradient-to-br from-violet-600 to-purple-700'
                  : 'bg-gradient-to-br from-gray-600 to-gray-700'
              }`}>
                {msg.sender === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
              </div>

              <div className={`max-w-[78%] ${msg.sender === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {msg.sender === 'user' ? (
                  <div className="bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-3">
                    <p className="text-sm">{msg.content}</p>
                  </div>
                ) : (
                  msg.bnp && <BNPResponseCard bnp={msg.bnp} fromEngine={msg.fromEngine} />
                )}
                <span className="text-xs text-gray-600 mt-1 px-1">
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
                ? 'bg-gradient-to-br from-violet-600 to-purple-700'
                : 'bg-gradient-to-br from-gray-600 to-gray-700'
            }`}>
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-[#1a1a2e] rounded-2xl px-4 py-3 border border-purple-500/20">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-gray-500 text-xs ml-2">
                  {isEngineAvailable ? 'Querying Clinical AI Engine...' : 'Processing clinical context...'}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-purple-500/20 space-y-2">
        {/* Patient context toggle */}
        {isEngineAvailable && (
          <button
            onClick={() => setShowPatientCtx(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
              hasPatientCtx
                ? 'border-purple-500/60 bg-purple-600/15 text-purple-300'
                : 'border-purple-500/20 bg-transparent text-gray-500 hover:text-gray-300 hover:border-purple-500/40'
            }`}
          >
            <UserCircle className="w-3.5 h-3.5" />
            Patient Context
            {hasPatientCtx && (
              <span className="bg-purple-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {(patientOpts.conditions?.length ?? 0) + (patientOpts.otherDrugs?.length ?? 0) +
                  (patientOpts.patientWeightKg ? 1 : 0) + (patientOpts.age ? 1 : 0)}
              </span>
            )}
            {showPatientCtx ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
        )}

        {/* Expandable patient panel */}
        {showPatientCtx && isEngineAvailable && (
          <PatientContextPanel opts={patientOpts} onChange={setPatientOpts} />
        )}

        <div className={`flex items-center gap-2 bg-[#1a1a2e] rounded-xl border p-2 transition-all duration-300 ${
          isListening ? 'border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]' : 'border-purple-500/30'
        }`}>
          {/* Mic button */}
          {voiceSupported && (
            <button
              onClick={handleMicClick}
              disabled={isTyping}
              title={isListening ? 'إيقاف التسجيل' : 'تحدّث بسؤالك'}
              className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 ${
                isListening
                  ? 'bg-red-500/20 text-red-400 animate-pulse hover:bg-red-500/30'
                  : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
              } disabled:opacity-40`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? '🎤 جارٍ الاستماع...' : 'Ask a clinical question... (include drug name for safety checks)'}
            className="flex-1 bg-transparent border-0 text-white placeholder:text-gray-500 focus-visible:ring-0 shadow-none text-sm"
            disabled={isTyping}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-gray-600 text-xs">
          {SYSTEM_NAME} · RAG-Only · No Hallucination · Sources Always Cited
        </p>
      </div>
    </div>
  );
};

export default ChatPage;
