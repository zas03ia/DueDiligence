import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { 
  Project, 
  Questionnaire, 
  Question, 
  Answer, 
  Document, 
  Request,
  GenerationRequest,
  EvaluationRequest,
  EvaluationResult,
  IndexingRequest,
  DocumentUploadParams,
  SearchParams,
  SearchResult,
  ApiResponse,
  PaginatedResponse,
  ProjectWithDetails
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('auth_token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token')
        }
        return Promise.reject(error)
      }
    )
  }

  // Health check
  async healthCheck(): Promise<{ status: string }> {
    const response = await this.client.get('/health')
    return response.data
  }

  // Projects
  async getProjects(skip = 0, limit = 100): Promise<Project[]> {
    const response = await this.client.get('/api/v1/projects', {
      params: { skip, limit }
    })
    return response.data
  }

  async getProject(id: string): Promise<Project> {
    const response = await this.client.get(`/api/v1/projects/${id}`)
    return response.data
  }

  async createProject(project: Partial<Project>): Promise<Project> {
    const response = await this.client.post('/api/v1/projects', project)
    return response.data
  }

  async updateProject(id: string, project: Partial<Project>): Promise<Project> {
    const response = await this.client.put(`/api/v1/projects/${id}`, project)
    return response.data
  }

  async deleteProject(id: string): Promise<void> {
    await this.client.delete(`/api/v1/projects/${id}`)
  }

  async getProjectDetails(id: string): Promise<ProjectWithDetails> {
    const response = await this.client.get(`/api/v1/projects/${id}/details`)
    return response.data
  }

  async generateProjectAnswers(
    projectId: string,
    questionIds?: string[],
    asyncProcessing = true
  ): Promise<any> {
    const body: Record<string, any> = { async_processing: asyncProcessing }
    if (questionIds && questionIds.length > 0) {
      body.question_ids = questionIds
    }
    const response = await this.client.post(
      `/api/v1/projects/${projectId}/generate-answers`,
      body
    )
    return response.data
  }

  async getProjectStatus(id: string): Promise<any> {
    const response = await this.client.get(`/api/v1/projects/${id}/status`)
    return response.data
  }

  async getProjectQuestionnaire(id: string): Promise<any> {
    const response = await this.client.get(`/api/v1/projects/${id}/questionnaire`)
    return response.data
  }

  async setProjectQuestionnaire(projectId: string, questionnaireId: string): Promise<any> {
    const response = await this.client.post(
      `/api/v1/projects/${projectId}/questionnaire`,
      { questionnaire_id: questionnaireId }
    )
    return response.data
  }

  async markProjectOutdated(projectId: string): Promise<any> {
    const response = await this.client.post(`/api/v1/projects/${projectId}/mark-outdated`)
    return response.data
  }

  // Documents
  async getDocuments(skip = 0, limit = 100): Promise<Document[]> {
    const response = await this.client.get('/api/v1/documents', {
      params: { skip, limit }
    })
    return response.data
  }

  async getDocument(id: string): Promise<Document> {
    const response = await this.client.get(`/api/v1/documents/${id}`)
    return response.data
  }

  async uploadDocument(params: DocumentUploadParams): Promise<Document> {
    const formData = new FormData()
    formData.append('file', params.file)
    formData.append('auto_index', params.auto_index?.toString() || 'true')
    formData.append('chunking_strategy', params.chunking_strategy || 'PARAGRAPH')

    const response = await this.client.post('/api/v1/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async indexDocument(id: string, chunkingStrategy = 'PARAGRAPH'): Promise<any> {
    const response = await this.client.post(
      `/api/v1/documents/${id}/index`,
      null,
      { params: { chunking_strategy: chunkingStrategy } }
    )
    return response.data
  }

  async reindexDocument(id: string, chunkingStrategy = 'PARAGRAPH'): Promise<any> {
    const response = await this.client.post(
      `/api/v1/documents/${id}/reindex`,
      null,
      { params: { chunking_strategy: chunkingStrategy } }
    )
    return response.data
  }

  async deleteDocument(id: string): Promise<void> {
    await this.client.delete(`/api/v1/documents/${id}`)
  }

  async getDocumentIndexInfo(id: string): Promise<any> {
    const response = await this.client.get(`/api/v1/documents/${id}/index-info`)
    return response.data
  }

  async getDocumentContent(id: string, limit = 100): Promise<any> {
    const response = await this.client.get(`/api/v1/documents/${id}/content`, {
      params: { limit }
    })
    return response.data
  }

  async searchDocuments(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.client.post('/api/v1/documents/search', null, {
      params: {
        query: params.query,
        document_ids: params.document_ids,
        top_k: params.top_k ?? 10,
      },
    })
    return response.data.results
  }

  async downloadDocument(id: string): Promise<Blob> {
    const response = await this.client.get(`/api/v1/documents/${id}/download`, {
      responseType: 'blob'
    })
    return response.data
  }

  async getSupportedDocumentTypes(): Promise<any> {
    const response = await this.client.get('/api/v1/documents/types/supported')
    return response.data
  }

  async getChunkingStrategies(): Promise<any> {
    const response = await this.client.get('/api/v1/documents/chunking/strategies')
    return response.data
  }

  // Answers
  async generateSingleAnswer(projectId: string, questionId: string): Promise<any> {
    const response = await this.client.post('/api/v1/answers/generate-single', {
      project_id: projectId,
      question_ids: [questionId]
    })
    return response.data
  }

  async generateAllAnswers(projectId: string, questionIds?: string[]): Promise<any> {
    const response = await this.client.post('/api/v1/answers/generate-all', {
      project_id: projectId,
      question_ids: questionIds
    })
    return response.data
  }

  async getAnswer(id: string): Promise<Answer> {
    const response = await this.client.get(`/api/v1/answers/${id}`)
    return response.data
  }

  async updateAnswer(id: string, answer: Partial<Answer>): Promise<Answer> {
    const response = await this.client.put(`/api/v1/answers/${id}`, answer)
    return response.data
  }

  async confirmAnswer(id: string): Promise<any> {
    const response = await this.client.post(`/api/v1/answers/${id}/confirm`)
    return response.data
  }

  async rejectAnswer(id: string, reason?: string): Promise<any> {
    const response = await this.client.post(`/api/v1/answers/${id}/reject`, null, {
      params: { reason },
    })
    return response.data
  }

  async regenerateAnswer(id: string): Promise<any> {
    const response = await this.client.post(`/api/v1/answers/${id}/regenerate`)
    return response.data
  }

  async getProjectAnswers(projectId: string): Promise<Answer[]> {
    const response = await this.client.get(`/api/v1/answers/project/${projectId}`)
    return response.data
  }

  async getProjectAnswersWithContext(projectId: string): Promise<any> {
    const response = await this.client.get(`/api/v1/answers/project/${projectId}/with-context`)
    return response.data
  }

  async getQuestionAnswer(projectId: string, questionId: string): Promise<any> {
    const response = await this.client.get(`/api/v1/answers/question/${questionId}/project/${projectId}`)
    return response.data
  }

  async evaluateAnswers(projectId: string, groundTruthAnswers: Record<string, string>): Promise<EvaluationResult> {
    const response = await this.client.post('/api/v1/answers/evaluate', {
      project_id: projectId,
      ground_truth_answers: groundTruthAnswers
    })
    return response.data
  }

  async compareAiVsManualAnswers(projectId: string): Promise<any> {
    const response = await this.client.get(`/api/v1/answers/project/${projectId}/compare-ai-manual`)
    return response.data
  }

  async getAnswerStatistics(projectId: string): Promise<any> {
    const response = await this.client.get(`/api/v1/answers/project/${projectId}/statistics`)
    return response.data
  }

  // Questionnaires
  async getQuestionnaires(): Promise<any[]> {
    const response = await this.client.get('/api/v1/questionnaires')
    return response.data
  }

  async uploadQuestionnaire(file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await this.client.post('/api/v1/questionnaires/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  // Request status
  async getRequestStatus(id: string): Promise<Request> {
    const response = await this.client.get(`/api/v1/requests/${id}`)
    return response.data
  }

  async getProjectRequests(projectId: string): Promise<Request[]> {
    const response = await this.client.get(`/api/v1/requests/project/${projectId}`)
    return response.data
  }
}

export const apiClient = new ApiClient()
export default apiClient
