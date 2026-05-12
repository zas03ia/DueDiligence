import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, BarChart3, CheckCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore, useProjectLoading, useProjectError } from '@/stores/projectStore'
import { useEvaluationStore, useEvaluationLoading, useEvaluationError } from '@/stores/evaluationStore'
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
    loading: projectLoading,
    error: projectError 
  } = useProjectStore()
  
  const { 
    evaluateAnswers,
    currentEvaluation,
    loading: evaluationLoading,
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
      // Create report data
      const reportData = {
        project_id: currentEvaluation.project_id,
        overall_score: currentEvaluation.overall_score,
        avg_confidence: currentEvaluation.avg_confidence,
        total_questions: currentEvaluation.total_questions,
        evaluation_summary: currentEvaluation.evaluation_summary,
        question_evaluations: currentEvaluation.question_evaluations,
        similarity_metrics: currentEvaluation.similarity_metrics
      }
      
      // Download as JSON
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

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600'
    if (score >= 0.6) return 'text-yellow-600'
    if (score >= 0.4) return 'text-orange-600'
    return 'text-red-600'
  }

  const getQualityIcon = (quality: string) => {
    switch (quality) {
      case 'excellent':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'good':
        return <CheckCircle className="w-4 h-4 text-blue-600" />
      case 'fair':
        return <CheckCircle className="w-4 h-4 text-yellow-600" />
      case 'poor':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <CheckCircle className="w-4 h-4 text-gray-600" />
    }
  }

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading evaluation...</div>
      </div>
    )
  }

  if (projectError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">Error: {projectError}</div>
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Project not found</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/projects')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Button>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Evaluation Report</h1>
            <p className="text-gray-600 mt-1">
              Project: {currentProject.name}
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={() => setShowGroundTruthForm(!showGroundTruthForm)}>
              {showGroundTruthForm ? 'Hide' : 'Show'} Ground Truth Form
            </Button>
            {currentEvaluation && (
              <Button onClick={handleDownloadReport}>
                <Download className="w-4 h-4 mr-2" />
                Download Report
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Ground Truth Form */}
      {showGroundTruthForm && (
        <div className="mb-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Ground Truth Answers</h2>
          <p className="text-gray-600 mb-4">
            Provide the correct answers for evaluation. These will be compared against the AI-generated answers.
          </p>
          
          <div className="space-y-4">
            {currentEvaluation?.question_evaluations?.map((evaluation) => (
              <div key={evaluation.question_id} className="border rounded-lg p-4">
                <div className="mb-3">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Question {evaluation.question_id}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {evaluation.question_evaluations?.[0]?.question_text || 'Question text not available'}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      AI Answer:
                    </label>
                    <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded border">
                      {evaluation.ai_answer || 'No AI answer'}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ground Truth Answer:
                    </label>
                    <textarea
                      className="w-full p-3 border rounded text-sm"
                      rows={3}
                      placeholder="Enter ground truth answer..."
                      value={groundTruthAnswers[evaluation.question_id] || ''}
                      onChange={(e) => handleGroundTruthChange(evaluation.question_id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 flex gap-2">
            <Button onClick={() => setShowGroundTruthForm(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleEvaluate}
              disabled={Object.keys(groundTruthAnswers).length === 0}
            >
              Evaluate Answers
            </Button>
          </div>
        </div>
      )}

      {/* Evaluation Results */}
      {currentEvaluation && (
        <div className="space-y-8">
          {/* Overall Score */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Overall Evaluation</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-4xl font-bold mb-2">
                  {currentEvaluation.overall_score.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Overall Score</div>
                <div className={`text-2xl font-semibold ${getScoreColor(currentEvaluation.overall_score)}`}>
                  {currentEvaluation.overall_score >= 0.8 ? 'Excellent' :
                   currentEvaluation.overall_score >= 0.6 ? 'Good' :
                   currentEvaluation.overall_score >= 0.4 ? 'Fair' : 'Poor'}
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-4xl font-bold mb-2">
                  {currentEvaluation.avg_confidence.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Avg Confidence</div>
                <div className={`text-2xl font-semibold ${getScoreColor(currentEvaluation.avg_confidence)}`}>
                  {currentEvaluation.avg_confidence >= 0.8 ? 'High' :
                   currentEvaluation.avg_confidence >= 0.6 ? 'Medium' : 'Low'}
                </div>
              </div>
              
              <div className="text-center">
                <div className="text-4xl font-bold mb-2">
                  {currentEvaluation.answerable_rate.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">Answerable Rate</div>
                <div className="text-2xl font-semibold text-blue-600">
                  {(currentEvaluation.answerable_rate * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Quality Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Quality Distribution</h2>
            
            <div className="space-y-3">
              {Object.entries(currentEvaluation.evaluation_summary.quality_distribution).map(([quality, count]) => (
                <div key={quality} className="flex items-center justify-between">
                  <div className="flex items-center">
                    {getQualityIcon(quality)}
                    <span className="ml-2 capitalize font-medium">
                      {quality} ({count})
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {((count / currentEvaluation.total_questions) * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Score Statistics */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Score Statistics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-3">Similarity Scores</h3>
                <div className="space-y-2">
                  {Object.entries(currentEvaluation.similarity_metrics).map(([metric, stats]) => (
                    <div key={metric} className="border rounded p-3">
                      <div className="font-medium capitalize mb-2">{metric}</div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Mean:</span>
                          <span className="font-semibold">{stats.mean.toFixed(3)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Std:</span>
                          <span className="font-semibold">{stats.std.toFixed(3)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Min:</span>
                          <span className="font-semibold">{stats.min.toFixed(3)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Max:</span>
                          <span className="font-semibold">{stats.max.toFixed(3)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-3">Confidence Scores</h3>
                <div className="border rounded p-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Mean:</span>
                      <span className="font-semibold">{currentEvaluation.evaluation_summary.score_statistics.confidence.mean.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Std:</span>
                      <span className="font-semibold">{currentEvaluation.evaluation_summary.score_statistics.confidence.std.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Min:</span>
                      <span className="font-semibold">{currentEvaluation.evaluation_summary.score_statistics.confidence.min.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Max:</span>
                      <span className="font-semibold">{currentEvaluation.evaluation_summary.score_statistics.confidence.max.toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Recommendations</h2>
            
            <div className="space-y-2">
              {currentEvaluation.evaluation_report.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="text-blue-600 mt-1">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Question Details */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Question Evaluations ({currentEvaluation.evaluated_questions})</h2>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Question
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AI Answer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ground Truth
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Similarity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quality
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentEvaluation.question_evaluations.map((evaluation, index) => (
                    <tr key={evaluation.question_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                        {evaluation.question_evaluations?.[0]?.question_text?.substring(0, 50) || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                        {evaluation.ai_answer?.substring(0, 100) || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                        {evaluation.ground_truth?.substring(0, 100) || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <span className={`font-semibold ${getScoreColor(evaluation.similarity_scores.combined)}`}>
                          {evaluation.similarity_scores.combined.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <span className={`font-semibold ${getScoreColor(evaluation.confidence_score)}`}>
                          {evaluation.confidence_score.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center">
                          {getQualityIcon(evaluation.quality_assessment.quality)}
                          <span className="ml-2 capitalize">{evaluation.quality_assessment.quality}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
