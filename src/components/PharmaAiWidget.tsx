import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, RotateCcw, Send, X } from 'lucide-react';
import { api } from '../lib/api';
import type { BatchStatus } from '../lib/pharmaLogic';
import { BatchStatusBadge } from './StatusBadge';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  verifiedBatches?: Array<{
    batchId: string;
    found: boolean;
    status: BatchStatus;
    medicineName?: string;
    drugGroup?: string;
    manufacturerName?: string;
    expiryDate?: string;
  }>;
  isError?: boolean;
}

const STORAGE_KEY = 'medina_ai_chat_history_v1';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text:
    'Assalamu Alaikum & Welcome to MediNa AI — your intelligent Pharmaceutical Traceability & Health Guidance Assistant. 🩺\nHow can I assist you today?\n\n[ Note: I provide primary pharmaceutical guidance only. Please consult a licensed doctor for prescriptions or emergencies. ]',
};

export function PharmaAiWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore storage access errors
    }
    return [WELCOME_MESSAGE];
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Ignore storage quota errors
    }
  }, [messages]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading]);

  function handleClearChat() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
    setMessages([WELCOME_MESSAGE]);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await api.askPharmaAi(
        trimmed,
        nextHistory.map((m) => ({ role: m.role, text: m.text }))
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.reply,
          verifiedBatches: res.verifiedBatches,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Unable to reach MediNa AI.',
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function prefillBatchCheck() {
    setInput('Verify Batch CPA-ATB-P001-1028');
    inputRef.current?.focus();
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 no-print">
      {open ? (
        <section
          aria-label="MediNa AI Assistant"
          className="flex h-[480px] max-h-[76vh] w-[calc(100vw-2rem)] sm:w-[400px] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-teal-200/80 bg-teal-50 text-[#0F766E]">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                  MediNa AI
                </h2>
                <p className="text-xs text-slate-500">Batch &amp; DGDA Compliance Guide</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 1 && (
                <button
                  type="button"
                  title="Clear chat history"
                  aria-label="Clear chat history"
                  onClick={handleClearChat}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                aria-label="Close MediNa AI"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 bg-slate-50/60"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-2xs ${
                    m.role === 'user'
                      ? 'bg-[#0F766E] text-white'
                      : m.isError
                      ? 'border border-rose-200 bg-rose-50 text-rose-800'
                      : 'border border-slate-200/80 bg-white text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.text}</p>

                  {m.verifiedBatches && m.verifiedBatches.length > 0 && (
                    <div className="mt-2.5 space-y-2 border-t border-slate-100 pt-2">
                      {m.verifiedBatches.map((vb) => (
                        <div
                          key={vb.batchId}
                          className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 text-xs text-slate-800"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">{vb.batchId}</span>
                            <BatchStatusBadge status={vb.status} />
                          </div>
                          {vb.found && vb.medicineName && (
                            <div className="mt-1 text-slate-600">
                              {vb.medicineName} · {vb.manufacturerName} · Exp {vb.expiryDate}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-start">
                <div
                  aria-label="MediNa AI is typing"
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-500 shadow-2xs"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-600 typing-dot" />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-600 typing-dot" />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-600 typing-dot" />
                </div>
              </div>
            )}
          </div>

          {/* Batch Quick-Check & Safety Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2 bg-white">
            <button
              type="button"
              onClick={prefillBatchCheck}
              className="rounded-full border border-teal-200 bg-teal-50/70 px-3 py-1 text-xs font-medium text-[#0F766E] hover:bg-teal-100/70 transition-colors whitespace-nowrap shrink-0"
            >
              Quick Batch Check
            </button>
            <button
              type="button"
              onClick={() => void sendMessage('What do AUTHENTIC, EXPIRED, and RECALLED statuses mean?')}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              DGDA Status Rules
            </button>
            <button
              type="button"
              onClick={() => void sendMessage('How do I report an overpriced or counterfeit medicine?')}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              How to Report
            </button>
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-slate-200/80 bg-white p-3 rounded-b-2xl"
          >
            <label htmlFor="pharma-ai-input" className="sr-only">
              Ask MediNa AI
            </label>
            <input
              ref={inputRef}
              id="pharma-ai-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter Batch ID or DGDA question..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message to MediNa AI"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0F766E] text-white hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50 transition-all"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[#0F766E] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#115E59] hover:shadow-xl hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all whitespace-nowrap"
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
          <span>MediNa AI</span>
        </button>
      )}
    </div>
  );
}