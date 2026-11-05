import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, X, Send, Loader2, CheckCircle2, Wand2, Bot, Zap, Trash2,
} from 'lucide-react'
import { useResume } from '../store/ResumeContext.jsx'
import { parsedToText } from '../store/resumeUtils.js'
import { streamCopilot, chatCopilot } from '../api/client.js'

// Chips that should route the user into the resume studio rather than loop as chat.
const NAV_SUGGESTIONS = {
  'Create a resume from a description': '/resume?mode=prompt',
  'Upload an existing resume': '/resume?mode=upload',
}

const GREETING = {
  role: 'assistant',
  content:
    "Hi, I'm your AI resume copilot. Ask me anything about your resume, or tell me to **improve it** and I'll rewrite it live. I can explain your ATS score, surface missing keywords, and strengthen weak bullets.",
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
  const [thinking, setThinking] = useState('')
  const [pendingEdit, setPendingEdit] = useState(null)
  const scrollRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, thinking])

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const history = [...messages, { role: 'user', content }]
    setMessages(history)
    setInput('')
    setLoading(true)
    setThinking('Thinking…')

    const apiMessages = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    const payload = {
      messages: apiMessages,
      resumeText: resumeText || parsedToText(parsed),
      parsed,
      jobDescription,
      targetCountry,
    }

    // Insert a live assistant placeholder we stream into.
    let assistantIndex = -1
    setMessages((prev) => {
      assistantIndex = prev.length
      return [...prev, { role: 'assistant', content: '', streaming: true }]
    })

    const appendToken = (chunk) => {
      setThinking('')
      setMessages((prev) => {
        const next = [...prev]
        const i = next.length - 1
        if (next[i]?.role === 'assistant') {
          next[i] = { ...next[i], content: (next[i].content || '') + chunk }
        }
        return next
      })
    }

    const finalize = (ev) => {
      setMessages((prev) => {
        const next = [...prev]
        const i = next.length - 1
        if (next[i]?.role === 'assistant') {
          next[i] = {
            role: 'assistant',
            content: ev.reply ?? next[i].content,
            suggestions: ev.suggestions,
            didEdit: ev.did_edit,
            source: ev.source,
            streaming: false,
          }
        }
        return next
      })
      if (ev.did_edit && ev.updated_parsed) {
        setPendingEdit({ parsed: ev.updated_parsed, text: ev.updated_resume_text })
      }
    }

    try {
      const finalEvent = await streamCopilot(payload, (ev) => {
        if (ev.type === 'status') setThinking(ev.text || 'Thinking…')
        else if (ev.type === 'token') appendToken(ev.text || '')
        else if (ev.type === 'final') finalize(ev)
      })
      if (!finalEvent) {
        // Stream yielded nothing usable — fall back to the non-streaming call.
        const data = await chatCopilot(payload)
        finalize({ ...data, did_edit: data.did_edit, updated_parsed: data.updated_parsed, updated_resume_text: data.updated_resume_text })
      }
    } catch (e) {
      // Network/stream error → try the plain endpoint, else show an error.
      try {
        const data = await chatCopilot(payload)
        finalize({ ...data, did_edit: data.did_edit, updated_parsed: data.updated_parsed, updated_resume_text: data.updated_resume_text })
      } catch (e2) {
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'assistant',
            content: '⚠️ ' + (e2?.response?.data?.detail || 'Something went wrong. Is the backend running?'),
            streaming: false,
          }
          return next
        })
      }
    } finally {
      setLoading(false)
      setThinking('')
    }
  }

  const applyEdit = () => {
    if (!pendingEdit) return
    setParsed(pendingEdit.parsed)
    setResumeText(pendingEdit.text)
    setAnalysis(null)
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '✅ Applied! Your editor now shows the improved resume. Re-verify the ATS score to see the gain.', streaming: false },
    ])
    setPendingEdit(null)
  }

  const resetChat = () => {
    setMessages([GREETING])
    setPendingEdit(null)
  }

  const onSuggestion = (s) => {
    if (s === 'Apply to editor') return applyEdit()
    if (NAV_SUGGESTIONS[s]) {
      setOpen(false)
      navigate(NAV_SUGGESTIONS[s])
      return
    }
    send(s)
  }

  return (
    <>
      {/* Floating launcher */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 h-12 pl-4 pr-5 rounded-control bg-primary text-on-primary shadow-cta flex items-center gap-2"
        title="AI Copilot"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={22} />
            </motion.span>
          ) : (
            <motion.span key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} className="flex items-center gap-2">
              <Sparkles size={20} />
              <span className="font-semibold text-sm">AI Copilot</span>
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: 440, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 440, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed bottom-24 right-6 z-50 w-[min(94vw,420px)] h-[min(78vh,720px)] rounded-dialog bg-surface shadow-panel border border-line flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-card border-b border-line flex items-center gap-3">
              <div className="w-9 h-9 rounded-control bg-primary text-on-primary grid place-items-center">
                <Bot size={18} />
              </div>
              <div className="leading-tight flex-1">
                <div className="font-serif text-[17px] text-ink">Copilot</div>
                <div className="text-[10.5px] text-muted flex items-center gap-1">
                  <Zap size={10} /> Live AI · streams as it thinks
                </div>
              </div>
              <button onClick={resetChat} title="New chat" className="w-8 h-8 grid place-items-center rounded-control hover:bg-[var(--hover)] text-muted transition">
                <Trash2 size={15} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="thin-scroll flex-1 overflow-auto p-3 space-y-3 bg-surface">
              {messages.map((m, i) => (
                <Message key={i} m={m} onSuggestion={onSuggestion} />
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-card shadow-raised border border-line rounded-card rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                    <ThinkingDots />
                    <span className="text-meta text-muted">{thinking}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Pending apply */}
            {pendingEdit && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className="px-3 py-2 bg-success-surface border-t border-line flex items-center justify-between">
                <span className="text-meta text-success font-medium flex items-center gap-1">
                  <Wand2 size={13} /> Improved resume ready
                </span>
                <button onClick={applyEdit}
                  className="text-control font-medium px-3 py-1.5 rounded-control bg-primary text-on-primary hover:bg-primary-hover">
                  Apply to editor
                </button>
              </motion.div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-line bg-card">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  rows={1}
                  placeholder="Ask anything, or say 'improve my resume'…"
                  className="thin-scroll flex-1 resize-none rounded-control bg-input border border-line-input px-3 py-2 text-field max-h-28 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                <button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="w-10 h-10 shrink-0 rounded-control bg-primary text-on-primary grid place-items-center hover:bg-primary-hover disabled:opacity-40"
                >
                  {loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}

function Message({ m, onSuggestion }) {
  const isUser = m.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-card px-3.5 py-2.5 text-field leading-relaxed
          ${isUser
            ? 'bg-primary text-on-primary rounded-br-sm'
            : 'bg-card text-ink shadow-raised border border-line rounded-bl-sm'}`}
      >
        <FormattedText text={m.content} />
        {m.streaming && !m.content && <span className="inline-block w-2 h-4 bg-muted animate-pulse align-middle rounded-sm" />}
        {!isUser && m.source === 'llm' && !m.streaming && (
          <div className="mt-1.5 text-[9px] uppercase tracking-[0.1em] text-faint flex items-center gap-1">
            <Sparkles size={9} /> AI-generated
          </div>
        )}
        {!isUser && m.suggestions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {m.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                className={`text-control px-2.5 py-1 rounded-full border transition-colors
                  ${s === 'Apply to editor'
                    ? 'bg-success-surface border-line text-success font-medium hover:brightness-95'
                    : 'bg-surface border-line text-ink hover:bg-[var(--hover)]'}`}
              >
                {s === 'Apply to editor' && <CheckCircle2 size={11} className="inline mr-1" />}
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  )
}

// Lightweight markdown: **bold**, bullet lines, and paragraph breaks.
function FormattedText({ text }) {
  const lines = String(text || '').split('\n')
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        const isBullet = /^[-*•]\s+/.test(trimmed)
        const body = isBullet ? trimmed.replace(/^[-*•]\s+/, '') : line
        return (
          <div key={i} className={isBullet ? 'flex gap-1.5' : ''}>
            {isBullet && <span className="text-faint mt-0.5">—</span>}
            <span>{renderBold(body)}</span>
          </div>
        )
      })}
    </div>
  )
}

function renderBold(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  )
}
