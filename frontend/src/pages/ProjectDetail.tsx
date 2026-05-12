import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, CheckCircle, XCircle, RefreshCw, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { useAnswerStore } from '@/stores/answerStore'
import { formatDate, getStatusColor, getConfidenceColor } from '@/lib/utils'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('questions')
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  
  // Consolidating store access
  const { 
    fetchProjectDetails, 
    generateAnswers, 
    currentProject,
    projectDetails,
    isLoading: projectLoading,
    error: projectError 
  } = useProjectStore()
  
  const { 
    confirmAnswer, 
    rejectAnswer, 
    regenerateAnswer,
    updateAnswer 
  } = useAnswerStore()

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id)
    }
  }, [id, fetchProjectDetails])

  // Memoize derived data for performance and stability
  const { questions, answers, answerStats } = useMemo(() => {
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

  const handleGenerateAnswers = async () => {
    if (!currentProject?.id) return
    try {
      await generateAnswers(currentProject.id)
    } catch (error) {
      console.error('Failed to generate answers:', error)
    }
  }

  // Generic wrapper for answer actions to prevent repetition
  const handleAction = async (e: React.MouseEvent, action: (id: string) => Promise<void>, answerId: string) => {
    e.stopPropagation() // Prevents triggering the parent div's onClick
    try {
      await action(answerId)
    } catch (error) {
      console.error(`Action failed:`, error)
    }
  }

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
    <div className="container mx-auto py-8 px-4">
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

        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{currentProject?.name || 'Untitled Project'}</h1>
            <p className="text-gray-600 mt-1">{currentProject?.description}</p>
            <div className={`mt-2 inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(currentProject?.status || 'DRAFT')}`}>
              {currentProject?.status}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerateAnswers} disabled={projectLoading}>
              <Play className="w-4 h-4 mr-2" />
              Generate Answers
            </Button>
            <Button variant="outline" onClick={() => navigate(`/projects/${id}/documents`)}>
              <FileText className="w-4 h-4 mr-2" />
              Documents
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['questions', 'answers', 'statistics'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab} {tab !== 'statistics' && `(${tab === 'questions' ? questions.length : answers.length})`}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'questions' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Questions</h2>
              <div className="text-sm text-gray-600">
                {questions.length} questions • {answerStats.confirmed} confirmed
              </div>
            </div>

            <div className="space-y-3">
              {questions.map((question) => {
                const answer = answers.find(a => a.question_id === question.id)
                const isSelected = selectedQuestion === question.id
                
                return (
                  <div 
                    key={question.id} 
                    className={`border rounded-lg p-4 transition-all cursor-pointer ${isSelected ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-md'}`}
                    onClick={() => setSelectedQuestion(question.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-500">
                            {question.section || 'General'}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(answer?.status || 'PENDING')}`}>
                            {answer?.status || 'PENDING'}
                          </span>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">{question.text}</h3>
                      </div>
                      <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        {question.question_type}
                      </div>
                    </div>

                    {answer && (
                      <div className="mt-4 space-y-3 border-t pt-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Confidence:</span>
                            <span className={`text-sm font-bold ${getConfidenceColor(answer.confidence_score)}`}>
                              {(answer.confidence_score * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" variant="outline" className="h-8"
                              onClick={(e) => handleAction(e, confirmAnswer, answer.id)}
                              disabled={answer.status === 'CONFIRMED'}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" /> Confirm
                            </Button>
                            <Button 
                              size="sm" variant="outline" className="h-8"
                              onClick={(e) => handleAction(e, rejectAnswer, answer.id)}
                              disabled={answer.status === 'REJECTED'}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                            <Button 
                              size="sm" variant="outline" className="h-8 text-blue-600"
                              onClick={(e) => handleAction(e, regenerateAnswer, answer.id)}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" /> Regenerate
                            </Button>
                          </div>
                        </div>
                        
                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded border">
                          <p className="font-semibold text-gray-700 mb-1">AI Response:</p>
                          {answer.answer_text || 'No answer generated yet.'}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ... (Answers Tab and Statistics logic remain similar but benefited from memoized values) */}
        {activeTab === 'statistics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-white p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-bold mb-4">Answer Health</h3>
                <div className="space-y-3">
                  {Object.entries(answerStats).map(([key, val]) => (
                    <div key={key} className="flex justify-between border-b pb-2">
                      <span className="text-gray-600 capitalize">{key.replace('_', ' ')}</span>
                      <span className="font-mono font-bold">{val}</span>
                    </div>
                  ))}
                </div>
             </div>
             <div className="bg-white p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-bold mb-4">Timestamps</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created</span>
                    <span>{formatDate(currentProject?.created_at || '')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Updated</span>
                    <span>{formatDate(currentProject?.updated_at || '')}</span>
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  )
}