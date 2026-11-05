import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, FileCheck2, Loader2 } from 'lucide-react'

export default function FileDropzone({ onFile, loading, fileName }) {
  const [hover, setHover] = useState(false)

  const onDrop = useCallback(
    (accepted) => {
      if (accepted?.length) onFile(accepted[0])
    },
    [onFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
  })

  return (
    <motion.div
      {...getRootProps()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`relative cursor-pointer rounded-panel border-2 border-dashed p-10 text-center transition
        ${isDragActive || hover ? 'border-brand-500 bg-brand-50' : 'border-line-input bg-card'}`}
    >
      <input {...getInputProps()} />
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 text-brand-600">
            <Loader2 className="animate-spin" size={40} />
            <p className="font-medium">Parsing your resume…</p>
          </motion.div>
        ) : fileName ? (
          <motion.div key="done" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 text-emerald-600">
            <FileCheck2 size={40} />
            <p className="font-semibold">{fileName}</p>
            <p className="text-sm text-faint">Click to replace</p>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3">
            <motion.div animate={{ y: isDragActive ? -6 : 0 }} className="w-16 h-16 rounded-card bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shadow-lg shadow-brand-600/30">
              <UploadCloud size={30} />
            </motion.div>
            <p className="font-semibold text-ink">Drag & drop your resume</p>
            <p className="text-sm text-faint">PDF, DOCX or TXT · up to 10MB</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
