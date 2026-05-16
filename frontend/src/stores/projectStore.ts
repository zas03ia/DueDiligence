import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Project, ProjectWithDetails, LoadingState, ProjectFilters } from '../types'
import { apiClient } from '../services/api'

interface ProjectState extends LoadingState {
  projects: Project[]
  currentProject: Project | null
  projectDetails: ProjectWithDetails | null
  filters: ProjectFilters
  
  // Actions
  fetchProjects: () => Promise<void>
  fetchProject: (id: string) => Promise<void>
  fetchProjectDetails: (id: string) => Promise<void>
  createProject: (project: Partial<Project>) => Promise<Project>
  updateProject: (id: string, project: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  generateAnswers: (projectId: string, questionIds?: string[]) => Promise<{ task_id?: string } | void>
  setFilters: (filters: Partial<ProjectFilters>) => void
  clearCurrentProject: () => void
  reset: () => void
}

const initialState: Omit<ProjectState, 'fetchProjects' | 'fetchProject' | 'fetchProjectDetails' | 'createProject' | 'updateProject' | 'deleteProject' | 'generateAnswers' | 'setFilters' | 'clearCurrentProject' | 'reset'> = {
  projects: [],
  currentProject: null,
  projectDetails: null,
  filters: {},
  isLoading: false,
  error: undefined,
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchProjects: async () => {
        set({ isLoading: true, error: undefined })
        
        try {
          const projects = await apiClient.getProjects()
          set({ projects, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch projects',
            isLoading: false 
          })
        }
      },

      fetchProject: async (id: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const project = await apiClient.getProject(id)
          set({ currentProject: project, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch project',
            isLoading: false 
          })
        }
      },

      fetchProjectDetails: async (id: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const projectDetails = await apiClient.getProjectDetails(id)
          set({
            projectDetails,
            currentProject: projectDetails.project,
            isLoading: false,
          })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch project details',
            isLoading: false 
          })
        }
      },

      createProject: async (projectData: Partial<Project>) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const newProject = await apiClient.createProject(projectData)
          set(state => ({ 
            projects: [...state.projects, newProject],
            isLoading: false 
          }))
          return newProject
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to create project',
            isLoading: false 
          })
          throw error
        }
      },

      updateProject: async (id: string, projectData: Partial<Project>) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const updatedProject = await apiClient.updateProject(id, projectData)
          set(state => ({
            projects: state.projects.map(p => p.id === id ? updatedProject : p),
            currentProject: state.currentProject?.id === id ? updatedProject : state.currentProject,
            isLoading: false
          }))
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to update project',
            isLoading: false 
          })
          throw error
        }
      },

      deleteProject: async (id: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          await apiClient.deleteProject(id)
          set(state => ({
            projects: state.projects.filter(p => p.id !== id),
            currentProject: state.currentProject?.id === id ? null : state.currentProject,
            projectDetails: state.projectDetails?.project.id === id ? null : state.projectDetails,
            isLoading: false
          }))
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to delete project',
            isLoading: false 
          })
          throw error
        }
      },

      generateAnswers: async (projectId: string, questionIds?: string[]) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const result = await apiClient.generateProjectAnswers(projectId, questionIds)
          if (result?.task_id) {
            const stored = JSON.parse(localStorage.getItem('project_tasks') || '{}')
            const tasks = stored[projectId] || []
            tasks.unshift({
              id: result.task_id,
              request_type: 'GENERATE_ANSWERS',
              status: 'RUNNING',
              progress: 0,
              project_id: projectId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            stored[projectId] = tasks.slice(0, 20)
            localStorage.setItem('project_tasks', JSON.stringify(stored))
          }
          if (get().projectDetails?.project.id === projectId) {
            await get().fetchProjectDetails(projectId)
          }
          set({ isLoading: false })
          return result
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to generate answers',
            isLoading: false 
          })
          throw error
        }
      },

      setFilters: (filters: Partial<ProjectFilters>) => {
        set(state => ({
          filters: { ...state.filters, ...filters }
        }))
      },

      clearCurrentProject: () => {
        set({ 
          currentProject: null,
          projectDetails: null 
        })
      },

      reset: () => {
        set(initialState)
      },
    }),
    {
      name: 'project-store',
    }
  )
)

// Selectors
export const useProjects = () => useProjectStore(state => state.projects)
export const useCurrentProject = () => useProjectStore(state => state.currentProject)
export const useProjectDetails = () => useProjectStore(state => state.projectDetails)
export const useProjectFilters = () => useProjectStore(state => state.filters)
export const useProjectLoading = () => useProjectStore(state => state.isLoading)
export const useProjectError = () => useProjectStore(state => state.error)
