import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, GripVertical, User, FileText } from 'lucide-react'

// Fully controlled editable resume. Every edit calls onChange with a fresh
// parsed object so the parent can re-feed the latest content into the model.
export default function ResumeEditor({ parsed, onChange }) {
  const contact = parsed?.contact || {}
  const sections = parsed?.sections || []

  const update = (next) => onChange({ ...parsed, ...next })

  const setContact = (field, value) =>
    update({ contact: { ...contact, [field]: value } })

  const setLinks = (value) =>
    update({ contact: { ...contact, links: value.split(',').map((s) => s.trim()).filter(Boolean) } })

  const setSectionTitle = (i, value) => {
    const next = sections.map((s, idx) => (idx === i ? { ...s, title: value } : s))
    update({ sections: next })
  }

  const setLine = (si, li, value) => {
    const next = sections.map((s, idx) =>
      idx === si ? { ...s, lines: s.lines.map((l, j) => (j === li ? value : l)) } : s
    )
    update({ sections: next })
  }

  const addLine = (si) => {
    const next = sections.map((s, idx) =>
      idx === si ? { ...s, lines: [...s.lines, ''] } : s
    )
    update({ sections: next })
  }

  const removeLine = (si, li) => {
    const next = sections.map((s, idx) =>
      idx === si ? { ...s, lines: s.lines.filter((_, j) => j !== li) } : s
    )
    update({ sections: next })
  }

  const addSection = () =>
    update({ sections: [...sections, { title: 'New Section', lines: [''] }] })

  const removeSection = (si) =>
    update({ sections: sections.filter((_, idx) => idx !== si) })

  const field = (label, value, onChangeVal, placeholder) => (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      <input
        value={value || ''}
        onChange={(e) => onChangeVal(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Contact */}
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3 text-slate-700 font-semibold">
          <User size={16} className="text-brand-600" /> Contact
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {field('Full name', contact.name, (v) => setContact('name', v), 'Jane Smith')}
          {field('Email', contact.email, (v) => setContact('email', v), 'jane@example.com')}
          {field('Phone', contact.phone, (v) => setContact('phone', v), '+49 151 23456')}
          {field('Location', contact.location, (v) => setContact('location', v), 'Berlin, Germany')}
          <div className="sm:col-span-2">
            {field('Links (comma separated)', (contact.links || []).join(', '), setLinks, 'linkedin.com/in/… , github.com/…')}
          </div>
        </div>
      </div>

      {/* Sections */}
      <AnimatePresence>
        {sections.map((section, si) => (
          <motion.div
            key={si}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="rounded-2xl border border-slate-200 p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <GripVertical size={16} className="text-slate-300" />
              <input
                value={section.title}
                onChange={(e) => setSectionTitle(si, e.target.value)}
                className="flex-1 font-semibold text-slate-800 bg-transparent border-b border-transparent focus:border-brand-400 focus:outline-none py-1"
              />
              <button
                onClick={() => removeSection(si)}
                className="text-slate-300 hover:text-rose-500 transition"
                title="Delete section"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {section.lines.map((line, li) => (
                <div key={li} className="flex items-start gap-2 group">
                  <span className="text-brand-400 mt-2.5 text-xs">▹</span>
                  <textarea
                    value={line}
                    onChange={(e) => setLine(si, li, e.target.value)}
                    rows={1}
                    placeholder="Add an achievement bullet…"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => removeLine(si, li)}
                    className="text-slate-300 hover:text-rose-500 mt-2 opacity-0 group-hover:opacity-100 transition"
                    title="Delete line"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addLine(si)}
                className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium hover:text-brand-700 mt-1"
              >
                <Plus size={13} /> Add line
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        onClick={addSection}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-slate-300 text-slate-500 text-sm font-medium hover:border-brand-400 hover:text-brand-600 transition"
      >
        <Plus size={15} /> Add section
      </button>
    </div>
  )
}
