import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Upload, FileText, Download, Search, Plus, Eye, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDocumentStore, useDocumentLoading, useDocumentError } from '@/stores/documentStore'
import { formatDate, formatFileSize, getStatusColor } from '@/lib/utils'
import { DocumentType } from '@/types'

export default function DocumentManagement() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('')
  
  const { 
    documents, 
    uploadDocument, 
    indexDocument, 
    deleteDocument, 
    downloadDocument,
    loading: documentLoading,
    error: documentError 
  } = useDocumentStore()

  useEffect(() => {
    // Fetch documents on component mount
    // This would typically call fetchDocuments()
  }, [])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploadProgress(0)
      const document = await uploadDocument(file, true, 'PARAGRAPH')
      setSelectedFile(document.id)
      
      // Reset upload progress
      setTimeout(() => setUploadProgress(100), 500)
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }

  const handleIndexDocument = async (documentId: string) => {
    try {
      await indexDocument(documentId, 'PARAGRAPH')
    } catch (error) {
      console.error('Indexing failed:', error)
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await deleteDocument(documentId)
      setSelectedFile(null)
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }

  const handleDownloadDocument = async (documentId: string) => {
    try {
      await downloadDocument(documentId)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
    const matchesType = !fileTypeFilter || doc.file_type === fileTypeFilter
    return matchesSearch && matchesType
  })

  const getDocumentIcon = (fileType: string) => {
    switch (fileType) {
      case 'PDF':
        return <FileText className="w-4 h-4" />
      case 'DOCX':
        return <FileText className="w-4 h-4" />
      case 'XLSX':
        return <FileText className="w-4 h-4" />
      case 'PPTX':
        return <FileText className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  if (documentLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading documents...</div>
      </div>
    )
  }

  if (documentError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">Error: {documentError}</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Document Management</h1>
          <Button onClick={() => navigate('/projects')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
          
          <div className="flex gap-2">
            <Button onClick={() => setSelectedFile(null)}>
              <Plus className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
            <Button variant="outline" onClick={() => navigate('/projects')}>
              <FileText className="w-4 h-4 mr-2" />
              View All Projects
            </Button>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Upload Document</h2>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <div className="text-center">
              <Upload className="w-12 h-12 text-gray-400 mb-4 mx-auto" />
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop your documents here, or click to browse
              </p>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.pptx"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
            </div>
            
            {uploadProgress > 0 && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 text-white text-center leading-relaxed"
                    style={{ width: `${uploadProgress}%` }}
                  >
                    {uploadProgress}% - Uploading...
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-6">
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
            />
          </div>
          
          <select
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="PDF">PDF</option>
            <option value="DOCX">Word Documents</option>
            <option value="XLSX">Excel Spreadsheets</option>
            <option value="PPTX">PowerPoint</option>
          </select>
          
          <Button variant="outline" onClick={() => setSearchTerm('')}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No documents found</p>
            <Button onClick={() => navigate('/projects')}>
              <Plus className="w-4 h-4 mr-2" />
              Upload First Document
            </Button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Indexed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDocuments.map((document) => (
                <tr 
                  key={document.id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedFile(document.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getDocumentIcon(document.file_type)}
                      <span className="ml-2">{document.filename}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(document.indexed ? 'CONFIRMED' : 'PENDING')}`}>
                      {document.indexed ? 'Indexed' : 'Not Indexed'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatFileSize(document.file_size)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(document.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(document.updated_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex gap-1">
                      {!document.indexed && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleIndexDocument(document.id)}
                          disabled={documentLoading}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Index
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleDownloadDocument(document.id)}
                        disabled={documentLoading}
                      >
                          <Download className="w-3 h-3 mr-1" />
                          Download
                        </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleDeleteDocument(document.id)}
                        disabled={documentLoading}
                      >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Selected File Details */}
      {selectedFile && (
        <div className="mt-8 border rounded-lg p-6 bg-white">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Document Details</h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedFile(null)}
            >
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">File Information</h4>
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Filename:</dt>
                  <dd className="text-sm text-gray-900">{selectedFile.filename}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Type:</dt>
                  <dd className="text-sm text-gray-900">{selectedFile.file_type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Size:</dt>
                  <dd className="text-sm text-gray-900">{formatFileSize(selectedFile.file_size)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Created:</dt>
                  <dd className="text-sm text-gray-900">{formatDate(selectedFile.created_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Updated:</dt>
                  <dd className="text-sm text-gray-900">{formatDate(selectedFile.updated_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Indexed:</dt>
                  <dd className="text-sm text-gray-900">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedFile.indexed ? 'CONFIRMED' : 'PENDING')}`}>
                      {selectedFile.indexed ? 'Yes' : 'No'}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Indexing Information</h4>
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Status:</dt>
                  <dd className="text-sm text-gray-900">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor('INDEXING'}`}>
                      Indexing...
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm font-medium text-gray-500">Progress:</dt>
                  <dd className="text-sm text-gray-900">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 text-white text-center leading-relaxed"
                        style={{ width: '33%' }}
                      >
                        {uploadProgress}%
                      </div>
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Actions</h4>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleIndexDocument(selectedFile.id)}
                  disabled={!selectedFile.indexed || documentLoading}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  {selectedFile.indexed ? 'Re-Index' : 'Index'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleDownloadDocument(selectedFile.id)}
                  disabled={documentLoading}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Download
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleDeleteDocument(selectedFile.id)}
                  disabled={documentLoading}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
