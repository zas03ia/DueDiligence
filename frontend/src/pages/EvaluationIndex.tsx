import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { formatDate, getStatusColor } from '@/lib/utils'

export default function EvaluationIndex() {
  const { projects, fetchProjects, isLoading } = useProjectStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Evaluation</h1>
        <p className="text-muted-foreground mt-2">
          Select a project to view or run answer quality evaluation
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-xl">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No projects yet. Create one to run evaluations.</p>
          <Link to="/projects/new">
            <Button>Create Project</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}/evaluation`}
              className="block p-6 bg-card border rounded-xl hover:border-primary/50 hover:shadow-md transition-all"
            >
              <h3 className="font-semibold text-lg text-foreground">{project.name}</h3>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
              )}
              <div className="flex items-center justify-between mt-4">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(project.status)}`}>
                  {project.status}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(project.updated_at)}</span>
              </div>
              <div className="flex items-center text-primary text-sm font-medium mt-4">
                Open evaluation <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
