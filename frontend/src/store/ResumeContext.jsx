import { createContext, useContext, useEffect, useState } from 'react'

const ResumeContext = createContext(null)

const STORAGE_KEY = 'ats_architect_state_v1'

function loadInitial() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (_) {}
  return {}
}

export function ResumeProvider({ children }) {
  const init = loadInitial()
  const [parsed, setParsed] = useState(init.parsed || null)
  const [resumeText, setResumeText] = useState(init.resumeText || '')
  const [fileName, setFileName] = useState(init.fileName || '')
  const [jobDescription, setJobDescription] = useState(init.jobDescription || '')
  const [targetCountry, setTargetCountry] = useState(init.targetCountry || 'germany')
  const [template, setTemplate] = useState(init.template || 'tech_minimalist')
  const [accentColor, setAccentColor] = useState(init.accentColor || '#2563eb')
  const [analysis, setAnalysis] = useState(init.analysis || null)
  const [localized, setLocalized] = useState(init.localized || null)

  useEffect(() => {
    const snapshot = {
      parsed, resumeText, fileName, jobDescription, targetCountry,
      template, accentColor, analysis, localized,
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch (_) {}
  }, [parsed, resumeText, fileName, jobDescription, targetCountry, template, accentColor, analysis, localized])

  const value = {
    parsed, setParsed,
    resumeText, setResumeText,
    fileName, setFileName,
    jobDescription, setJobDescription,
    targetCountry, setTargetCountry,
    template, setTemplate,
    accentColor, setAccentColor,
    analysis, setAnalysis,
    localized, setLocalized,
  }
  return <ResumeContext.Provider value={value}>{children}</ResumeContext.Provider>
}

export function useResume() {
  const ctx = useContext(ResumeContext)
  if (!ctx) throw new Error('useResume must be used within ResumeProvider')
  return ctx
}
