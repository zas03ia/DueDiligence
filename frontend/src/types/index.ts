export interface Project {
  id: string
  name: string
  description?: string
  document_scope: string[]
  status: ProjectStatus
  questionnaire_id?: string
  created_at: string
  updated_at: string
}

export interface Questionnaire {
  id: string
  name: string
  description?: string
  file_path: string
  created_at: string
  updated_at: string
  questions?: Question[]
}

export interface Question {
  id: string
  questionnaire_id: string
  text: string
  question_type: QuestionType
  section?: string
  order: number
  options?: string[]
  created_at: string
}

export interface Answer {
  id: string
  project_id: string
  question_id: string
  answer_text?: string
  manual_answer?: string
  confidence_score: number
  is_answerable: boolean
  citations: Citation[]
  status: AnswerStatus
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  filename: string
  file_type: DocumentType
  title?: string
  file_path: string
  file_size: number
  metadata: Record<string, any>
  indexed: boolean
  created_at: string
  updated_at: string
}

export interface Request {
  id: string
  request_type: string
  status: RequestStatus
  progress: number
  project_id?: string
  document_id?: string
  result_data?: Record<string, any>
  error_message?: string
  created_at: string
  updated_at: string
}

export interface Citation {
  chunk_id: string
  text: string
  similarity_score: number
  page_number?: number
  slide_number?: number
  sheet_name?: string
  section?: string
}

export interface EvaluationResult {
  project_id: string
  overall_score: number
  avg_confidence: number
  total_questions: number
  evaluated_questions: number
  answerable_rate: number
  question_evaluations: QuestionEvaluation[]
  evaluation_report: EvaluationReport
  similarity_metrics: SimilarityMetrics
}

export interface QuestionEvaluation {
  answer_id: string
  question_id: string
  question_text: string
  ai_answer: string
  manual_answer?: string
  ground_truth: string
  evaluated_answer: string
  similarity_scores: SimilarityScores
  confidence_score: number
  is_answerable: boolean
  status: AnswerStatus
  quality_assessment: QualityAssessment
}

export interface EvaluationReport {
  project_name: string
  evaluation_summary: {
    overall_score: number
    average_confidence: number
    total_evaluated: number
    quality_distribution: Record<string, number>
  }
  score_statistics: {
    similarity: ScoreStats
    confidence: ScoreStats
  }
  recommendations: string[]
}

export interface SimilarityMetrics {
  semantic: ScoreStats
  keyword: ScoreStats
  length: ScoreStats
  combined: ScoreStats
}

export interface SimilarityScores {
  semantic: number
  keyword: number
  length: number
  combined: number
}

export interface ScoreStats {
  mean: number
  std: number
  min: number
  max: number
}

export interface QualityAssessment {
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  description: string
  similarity_score: number
}

export interface ProjectWithDetails {
  project: Project
  questions: Question[]
  answers: Answer[]
}

export interface GenerationRequest {
  project_id: string
  question_ids?: string[]
}

export interface EvaluationRequest {
  project_id: string
  ground_truth_answers: Record<string, string>
}

export interface IndexingRequest {
  document_id: string
  chunking_strategy: ChunkingStrategy
}

export interface AnswerGenerationParams {
  project_id: string
  question_id: string
  use_cached?: boolean
}

export interface DocumentUploadParams {
  file: File
  auto_index?: boolean
  chunking_strategy?: ChunkingStrategy
}

export interface SearchParams {
  query: string
  document_ids?: string[]
  top_k?: number
}

export interface SearchResult {
  text: string
  metadata: Record<string, any>
  similarity_score: number
}

// Enums
export type ProjectStatus = 'DRAFT' | 'INDEXING' | 'READY' | 'GENERATING' | 'COMPLETED' | 'OUTDATED' | 'ERROR'
export type AnswerStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'MANUAL_UPDATED' | 'MISSING_DATA'
export type RequestStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type DocumentType = 'PDF' | 'DOCX' | 'XLSX' | 'PPTX'
export type QuestionType = 'TEXT' | 'BOOLEAN' | 'NUMERIC' | 'DATE' | 'MULTIPLE_CHOICE'
export type ChunkingStrategy = 'FIXED_SIZE' | 'SENTENCE' | 'PARAGRAPH' | 'SEMANTIC'

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

// UI State Types
export interface LoadingState {
  isLoading: boolean
  error?: string
}

export interface ProjectFilters {
  status?: ProjectStatus
  search?: string
}

export interface DocumentFilters {
  file_type?: DocumentType
  indexed_only?: boolean
  search?: string
}

export interface AnswerFilters {
  status?: AnswerStatus
  question_type?: QuestionType
  search?: string
}
