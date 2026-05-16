import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, CheckCircle, XCircle, RefreshCw, FileText,
  BarChart3, Activity, Sparkles, ArrowRight, AlertTriangle, Info, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { useAnswerStore } from '@/stores/answerStore'
import PageHeader from '@/components/PageHeader'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'
import { formatDate, getStatusColor, getConfidenceColor } from '@/lib/utils'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'questions' | 'answers' | 'statistics'>('questions')
  const [generationProgress, setGenerationProgress] = useState<{ answered: number; total: number } | null>(null)
  const [questionnaires, setQuestionnaires] = useState<{ id: string; name: string; question_count: number }[]>([])
  const [assigningQuestionnaire, setAssigningQuestionnaire] = useState(false)
  const [uploadingQuestionnaire, setUploadingQuestionnaire] = useState(false)
  const questionnaireFileRef = useRef<HTMLInputElement>(null)
  const {
    fetchProjectDetails,
    generateAnswers,
    deleteProject,
    projectDetails,
    isLoading: projectLoading,
    error: projectError,
  } = useProjectStore()

  const { confirmAnswer, rejectAnswer, regenerateAnswer } = useAnswerStore()

  const project = projectDetails?.project

  useEffect(() => {
    if (id) fetchProjectDetails(id)
  }, [id, fetchProjectDetails])

  useEffect(() => {
    apiClient.getQuestionnaires().then(setQuestionnaires).catch(() => {})
  }, [])

  const handleAssignQuestionnaire = async (questionnaireId: string) => {
    if (!id) return
    try {
      await apiClient.setProjectQuestionnaire(id, questionnaireId)
      toast.success('Questionnaire assigned')
      setAssigningQuestionnaire(false)
      fetchProjectDetails(id)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to assign questionnaire')
    }
  }

  const handleQuestionnaireUpload = async (file: File) => {
    setUploadingQuestionnaire(true)
    try {
      toast.loading('Parsing questionnaire...', { id: 'q-upload' })
      const result = await apiClient.uploadQuestionnaire(file)
      toast.success(`Parsed ${result.total_questions} questions`, { id: 'q-upload' })
      const updated = await apiClient.getQuestionnaires()
      setQuestionnaires(updated)
      // Auto-assign the newly uploaded questionnaire
      await handleAssignQuestionnaire(result.questionnaire_id)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to parse questionnaire', { id: 'q-upload' })
    } finally {
      setUploadingQuestionnaire(false)
    }
  }

  const { questions, answers, answerStats } = useMemo(() => {
    const q = projectDetails?.questions || []
    const a = projectDetails?.answers || []
    return {
      questions: q,
      answers: a,
      answerStats: {
        confirmed: a.filter((ans) => ans.status === 'CONFIRMED').length,
        rejected: a.filter((ans) => ans.status === 'REJECTED').length,
        pending: a.filter((ans) => ans.status === 'PENDING').length,
        manual_updated: a.filter((ans) => ans.status === 'MANUAL_UPDATED').length,
        missing_data: a.filter((ans) => ans.status === 'MISSING_DATA').length,
      },
    }
  }, [projectDetails])

  const handleGenerateAnswers = async () => {
    if (!id) return
    try {
      toast.loading('Starting answer generation...', { id: 'gen' })
      const result = await generateAnswers(id)
      toast.success('Generation running in background', { id: 'gen' })

      // Open SSE stream for real-time progress
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const es = new EventSource(`${API_BASE}/api/v1/projects/${id}/generate-answers/stream`)
      es.onmessage = (e) => {
        const data = JSON.parse(e.data)
        setGenerationProgress({ answered: data.answered, total: data.total })
        if (data.done) {
          es.close()
          setGenerationProgress(null)
          fetchProjectDetails(id)
          toast.success(
            data.status === 'ERROR' ? 'Generation finished with errors' : 'Answers generated successfully'
          )
        }
      }
      es.onerror = () => { es.close(); setGenerationProgress(null); fetchProjectDetails(id) }
    } catch {
      toast.error('Failed to start generation', { id: 'gen' })
    }
  }

  const handleDelete = async () => {
    if (!id || !project) return
    if (!window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return
    try {
      await deleteProject(id)
      toast.success('Project deleted')
      navigate('/projects')
    } catch {
      toast.error('Failed to delete project')
    }
  }

  const handleAction = async (
    e: React.MouseEvent,
    action: (answerId: string, projectId?: string) => Promise<void>,
    answerId: string
  ) => {
    e.stopPropagation()
    if (!id) return
    try {
      await action(answerId, id)
      toast.success('Answer updated')
    } catch {
      toast.error('Action failed')
    }
  }

  // Derive next-step guidance based on project state
  // Must be before any early returns to satisfy Rules of Hooks
  const nextStep = useMemo(() => {
    if (!project) return null
    if (project.status === 'OUTDATED')
      return { icon: AlertTriangle, color: 'bg-orange-50 border-orange-200 text-orange-800', message: 'New documents were added since answers were last generated. Click "Generate All" to refresh answers.' }
    if (project.status === 'ERROR')
      return { icon: AlertTriangle, color: 'bg-red-50 border-red-200 text-red-800', message: 'Something went wrong during the last operation. Check Request Status for details, then try generating answers again.' }
    if (project.status === 'GENERATING')
      return { icon: Info, color: 'bg-blue-50 border-blue-200 text-blue-800', message: 'Answer generation is running in the background. Check Request Status to track progress.' }
    if (questions.length === 0)
      return { icon: Info, color: 'bg-blue-50 border-blue-200 text-blue-800', message: 'No questions yet. Click the "Questionnaire" button above to upload a questionnaire PDF/DOCX or assign an existing one.' }
    if (answers.length === 0)
      return { icon: ArrowRight, color: 'bg-primary/5 border-primary/20 text-primary', message: `${questions.length} questions are ready. Click "Generate All" to have the AI answer them using your indexed documents.` }
    if (answerStats.pending > 0)
      return { icon: ArrowRight, color: 'bg-primary/5 border-primary/20 text-primary', message: `${answerStats.pending} answer(s) are pending review. Go to the Questions tab and Confirm or Reject each AI-generated answer.` }
    if (answerStats.confirmed + answerStats.manual_updated === answers.length)
      return { icon: CheckCircle, color: 'bg-green-50 border-green-200 text-green-800', message: 'All answers reviewed! Head to Evaluation to compare AI answers against ground truth and get a quality score.' }
    return null
  }, [project, questions, answers, answerStats])

  if (projectLoading && !project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3" />
        <span>Loading project...</span>
      </div>
    )
  }

  if (projectError) {
    return (
      <div className="container mx-auto py-8 px-4 text-center text-destructive">
        Error: {projectError}
      </div>
    )
  }

  if (!project) {
    return (
      <div className="container mx-auto py-8 px-4 text-center">
        <p className="text-muted-foreground mb-4">Project not found</p>
        <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
      </div>
    )
  }

  const headerActions = (
    <>
      <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/documents`)}>
        <FileText className="w-4 h-4 mr-2" /> Documents
      </Button>
      <Button variant="outline" size="sm" onClick={() => setAssigningQuestionnaire(v => !v)}>
        <Upload className="w-4 h-4 mr-2" /> Questionnaire
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/generate`)}>
        <Sparkles className="w-4 h-4 mr-2" /> Generate
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/evaluation`)}>
        <BarChart3 className="w-4 h-4 mr-2" /> Evaluation
      </Button>
      <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${id}/requests`)}>
        <Activity className="w-4 h-4 mr-2" /> Status
      </Button>
      <Button onClick={handleGenerateAnswers} disabled={projectLoading || questions.length === 0}>
        <Play className="w-4 h-4 mr-2" /> Generate All
      </Button>
      <Button variant="destructive" size="sm" onClick={handleDelete}>
        Delete
      </Button>
    </>
  )

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project.name },
        ]}
        title={project.name}
        subtitle={project.description}
        actions={headerActions}
      />

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
            {project.status}
          </span>
        </div>

        {nextStep && (() => {
          const Icon = nextStep.icon
          return (
            <div className={`flex items-start gap-3 p-4 rounded-lg border mb-6 ${nextStep.color}`}>
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{nextStep.message}</p>
            </div>
          )
        })()}

        {generationProgress && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between text-sm font-medium text-blue-800 mb-2">
              <span>Generating answers...</span>
              <span>{generationProgress.answered} / {generationProgress.total}</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: generationProgress.total > 0 ? `${(generationProgress.answered / generationProgress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {assigningQuestionnaire && (
          <div className="mb-6 bg-card border rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Assign Questionnaire</h3>
              <Button variant="ghost" size="sm" onClick={() => setAssigningQuestionnaire(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {questionnaires.length > 0 && (
              <div className="space-y-2 mb-4">
                {questionnaires.map((q) => (
                  <div
                    key={q.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:border-primary/50 transition-colors ${
                      project.questionnaire_id === q.id ? 'border-primary bg-primary/5' : ''
                    }`}
                    onClick={() => handleAssignQuestionnaire(q.id)}
                  >
                    <div>
                      <p className="font-medium text-sm">{q.name}</p>
                      <p className="text-xs text-muted-foreground">{q.question_count} questions</p>
                    </div>
                    {project.questionnaire_id === q.id && (
                      <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="relative mb-3">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  {questionnaires.length > 0 ? 'or upload new' : 'upload a questionnaire PDF or DOCX'}
                </span>
              </div>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => questionnaireFileRef.current?.click()}
            >
              {uploadingQuestionnaire ? (
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
                  Parsing questionnaire...
                </p>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Click to upload a questionnaire PDF or DOCX</p>
                  <p className="text-xs text-muted-foreground mt-1">It will be parsed into questions and assigned to this project automatically</p>
                </>
              )}
              <input
                ref={questionnaireFileRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleQuestionnaireUpload(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        )}

        <div className="border-b border-border mb-6">
          <nav className="flex gap-6">
            {(['questions', 'answers', 'statistics'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab} ({tab === 'statistics' ? Object.values(answerStats).reduce((a, b) => a + b, 0) : tab === 'questions' ? questions.length : answers.length})
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'questions' && (
          <div className="space-y-4">
            {questions.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed rounded-xl">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium mb-1">No questions yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Assign a questionnaire to this project to get started.
                </p>
                <Button onClick={() => setAssigningQuestionnaire(true)}>
                  <Upload className="w-4 h-4 mr-2" /> Upload or Assign Questionnaire
                </Button>
              </div>
            ) : (
              questions.map((question) => {
                const answer = answers.find((a) => a.question_id === question.id)
                return (
                  <div key={question.id} className="border rounded-lg p-4 bg-card">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-xs text-muted-foreground">{question.section || 'General'}</span>
                        <h3 className="font-medium mt-1">{question.text}</h3>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(answer?.status || 'PENDING')}`}>
                        {answer?.status || 'PENDING'}
                      </span>
                    </div>
                    {answer?.answer_text && (
                      <div className="mt-3 p-3 bg-muted/50 rounded text-sm">{answer.answer_text}</div>
                    )}
                    {answer && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" disabled={answer.status === 'CONFIRMED'}
                          onClick={(e) => handleAction(e, confirmAnswer, answer.id)}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Confirm
                        </Button>
                        <Button size="sm" variant="outline" disabled={answer.status === 'REJECTED'}
                          onClick={(e) => handleAction(e, rejectAnswer, answer.id)}>
                          <XCircle className="w-3 h-3 mr-1" /> Reject
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={(e) => handleAction(e, regenerateAnswer, answer.id)}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'answers' && (
          <div className="space-y-4">
            {answers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No answers yet.</p>
                <Button onClick={handleGenerateAnswers}>
                  <Play className="w-4 h-4 mr-2" /> Generate Answers
                </Button>
              </div>
            ) : (
              answers.map((answer) => {
                const question = questions.find((q) => q.id === answer.question_id)
                return (
                  <div key={answer.id} className="border rounded-lg p-4 bg-card">
                    <p className="text-sm font-medium text-muted-foreground mb-1">{question?.text || 'Unknown question'}</p>
                    <p className="text-sm mb-2">{answer.answer_text || 'No answer text'}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${getConfidenceColor(answer.confidence_score)}`}>
                        {(answer.confidence_score * 100).toFixed(1)}% confidence
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(answer.status)}`}>{answer.status}</span>
                    </div>
                    {answer.citations?.length > 0 && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        {answer.citations.length} citation(s)
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={(e) => handleAction(e, confirmAnswer, answer.id)}>Confirm</Button>
                      <Button size="sm" variant="outline" onClick={(e) => handleAction(e, rejectAnswer, answer.id)}>Reject</Button>
                      <Button size="sm" variant="outline" onClick={(e) => handleAction(e, regenerateAnswer, answer.id)}>Regenerate</Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border rounded-lg p-6">
              <h3 className="font-semibold mb-4">Answer breakdown</h3>
              <div className="space-y-2">
                {Object.entries(answerStats).map(([key, val]) => (
                  <div key={key} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground capitalize">{key.replace('_', ' ')}</span>
                    <span className="font-mono font-bold">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border rounded-lg p-6">
              <h3 className="font-semibold mb-4">Project info</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Created</dt><dd>{formatDate(project.created_at)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Updated</dt><dd>{formatDate(project.updated_at)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Questions</dt><dd>{questions.length}</dd></div>
              </dl>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
