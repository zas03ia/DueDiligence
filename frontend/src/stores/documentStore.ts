import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Document, LoadingState, DocumentFilters, SearchResult, ChunkingStrategy } from '../types'
import { apiClient } from '../services/api'

interface DocumentState extends LoadingState {
  documents: Document[]
  currentDocument: Document | null
  documentContent: any
  searchResults: SearchResult[]
  filters: DocumentFilters
  uploadProgress: number
  
  // Actions
  fetchDocuments: () => Promise<void>
  fetchDocument: (id: string) => Promise<void>
  fetchDocumentContent: (id: string, limit?: number) => Promise<void>
  uploadDocument: (file: File, autoIndex?: boolean, chunkingStrategy?: ChunkingStrategy) => Promise<Document>
  indexDocument: (id: string, chunkingStrategy?: ChunkingStrategy) => Promise<void>
  reindexDocument: (id: string, chunkingStrategy?: ChunkingStrategy) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  searchDocuments: (query: string, documentIds?: string[]) => Promise<void>
  downloadDocument: (id: string) => Promise<void>
  setFilters: (filters: Partial<DocumentFilters>) => void
  setUploadProgress: (progress: number) => void
  clearCurrentDocument: () => void
  clearSearchResults: () => void
  reset: () => void
}

const initialState: Omit<DocumentState, 'fetchDocuments' | 'fetchDocument' | 'fetchDocumentContent' | 'uploadDocument' | 'indexDocument' | 'reindexDocument' | 'deleteDocument' | 'searchDocuments' | 'downloadDocument' | 'setFilters' | 'setUploadProgress' | 'clearCurrentDocument' | 'clearSearchResults' | 'reset'> = {
  documents: [],
  currentDocument: null,
  documentContent: null,
  searchResults: [],
  filters: {},
  uploadProgress: 0,
  isLoading: false,
  error: undefined,
}

export const useDocumentStore = create<DocumentState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchDocuments: async () => {
        set({ isLoading: true, error: undefined })
        
        try {
          const documents = await apiClient.getDocuments()
          set({ documents, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch documents',
            isLoading: false 
          })
        }
      },

      fetchDocument: async (id: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const document = await apiClient.getDocument(id)
          set({ currentDocument: document, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch document',
            isLoading: false 
          })
        }
      },

      fetchDocumentContent: async (id: string, limit = 100) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const content = await apiClient.getDocumentContent(id, limit)
          set({ documentContent: content, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch document content',
            isLoading: false 
          })
        }
      },

      uploadDocument: async (file: File, autoIndex = true, chunkingStrategy: ChunkingStrategy = 'PARAGRAPH') => {
        set({ isLoading: true, error: undefined, uploadProgress: 0 })
        
        try {
          const document = await apiClient.uploadDocument({
            file,
            auto_index: autoIndex,
            chunking_strategy: chunkingStrategy
          })
          
          set(state => ({
            documents: [...state.documents, document],
            currentDocument: document,
            uploadProgress: 100,
            isLoading: false
          }))
          
          return document
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to upload document',
            isLoading: false,
            uploadProgress: 0
          })
          throw error
        }
      },

      indexDocument: async (id: string, chunkingStrategy: ChunkingStrategy = 'PARAGRAPH') => {
        set({ isLoading: true, error: undefined })
        
        try {
          await apiClient.indexDocument(id, chunkingStrategy)
          
          // Refresh documents list
          await get().fetchDocuments()
          
          set({ isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to index document',
            isLoading: false 
          })
          throw error
        }
      },

      reindexDocument: async (id: string, chunkingStrategy: ChunkingStrategy = 'PARAGRAPH') => {
        set({ isLoading: true, error: undefined })
        
        try {
          await apiClient.reindexDocument(id, chunkingStrategy)
          
          // Refresh documents list
          await get().fetchDocuments()
          
          set({ isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to reindex document',
            isLoading: false 
          })
          throw error
        }
      },

      deleteDocument: async (id: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          await apiClient.deleteDocument(id)
          
          set(state => ({
            documents: state.documents.filter(d => d.id !== id),
            currentDocument: state.currentDocument?.id === id ? null : state.currentDocument,
            documentContent: state.documentContent?.document_id === id ? null : state.documentContent,
            isLoading: false
          }))
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to delete document',
            isLoading: false 
          })
          throw error
        }
      },

      searchDocuments: async (query: string, documentIds?: string[]) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const results = await apiClient.searchDocuments({
            query,
            document_ids: documentIds,
            top_k: 10
          })
          
          set({ searchResults: results, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to search documents',
            isLoading: false 
          })
        }
      },

      downloadDocument: async (id: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const blob = await apiClient.downloadDocument(id)
          
          // Create download link
          const url = window.URL.createObjectURL(blob)
          const link = window.document.createElement('a')
          link.href = url
          
          // Get filename from current document or fetch it
          const documentData = get().currentDocument || await apiClient.getDocument(id)
          link.download = documentData.filename
          
          window.document.body.appendChild(link)
          link.click()
          window.document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          
          set({ isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to download document',
            isLoading: false 
          })
        }
      },

      setFilters: (filters: Partial<DocumentFilters>) => {
        set(state => ({
          filters: { ...state.filters, ...filters }
        }))
      },

      setUploadProgress: (progress: number) => {
        set({ uploadProgress: progress })
      },

      clearCurrentDocument: () => {
        set({ 
          currentDocument: null,
          documentContent: null 
        })
      },

      clearSearchResults: () => {
        set({ searchResults: [] })
      },

      reset: () => {
        set(initialState)
      },
    }),
    {
      name: 'document-store',
    }
  )
)

// Selectors
export const useDocuments = () => useDocumentStore(state => state.documents)
export const useCurrentDocument = () => useDocumentStore(state => state.currentDocument)
export const useDocumentContent = () => useDocumentStore(state => state.documentContent)
export const useSearchResults = () => useDocumentStore(state => state.searchResults)
export const useDocumentFilters = () => useDocumentStore(state => state.filters)
export const useDocumentLoading = () => useDocumentStore(state => state.isLoading)
export const useDocumentError = () => useDocumentStore(state => state.error)
export const useUploadProgress = () => useDocumentStore(state => state.uploadProgress)
