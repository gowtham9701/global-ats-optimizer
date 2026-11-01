import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, Globe2, ScanSearch, FileDown, Wand2, Rocket } from 'lucide-react'
import FileDropzone from '../components/FileDropzone.jsx'
import TemplateGrid from '../components/TemplateGrid.jsx'
import AtsScore from '../components/AtsScore.jsx'
import FormatCheck from '../components/FormatCheck.jsx'
import { useResume } from '../store/ResumeContext.jsx'
import { uploadResume, fetchTemplates } from '../api/client.js'

const COUNTRIES = [
  { id: 'germany', label: '🇩🇪 Germany' },
  { id: 'usa', label: '🇺🇸 USA' },
  { id: 'uk', label: '🇬🇧 UK' },
  { id: 'canada', label: '🇨🇦 Canada' },
  { id: 'india', label: '🇮🇳 India' },
  { id: 'global', label: '🌍 Global' },
]

const FEATURES = [
  { icon: Globe2, title: 'Multi-Country Converter', desc: 'Reshape a dense Indian resume into a clean German Lebenslauf — ATS-aligned.' },
  { icon: ScanSearch, title: 'Deep ATS Diagnostics', desc: 'A benchmark score /100 with color-coded line-by-line highlights.' },
  { icon: Wand2, title: 'Agentic AI Tools', desc: 'Keyword matcher, action-verb enhancer & formatter driven by an AI agent.' },
  { icon: FileDown, title: 'Template Engine', desc: '3 polished templates, instantly re-rendered to downloadable PDF.' },
]

export default function Home() {
  const navigate = useNavigate()
  const {
    parsed, setParsed, resumeText, setResumeText, fileName, setFileName,
    jobDescription, setJobDescription, targetCountry, setTargetCountry,
    template, setTemplate,
  } = useResume()

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTemplates().then(setTemplates).catch(() => setTemplates([
      { id: 'tech_minimalist', name: 'Tech Minimalist', description: 'Clean single-column layout for engineering roles.' },
      { id: 'executive', name: 'Executive Professional', description: 'Polished layout for senior leadership.' },
      { id: 'academic', name: 'Academic CV', description: 'Long-form CV for research and academia.' },
    ]))
  }, [])

  const handleFile = async (file) => {
    setError('')
    setLoading(true)
    try {
      const data = await uploadResume(file)
      setParsed(data.parsed)
      setResumeText(data.parsed.raw_text)
      setFileName(file.name)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to parse the file. Try a PDF, DOCX or TXT.')
    } finally {
      setLoading(false)
    }
  }

  const canProceed = Boolean(parsed?.raw_text)

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Hero */}
      <section className="text-center max-w-3xl mx-auto mb-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium mb-5"
        >
          <Sparkles size={15} /> Open-source · Zero-cost AI · Self-hosted
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900"
        >
          Global ATS Resume{' '}
          <span className="bg-gradient-to-r from-brand-500 via-indigo-500 to-brand-700 bg-[length:200%_auto] animate-gradient-pan bg-clip-text text-transparent">
            Optimizer & Agentic Architect
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-5 text-lg text-slate-500"
        >
          Upload your resume, let an AI agent diagnose it against any job description,
          localize it for any country, and re-render a beautiful ATS-ready PDF.
        </motion.p>
      </section>

      {/* Upload + settings */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="space-y-4">
          <FileDropzone onFile={handleFile} loading={loading} fileName={fileName} />
          {parsed?.raw_text && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-white shadow-md p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm text-slate-500">Quick check before you dive in:</span>
                <AtsScore getText={() => resumeText} jobDescription={jobDescription} targetCountry={targetCountry} template={template} wordCount={(resumeText || '').split(/\s+/).filter(Boolean).length} />
              </div>
              <FormatCheck getText={() => resumeText} targetCountry={targetCountry} compact />
            </motion.div>
          )}
        </div>

        <div className="rounded-3xl bg-white shadow-md p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Paste a Job Description (optional, powers keyword matching)
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={5}
              placeholder="Paste the target job description here…"
              className="thin-scroll w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Target Country</label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTargetCountry(c.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition
                    ${targetCountry === c.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-400'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-8 rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>
      )}

      {/* Template selection */}
      <section className="mb-12">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Choose a Template</h2>
        <p className="text-slate-500 text-sm mb-5">Your optimized resume will be re-rendered in this style.</p>
        <TemplateGrid templates={templates} selected={template} onSelect={setTemplate} />
      </section>

      {/* CTA */}
      <div className="text-center flex flex-col sm:flex-row items-center justify-center gap-3">
        <motion.button
          whileHover={{ scale: canProceed ? 1.04 : 1 }}
          whileTap={{ scale: canProceed ? 0.97 : 1 }}
          disabled={!canProceed}
          onClick={() => navigate('/dashboard')}
          className={`inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-lg shadow-lg transition
            ${canProceed ? 'bg-brand-600 text-white shadow-brand-600/30 hover:bg-brand-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
        >
          <Rocket size={20} /> Analyze & Optimize
        </motion.button>
        <Link
          to="/builder"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-lg bg-white border border-slate-200 text-slate-700 hover:border-brand-400 transition"
        >
          <Wand2 size={20} className="text-brand-600" /> Create from scratch
        </Link>
      </div>
      {!canProceed && <p className="text-center text-xs text-slate-400 mt-3">Upload a resume to analyze, or create a new one from scratch</p>}

      {/* Features */}
      <section className="mt-20 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="rounded-2xl bg-white shadow-md p-5"
          >
            <div className="w-11 h-11 rounded-xl bg-brand-50 grid place-items-center text-brand-600 mb-3">
              <f.icon size={20} />
            </div>
            <h3 className="font-bold text-slate-800">{f.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{f.desc}</p>
          </motion.div>
        ))}
      </section>
    </div>
  )
}
