import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Play, CheckCircle, XCircle, RefreshCw, FileText, Download, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore, useProjectDetails, useProjectLoading, useProjectError } from '@/stores/projectStore'
import { useAnswerStore } from '@/stores/answerStore'
import { formatDate, getStatusColor, getConfidenceColor, formatFileSize } from '@/lib/utils'
import { ProjectStatus, AnswerStatus, QuestionType } from '@/types'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('questions')
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  
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

  const handleGenerateAnswers = async () => {
    if (!currentProject) return
    
    try {
      await generateAnswers(currentProject.id)
    } catch (error) {
      console.error('Failed to generate answers:', error)
    }
  }

  const handleConfirmAnswer = async (answerId: string) => {
    try {
      await confirmAnswer(answerId)
    } catch (error) {
      console.error('Failed to confirm answer:', error)
    }
  }

  const handleRejectAnswer = async (answerId: string) => {
    try {
      await rejectAnswer(answerId)
    } catch (error) {
      console.error('Failed to reject answer:', error)
    }
  }

  const handleRegenerateAnswer = async (answerId: string) => {
    try {
      await regenerateAnswer(answerId)
    } catch (error) {
      console.error('Failed to regenerate answer:', error)
    }
  }

  const handleManualUpdate = async (answerId: string, manualAnswer: string) => {
    try {
      await updateAnswer(answerId, { manual_answer: manualAnswer })
    } catch (error) {
      console.error('Failed to update answer:', error)
    }
  }

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading project details...</div>
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

  if (!projectDetails) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Project not found</div>
      </div>
    )
  }

  const { project, questions, answers } = projectDetails
  const answerStats = {
    total: answers.length,
    confirmed: answers.filter(a => a.status === 'CONFIRMED').length,
    rejected: answers.filter(a => a.status === 'REJECTED').length,
    pending: answers.filter(a => a.status === 'PENDING').length,
    manual_updated: answers.filter(a => a.status === 'MANUAL_UPDATED').length,
    missing_data: answers.filter(a => a.status === 'MISSING_DATA').length
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
            <h1 className="text-3xl font-bold text-gray-900">{project?.name}</h1>
            <p className="text-gray-600 mt-1">{project?.description}</p>
            <div className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(project?.status || 'DRAFT')}`}>
              {project?.status}
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
          <button
            onClick={() => setActiveTab('questions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'questions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Questions ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('answers')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'answers'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Answers ({answers.length})
          </button>
          <button
            onClick={() => setActiveTab('statistics')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'statistics'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Statistics
          </button>
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
                return (
                  <div 
                    key={question.id} 
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedQuestion(question.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-500">
                            {question.section || 'General'}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded ${getStatusColor(answer?.status || 'PENDING')}`}>
                            {answer?.status || 'PENDING'}
                          </span>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {question.text}
                        </h3>
                      </div>
                      <div className="text-sm text-gray-500">
                        Type: {question.question_type}
                      </div>
                    </div>
                    
                    {answer && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Confidence:</span>
                            <span className={`font-semibold ${getConfidenceColor(answer.confidence_score)}`}>
                              {(answer.confidence_score * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant={answer.status === 'CONFIRMED' ? 'default' : 'outline'}
                              onClick={() => handleConfirmAnswer(answer.id)}
                              disabled={answer.status === 'CONFIRMED'}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Confirm
                            </Button>
                            <Button 
                              size="sm" 
                              variant={answer.status === 'REJECTED' ? 'default' : 'outline'}
                              onClick={() => handleRejectAnswer(answer.id)}
                              disabled={answer.status === 'REJECTED'}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleRegenerateAnswer(answer.id)}
                            >
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Regenerate
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-2">
                        <div className="text-sm font-medium text-gray-700 mb-1">AI Answer:</div>
                        <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                          {answer.answer_text || 'No answer generated'}
                        </div>
                      </div>
                      
                      {answer.manual_answer && (
                        <div className="mt-2">
                          <div className="text-sm font-medium text-gray-700 mb-1">Manual Answer:</div>
                          <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded border border-blue-200">
                            {answer.manual_answer}
                          </div>
                        </div>
                      )}
                      
                      {answer.citations && answer.citations.length > 0 && (
                        <div className="mt-2">
                          <div className="text-sm font-medium text-gray-700 mb-1">Citations:</div>
                          <div className="space-y-1">
                            {answer.citations.slice(0, 3).map((citation, index) => (
                              <div key={index} className="text-xs bg-gray-100 p-2 rounded border">
                                <div className="font-medium text-gray-700 mb-1">
                                  {citation.page_number && `Page ${citation.page_number}`}
                                  {citation.slide_number && `Slide ${citation.slide_number}`}
                                  {citation.sheet_name && `Sheet: ${citation.sheet_name}`}
                                </div>
                                <div className="text-gray-600">
                                  {citation.text.substring(0, 100)}...
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === 'answers' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Answers</h2>
              <div className="text-sm text-gray-600">
                {answerStats.confirmed} confirmed • {answerStats.pending} pending
              </div>
            </div>
            
            <div className="space-y-3">
              {answers.map((answer) => {
                const question = questions.find(q => q.id === answer.question_id)
                return (
                  <div key={answer.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-1">
                          {question?.text}
                        </h3>
                        <span className={`px-2 py-1 text-xs rounded ${getStatusColor(answer.status)}`}>
                          {answer.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        Confidence: {(answer.confidence_score * 100).toFixed(1)}%
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <div className="text-sm font-medium text-gray-700">AI Answer:</div>
                        <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                          {answer.answer_text || 'No answer generated'}
                        </div>
                      </div>
                      
                      {answer.manual_answer && (
                        <div>
                          <div className="text-sm font-medium text-blue-700">Manual Answer:</div>
                          <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded border border-blue-200">
                            {answer.manual_answer}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex gap-2 mt-3">
                        <textarea
                          className="w-full p-2 border rounded text-sm"
                          rows={3}
                          placeholder="Add manual answer..."
                          defaultValue={answer.manual_answer || ''}
                          onBlur={(e) => handleManualUpdate(answer.id, e.target.value)}
                        />
                        <Button size="sm" onClick={() => handleManualUpdate(answer.id, answer.manual_answer || '')}>
                          Update
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
        {activeTab === 'statistics' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Project Statistics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg border">
                <h3 className="text-lg font-medium mb-4">Answer Status</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Confirmed</span>
                    <span className="font-semibold text-green-600">{answerStats.confirmed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rejected</span>
                    <span className="font-semibold text-red-600">{answerStats.rejected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pending</span>
                    <span className="font-semibold text-yellow-600">{answerStats.pending}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Manual Updated</span>
                    <span className="font-semibold text-blue-600">{answerStats.manual_updated}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Missing Data</span>
                    <span className="font-semibold text-orange-600">{answerStats.missing_data}</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg border">
                <h3 className="text-lg font-medium mb-4">Project Info</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(project?.status || 'DRAFT')}`}>
                      {project?.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Created</span>
                    <span className="text-gray-900">{formatDate(project?.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Last Updated</span>
                    <span className="text-gray-900">{formatDate(project?.updated_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
