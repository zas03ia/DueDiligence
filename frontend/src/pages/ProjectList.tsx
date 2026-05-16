import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, MoreHorizontal, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import PageHeader from '@/components/PageHeader'
import toast from 'react-hot-toast'
import { ProjectStatus } from '@/types'
import { formatDate, getStatusColor } from '@/lib/utils'

const PAGE_SIZE = 10

export default function ProjectList() {
  const navigate = useNavigate()
  const { projects, isLoading, error, fetchProjects, deleteProject } = useProjectStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('')
  const [page, setPage] = useState(0)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (!openMenuId) return
    const handler = () => setOpenMenuId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenuId])

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (project.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    const matchesStatus = !statusFilter || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE))
  const paginatedProjects = filteredProjects.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleDelete = async (projectId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    setOpenMenuId(null)
    try {
      await deleteProject(projectId)
      toast.success('Project deleted')
    } catch {
      toast.error('Failed to delete project')
    }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Manage your due diligence projects"
        actions={
          <Link to="/projects/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        }
      />

      <div className="container mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }}
              className="w-full pl-10 pr-4 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as ProjectStatus | ''); setPage(0) }}
            className="px-4 py-2 border border-input rounded-lg bg-background"
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="INDEXING">Indexing</option>
            <option value="READY">Ready</option>
            <option value="GENERATING">Generating</option>
            <option value="COMPLETED">Completed</option>
            <option value="OUTDATED">Outdated</option>
            <option value="ERROR">Error</option>
          </select>
          <Button variant="outline" onClick={() => fetchProjects()}>
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center py-12 text-muted-foreground">Loading projects...</p>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-xl">
            <p className="text-muted-foreground mb-4">No projects found</p>
            <Link to="/projects/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create your first project
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-card border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Updated</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <Link to={`/projects/${project.id}`} className="font-medium text-primary hover:underline">
                          {project.name}
                        </Link>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{project.description}</p>
                        )}
                        {project.status === 'OUTDATED' && (
                          <p className="text-xs text-orange-600 mt-1">⚠ New documents added — answers need regeneration</p>
                        )}
                        {project.status === 'DRAFT' && (
                          <p className="text-xs text-muted-foreground mt-1">→ Open project to assign a questionnaire and generate answers</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(project.created_at)}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(project.updated_at)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1 relative">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${project.id}`)}>
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                          {openMenuId === project.id && (
                            <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-lg shadow-lg py-1 min-w-[140px]">
                              <button
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center text-destructive"
                                onClick={() => handleDelete(project.id, project.name)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredProjects.length)} of {filteredProjects.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
