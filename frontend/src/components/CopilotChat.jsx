import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, X, Send, Sparkles, Loader2, CheckCircle2, Bot, Wand2,
} from 'lucide-react'
import { useResume } from '../store/ResumeContext.jsx'
import { parsedToText } from '../store/resumeUtils.js'
import { chatCopilot } from '../api/client.js'

const GREETING = {
  role: 'assistant',
  content:
    "👋 Hi! I'm your resume copilot. Ask me anything about your resume, or say ‘improve my resume’ and I'll rewrite it and update your editor. I can check your ATS score, find missing keywords, and strengthen weak bullets.",
  suggestions: [
    'What is my ATS score and why?',
    'Improve my weak bullet points',
    'Add missing keywords from the job description',
  ],
}

export default function CopilotChat() {
  const {
    parsed, resumeText, setParsed, setResumeText, setAnalysis,
    jobDescription, targetCountry,
  } = useResume()

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEdit, setPendingEdit] = useState(null) // { parsed, text }
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const history = [...messages, { role: 'user', content }]
    setMessages(history)
    setInput('')
    setLoading(true)
    try {
      const apiMessages = history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }))
      const data = await chatCopilot({
        messages: apiMessages,
        resumeText: resumeText || parsedToText(parsed),
        parsed,
        jobDescription,
        targetCountry,
      })
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          suggestions: data.suggestions,
          didEdit: data.did_edit,
          source: data.source,
        },
      ])
      if (data.did_edit && data.updated_parsed) {
        setPendingEdit({ parsed: data.updated_parsed, text: data.updated_resume_text })
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ ' + (e?.response?.data?.detail || 'Something went wrong. Is the backend running?') },
      ])
    } finally {
      setLoading(false)
    }
  }

  const applyEdit = () => {
    if (!pendingEdit) return
    setParsed(pendingEdit.parsed)
    setResumeText(pendingEdit.text)
    setAnalysis(null)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '✅ Applied! Your editor now shows the improved resume. Re-verify the ATS score to see the gain.' },
    ])
    setPendingEdit(null)
  }

  const onSuggestion = (s) => {
    if (s === 'Apply to editor') return applyEdit()
    send(s)
  }

  return (
    <>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-600/40 grid place-items-center"
        title="Resume Copilot"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={24} />
            </motion.span>
          ) : (
            <motion.span key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <MessageSquare size={24} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Side panel */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 240 }}
            className="fixed bottom-24 right-6 z-50 w-[min(92vw,400px)] h-[min(72vh,640px)] rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-brand-600 to-indigo-600 text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/20 grid place-items-center">
                <Bot size={18} />
              </div>
              <div className="leading-tight">
                <div className="font-bold text-sm">Resume Copilot</div>
                <div className="text-[10px] opacity-80 flex items-center gap-1">
                  <Sparkles size={10} /> AI-assisted editing
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="thin-scroll flex-1 overflow-auto p-3 space-y-3 bg-slate-50">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                      ${m.role === 'user'
                        ? 'bg-brand-600 text-white rounded-br-sm'
                        : 'bg-white text-slate-700 shadow-sm border border-slate-100 rounded-bl-sm'}`}
                  >
                    <FormattedText text={m.content} />
                    {m.role === 'assistant' && m.suggestions?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {m.suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => onSuggestion(s)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition
                              ${s === 'Apply to editor'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-semibold hover:bg-emerald-100'
                                : 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100'}`}
                          >
                            {s === 'Apply to editor' && <CheckCircle2 size={11} className="inline mr-1" />}
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white shadow-sm border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3">
                    <Loader2 size={16} className="animate-spin text-brand-600" />
                  </div>
                </div>
              )}
            </div>

            {/* Pending apply banner */}
            {pendingEdit && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className="px-3 py-2 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <Wand2 size={13} /> Improved resume ready
                </span>
                <button onClick={applyEdit}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700">
                  Apply to editor
                </button>
              </motion.div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-slate-100 bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  rows={1}
                  placeholder="Ask your copilot…"
                  className="thin-scroll flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm max-h-24 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="w-10 h-10 shrink-0 rounded-xl bg-brand-600 text-white grid place-items-center hover:bg-brand-700 disabled:opacity-40"
                >
                  <Send size={17} />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}

// Minimal **bold** markdown rendering for copilot replies.
function FormattedText({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  )
}
