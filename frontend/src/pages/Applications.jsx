import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2, FilePlus2, Trash2, X, Database, Table2, LayoutGrid,
} from 'lucide-react'
import {
  fetchApplications, updateApplication, deleteApplication,
} from '../api/client.js'
import { Button, Panel, PageHeader, Pill } from '../components/ui.jsx'

const STAGE_META = {
  saved: { label: 'Saved', color: 'var(--status-draft)' },
  drafting: { label: 'Drafting', color: 'var(--status-screening)' },
  applied: { label: 'Applied', color: 'var(--status-sent)' },
  interview: { label: 'Interview', color: 'var(--status-interview)' },
  offer: { label: 'Offer', color: 'var(--status-offer)' },
  rejected: { label: 'Rejected', color: 'var(--status-rejected)' },
}

export default function Applications() {
  const [apps, setApps] = useState([])
  const [stages, setStages] = useState(Object.keys(STAGE_META))
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('board')
  const [selected, setSelected] = useState(null)
  const [dragId, setDragId] = useState(null)

  const load = () => {
    setLoading(true)
    fetchApplications()
      .then((d) => { setApps(d.applications || []); setStages(d.stages || stages); setEnabled(d.enabled) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const moveTo = async (id, stage) => {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)))
    try { await updateApplication(id, { stage }) } catch (_) { load() }
  }

  const remove = async (id) => {
    setApps((prev) => prev.filter((a) => a.id !== id))
    setSelected(null)
    try { await deleteApplication(id) } catch (_) { load() }
  }

  if (loading) {
    return <div className="py-24 grid place-items-center text-muted"><Loader2 size={26} className="animate-spin" /></div>
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <PageHeader title="Applications" lead="Every application, tracked from draft to offer.">
        <div className="inline-flex rounded-control border border-line-input bg-card p-0.5 shadow-raised">
          <button onClick={() => setView('board')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-control transition-colors ${view === 'board' ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'}`}><LayoutGrid size={14} /> Board</button>
          <button onClick={() => setView('table')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-control transition-colors ${view === 'table' ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'}`}><Table2 size={14} /> Table</button>
        </div>
        <Button to="/new"><FilePlus2 size={16} /> New</Button>
      </PageHeader>

      {!enabled && (
        <Panel className="mb-5 px-4 py-3 flex items-center gap-2 text-meta text-warning bg-warning-surface border-0">
          <Database size={15} /> Persistence is off — applications won't be saved until <code className="font-mono">DATABASE_URL</code> is set.
        </Panel>
      )}

      {apps.length === 0 ? (
        <Panel className="p-12 text-center">
          <p className="text-muted text-field">No applications yet.</p>
          <Button to="/new" className="mt-4"><FilePlus2 size={16} /> Add your first application</Button>
        </Panel>
      ) : view === 'board' ? (
        <div className="grid grid-flow-col auto-cols-[minmax(240px,1fr)] gap-4 overflow-x-auto thin-scroll pb-4">
          {stages.map((st) => {
            const items = apps.filter((a) => a.stage === st)
            return (
              <div key={st}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId != null) { moveTo(dragId, st); setDragId(null) } }}
                className="rounded-card bg-surface border border-line p-3 min-h-[220px]">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_META[st]?.color }} />
                  <span className="text-control font-medium text-ink">{STAGE_META[st]?.label || st}</span>
                  <span className="text-meta text-faint ml-auto">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((a) => (
                    <motion.div key={a.id} layout
                      draggable
                      onDragStart={() => setDragId(a.id)}
                      onClick={() => setSelected(a)}
                      className="rounded-control bg-card border border-line p-3 cursor-pointer hover:border-line-strong transition-colors shadow-raised">
                      <div className="text-field font-medium truncate">{a.role || 'Untitled role'}</div>
                      <div className="text-meta text-muted truncate">{a.company || '—'}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <Pill>{a.match_score}% match</Pill>
                        {a.gaps?.length > 0 && <span className="text-[11px] text-warning">{a.gaps.length} gaps</span>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Panel className="overflow-hidden">
          <table className="w-full text-field">
            <thead className="bg-surface text-muted border-b border-line">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-meta">Role</th>
                <th className="text-left px-4 py-3 font-medium text-meta">Company</th>
                <th className="text-left px-4 py-3 font-medium text-meta">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-meta">Match</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-[var(--hover)]">
                  <td className="px-4 py-3 font-medium cursor-pointer" onClick={() => setSelected(a)}>{a.role || 'Untitled'}</td>
                  <td className="px-4 py-3 text-muted">{a.company || '—'}</td>
                  <td className="px-4 py-3">
                    <select value={a.stage} onChange={(e) => moveTo(a.id, e.target.value)}
                      className="rounded-control border border-line-input bg-input text-ink px-2 py-1 text-control">
                      {stages.map((s) => <option key={s} value={s}>{STAGE_META[s]?.label || s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.match_score}%</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(a.id)} className="text-faint hover:text-danger"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Detail drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={() => setSelected(null)}>
            <motion.div initial={{ x: 520 }} animate={{ x: 0 }} exit={{ x: 520 }} transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[min(94vw,540px)] h-full bg-surface border-l border-line overflow-auto thin-scroll p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="title-md text-[24px]">{selected.role || 'Untitled role'}</h2>
                  <p className="text-muted text-field">{selected.company} {selected.location ? `· ${selected.location}` : ''}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-control hover:bg-[var(--hover)] text-muted"><X size={18} /></button>
              </div>

              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <select value={selected.stage} onChange={(e) => { moveTo(selected.id, e.target.value); setSelected({ ...selected, stage: e.target.value }) }}
                  className="rounded-control border border-line-input bg-input text-ink px-3 py-1.5 text-control">
                  {stages.map((s) => <option key={s} value={s}>{STAGE_META[s]?.label || s}</option>)}
                </select>
                <Pill>{selected.match_score}% match</Pill>
                <Button onClick={() => remove(selected.id)} variant="danger" size="sm" className="ml-auto">
                  <Trash2 size={14} /> Delete
                </Button>
              </div>

              {selected.gaps?.length > 0 && (
                <Block title="Gaps to address">
                  <div className="flex flex-wrap gap-1.5">
                    {selected.gaps.map((g, i) => <Pill key={i} tone="warning">{g}</Pill>)}
                  </div>
                </Block>
              )}
              {selected.requirements?.length > 0 && (
                <Block title="Key requirements">
                  <ul className="space-y-1.5 text-field text-ink">
                    {selected.requirements.map((r, i) => <li key={i} className="flex gap-2"><span className="text-faint">—</span>{r}</li>)}
                  </ul>
                </Block>
              )}
              {selected.cover_letter && (
                <Block title="Cover letter">
                  <pre className="whitespace-pre-wrap text-field text-ink font-serif leading-relaxed">{selected.cover_letter}</pre>
                </Block>
              )}
              {selected.tailored_resume?.sections?.length > 0 && (
                <Block title="Tailored resume">
                  {selected.tailored_resume.sections.map((s, i) => (
                    <div key={i} className="mb-3">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-muted mb-1">{s.title}</div>
                      <ul className="space-y-0.5 text-field text-ink">
                        {(s.lines || []).map((l, j) => <li key={j} className="flex gap-2"><span className="text-faint">—</span>{l}</li>)}
                      </ul>
                    </div>
                  ))}
                </Block>
              )}
              {selected.posting_text && (
                <Block title="Original posting">
                  <pre className="whitespace-pre-wrap text-meta text-muted font-sans max-h-48 overflow-auto thin-scroll">{selected.posting_text}</pre>
                </Block>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Block({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-[11px] uppercase tracking-[0.1em] text-muted mb-2">{title}</h3>
      {children}
    </div>
  )
}
