import { useRef, useState } from 'react'
import { Upload, Download, Trash2, FileText, Loader } from 'lucide-react'
import { useDocuments } from '../hooks/useDocuments'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Document list + upload for a single patient.
 * Rendered inside the patient's SlidePanel as a separate section.
 */
export default function PatientDocuments({ patientId }) {
  const { documents, loading, upload, download, remove } = useDocuments(patientId)
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      await upload(file)
    } catch (err) {
      setUploadError(err.response?.data?.detail ?? 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDownload(doc) {
    try {
      await download(doc)
    } catch {
      // MinIO not running — silent fail is fine in dev
    }
  }

  async function handleDelete(doc) {
    if (!confirm(`Delete "${doc.filename}"?`)) return
    await remove(doc.id)
  }

  return (
    <div className="mt-6 pt-6 border-t border-stone-100">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-medium text-stone-500 uppercase tracking-wider">Documents</h4>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-40"
        >
          {uploading
            ? <Loader size={13} className="animate-spin" />
            : <Upload size={13} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {uploadError && (
        <p className="text-red-500 text-xs mb-3">{uploadError}</p>
      )}

      {loading ? (
        <p className="text-stone-400 text-sm">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-stone-400 text-sm">No documents on file.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map(doc => (
            <li key={doc.id} className="flex items-center gap-3 p-3 rounded-lg bg-stone-50 hover:bg-stone-100 transition-colors">
              <FileText size={15} className="text-stone-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-700 truncate">{doc.filename}</p>
                <p className="text-xs text-stone-400">{formatBytes(doc.size_bytes)} · {formatDate(doc.uploaded_at)}</p>
              </div>
              <button
                onClick={() => handleDownload(doc)}
                title="Download"
                className="text-stone-400 hover:text-stone-700 transition-colors"
              >
                <Download size={14} />
              </button>
              <button
                onClick={() => handleDelete(doc)}
                title="Delete"
                className="text-stone-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
