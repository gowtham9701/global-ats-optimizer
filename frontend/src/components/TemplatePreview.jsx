import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { renderPreview } from '../api/client.js'

// Debounced WYSIWYG preview: renders the exact HTML the PDF is built from,
// inside a sandboxed iframe, so what you see is what you download.
export default function TemplatePreview({ parsed, template, accentColor }) {
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef(null)

  useEffect(() => {
    if (!parsed) return
    setLoading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const out = await renderPreview({ parsed, template, accentColor })
        setHtml(out)
        setError('')
      } catch (e) {
        setError('Preview unavailable.')
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => clearTimeout(timer.current)
  }, [JSON.stringify(parsed), template, accentColor])

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
      {loading && (
        <div className="absolute top-2 right-2 z-10 bg-white/90 rounded-full px-2 py-1 flex items-center gap-1 text-xs text-slate-500 shadow">
          <Loader2 size={12} className="animate-spin" /> Rendering…
        </div>
      )}
      {error ? (
        <div className="p-8 text-center text-sm text-slate-400">{error}</div>
      ) : (
        <iframe
          title="Resume preview"
          srcDoc={html}
          className="w-full bg-white"
          style={{ height: 'min(72vh, 900px)', border: 'none' }}
        />
      )}
    </div>
  )
}
