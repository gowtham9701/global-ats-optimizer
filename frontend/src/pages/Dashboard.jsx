import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Gauge, Bot, KeyRound, BookOpen, ListChecks, Globe2, FileDown,
  Loader2, RefreshCw, Highlighter, Wrench, TrendingUp, PenLine, Eye,
} from 'lucide-react'
import ScoreDial from '../components/ScoreDial.jsx'
import ScoreBars from '../components/ScoreBars.jsx'
import LineHighlighter from '../components/LineHighlighter.jsx'
import SplitScreen from '../components/SplitScreen.jsx'
import Chips from '../components/Chips.jsx'
import Card from '../components/Card.jsx'
import ScoreHistory from '../components/ScoreHistory.jsx'
import FormatCheck from '../components/FormatCheck.jsx'
import TemplatePreview from '../components/TemplatePreview.jsx'
import { useResume } from '../store/ResumeContext.jsx'
import { analyzeResume, localizeResume, generatePdf } from '../api/client.js'

const COUNTRIES = ['germany', 'usa', 'uk', 'canada', 'india', 'global']

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    parsed, resumeText, jobDescription, targetCountry, setTargetCountry,
    template, setTemplate, accentColor,
    analysis, setAnalysis, localized, setLocalized,
  } = useResume()

  const [loading, setLoading] = useState(false)
  const [localizing, setLocalizing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    if (!parsed?.raw_text) {
      navigate('/')
      return
    }
    if (!analysis) runAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runAnalysis = async () => {
    setError('')
    setLoading(true)
    try {
      const wordCount = (resumeText || '').split(/\s+/).filter(Boolean).length
      const data = await analyzeResume({ resumeText, jobDescription, targetCountry, template, wordCount })
      setAnalysis(data)
      setHistoryKey((k) => k + 1)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Analysis failed. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const runLocalize = async () => {
    setLocalizing(true)
    try {
      const data = await localizeResume({ resumeText, targetCountry })
      setLocalized(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Localization failed.')
    } finally {
      setLocalizing(false)
    }
  }

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const blob = await generatePdf({ parsed, template, accentColor })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `resume_${template}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('PDF generation failed.')
    } finally {
      setDownloading(false)
    }
  }

  if (!parsed?.raw_text) return null

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="title-xl text-[34px] sm:text-[40px]">Optimization</h1>
          <p className="text-muted text-lead mt-1">
            Target: <span className="text-ink capitalize">{targetCountry}</span> ·
            Template: <span className="text-ink capitalize">{template.replace('_', ' ')}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={targetCountry}
            onChange={(e) => { setTargetCountry(e.target.value); setLocalized(null) }}
            className="rounded-control bg-input border border-line-input px-3 py-2 text-control capitalize focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          >
            {COUNTRIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
          <button
            onClick={() => navigate('/resume')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-control text-field text-muted hover:text-ink hover:bg-[var(--hover)] transition-colors"
          >
            <PenLine size={16} /> Open in editor
          </button>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-control text-field text-muted hover:text-ink hover:bg-[var(--hover)] transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Re-analyze
          </button>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-control bg-primary text-on-primary text-field font-medium hover:bg-primary-hover shadow-cta"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Download PDF
          </button>
        </div>
      </div>

      {error && <div className="mb-6 rounded-control bg-danger-surface text-danger px-4 py-3 text-meta">{error}</div>}

      {loading && !analysis ? (
        <div className="grid place-items-center py-24 text-brand-600">
          <Loader2 size={40} className="animate-spin" />
          <p className="mt-3 font-medium">Running the agentic analysis…</p>
        </div>
      ) : analysis ? (
        <div className="space-y-6">
          {/* Top row: score + breakdown + narrative */}
          <div className="grid lg:grid-cols-3 gap-6">
            <Card title="Benchmark Score" icon={Gauge} className="grid place-items-center">
              <ScoreDial score={analysis.total_score} />
            </Card>
            <Card title="Diagnostics Breakdown" icon={ListChecks}>
              <ScoreBars breakdown={analysis.breakdown} />
            </Card>
            <Card title="AI Agent Briefing" icon={Bot}>
              <p className="text-sm text-muted leading-relaxed">{analysis.agent_narrative}</p>
            </Card>
          </div>

          {/* History trend + country format compliance */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card title="Score History & Trend" icon={TrendingUp}>
              <ScoreHistory refreshKey={historyKey} />
            </Card>
            <Card title={`Country Format Check · ${targetCountry}`} icon={Globe2}>
              <p className="text-sm text-muted mb-3">
                Verify this resume against {targetCountry} ATS/format conventions — works for uploaded resumes too.
              </p>
              <FormatCheck getText={() => resumeText} targetCountry={targetCountry} />
            </Card>
          </div>

          {/* WYSIWYG template preview */}
          <Card title="Live Resume Preview" icon={Eye}>
            <TemplatePreview parsed={parsed} template={template} accentColor={accentColor} />
          </Card>

          {/* Keywords */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card title="Matched Keywords" icon={KeyRound}>
              <Chips items={analysis.matched_keywords} tone="green" />
            </Card>
            <Card title="Missing Keywords (add these)" icon={KeyRound}>
              <Chips items={analysis.missing_keywords} tone="red" />
            </Card>
          </div>

          {/* Recommendations + RAG */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card title="Recommendations" icon={Wrench}>
              <ul className="space-y-2">
                {analysis.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-muted flex gap-2">
                    <span className="text-brand-500">▹</span> {r}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Grounded Knowledge (RAG)" icon={BookOpen}>
              <ul className="space-y-2">
                {analysis.rag_context.map((c, i) => (
                  <li key={i} className="text-xs text-muted bg-surface rounded-lg p-2.5">{c}</li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Line highlighter */}
          <Card title="Key Line Highlighter" icon={Highlighter}>
            <div className="flex gap-4 mb-4 text-xs">
              <span className="flex items-center gap-1 text-emerald-600">● High impact</span>
              <span className="flex items-center gap-1 text-amber-600">● Needs metrics</span>
              <span className="flex items-center gap-1 text-rose-600">● Weak phrasing</span>
            </div>
            <div className="thin-scroll max-h-[480px] overflow-auto pr-2">
              <LineHighlighter lines={analysis.line_profiles} />
            </div>
          </Card>

          {/* Localization split screen */}
          <Card title={`Multi-Country Converter → ${targetCountry}`} icon={Globe2}>
            {!localized ? (
              <div className="text-center py-6">
                <p className="text-muted text-sm mb-4">
                  Convert this resume to {targetCountry} conventions (structure + privacy localization).
                </p>
                <button
                  onClick={runLocalize}
                  disabled={localizing}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-semibold hover:bg-primary-hover"
                >
                  {localizing ? <Loader2 size={18} className="animate-spin" /> : <Globe2 size={18} />}
                  Convert to {targetCountry}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {localized.removed_fields?.length > 0 && (
                  <div className="text-xs text-muted">
                    <span className="font-semibold">Removed for privacy:</span>{' '}
                    {localized.removed_fields.join(', ')}
                  </div>
                )}
                <SplitScreen
                  leftTitle="Original Resume"
                  rightTitle={`${targetCountry} Localized`}
                  left={resumeText}
                  right={
                    <pre className="text-sm text-ink whitespace-pre-wrap font-sans">
                      {localized.converted_text}
                    </pre>
                  }
                />
                {localized.structural_notes?.length > 0 && (
                  <ul className="space-y-1.5 pt-2">
                    {localized.structural_notes.map((n, i) => (
                      <li key={i} className="text-xs text-muted flex gap-2">
                        <span className="text-brand-500">▹</span> {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  )
}
