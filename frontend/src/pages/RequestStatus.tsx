import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore, useProjectLoading, useProjectError } from '@/stores/projectStore'
import { formatDate, getStatusColor } from '@/lib/utils'
import { Request } from '@/types'

export default function RequestStatus() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  
  const { 
    currentProject,
    loading: projectLoading,
    error: projectError 
  } = useProjectStore()

  const [requests, setRequests] = useState<Request[]>([])

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id)
    }
  }, [id, fetchProjectDetails])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        // In a real app, this would fetch requests from API
        console.log('Auto-refreshing requests...')
      }, 5000)
      
      return () => clearInterval(interval)
    }
    
    return () => {
      setAutoRefresh(false)
    }
  }, [autoRefresh])

  const handleRefresh = async () => {
    try {
      // In a real app, this would fetch requests from API
      console.log('Refreshing requests...')
    } catch (error) {
      console.error('Refresh failed:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-600" />
      case 'RUNNING':
        return <RefreshCw className="w-4 h-4 text-blue-600" />
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <Clock className="w-4 h-4 text-gray-600" />
    }
  }

  const getProgressPercentage = (request: Request) => {
    return Math.round((request.progress || 0) * 100)
  }

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading request status...</div>
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
        
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Request Status</h1>
            <p className="text-gray-600 mt-1">
              Project: {currentProject.name}
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleRefresh} disabled={autoRefresh}>
              <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Stop Refresh' : 'Refresh'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Manual' : 'Auto'} Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Request Stats */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Request Statistics</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Requests:</span>
              <span className="text-lg font-semibold">{requests.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Pending:</span>
              <span className="text-lg font-semibold text-yellow-600">
                {requests.filter(r => r.status === 'PENDING').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Running:</span>
              <span className="text-lg font-semibold text-blue-600">
                {requests.filter(r => r.status === 'RUNNING').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Completed:</span>
              <span className="text-lg font-semibold text-green-600">
                {requests.filter(r => r.status === 'COMPLETED').length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Failed:</span>
              <span className="text-lg font-semibold text-red-600">
                {requests.filter(r => r.status === 'FAILED').length}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-2">
            {requests.slice(0, 5).map((request) => (
              <div key={request.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                   onClick={() => setSelectedRequest(request.id)}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(request.status)}
                      <span className="text-sm font-medium">{request.request_type}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(request.created_at)}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(request.status)}`}>
                      {request.status}
                    </span>
                  </div>
                  <div className="text-right">
                    {request.progress !== undefined && (
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 text-white text-center leading-relaxed"
                          style={{ width: `${getProgressPercentage(request)}%` }}
                        >
                          {getProgressPercentage(request)}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="text-sm text-gray-600 mt-2">
                {request.result_data && (
                  <div>
                    <span className="font-medium">Result:</span>
                    <span className="ml-2">
                      {typeof request.result_data === 'object' 
                        ? JSON.stringify(request.result_data).substring(0, 100) + '...'
                        : request.result_data
                      }
                    </span>
                  </div>
                )}
                
                {request.error_message && (
                  <div className="text-red-600 mt-2">
                    <span className="font-medium">Error:</span>
                    <span className="ml-2">{request.error_message}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Request Details */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl mx-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold">Request Details</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedRequest(null)}
              >
                ×
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Request ID:</span>
                <span className="text-sm font-mono">{selectedRequest.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Type:</span>
                <span className="text-sm font-medium">{selectedRequest.request_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status:</span>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedRequest.status)}`}>
                  {selectedRequest.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Progress:</span>
                <span className="text-sm font-medium">
                  {selectedRequest.progress !== undefined ? `${getProgressPercentage(selectedRequest)}%` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Created:</span>
                <span className="text-sm text-gray-600">{formatDate(selectedRequest.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Updated:</span>
                <span className="text-sm text-gray-600">{formatDate(selectedRequest.updated_at)}</span>
              </div>
            </div>
            
            {selectedRequest.project_id && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Project ID:</span>
                <span className="text-sm font-mono">{selectedRequest.project_id}</span>
              </div>
            )}
            
            {selectedRequest.document_id && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Document ID:</span>
                <span className="text-sm font-mono">{selectedRequest.document_id}</span>
              </div>
            )}
            
            {selectedRequest.result_data && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-2">Result:</div>
                <div className="bg-gray-50 rounded p-3 text-sm">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(selectedRequest.result_data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            
            {selectedRequest.error_message && (
              <div>
                <div className="text-sm font-medium text-red-600 mb-2">Error:</div>
                <div className="bg-red-50 rounded p-3 text-sm text-red-600">
                  {selectedRequest.error_message}
                </div>
              </div>
            )}
            
            <div className="mt-6 flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setSelectedRequest(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {requests.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500">
            <div className="text-lg mb-4">No requests found</div>
            <p className="text-sm">
              Requests will appear here when you start operations like document indexing or answer generation.
            </p>
            <Button onClick={() => navigate('/projects')}>
              Go to Projects
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
