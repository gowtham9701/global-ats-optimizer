import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, PenLine, UploadCloud, FilePlus2, FileDown, Loader2,
  LayoutDashboard, Eye, Pencil, Wand2,
} from 'lucide-react'
import FileDropzone from '../components/FileDropzone.jsx'
import ResumeEditor from '../components/ResumeEditor.jsx'
import AtsScore from '../components/AtsScore.jsx'
import { useResume } from '../store/ResumeContext.jsx'
import { parsedToText, emptyResume } from '../store/resumeUtils.js'
import { uploadResume, generateResume, generatePdf } from '../api/client.js'

const COUNTRIES = [
  { id: 'germany', label: '🇩🇪 Germany' },
  { id: 'usa', label: '🇺🇸 USA' },
  { id: 'uk', label: '🇬🇧 UK' },
  { id: 'canada', label: '🇨🇦 Canada' },
  { id: 'india', label: '🇮🇳 India' },
  { id: 'global', label: '🌍 Global' },
]

const TEMPLATES = [
  { id: 'tech_minimalist', name: 'Tech Minimalist' },
  { id: 'executive', name: 'Executive' },
  { id: 'academic', name: 'Academic CV' },
]

export default function Builder() {
  const navigate = useNavigate()
  const {
    parsed, setParsed, setResumeText, fileName, setFileName,
    jobDescription, targetCountry, setTargetCountry,
    template, setTemplate, accentColor, setAnalysis,
  } = useResume()

  const [mode, setMode] = useState(parsed?.raw_text ? 'edit' : 'choose')
  const [desc, setDesc] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [view, setView] = useState('edit') // edit | preview

  // Keep resumeText in context in sync with edits so analysis/PDF use latest.
  const liveText = useMemo(() => parsedToText(parsed), [parsed])
  useEffect(() => {
    if (parsed) setResumeText(liveText)
  }, [liveText]) // eslint-disable-line

  const applyParsed = (p) => {
    setParsed(p)
    setResumeText(parsedToText(p))
    setAnalysis(null) // edits invalidate the previous full analysis
    setMode('edit')
  }

  const handleGenerate = async () => {
    if (!desc.trim()) { setError('Describe your background to generate a resume.'); return }
    setError(''); setLoading(true)
    try {
      const data = await generateResume({ description: desc, targetCountry, fullName: name, email, phone })
      setSource(data.source)
      applyParsed(data.parsed)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Generation failed. Is the backend running?')
    } finally { setLoading(false) }
  }

  const handleUpload = async (file) => {
    setError(''); setLoading(true)
    try {
      const data = await uploadResume(file)
      setFileName(file.name)
      applyParsed(data.parsed)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not parse the file.')
    } finally { setLoading(false) }
  }

  const startBlank = () => applyParsed(emptyResume())

  const downloadPdf = async () => {
    setDownloading(true); setError('')
    try {
      const blob = await generatePdf({ parsed, template, accentColor })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `resume_${template}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('PDF generation failed.')
    } finally { setDownloading(false) }
  }

  // ----- Choose mode -----
  if (mode === 'choose') {
    const card = (icon, title, desc2, onClick, accent) => (
      <motion.button
        whileHover={{ y: -6 }}
        onClick={onClick}
        className="text-left rounded-2xl bg-white shadow-md p-6 border-2 border-transparent hover:border-brand-500 transition"
      >
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} grid place-items-center text-white mb-4`}>
          {icon}
        </div>
        <h3 className="font-bold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-500 mt-1">{desc2}</p>
      </motion.button>
    )
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium mb-4">
            <Sparkles size={15} /> Resume Creator
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Create your resume</h1>
          <p className="text-slate-500 mt-2">Generate from a description, import an existing file, or start from scratch — then edit everything live.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {card(<Wand2 size={22} />, 'Generate from prompt', 'Describe your background and let AI draft an ATS-ready resume.', () => setMode('prompt'), 'from-indigo-500 to-brand-700')}
          {card(<UploadCloud size={22} />, 'Import PDF / DOCX', 'Upload an existing resume and refine it in the editor.', () => setMode('upload'), 'from-sky-500 to-blue-700')}
          {card(<FilePlus2 size={22} />, 'Start blank', 'Build from an empty ATS-friendly template.', startBlank, 'from-emerald-500 to-teal-700')}
        </div>
      </div>
    )
  }

  // ----- Prompt mode -----
  if (mode === 'prompt') {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <button onClick={() => setMode('choose')} className="text-sm text-slate-400 hover:text-slate-600 mb-4">← Back</button>
        <div className="rounded-3xl bg-white shadow-md p-7 space-y-5">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
            <Wand2 size={20} className="text-brand-600" /> Generate from description
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={8}
            placeholder="E.g. I'm a backend engineer with 5 years in Python, FastAPI, Docker & Kubernetes. I built a microservices platform serving 2M users and cut latency 42%. I automated CI/CD and mentored 4 engineers. Targeting a senior backend role."
            className="thin-scroll w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Target Country</label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => (
                <button key={c.id} onClick={() => setTargetCountry(c.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${targetCountry === c.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-200 hover:border-brand-400'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm">{error}</div>}
          <button onClick={handleGenerate} disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-brand-600 text-white font-semibold hover:bg-brand-700 shadow-lg shadow-brand-600/30">
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} Generate Resume
          </button>
        </div>
      </div>
    )
  }

  // ----- Upload mode -----
  if (mode === 'upload') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button onClick={() => setMode('choose')} className="text-sm text-slate-400 hover:text-slate-600 mb-4">← Back</button>
        <FileDropzone onFile={handleUpload} loading={loading} fileName={fileName} />
        {error && <div className="mt-4 rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm">{error}</div>}
      </div>
    )
  }

  // ----- Edit mode (result displayed + editable) -----
  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Sticky top toolbar: download + ATS verification always visible */}
      <div className="sticky top-16 z-30 -mx-6 px-6 py-3 glass border-b mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            <button onClick={() => setView('edit')} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition ${view === 'edit' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}><Pencil size={14} /> Edit</button>
            <button onClick={() => setView('preview')} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition ${view === 'preview' ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}><Eye size={14} /> Preview</button>
          </div>
          {source && <span className="text-xs text-slate-400">Drafted by: <b className="capitalize">{source === 'llm' ? 'AI model' : 'Smart builder'}</b></span>}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <AtsScore getText={() => liveText} jobDescription={jobDescription} targetCountry={targetCountry} />
          <select value={template} onChange={(e) => setTemplate(e.target.value)}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={downloadPdf} disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 shadow-lg shadow-brand-600/30">
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Download PDF
          </button>
          <button onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:border-brand-400">
            <LayoutDashboard size={16} /> Full Analysis
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className={view === 'preview' ? 'hidden lg:block' : ''}>
          <div className="flex items-center gap-2 mb-3 text-slate-700 font-bold">
            <PenLine size={16} className="text-brand-600" /> Edit your resume
          </div>
          <ResumeEditor parsed={parsed} onChange={applyParsed} />
        </div>

        {/* Live preview */}
        <div className={view === 'edit' ? 'hidden lg:block' : ''}>
          <div className="flex items-center gap-2 mb-3 text-slate-700 font-bold">
            <Eye size={16} className="text-brand-600" /> Live preview
          </div>
          <div className="rounded-2xl bg-white shadow-md p-6 min-h-[400px]">
            <PreviewDoc parsed={parsed} />
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewDoc({ parsed }) {
  const c = parsed?.contact || {}
  const sections = (parsed?.sections || []).filter((s) => (s.title || '').toLowerCase() !== 'header')
  return (
    <AnimatePresence mode="popLayout">
      <motion.div key={JSON.stringify(c)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h2 className="text-2xl font-extrabold text-slate-900">{c.name || 'Your Name'}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {[c.email, c.phone, c.location, ...(c.links || [])].filter(Boolean).join('  ·  ')}
        </p>
        <div className="h-0.5 bg-brand-600 rounded my-4" />
        {sections.map((s, i) => (
          <div key={i} className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-brand-700 mb-1.5">{s.title}</h3>
            <ul className="space-y-1">
              {s.lines.filter(Boolean).map((l, j) => (
                <li key={j} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-brand-400">▹</span>{l}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  )
}
