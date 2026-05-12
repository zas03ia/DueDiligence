import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { formatDate, getStatusColor } from '@/lib/utils'
import { Request } from '@/types'

export default function RequestStatus() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  
  // FIXED: selectedRequest should hold the object to access properties in the modal
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [requests, setRequests] = useState<Request[]>([])
  
  const { 
    currentProject,
    isLoading: projectLoading,
    error: projectError,
    fetchProjectDetails // Added from store
  } = useProjectStore()

  // Memoized fetch to prevent unnecessary re-renders
  const loadData = useCallback(async () => {
    if (!id) return
    try {
      // In a real app: const data = await api.getRequests(id); setRequests(data);
      console.log('Fetching requests for project:', id)
    } catch (error) {
      console.error('Fetch failed:', error)
    }
  }, [id])

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id)
      loadData()
    }
  }, [id, fetchProjectDetails, loadData])

  // Auto-refresh logic
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (autoRefresh) {
      interval = setInterval(() => {
        loadData()
      }, 5000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [autoRefresh, loadData])

  const getStatusIcon = (status: string) => {
    const iconClass = "w-4 h-4"
    switch (status) {
      case 'PENDING': return <Clock className={`${iconClass} text-yellow-600`} />
      case 'RUNNING': return <RefreshCw className={`${iconClass} text-blue-600 animate-spin`} />
      case 'COMPLETED': return <CheckCircle className={`${iconClass} text-green-600`} />
      case 'FAILED': return <XCircle className={`${iconClass} text-red-600`} />
      default: return <Clock className={`${iconClass} text-gray-600`} />
    }
  }

  const getProgressPercentage = (request: Request) => Math.round((request.progress || 0) * 100)

  if (projectLoading) return <div className="flex items-center justify-center h-64 text-lg">Loading...</div>
  if (projectError) return <div className="flex items-center justify-center h-64 text-red-600">Error: {projectError}</div>
  if (!currentProject) return <div className="flex items-center justify-center h-64 text-gray-600">Project not found</div>

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="mb-2 p-0">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Request Status</h1>
          <p className="text-gray-600">Project: <strong>{currentProject.name}</strong></p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAutoRefresh(!autoRefresh)} className={autoRefresh ? 'border-blue-500 text-blue-600' : ''}>
            {autoRefresh ? 'Stop Auto-refresh' : 'Enable Auto-refresh'}
          </Button>
          <Button onClick={loadData} disabled={autoRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Now
          </Button>
        </div>
      </div>

      <hr className="mb-8" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Statistics</h3>
            <div className="space-y-3">
              {[
                { label: 'Total', value: requests.length, color: 'text-gray-900' },
                { label: 'Running', value: requests.filter(r => r.status === 'RUNNING').length, color: 'text-blue-600' },
                { label: 'Completed', value: requests.filter(r => r.status === 'COMPLETED').length, color: 'text-green-600' },
                { label: 'Failed', value: requests.filter(r => r.status === 'FAILED').length, color: 'text-red-600' },
              ].map(stat => (
                <div key={stat.label} className="flex justify-between items-center border-b pb-2 last:border-0">
                  <span className="text-sm text-gray-600">{stat.label}</span>
                  <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: List */}
        <div className="lg:col-span-2 space-y-4">
          {requests.map((request) => (
            <div 
              key={request.id} 
              className="bg-white border rounded-lg p-4 hover:border-blue-300 transition-all cursor-pointer shadow-sm"
              onClick={() => setSelectedRequest(request)}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(request.status)}
                  <span className="font-semibold text-gray-800">{request.request_type}</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusColor(request.status)}`}>
                  {request.status}
                </span>
              </div>

              {request.status === 'RUNNING' && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Progress</span>
                    <span>{getProgressPercentage(request)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${getProgressPercentage(request)}%` }} 
                    />
                  </div>
                </div>
              )}
              
              <div className="text-xs text-gray-500 flex justify-between">
                <span>ID: {request.id.substring(0, 8)}...</span>
                <span>{formatDate(request.created_at)}</span>
              </div>
            </div>
          ))}

          {requests.length === 0 && (
            <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
              <p className="text-gray-500">No active requests found for this project.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Overlay */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-bold">Request Details</h3>
              <button onClick={() => setSelectedRequest(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Type</p>
                  <p className="font-medium">{selectedRequest.request_type}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p className={`font-bold ${getStatusColor(selectedRequest.status)}`}>{selectedRequest.status}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500">Request ID</p>
                  <p className="font-mono text-xs bg-gray-100 p-1 rounded">{selectedRequest.id}</p>
                </div>
              </div>

              {selectedRequest.result_data && (
                <div className="mt-4">
                  <p className="text-sm font-semibold mb-2">Result Data</p>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedRequest.result_data, null, 2)}
                  </pre>
                </div>
              )}

              {selectedRequest.error_message && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                  <p className="text-red-700 text-sm font-bold">Error Message</p>
                  <p className="text-red-600 text-sm">{selectedRequest.error_message}</p>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <Button onClick={() => setSelectedRequest(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}