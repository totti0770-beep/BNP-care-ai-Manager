import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useClosedLoopRAG } from '@/contexts/ClosedLoopRAGContext';
import { Send, Bot, User, Paperclip, Mic, Shield, AlertTriangle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  sources?: {
    documentName: string;
    pageNumber: number;
    similarity: number;
  }[];
  confidenceLevel?: number;
  rejected?: boolean;
  rejectionReason?: string;
}

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const { generateResponse, confidenceThreshold } = useClosedLoopRAG();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response = generateResponse(input);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.rejected ? t('insufficientContext') : response.answer,
        sender: 'ai',
        timestamp: new Date(),
        sources: response.sources,
        confidenceLevel: response.confidenceLevel,
        rejected: response.rejected,
        rejectionReason: response.rejectionReason,
      };

      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);

      if (response.rejected) {
        toast.warning(t('insufficientContext'));
      }
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] h-screen">
      <div className="flex items-center justify-between p-4 border-b border-purple-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-white font-semibold">Nursing AI Assistant</h2>
            <p className="text-gray-400 text-sm">{t('closedLoopRAG')} • {t('confidence')}: {(confidenceThreshold * 100).toFixed(0)}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-green-600/20 text-green-400 text-xs flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {t('offlineOnly')}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mb-4">
              <Bot className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">{t('howCanIHelp')}</h3>
            <p className="text-gray-400 max-w-md mb-6">{t('askNursingQuestion')}</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {[t('medicationProtocols'), t('patientSafety'), t('infectionControl'), t('criticalCare')].map((label) => (
                <span key={label} className="px-3 py-1.5 rounded-full bg-[#1a1a2e] border border-purple-500/30 text-gray-400 text-sm cursor-pointer hover:border-purple-500/60 transition-colors" onClick={() => setInput(label)}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.sender === 'user'
                  ? 'bg-gradient-to-br from-purple-500 to-violet-600'
                  : message.rejected
                  ? 'bg-gradient-to-br from-yellow-500 to-orange-600'
                  : 'bg-gradient-to-br from-gray-600 to-gray-700'
              }`}>
                {message.sender === 'user' ? (
                  <User className="w-4 h-4 text-white" />
                ) : message.rejected ? (
                  <AlertTriangle className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
              <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                message.sender === 'user'
                  ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white'
                  : message.rejected
                  ? 'bg-yellow-600/20 text-yellow-200 border border-yellow-500/30'
                  : 'bg-[#1a1a2e] text-gray-200 border border-purple-500/20'
              }`}>
                <p>{message.content}</p>

                {!message.rejected && message.sources && message.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-purple-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-4 h-4 text-purple-400" />
                      <span className="text-xs text-purple-400">{t('sources')}</span>
                    </div>
                    {message.sources.map((source, idx) => (
                      <div key={idx} className="text-xs text-gray-400 mb-1">
                        • {source.documentName} ({t('page')} {source.pageNumber}) - {(source.similarity * 100).toFixed(1)}%
                      </div>
                    ))}
                    {message.confidenceLevel && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">{t('confidence')}:</span>
                        <span className={`text-xs font-medium ${
                          message.confidenceLevel >= 0.8 ? 'text-green-400' :
                          message.confidenceLevel >= 0.6 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {(message.confidenceLevel * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <span className="text-xs opacity-50 mt-2 block">{message.timestamp.toLocaleTimeString()}</span>
              </div>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-[#1a1a2e] rounded-2xl px-4 py-3 border border-purple-500/20">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-purple-500/20">
        <div className="flex items-center gap-2 bg-[#1a1a2e] rounded-xl border border-purple-500/30 p-2">
          <button className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors">
            <Paperclip className="w-5 h-5 text-gray-400" />
          </button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t('typeMessage')}
            className="flex-1 bg-transparent border-0 text-white placeholder:text-gray-500 focus-visible:ring-0 shadow-none"
          />
          <button className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors">
            <Mic className="w-5 h-5 text-gray-400" />
          </button>
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white px-4"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
        <p className="text-center text-gray-500 text-xs mt-2">
          {t('closedLoopRAG')} • {t('officialOnlyFilter')} • {t('contextRejection')}
        </p>
      </div>
    </div>
  );
};

export default ChatPage;
