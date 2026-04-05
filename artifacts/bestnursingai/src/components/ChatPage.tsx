import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useClosedLoopRAG, BNPResponse, SYSTEM_NAME } from '@/contexts/ClosedLoopRAGContext';
import { useBackend } from '@/contexts/BackendContext';
import {
  Send, Bot, User, Shield, AlertTriangle, BookOpen,
  Pill, Activity, ShieldAlert, Info, Zap, ClipboardList,
  XCircle, ArrowLeftRight, CheckCircle2, Stethoscope,
  BarChart2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  bnp?: BNPResponse;
  fromEngine?: boolean;
}

const SUGGESTED = [
  'What is the hand hygiene protocol?',
  'Paracetamol dose for 70 kg adult',
  'ICU vital signs monitoring protocol',
  'Insulin double-check procedure',
  'Fall prevention assessment steps',
  'Morphine overdose antidote',
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

// ── Main component ────────────────────────────────────────────────────────────
const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { generateResponse, confidenceThreshold } = useClosedLoopRAG();
  const { isEngineAvailable, isChecking, indexedChunks, openaiEnabled, sendQuery } = useBackend();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;

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
      // Use real Clinical AI Engine
      const engineResult = await sendQuery(text.trim());
      if (engineResult) {
        bnp = engineResult;
        fromEngine = true;
      } else {
        // Engine call failed — fall back to local
        bnp = generateResponse(text.trim());
      }
    } else {
      // Local demo fallback
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
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mb-4">
              <Bot className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-1">{SYSTEM_NAME}</h3>
            <p className="text-gray-400 text-sm mb-1">
              {isEngineAvailable
                ? `Connected to Clinical AI Engine · ${indexedChunks} chunks indexed`
                : 'Answers sourced exclusively from approved clinical documents'}
            </p>
            <p className="text-gray-600 text-xs mb-6">
              Includes dose calculation · Safety warnings · Citation references
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="px-3 py-1.5 rounded-full bg-[#1a1a2e] border border-purple-500/30 text-gray-400 text-sm hover:border-purple-500/60 hover:text-gray-200 transition-all"
                >
                  {s}
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
      <div className="p-4 border-t border-purple-500/20">
        <div className="flex items-center gap-2 bg-[#1a1a2e] rounded-xl border border-purple-500/30 p-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a clinical question... (include patient weight for dose calculation)"
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
        <p className="text-center text-gray-600 text-xs mt-2">
          {SYSTEM_NAME} · RAG-Only · No Hallucination · Sources Always Cited
        </p>
      </div>
    </div>
  );
};

export default ChatPage;
