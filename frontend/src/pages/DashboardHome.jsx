import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FilePlus2, User, KanbanSquare, Loader2, ArrowRight, Database,
} from 'lucide-react'
import { fetchFunnel, fetchApplications, fetchProfile } from '../api/client.js'
import { Button, Panel, PageHeader, SectionTitle } from '../components/ui.jsx'
import { BRAND } from '../config/brand.js'

const STAGE_META = {
  saved: { label: 'Saved', color: 'var(--status-draft)' },
  drafting: { label: 'Drafting', color: 'var(--status-screening)' },
  applied: { label: 'Applied', color: 'var(--status-sent)' },
  interview: { label: 'Interview', color: 'var(--status-interview)' },
  offer: { label: 'Offer', color: 'var(--status-offer)' },
  rejected: { label: 'Rejected', color: 'var(--status-rejected)' },
}

export default function DashboardHome() {
  const [funnel, setFunnel] = useState(null)
  const [apps, setApps] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchFunnel(), fetchApplications(), fetchProfile()])
      .then(([f, a, p]) => {
        setFunnel(f)
        setApps(a.applications || [])
        setProfile(p.profile || null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const dbOff = funnel && !funnel.enabled
  const next = apps.filter((a) => a.stage === 'saved' || a.stage === 'drafting')

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <PageHeader title="Dashboard" lead={BRAND.shortDesc}>
        <Button to="/new"><FilePlus2 size={16} /> New application</Button>
      </PageHeader>

      {loading ? (
        <div className="py-24 grid place-items-center text-muted"><Loader2 size={26} className="animate-spin" /></div>
      ) : (
        <div className="space-y-6">
          {dbOff && (
            <Panel className="px-4 py-3 flex items-center gap-2 text-meta text-warning bg-warning-surface border-0">
              <Database size={15} /> Persistence is off — set <code className="font-mono">DATABASE_URL</code> to save your profile and applications.
            </Panel>
          )}

          {!profile && apps.length === 0 && (
            <Panel className="p-6">
              <SectionTitle>Get started</SectionTitle>
              <p className="text-muted text-field mt-1 mb-5">Build your profile once — every application reuses it.</p>
              <div className="grid sm:grid-cols-3 gap-4">
                <Step to="/profile" icon={User} n="01" title="Build your profile" desc="Your career history — the source of truth for every document." />
                <Step to="/new" icon={FilePlus2} n="02" title="Add an application" desc="Paste a posting; get a tailored resume and cover letter." />
                <Step to="/applications" icon={KanbanSquare} n="03" title="Track to offer" desc="Move each application across the board, draft to offer." />
              </div>
            </Panel>
          )}

          {/* Funnel */}
          <Panel className="p-6">
            <div className="flex items-baseline justify-between mb-5">
              <SectionTitle>Your funnel</SectionTitle>
              <span className="text-muted text-meta">{funnel?.total || 0} applications</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-line rounded-card overflow-hidden border border-line">
              {Object.keys(STAGE_META).map((st) => (
                <div key={st} className="bg-card p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_META[st].color }} />
                    <span className="text-[11px] text-muted">{STAGE_META[st].label}</span>
                  </div>
                  <div className="title-md text-[26px]">{funnel?.stages?.[st] ?? 0}</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Next */}
          <Panel className="p-6">
            <SectionTitle className="mb-4">Worth a look next</SectionTitle>
            {apps.length === 0 ? (
              <p className="text-muted text-field">No applications yet. <Link to="/new" className="text-ink underline underline-offset-2">Add your first →</Link></p>
            ) : next.length === 0 ? (
              <p className="text-muted text-field">Nothing waiting — you're all caught up.</p>
            ) : (
              <div className="divide-y divide-line -my-1">
                {next.slice(0, 6).map((a) => (
                  <Link key={a.id} to="/applications" className="flex items-center justify-between gap-3 py-3 group">
                    <div className="min-w-0">
                      <div className="text-field font-medium truncate group-hover:text-muted transition-colors">{a.role || 'Untitled role'}{a.company ? ` · ${a.company}` : ''}</div>
                      <div className="text-meta text-muted">{STAGE_META[a.stage]?.label} · {a.match_score}% match</div>
                    </div>
                    <ArrowRight size={15} className="text-faint shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

function Step({ to, icon: Icon, n, title, desc }) {
  return (
    <Link to={to} className="group block rounded-card border border-line p-4 hover:border-line-strong transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-control bg-surface border border-line grid place-items-center text-ink"><Icon size={16} strokeWidth={1.75} /></div>
        <span className="font-serif text-muted text-[15px]">{n}</span>
      </div>
      <div className="text-field font-medium group-hover:text-muted transition-colors">{title}</div>
      <div className="text-meta text-muted mt-1">{desc}</div>
    </Link>
  )
}
