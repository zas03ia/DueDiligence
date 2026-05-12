import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, BarChart3, CheckCircle, XCircle, TrendingUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { useEvaluationStore } from '@/stores/evaluationStore'
import { formatDate, getStatusColor } from '@/lib/utils'
import { EvaluationResult } from '@/types'

export default function EvaluationReport() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [groundTruthAnswers, setGroundTruthAnswers] = useState<Record<string, string>>({})
  const [showGroundTruthForm, setShowGroundTruthForm] = useState(false)
  
  const { 
    fetchProjectDetails,
    currentProject,
    isLoading: projectLoading,
    error: projectError 
  } = useProjectStore()
  
  const { 
    evaluateAnswers,
    currentEvaluation,
    isLoading: evaluationLoading,
    error: evaluationError 
  } = useEvaluationStore()

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id)
    }
  }, [id, fetchProjectDetails])

  const handleEvaluate = async () => {
    if (!currentProject || Object.keys(groundTruthAnswers).length === 0) {
      alert('Please provide ground truth answers for evaluation')
      return
    }
    
    try {
      await evaluateAnswers(currentProject.id, groundTruthAnswers)
    } catch (error) {
      console.error('Evaluation failed:', error)
    }
  }

  const handleGroundTruthChange = (questionId: string, answer: string) => {
    setGroundTruthAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }))
  }

  const handleDownloadReport = async () => {
    if (!currentEvaluation) return
    
    try {
      const reportData = {
        project_id: currentEvaluation.project_id,
        overall_score: currentEvaluation.overall_score,
        avg_confidence: currentEvaluation.avg_confidence,
        total_questions: currentEvaluation.total_questions,
        evaluation_summary: currentEvaluation.evaluation_report?.evaluation_summary,
        question_evaluations: currentEvaluation.question_evaluations,
        similarity_metrics: currentEvaluation.similarity_metrics
      }
      
      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `evaluation-report-${currentProject?.name || 'project'}-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const getScoreColor = (score: number | undefined) => {
    if (score === undefined) return 'text-gray-400'
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    if (score >= 0.4) return 'text-orange-600'
    return 'text-red-600'
  }

  const getQualityIcon = (quality: string) => {
    switch (quality.toLowerCase()) {
      case 'excellent': return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'good': return <CheckCircle className="w-4 h-4 text-blue-600" />
      case 'fair': return <CheckCircle className="w-4 h-4 text-yellow-600" />
      case 'poor': return <XCircle className="w-4 h-4 text-red-600" />
      default: return <CheckCircle className="w-4 h-4 text-gray-600" />
    }
  }

  if (projectLoading) return <div className="flex items-center justify-center h-64 text-lg">Loading evaluation...</div>
  if (projectError) return <div className="flex items-center justify-center h-64 text-red-600">Error: {projectError}</div>
  if (!currentProject) return <div className="flex items-center justify-center h-64 text-gray-600">Project not found</div>

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="mb-2 p-0">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Evaluation Report</h1>
          <p className="text-gray-600">Project: <strong>{currentProject.name}</strong></p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGroundTruthForm(!showGroundTruthForm)}>
            {showGroundTruthForm ? 'Hide' : 'Show'} Ground Truth Form
          </Button>
          {currentEvaluation && (
            <Button onClick={handleDownloadReport}>
              <Download className="w-4 h-4 mr-2" /> Download JSON
            </Button>
          )}
        </div>
      </div>

      <hr className="mb-8" />

      {/* Ground Truth Form */}
      {showGroundTruthForm && (
        <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-2">Ground Truth Input</h2>
          <p className="text-sm text-gray-500 mb-6">Compare AI outputs against your provided gold-standard answers.</p>
          
          <div className="space-y-6">
            {currentEvaluation?.question_evaluations?.map((evaluation) => (
              <div key={evaluation.question_id} className="border rounded-lg p-4 bg-gray-50/50">
                <h3 className="font-semibold mb-2">Question {evaluation.question_id}</h3>
                <p className="text-sm text-gray-700 mb-4 italic">"{evaluation.question_text}"</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1">AI Answer</label>
                    <div className="text-sm p-3 bg-white border rounded h-24 overflow-y-auto">{evaluation.ai_answer}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Ground Truth</label>
                    <textarea
                      className="w-full p-3 border rounded text-sm h-24"
                      placeholder="Enter the correct answer..."
                      value={groundTruthAnswers[evaluation.question_id] || ''}
                      onChange={(e) => handleGroundTruthChange(evaluation.question_id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowGroundTruthForm(false)}>Cancel</Button>
            <Button onClick={handleEvaluate} disabled={evaluationLoading || Object.keys(groundTruthAnswers).length === 0}>
              {evaluationLoading ? <RefreshCw className="animate-spin w-4 h-4 mr-2" /> : null}
              Run Evaluation
            </Button>
          </div>
        </div>
      )}

      {/* Results Dashboard */}
      {currentEvaluation ? (
        <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
              <p className="text-sm text-gray-500 font-medium uppercase">Overall Score</p>
              <div className={`text-4xl font-black my-2 ${getScoreColor(currentEvaluation.overall_score)}`}>
                {(currentEvaluation.overall_score * 100).toFixed(0)}%
              </div>
              <p className="text-xs font-bold text-gray-400">Similarity Index</p>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
              <p className="text-sm text-gray-500 font-medium uppercase">Avg Confidence</p>
              <div className={`text-4xl font-black my-2 ${getScoreColor(currentEvaluation.avg_confidence)}`}>
                {currentEvaluation.avg_confidence.toFixed(2)}
              </div>
              <p className="text-xs font-bold text-gray-400">Model Certainty</p>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm text-center">
              <p className="text-sm text-gray-500 font-medium uppercase">Answerable Rate</p>
              <div className="text-4xl font-black my-2 text-blue-600">
                {(currentEvaluation.answerable_rate * 100).toFixed(0)}%
              </div>
              <p className="text-xs font-bold text-gray-400">{currentEvaluation.evaluated_questions} / {currentEvaluation.total_questions} Questions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Quality Distribution */}
            <div className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-blue-500" /> Quality Distribution
              </h3>
              <div className="space-y-4">
                {Object.entries(currentEvaluation.evaluation_report?.evaluation_summary?.quality_distribution || {}).map(([quality, count]) => {
                  const val = count as number; // Fixed unknown type error
                  const total = currentEvaluation.evaluation_report?.evaluation_summary?.total_evaluated || 1;
                  return (
                    <div key={quality} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize font-medium flex items-center gap-2">
                          {getQualityIcon(quality)} {quality}
                        </span>
                        <span className="text-gray-500">{val} ({((val / total) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(val / total) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confidence Stats */}
            <div className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-4 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-green-500" /> Confidence Statistics
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Fixed the 'evaluation_summary' property access errors here */}
                {[
                  { label: 'Mean', value: currentEvaluation.evaluation_report?.score_statistics?.confidence?.mean },
                  { label: 'Std Dev', value: currentEvaluation.evaluation_report?.score_statistics?.confidence?.std },
                  { label: 'Minimum', value: currentEvaluation.evaluation_report?.score_statistics?.confidence?.min },
                  { label: 'Maximum', value: currentEvaluation.evaluation_report?.score_statistics?.confidence?.max },
                ].map((stat) => (
                  <div key={stat.label} className="p-3 bg-gray-50 rounded-lg border">
                    <p className="text-xs text-gray-500 uppercase font-bold">{stat.label}</p>
                    <p className="text-xl font-mono font-bold text-gray-800">{stat.value?.toFixed(3) || 'N/A'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Detailed Table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-bold">Detailed Question Analysis</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white border-b">
                  <tr>
                    <th className="p-4 font-bold text-gray-600">Question</th>
                    <th className="p-4 font-bold text-gray-600 text-center">Similarity</th>
                    <th className="p-4 font-bold text-gray-600 text-center">Confidence</th>
                    <th className="p-4 font-bold text-gray-600">Quality</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {currentEvaluation.question_evaluations?.map((q) => (
                    <tr key={q.question_id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 max-w-md">
                        <p className="font-medium text-gray-900 truncate">{q.question_text}</p>
                        <p className="text-xs text-gray-400 mt-1">ID: {q.question_id}</p>
                      </td>
                      <td className="p-4 text-center font-mono font-bold">
                        <span className={getScoreColor(q.similarity_scores?.combined)}>
                          {q.similarity_scores?.combined?.toFixed(3) || '0.000'}
                        </span>
                      </td>
                      <td className="p-4 text-center font-mono font-bold">
                        <span className={getScoreColor(q.confidence_score)}>
                          {q.confidence_score?.toFixed(3) || '0.000'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {getQualityIcon(q.quality_assessment?.quality || '')}
                          <span className="capitalize">{q.quality_assessment?.quality || 'Unknown'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-600">No Evaluation Data</h2>
          <p className="text-gray-400 mb-6">Provide ground truth answers to generate a performance report.</p>
          <Button onClick={() => setShowGroundTruthForm(true)}>Get Started</Button>
        </div>
      )}
    </div>
  )
}