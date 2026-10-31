// Helpers to convert between the structured ParsedResume and plain text.
// The plain-text form is what we feed back into the analysis model so that
// edits made in the UI become the "latest result" the backend scores.

export function parsedToText(parsed) {
  if (!parsed) return ''
  const lines = []
  const c = parsed.contact || {}
  if (c.name) lines.push(c.name)
  const header = [c.email, c.phone, c.location, ...(c.links || [])].filter(Boolean).join(' | ')
  if (header) lines.push(header)
  lines.push('')
  for (const section of parsed.sections || []) {
    if ((section.title || '').toLowerCase() === 'header') continue
    lines.push((section.title || '').toUpperCase())
    for (const ln of section.lines || []) {
      lines.push(ln.startsWith('-') ? ln : `- ${ln}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export function emptyResume() {
  return {
    raw_text: '',
    contact: { name: '', email: '', phone: '', location: '', links: [] },
    sections: [
      { title: 'Summary', lines: [''] },
      { title: 'Experience', lines: [''] },
      { title: 'Skills', lines: [''] },
      { title: 'Education', lines: [''] },
    ],
    word_count: 0,
  }
}
