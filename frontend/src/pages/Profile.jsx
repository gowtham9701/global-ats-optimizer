import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Loader2, Save, Plus, Trash2, UploadCloud, CheckCircle2, Database,
} from 'lucide-react'
import { fetchProfile, saveProfile, seedProfile, uploadResume } from '../api/client.js'
import { Button, Panel, PageHeader, Label, Input, Textarea, Field } from '../components/ui.jsx'

const EMPTY = {
  full_name: '', headline: '', email: '', phone: '', location: '', summary: '',
  links: [], skills: [], experience: [], projects: [], education: [],
}

function strength(p) {
  let score = 0
  if (p.full_name) score += 10
  if (p.headline) score += 10
  if (p.summary && p.summary.length > 40) score += 15
  if ((p.skills || []).length >= 5) score += 20
  if ((p.experience || []).length >= 1) score += 20
  if ((p.projects || []).length >= 1) score += 10
  if ((p.education || []).length >= 1) score += 10
  if ((p.links || []).length >= 1) score += 5
  return Math.min(score, 100)
}

export default function Profile() {
  const [profile, setProfile] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchProfile()
      .then((d) => {
        setEnabled(d.enabled)
        if (d.profile) setProfile({ ...EMPTY, ...d.profile })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const score = useMemo(() => strength(profile), [profile])
  const set = (field, value) => { setProfile((p) => ({ ...p, [field]: value })); setSaved(false) }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const d = await saveProfile(profile)
      if (d.profile) setProfile({ ...EMPTY, ...d.profile })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not save. Is persistence configured?')
    } finally { setSaving(false) }
  }

  const importResume = async (file) => {
    setUploading(true); setError('')
    try {
      const up = await uploadResume(file)
      const d = await seedProfile({ parsed: up.parsed })
      if (d.profile) setProfile({ ...EMPTY, ...d.profile })
      setEnabled(d.enabled)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not import this file.')
    } finally { setUploading(false) }
  }

  if (loading) {
    return <div className="py-24 grid place-items-center text-muted"><Loader2 size={26} className="animate-spin" /></div>
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <PageHeader title="Your profile" lead="The single source of truth for every tailored resume and cover letter.">
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-control bg-card border border-line-input text-field hover:bg-[var(--hover)] cursor-pointer shadow-raised">
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />} Import from resume
          <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden"
            onChange={(e) => e.target.files?.[0] && importResume(e.target.files[0])} />
        </label>
        <Button onClick={save} disabled={saving || !enabled}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saved ? 'Saved' : 'Save profile'}
        </Button>
      </PageHeader>

      {!enabled && (
        <Panel className="mb-5 px-4 py-3 flex items-center gap-2 text-meta text-warning bg-warning-surface border-0">
          <Database size={15} /> Persistence is off — your profile won't be saved until <code className="font-mono">DATABASE_URL</code> is set. You can still edit and preview.
        </Panel>
      )}
      {error && <div className="mb-5 rounded-control bg-danger-surface text-danger px-4 py-3 text-meta">{error}</div>}

      {/* Strength meter */}
      <Panel className="mb-6 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-field font-medium">Profile strength</span>
          <span className="font-serif text-[20px]">{score}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--selected)] overflow-hidden">
          <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${score}%` }} />
        </div>
      </Panel>

      <div className="space-y-5">
        <Section title="Basics">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full name" value={profile.full_name} onChange={(v) => set('full_name', v)} placeholder="Jane Doe" />
            <Field label="Headline" value={profile.headline} onChange={(v) => set('headline', v)} placeholder="Senior Backend Engineer" />
            <Field label="Email" value={profile.email} onChange={(v) => set('email', v)} placeholder="jane@example.com" />
            <Field label="Phone" value={profile.phone} onChange={(v) => set('phone', v)} placeholder="+49 151 23456" />
            <Field label="Location" value={profile.location} onChange={(v) => set('location', v)} placeholder="Berlin, Germany" />
            <Field label="Links (comma separated)" value={(profile.links || []).join(', ')}
              onChange={(v) => set('links', v.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="linkedin.com/in/… , github.com/…" />
          </div>
          <div className="mt-3">
            <Label>Summary</Label>
            <Textarea value={profile.summary} onChange={(e) => set('summary', e.target.value)} rows={3} placeholder="A short professional summary…" />
          </div>
        </Section>

        <Section title="Skills">
          <TagInput tags={profile.skills || []} onChange={(v) => set('skills', v)} placeholder="Add a skill and press Enter" />
        </Section>

        <Section title="Experience" onAdd={() => set('experience', [...(profile.experience || []), { role: '', company: '', dates: '', bullets: [''] }])}>
          {(profile.experience || []).map((exp, i) => (
            <RepeatCard key={i} onRemove={() => set('experience', profile.experience.filter((_, j) => j !== i))}>
              <div className="grid sm:grid-cols-3 gap-2 mb-2">
                <Field label="Role" value={exp.role} onChange={(v) => updateItem(profile, set, 'experience', i, 'role', v)} />
                <Field label="Company" value={exp.company} onChange={(v) => updateItem(profile, set, 'experience', i, 'company', v)} />
                <Field label="Dates" value={exp.dates} onChange={(v) => updateItem(profile, set, 'experience', i, 'dates', v)} placeholder="06/2021 – Present" />
              </div>
              <BulletList bullets={exp.bullets || []} onChange={(b) => updateItem(profile, set, 'experience', i, 'bullets', b)} />
            </RepeatCard>
          ))}
        </Section>

        <Section title="Projects" onAdd={() => set('projects', [...(profile.projects || []), { name: '', description: '' }])}>
          {(profile.projects || []).map((pr, i) => (
            <RepeatCard key={i} onRemove={() => set('projects', profile.projects.filter((_, j) => j !== i))}>
              <div className="grid sm:grid-cols-2 gap-2">
                <Field label="Name" value={pr.name} onChange={(v) => updateItem(profile, set, 'projects', i, 'name', v)} />
                <Field label="Description" value={pr.description} onChange={(v) => updateItem(profile, set, 'projects', i, 'description', v)} />
              </div>
            </RepeatCard>
          ))}
        </Section>

        <Section title="Education" onAdd={() => set('education', [...(profile.education || []), { degree: '', institution: '', year: '' }])}>
          {(profile.education || []).map((ed, i) => (
            <RepeatCard key={i} onRemove={() => set('education', profile.education.filter((_, j) => j !== i))}>
              <div className="grid sm:grid-cols-3 gap-2">
                <Field label="Degree" value={ed.degree} onChange={(v) => updateItem(profile, set, 'education', i, 'degree', v)} />
                <Field label="Institution" value={ed.institution} onChange={(v) => updateItem(profile, set, 'education', i, 'institution', v)} />
                <Field label="Year" value={ed.year} onChange={(v) => updateItem(profile, set, 'education', i, 'year', v)} />
              </div>
            </RepeatCard>
          ))}
        </Section>
      </div>
    </div>
  )
}

function updateItem(profile, set, section, idx, field, value) {
  const next = (profile[section] || []).map((it, j) => (j === idx ? { ...it, [field]: value } : it))
  set(section, next)
}

function Section({ title, children, onAdd }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="title-md text-[20px]">{title}</h3>
        {onAdd && (
          <button onClick={onAdd} className="inline-flex items-center gap-1 text-control text-muted hover:text-ink">
            <Plus size={14} /> Add
          </button>
        )}
      </div>
      {children}
    </Panel>
  )
}

function RepeatCard({ children, onRemove }) {
  return (
    <div className="relative rounded-control border border-line p-3 mb-3 bg-surface">
      <button onClick={onRemove} className="absolute top-2 right-2 text-faint hover:text-danger"><Trash2 size={15} /></button>
      {children}
    </div>
  )
}

function BulletList({ bullets, onChange }) {
  return (
    <div className="space-y-1.5">
      {bullets.map((b, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-faint mt-2.5 text-xs">—</span>
          <Textarea value={b} rows={1} onChange={(e) => onChange(bullets.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder="Achievement bullet…" className="resize-y" />
          <button onClick={() => onChange(bullets.filter((_, j) => j !== i))} className="text-faint hover:text-danger mt-2"><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...bullets, ''])} className="inline-flex items-center gap-1 text-control text-muted hover:text-ink">
        <Plus size={13} /> Add bullet
      </button>
    </div>
  )
}

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('')
  const add = () => { const v = input.trim(); if (v && !tags.includes(v)) { onChange([...tags, v]); setInput('') } }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--selected)] text-ink text-control">
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} className="text-muted hover:text-danger">×</button>
          </span>
        ))}
      </div>
      <Input value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder={placeholder} />
    </div>
  )
}
