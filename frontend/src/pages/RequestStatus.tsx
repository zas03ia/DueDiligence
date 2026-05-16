import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { apiClient } from '@/services/api'
import PageHeader from '@/components/PageHeader'
import { formatDate, getStatusColor } from '@/lib/utils'
import { Request } from '@/types'

export default function RequestStatus() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [requests, setRequests] = useState<Request[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const { projectDetails, fetchProjectDetails, isLoading, error } = useProjectStore()
  const project = projectDetails?.project

  const loadData = useCallback(async () => {
    if (!id) return
    setLoadError(null)
    try {
      const data = await apiClient.getProjectRequests(id)
      setRequests(data)
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || 'Failed to load requests')
    }
  }, [id])

  useEffect(() => {
    if (id) {
      fetchProjectDetails(id)
      loadData()
    }
  }, [id, fetchProjectDetails, loadData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadData])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RUNNING':  return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
      case 'COMPLETED': return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'FAILED':   return <XCircle className="w-4 h-4 text-red-600" />
      default:         return <Clock className="w-4 h-4 text-yellow-600" />
    }
  }

  if (isLoading && !project) return <p className="text-center py-16">Loading...</p>
  if (error) return <p className="text-center py-16 text-destructive">{error}</p>
  if (!project) return <p className="text-center py-16">Project not found</p>

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project.name, href: `/projects/${id}` },
          { label: 'Request Status' },
        ]}
        title="Request Status"
        subtitle="Track background jobs and project progress"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/projects/${id}`)}>Back to Project</Button>
            <Button variant="outline" onClick={() => setAutoRefresh(!autoRefresh)}>
              {autoRefresh ? 'Stop Auto-refresh' : 'Auto-refresh'}
            </Button>
            <Button onClick={loadData}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
          </>
        }
      />

      <div className="container mx-auto px-4 py-6">
        {loadError && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-card border rounded-xl p-6">
            <h3 className="font-semibold mb-4">Statistics</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Total</span><strong>{requests.length}</strong></div>
              <div className="flex justify-between"><span>Pending</span><strong className="text-yellow-600">{requests.filter(r => r.status === 'PENDING').length}</strong></div>
              <div className="flex justify-between"><span>Running</span><strong className="text-blue-600">{requests.filter(r => r.status === 'RUNNING').length}</strong></div>
              <div className="flex justify-between"><span>Completed</span><strong className="text-green-600">{requests.filter(r => r.status === 'COMPLETED').length}</strong></div>
              <div className="flex justify-between"><span>Failed</span><strong className="text-red-600">{requests.filter(r => r.status === 'FAILED').length}</strong></div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-card border rounded-lg p-4 cursor-pointer hover:border-primary/50"
                onClick={() => setSelectedRequest(request)}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(request.status)}
                    <span className="font-medium">{request.request_type}</span>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(request.status)}`}>
                    {request.status}
                  </span>
                </div>
                {(request.status === 'RUNNING' || request.status === 'PENDING') && (
                  <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.round((request.progress || 0) * 100)}%` }}
                    />
                  </div>
                )}
                {request.error_message && (
                  <p className="text-xs text-destructive mt-1 truncate">{request.error_message}</p>
                )}
                <p className="text-xs text-muted-foreground">{formatDate(request.created_at)}</p>
              </div>
            ))}

            {requests.length === 0 && !loadError && (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                <p className="font-medium mb-2">No background jobs yet</p>
                <p className="text-sm">Jobs appear here when you click "Generate All" on a project. Each job tracks the progress of AI answer generation or document indexing.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedRequest && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedRequest(null)}
        >
          <div className="bg-card rounded-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">{selectedRequest.request_type}</h3>
            <div className="space-y-1 text-sm mb-4">
              <p><span className="text-muted-foreground">Status: </span>{selectedRequest.status}</p>
              <p><span className="text-muted-foreground">Progress: </span>{Math.round((selectedRequest.progress || 0) * 100)}%</p>
              <p className="text-xs font-mono text-muted-foreground">{selectedRequest.id}</p>
            </div>
            {selectedRequest.result_data && (
              <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
                {JSON.stringify(selectedRequest.result_data, null, 2)}
              </pre>
            )}
            {selectedRequest.error_message && (
              <p className="text-destructive text-sm mt-2">{selectedRequest.error_message}</p>
            )}
            <Button className="mt-4 w-full" onClick={() => setSelectedRequest(null)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  )
}
