import axios from 'axios'

// In local dev, VITE_API_BASE is empty and the Vite proxy forwards /api
// to the backend. In production (Vercel), set VITE_API_BASE to the Render URL.
const baseURL = import.meta.env.VITE_API_BASE || ''

const api = axios.create({ baseURL, timeout: 120000 })

// A stable per-browser session id used to scope persisted score history & chats.
export function getSessionId() {
  let id = localStorage.getItem('ats_session_id')
  if (!id) {
    id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('ats_session_id', id)
  }
  return id
}

export async function uploadResume(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function analyzeResume({ resumeText, jobDescription, targetCountry, template, wordCount }) {
  const { data } = await api.post('/api/analyze', {
    resume_text: resumeText,
    job_description: jobDescription || '',
    target_country: targetCountry || 'global',
    session_id: getSessionId(),
    template: template || '',
    word_count: wordCount || 0,
  })
  return data
}

export async function localizeResume({ resumeText, targetCountry }) {
  const { data } = await api.post('/api/localize', {
    resume_text: resumeText,
    target_country: targetCountry,
  })
  return data
}

export async function checkFormat({ resumeText, targetCountry }) {
  const { data } = await api.post('/api/format-check', {
    resume_text: resumeText,
    target_country: targetCountry || 'global',
  })
  return data
}

export async function fetchHistory(limit = 20) {
  const { data } = await api.get('/api/history', {
    params: { session_id: getSessionId(), limit },
  })
  return data
}

export async function fetchTemplates() {
  const { data } = await api.get('/api/templates')
  return data
}

export async function fetchTools() {
  const { data } = await api.get('/api/tools')
  return data
}

export async function generatePdf({ parsed, template, accentColor }) {
  const response = await api.post(
    '/api/generate-pdf',
    { parsed, template, accent_color: accentColor || '#2563eb' },
    { responseType: 'blob' }
  )
  return response.data
}

export async function renderPreview({ parsed, template, accentColor }) {
  const response = await api.post(
    '/api/render-preview',
    { parsed, template, accent_color: accentColor || '#2563eb' },
    { responseType: 'text' }
  )
  return response.data
}

export async function generateResume({ description, targetCountry, fullName, email, phone }) {
  const { data } = await api.post('/api/generate-resume', {
    description,
    target_country: targetCountry || 'global',
    full_name: fullName || '',
    email: email || '',
    phone: phone || '',
  })
  return data
}

export async function chatCopilot({ messages, resumeText, parsed, jobDescription, targetCountry }) {
  const { data } = await api.post('/api/chat', {
    messages,
    resume_text: resumeText || '',
    parsed: parsed || null,
    job_description: jobDescription || '',
    target_country: targetCountry || 'global',
    session_id: getSessionId(),
  })
  return data
}

/**
 * Stream a copilot reply token-by-token over SSE.
 * Calls onEvent({type, text, ...}) for every event; resolves with the final event.
 */
export async function streamCopilot(
  { messages, resumeText, parsed, jobDescription, targetCountry },
  onEvent
) {
  const resp = await fetch((baseURL || '') + '/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      resume_text: resumeText || '',
      parsed: parsed || null,
      job_description: jobDescription || '',
      target_country: targetCountry || 'global',
      session_id: getSessionId(),
    }),
  })
  if (!resp.ok || !resp.body) {
    throw new Error('Stream failed: ' + resp.status)
  }
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalEvent = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      const json = line.slice(5).trim()
      if (!json) continue
      try {
        const event = JSON.parse(json)
        onEvent(event)
        if (event.type === 'final') finalEvent = event
      } catch (_) {
        // ignore malformed chunk
      }
    }
  }
  return finalEvent
}

export default api
