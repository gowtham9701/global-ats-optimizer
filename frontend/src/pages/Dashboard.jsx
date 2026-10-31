import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Gauge, Bot, KeyRound, BookOpen, ListChecks, Globe2, FileDown,
  Loader2, RefreshCw, Highlighter, Wrench,
} from 'lucide-react'
import ScoreDial from '../components/ScoreDial.jsx'
import ScoreBars from '../components/ScoreBars.jsx'
import LineHighlighter from '../components/LineHighlighter.jsx'
import SplitScreen from '../components/SplitScreen.jsx'
import Chips from '../components/Chips.jsx'
import Card from '../components/Card.jsx'
import { useResume } from '../store/ResumeContext.jsx'
import { analyzeResume, localizeResume, generatePdf } from '../api/client.js'

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    parsed, resumeText, jobDescription, targetCountry, template, accentColor,
    analysis, setAnalysis, localized, setLocalized,
  } = useResume()

  const [loading, setLoading] = useState(false)
  const [localizing, setLocalizing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

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
      const data = await analyzeResume({ resumeText, jobDescription, targetCountry })
      setAnalysis(data)
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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Optimization Dashboard</h1>
          <p className="text-slate-500 text-sm">
            Target: <span className="font-semibold capitalize">{targetCountry}</span> ·
            Template: <span className="font-semibold capitalize">{template.replace('_', ' ')}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:border-brand-400"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Re-analyze
          </button>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-lg shadow-brand-600/30"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Download PDF
          </button>
        </div>
      </div>

      {error && <div className="mb-6 rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>}

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
              <p className="text-sm text-slate-600 leading-relaxed">{analysis.agent_narrative}</p>
            </Card>
          </div>

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
                  <li key={i} className="text-sm text-slate-600 flex gap-2">
                    <span className="text-brand-500">▹</span> {r}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Grounded Knowledge (RAG)" icon={BookOpen}>
              <ul className="space-y-2">
                {analysis.rag_context.map((c, i) => (
                  <li key={i} className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">{c}</li>
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
                <p className="text-slate-500 text-sm mb-4">
                  Convert this resume to {targetCountry} conventions (structure + privacy localization).
                </p>
                <button
                  onClick={runLocalize}
                  disabled={localizing}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-600 text-white font-semibold hover:bg-brand-700"
                >
                  {localizing ? <Loader2 size={18} className="animate-spin" /> : <Globe2 size={18} />}
                  Convert to {targetCountry}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {localized.removed_fields?.length > 0 && (
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold">Removed for privacy:</span>{' '}
                    {localized.removed_fields.join(', ')}
                  </div>
                )}
                <SplitScreen
                  leftTitle="Original Resume"
                  rightTitle={`${targetCountry} Localized`}
                  left={resumeText}
                  right={
                    <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                      {localized.converted_text}
                    </pre>
                  }
                />
                {localized.structural_notes?.length > 0 && (
                  <ul className="space-y-1.5 pt-2">
                    {localized.structural_notes.map((n, i) => (
                      <li key={i} className="text-xs text-slate-500 flex gap-2">
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
