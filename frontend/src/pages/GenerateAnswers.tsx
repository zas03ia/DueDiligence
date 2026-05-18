import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, CheckCircle, XCircle, RefreshCw, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { useAnswerStore } from '@/stores/answerStore'
import PageHeader from '@/components/PageHeader'
import toast from 'react-hot-toast'
import { getStatusColor, getConfidenceColor } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function GenerateAnswers() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([])
  const [generationMode, setGenerationMode] = useState<'all' | 'selected'>('all')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<{ answered: number; total: number } | null>(null)

  const {
    fetchProjectDetails,
    generateAnswers,
    projectDetails,
    isLoading: projectLoading,
    error: projectError
  } = useProjectStore()

  const { confirmAnswer, rejectAnswer, regenerateAnswer } = useAnswerStore()

  useEffect(() => {
    if (id) fetchProjectDetails(id)
  }, [id, fetchProjectDetails])

  const handleGenerateAnswers = async () => {
    if (!id) return

    const questionIds = generationMode === 'selected' ? selectedQuestions : undefined

    if (generationMode === 'selected' && selectedQuestions.length === 0) {
      toast.error('Select at least one question first')
      return
    }

    try {
      setGenerating(true)
      toast.loading('Starting answer generation...', { id: 'gen' })
      await generateAnswers(id, questionIds)
      toast.success('Generation running in background...', { id: 'gen' })

      // Open SSE stream to track progress and refresh when done
      let completed = false
      const es = new EventSource(`${API_BASE}/api/v1/projects/${id}/generate-answers/stream`)
      es.onmessage = (e) => {
        const data = JSON.parse(e.data)
        setProgress({ answered: data.answered, total: data.total })
        if (data.done) {
          completed = true
          es.close()
          setGenerating(false)
          setProgress(null)
          fetchProjectDetails(id)
          toast.success(
            data.status === 'ERROR' ? 'Generation finished with errors' : 'Answers generated successfully'
          )
        }
      }
      es.onerror = () => {
        es.close()
        setGenerating(false)
        setProgress(null)
        if (!completed) fetchProjectDetails(id)
      }
    } catch {
      setGenerating(false)
      toast.error('Failed to start generation', { id: 'gen' })
    }
  }

  const handleQuestionSelect = (questionId: string) => {
    setSelectedQuestions(prev => 
      prev.includes(questionId) 
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    )
  }

  const handleSelectAll = () => {
    if (projectDetails?.questions) {
      setSelectedQuestions(projectDetails.questions.map(q => q.id))
    }
  }

  const handleClearSelection = () => {
    setSelectedQuestions([])
  }

  // Memoize derived data for performance
  const { questions, answers, answerStats } = React.useMemo(() => {
    const q = projectDetails?.questions || []
    const a = projectDetails?.answers || []
    return {
      questions: q,
      answers: a,
      answerStats: {
        confirmed: a.filter(ans => ans.status === 'CONFIRMED').length,
        rejected: a.filter(ans => ans.status === 'REJECTED').length,
        pending: a.filter(ans => ans.status === 'PENDING').length,
        manual_updated: a.filter(ans => ans.status === 'MANUAL_UPDATED').length,
        missing_data: a.filter(ans => ans.status === 'MISSING_DATA').length
      }
    }
  }, [projectDetails])

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3" />
        <div className="text-lg">Loading project...</div>
      </div>
    )
  }

  if (projectError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 bg-red-50 p-4 rounded-md border border-red-200">
          <strong>Error:</strong> {projectError}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: projectDetails?.project?.name || 'Project', href: `/projects/${id}` },
          { label: 'Generate Answers' },
        ]}
        title="Generate Answers"
        subtitle="AI-powered answer generation for your due diligence questions"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Project
            </Button>
            <Button
              onClick={handleGenerateAnswers}
              disabled={generating || projectLoading || projectDetails?.project?.status === 'GENERATING'}
            >
              {generating ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />Generating...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" />Generate {generationMode === 'selected' ? `${selectedQuestions.length} Selected` : 'All'} Answers</>
              )}
            </Button>
          </>
        }
      />

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(projectDetails?.project?.status || 'DRAFT')}`}>
            {projectDetails?.project?.status}
          </span>
          <span className="text-sm text-muted-foreground">
            {questions.length} questions • {answerStats.confirmed} confirmed
          </span>
        </div>

        {progress && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between text-sm font-medium text-blue-800 mb-2">
              <span>Generating answers...</span>
              <span>{progress.answered} / {progress.total}</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: progress.total > 0 ? `${(progress.answered / progress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {/* Generation Controls */}
        <div className="bg-card rounded-lg border p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Generation Options</h2>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-6">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="all"
                  checked={generationMode === 'all'}
                  onChange={(e) => setGenerationMode(e.target.value as 'all' | 'selected')}
                  className="mr-2"
                />
                <span>Generate all answers</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="selected"
                  checked={generationMode === 'selected'}
                  onChange={(e) => setGenerationMode(e.target.value as 'all' | 'selected')}
                  className="mr-2"
                />
                <span>Generate selected answers</span>
              </label>
            </div>

            {generationMode === 'selected' && (
              <div className="flex items-center space-x-4 pt-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={handleClearSelection}>
                  Clear Selection
                </Button>
                <span className="text-sm text-gray-500">
                  {selectedQuestions.length} of {questions.length} selected
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Questions List */}
        <div className="bg-card rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Questions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select questions to generate answers for, or generate all answers at once.
            </p>
          </div>

          <div className="divide-y divide-border">
            {questions.map((question, index) => {
              const answer = answers.find(a => a.question_id === question.id)
              const isSelected = selectedQuestions.includes(question.id)
              
              return (
                <div 
                  key={question.id} 
                  className={`p-4 hover:bg-muted/30 ${isSelected ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex items-start space-x-4">
                    {generationMode === 'selected' && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleQuestionSelect(question.id)}
                        className="mt-1"
                      />
                    )}
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-muted-foreground">
                            Q{index + 1}
                          </span>
                          {question.section && (
                            <span className="text-xs bg-muted px-2 py-1 rounded">
                              {question.section}
                            </span>
                          )}
                          {answer && (
                            <span className={`px-2 py-1 text-xs rounded ${getStatusColor(answer.status)}`}>
                              {answer.status}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {answer && (
                            <>
                              <span className={`text-sm font-bold ${getConfidenceColor(answer.confidence_score)}`}>
                                {(answer.confidence_score * 100).toFixed(1)}%
                              </span>
                              <span className="text-xs text-gray-500">confidence</span>
                            </>
                          )}
                        </div>
                      </div>

                      <h3 className="text-base font-medium mb-2">
                        {question.text}
                      </h3>

                      {answer?.answer_text && (
                        <div className="bg-muted/50 p-3 rounded border">
                          <p className="text-sm">{answer.answer_text}</p>
                        </div>
                      )}

                      {answer && (
                        <div className="flex items-center space-x-2 mt-3">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => regenerateAnswer(answer.id)}
                            disabled={projectLoading}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Regenerate
                          </Button>
                          {answer.status !== 'CONFIRMED' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => confirmAnswer(answer.id)}
                              disabled={projectLoading}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Confirm
                            </Button>
                          )}
                          {answer.status !== 'REJECTED' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => rejectAnswer(answer.id)}
                              disabled={projectLoading}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {questions.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No questions available</h3>
              <p className="text-muted-foreground">This project doesn't have any questions to generate answers for.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
