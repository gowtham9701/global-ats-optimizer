import axios from 'axios'

// In local dev, VITE_API_BASE is empty and the Vite proxy forwards /api
// to the backend. In production (Vercel), set VITE_API_BASE to the Render URL.
const baseURL = import.meta.env.VITE_API_BASE || ''

const api = axios.create({ baseURL, timeout: 120000 })

export async function uploadResume(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post('/api/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function analyzeResume({ resumeText, jobDescription, targetCountry }) {
  const { data } = await api.post('/api/analyze', {
    resume_text: resumeText,
    job_description: jobDescription || '',
    target_country: targetCountry || 'global',
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
  })
  return data
}

export default api
