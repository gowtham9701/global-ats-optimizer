import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Loader2, AlertTriangle, CheckCircle2, ArrowRight, Wand2,
} from 'lucide-react'
import { tailorApplication } from '../api/client.js'
import { Button, Panel, PageHeader, SectionTitle, Textarea, Pill } from '../components/ui.jsx'

export default function NewApplication() {
  const navigate = useNavigate()
  const [posting, setPosting] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (!posting.trim()) { setError('Paste a job posting first.'); return }
    setError(''); setLoading(true); setResult(null)
    try {
      const data = await tailorApplication({ posting, save: true })
      setResult(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not tailor this application. Have you built your profile?')
    } finally {
      setLoading(false)
    }
  }

  const matchTone = (s) => (s >= 70 ? 'text-success' : s >= 40 ? 'text-warning' : 'text-danger')

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <PageHeader
        title="New application"
        lead="Paste a job posting. We read it, match it to your profile, and draft a tailored resume and cover letter — using only facts from your profile."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-3">
          <Textarea
            value={posting}
            onChange={(e) => setPosting(e.target.value)}
            rows={16}
            placeholder="Paste the full job posting here — title, company, responsibilities and requirements…"
            className="resize-none"
          />
          {error && (
            <div className="rounded-control bg-danger-surface text-danger px-4 py-3 text-meta flex items-center gap-2">
              <AlertTriangle size={15} /> {error}
            </div>
          )}
          <Button onClick={run} disabled={loading} size="lg" className="w-full">
            {loading ? <Loader2 size={17} className="animate-spin" /> : <Wand2 size={17} />}
            {loading ? 'Tailoring…' : 'Tailor my application'}
          </Button>
          <p className="text-meta text-muted">
            No profile yet? <Link to="/profile" className="text-ink underline underline-offset-2">Build it first →</Link>
          </p>
        </div>

        {/* Result */}
        <div>
          {loading && (
            <Panel className="p-10 grid place-items-center text-muted">
              <Loader2 size={26} className="animate-spin" />
              <p className="mt-3 text-meta">Reading the posting and writing your documents…</p>
            </Panel>
          )}

          {result && !loading && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <Panel className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="title-md text-[22px]">{result.role || 'Role'}</div>
                    <div className="text-muted text-field">{result.company || 'Company'}{result.location ? ` · ${result.location}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className={`title-md text-[26px] ${matchTone(result.match_score)}`}>{result.match_score}%</div>
                    <div className="text-[11px] text-faint">profile match</div>
                  </div>
                </div>
                {result.source === 'llm' && (
                  <div className="mt-2 text-[10.5px] uppercase tracking-[0.12em] text-faint flex items-center gap-1">
                    <Wand2 size={10} /> AI-tailored
                  </div>
                )}
              </Panel>

              {result.gaps?.length > 0 && (
                <Panel className="p-5">
                  <SectionTitle className="text-[18px] flex items-center gap-2"><AlertTriangle size={16} className="text-warning" /> Gaps</SectionTitle>
                  <p className="text-meta text-muted mt-1 mb-3">What the posting asks for that your profile doesn't yet evidence — shown honestly, never invented.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.gaps.map((g, i) => <Pill key={i} tone="warning">{g}</Pill>)}
                  </div>
                </Panel>
              )}

              {result.cover_letter && (
                <Panel className="p-5">
                  <SectionTitle className="text-[18px] mb-2">Cover letter</SectionTitle>
                  <pre className="whitespace-pre-wrap text-field text-ink font-serif leading-relaxed max-h-64 overflow-auto thin-scroll">{result.cover_letter}</pre>
                </Panel>
              )}

              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-meta text-success"><CheckCircle2 size={15} /> Saved to your board</span>
                <Button onClick={() => navigate('/applications')} variant="secondary" size="sm" className="ml-auto">
                  Open board <ArrowRight size={14} />
                </Button>
              </div>
            </motion.div>
          )}

          {!result && !loading && (
            <div className="rounded-panel border border-dashed border-line-strong p-12 text-center">
              <Wand2 size={24} className="mx-auto mb-3 text-faint" strokeWidth={1.5} />
              <p className="text-meta text-muted">Your tailored resume, cover letter and match analysis will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
