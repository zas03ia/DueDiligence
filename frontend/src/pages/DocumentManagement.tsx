import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Upload, FileText, Download, Search, Trash2, RefreshCw, X, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDocumentStore } from '@/stores/documentStore'
import { useProjectStore } from '@/stores/projectStore'
import PageHeader from '@/components/PageHeader'
import toast from 'react-hot-toast'
import { Document } from '@/types'
import { formatDate, formatFileSize, getStatusColor } from '@/lib/utils'

export default function DocumentManagement() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<Document | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const {
    documents,
    uploadDocument,
    indexDocument,
    reindexDocument,
    deleteDocument,
    downloadDocument,
    fetchDocuments,
    uploadProgress,
    isLoading,
    error,
  } = useDocumentStore()

  const { projectDetails, fetchProjectDetails } = useProjectStore()
  const project = projectDetails?.project

  useEffect(() => {
    fetchDocuments()
    if (projectId) fetchProjectDetails(projectId)
  }, [fetchDocuments, fetchProjectDetails, projectId])

  const handleUpload = async (file: File) => {
    try {
      toast.loading('Uploading...', { id: 'upload' })
      const doc = await uploadDocument(file, true, 'PARAGRAPH')
      setSelectedFile(doc)
      toast.loading('Indexing in background...', { id: 'upload' })

      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const es = new EventSource(`${API_BASE}/api/v1/documents/${doc.id}/index/stream`)
      es.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (data.indexed) {
          es.close()
          fetchDocuments()
          setSelectedFile(prev => prev?.id === doc.id ? { ...prev, indexed: true } : prev)
          toast.success('Document uploaded and indexed', { id: 'upload' })
        } else if (data.timeout || data.error) {
          es.close()
          toast.error(data.error || 'Indexing timed out after upload', { id: 'upload' })
        }
      }
      es.onerror = () => { es.close(); fetchDocuments() }
    } catch {
      toast.error('Upload failed', { id: 'upload' })
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) handleUpload(file)
    event.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const handleIndex = async (documentId: string, reindex = false) => {
    try {
      toast.loading(reindex ? 'Re-indexing...' : 'Indexing document...', { id: 'index' })
      if (reindex) await reindexDocument(documentId)
      else await indexDocument(documentId)

      // Open SSE stream to get real-time indexed status
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const es = new EventSource(`${API_BASE}/api/v1/documents/${documentId}/index/stream`)
      es.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (data.indexed) {
          es.close()
          fetchDocuments()
          const fresh = useDocumentStore.getState().documents.find(d => d.id === documentId)
          if (fresh) setSelectedFile(prev => prev?.id === documentId ? fresh : prev)
          toast.success(reindex ? 'Re-indexed successfully' : 'Indexed successfully', { id: 'index' })
        } else if (data.timeout || data.error) {
          es.close()
          toast.error(data.error || 'Indexing timed out', { id: 'index' })
        }
      }
      es.onerror = () => {
        es.close()
        // Stream closed after completion is also an onerror — do a final fetch
        fetchDocuments()
      }
    } catch {
      toast.error('Indexing failed', { id: 'index' })
    }
  }

  const handleDelete = async (documentId: string) => {
    if (!window.confirm('Delete this document?')) return
    try {
      await deleteDocument(documentId)
      if (selectedFile?.id === documentId) setSelectedFile(null)
      toast.success('Document deleted')
    } catch {
      toast.error('Delete failed')
    }
  }

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    const matchesType = !fileTypeFilter || doc.file_type === fileTypeFilter
    return matchesSearch && matchesType
  })

  const title = projectId && project ? `${project.name} — Documents` : 'Document Management'
  const breadcrumbs = projectId && project
    ? [{ label: 'Projects', href: '/projects' }, { label: project.name, href: `/projects/${projectId}` }, { label: 'Documents' }]
    : [{ label: 'Documents' }]

  return (
    <div>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={title}
        subtitle="Upload, index, and manage source documents"
        actions={
          <>
            {projectId && (
              <Button variant="outline" onClick={() => navigate(`/projects/${projectId}`)}>
                Back to Project
              </Button>
            )}
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Upload Document
            </Button>
          </>
        }
      />

      <div className="container mx-auto px-4 py-6">
        {error && <p className="text-destructive mb-4">{error}</p>}

        {documents.length > 0 && documents.some(d => !d.indexed) && (
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-blue-50 border-blue-200 text-blue-800 mb-6">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">
              {documents.filter(d => !d.indexed).length} document(s) are not yet indexed. Click "Index" next to each one, or they were queued automatically on upload. Indexed documents are searchable by the AI when generating answers.
            </p>
          </div>
        )}

        {documents.length > 0 && documents.every(d => d.indexed) && !projectId && (
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-green-50 border-green-200 text-green-800 mb-6">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">
              All documents are indexed. Head to <a href="/projects" className="underline font-semibold">Projects</a> to create a project and generate AI answers.
            </p>
          </div>
        )}

        <div
          className={`mb-8 border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Drag and drop files here, or click to browse</p>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Browse Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.pptx"
            onChange={handleFileUpload}
            className="hidden"
          />
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-4 max-w-md mx-auto">
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
            </div>
          )}
        </div>

        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background"
            />
          </div>
          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            className="px-4 py-2 border border-input rounded-lg bg-background"
          >
            <option value="">All Types</option>
            <option value="PDF">PDF</option>
            <option value="DOCX">Word</option>
            <option value="XLSX">Excel</option>
            <option value="PPTX">PowerPoint</option>
          </select>
          <Button variant="outline" onClick={() => fetchDocuments()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {isLoading && documents.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">Loading documents...</p>
        ) : filteredDocuments.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">No documents found. Upload your first document above.</p>
        ) : (
          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Size</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Indexed</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDocuments.map((document) => (
                  <tr
                    key={document.id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => setSelectedFile(document)}
                  >
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      {document.filename}
                    </td>
                    <td className="px-4 py-3">{document.file_type}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatFileSize(document.file_size)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(document.indexed ? 'CONFIRMED' : 'PENDING')}`}>
                        {document.indexed ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(document.created_at)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {!document.indexed && (
                          <Button size="sm" variant="outline" onClick={() => handleIndex(document.id)}>
                            Index
                          </Button>
                        )}
                        {document.indexed && (
                          <Button size="sm" variant="outline" onClick={() => handleIndex(document.id, true)}>
                            Re-index
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => downloadDocument(document.id)}>
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(document.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedFile && (
          <div className="mt-8 border rounded-lg p-6 bg-card">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">{selectedFile.filename}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><dt className="text-muted-foreground">Type</dt><dd>{selectedFile.file_type}</dd></div>
              <div><dt className="text-muted-foreground">Size</dt><dd>{formatFileSize(selectedFile.file_size)}</dd></div>
              <div><dt className="text-muted-foreground">Indexed</dt><dd>{selectedFile.indexed ? 'Yes' : 'No'}</dd></div>
              <div><dt className="text-muted-foreground">Updated</dt><dd>{formatDate(selectedFile.updated_at)}</dd></div>
            </dl>
            <div className="flex gap-2">
              {!selectedFile.indexed ? (
                <Button size="sm" onClick={() => handleIndex(selectedFile.id)}>Index Document</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handleIndex(selectedFile.id, true)}>Re-index</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => downloadDocument(selectedFile.id)}>Download</Button>
              <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedFile.id)}>Delete</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
