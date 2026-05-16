import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, BarChart3, CheckCircle, XCircle, TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { useEvaluationStore } from '@/stores/evaluationStore'
import PageHeader from '@/components/PageHeader'
import toast from 'react-hot-toast'
import { getStatusColor } from '@/lib/utils'

export default function EvaluationReport() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [groundTruthAnswers, setGroundTruthAnswers] = useState<Record<string, string>>({})
  const [showGroundTruthForm, setShowGroundTruthForm] = useState(false)

  const { fetchProjectDetails, projectDetails, isLoading: projectLoading, error: projectError } = useProjectStore()
  const { evaluateAnswers, currentEvaluation, isLoading: evaluationLoading } = useEvaluationStore()

  const project = projectDetails?.project
  const questions = projectDetails?.questions || []

  useEffect(() => {
    if (id) fetchProjectDetails(id)
  }, [id, fetchProjectDetails])

  useEffect(() => {
    if (questions.length > 0 && Object.keys(groundTruthAnswers).length === 0) {
      const initial: Record<string, string> = {}
      questions.forEach((q) => {
        const answer = projectDetails?.answers.find((a) => a.question_id === q.id)
        initial[q.id] = answer?.manual_answer || answer?.answer_text || ''
      })
      setGroundTruthAnswers(initial)
    }
  }, [questions, projectDetails?.answers, groundTruthAnswers])

  const handleEvaluate = async () => {
    if (!id) return
    const filled = Object.values(groundTruthAnswers).filter((v) => v.trim()).length
    if (filled === 0) {
      toast.error('Provide at least one ground truth answer')
      return
    }
    try {
      toast.loading('Running evaluation...', { id: 'eval' })
      await evaluateAnswers(id, groundTruthAnswers)
      toast.success('Evaluation complete', { id: 'eval' })
      setShowGroundTruthForm(false)
    } catch {
      toast.error('Evaluation failed', { id: 'eval' })
    }
  }

  const handleDownloadReport = () => {
    if (!currentEvaluation) return
    const blob = new Blob([JSON.stringify(currentEvaluation, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `evaluation-${project?.name || id}-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const getScoreColor = (score: number | undefined) => {
    if (score === undefined) return 'text-muted-foreground'
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (projectLoading && !project) {
    return <p className="text-center py-16 text-muted-foreground">Loading...</p>
  }
  if (projectError) {
    return <p className="text-center py-16 text-destructive">{projectError}</p>
  }
  if (!project) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Project not found</p>
        <Button onClick={() => navigate('/evaluation')}>Back to Evaluation</Button>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Evaluation', href: '/evaluation' },
          { label: project.name },
        ]}
        title="Evaluation Report"
        subtitle={`Compare AI answers against ground truth for ${project.name}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/projects/${id}`)}>Back to Project</Button>
            <Button variant="outline" onClick={() => setShowGroundTruthForm(!showGroundTruthForm)}>
              {showGroundTruthForm ? 'Hide' : 'Edit'} Ground Truth
            </Button>
            {currentEvaluation && (
              <Button onClick={handleDownloadReport}>
                <Download className="w-4 h-4 mr-2" /> Download
              </Button>
            )}
          </>
        }
      />

      <div className="container mx-auto px-4 py-6">
        {showGroundTruthForm && (
          <div className="mb-8 bg-card border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Ground truth answers</h2>
            {questions.length === 0 ? (
              <p className="text-muted-foreground">No questions in this project.</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {questions.map((q) => (
                  <div key={q.id} className="border rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">{q.text}</p>
                    <textarea
                      className="w-full p-2 border border-input rounded-lg text-sm bg-background"
                      rows={2}
                      placeholder="Expected answer..."
                      value={groundTruthAnswers[q.id] || ''}
                      onChange={(e) => setGroundTruthAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowGroundTruthForm(false)}>Cancel</Button>
              <Button onClick={handleEvaluate} disabled={evaluationLoading}>
                {evaluationLoading && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Run Evaluation
              </Button>
            </div>
          </div>
        )}

        {currentEvaluation ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-card border rounded-xl p-6 text-center">
                <p className="text-sm text-muted-foreground">Overall Score</p>
                <p className={`text-4xl font-bold my-2 ${getScoreColor(currentEvaluation.overall_score)}`}>
                  {(currentEvaluation.overall_score * 100).toFixed(0)}%
                </p>
              </div>
              <div className="bg-card border rounded-xl p-6 text-center">
                <p className="text-sm text-muted-foreground">Avg Confidence</p>
                <p className={`text-4xl font-bold my-2 ${getScoreColor(currentEvaluation.avg_confidence)}`}>
                  {currentEvaluation.avg_confidence.toFixed(2)}
                </p>
              </div>
              <div className="bg-card border rounded-xl p-6 text-center">
                <p className="text-sm text-muted-foreground">Answerable Rate</p>
                <p className="text-4xl font-bold my-2 text-primary">
                  {(currentEvaluation.answerable_rate * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="p-4 border-b bg-muted/30 font-semibold">Question analysis</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-4 text-left">Question</th>
                    <th className="p-4 text-center">Similarity</th>
                    <th className="p-4 text-center">Confidence</th>
                    <th className="p-4 text-left">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEvaluation.question_evaluations?.map((q) => (
                    <tr key={q.question_id} className="border-b hover:bg-muted/20">
                      <td className="p-4 max-w-md truncate">{q.question_text}</td>
                      <td className={`p-4 text-center font-mono ${getScoreColor(q.similarity_scores?.combined)}`}>
                        {q.similarity_scores?.combined?.toFixed(3) ?? '—'}
                      </td>
                      <td className={`p-4 text-center font-mono ${getScoreColor(q.confidence_score)}`}>
                        {q.confidence_score?.toFixed(3) ?? '—'}
                      </td>
                      <td className="p-4 capitalize">{q.quality_assessment?.quality || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 border-2 border-dashed rounded-xl">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No evaluation yet</h2>
            <p className="text-muted-foreground mb-2">Enter ground truth answers and run evaluation.</p>
            <p className="text-sm text-muted-foreground mb-6">
              Ground truth answers are the "correct" expected answers you provide manually. The system will compare them against the AI-generated answers using semantic similarity and keyword overlap to give you a quality score.
            </p>
            <Button onClick={() => setShowGroundTruthForm(true)}>Get Started</Button>
          </div>
        )}
      </div>
    </div>
  )
}
