import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Answer, LoadingState, AnswerFilters } from '../types'
import { apiClient } from '../services/api'
import { useProjectStore } from './projectStore'

interface AnswerState extends LoadingState {
  answers: Answer[]
  currentAnswer: Answer | null
  filters: AnswerFilters
  
  // Actions
  fetchProjectAnswers: (projectId: string) => Promise<void>
  fetchAnswer: (answerId: string) => Promise<void>
  updateAnswer: (answerId: string, answerData: Partial<Answer>, projectId?: string) => Promise<void>
  confirmAnswer: (answerId: string, projectId?: string) => Promise<void>
  rejectAnswer: (answerId: string, reason?: string, projectId?: string) => Promise<void>
  regenerateAnswer: (answerId: string, projectId?: string) => Promise<void>
  setFilters: (filters: Partial<AnswerFilters>) => void
  clearCurrentAnswer: () => void
  reset: () => void
}

const refreshProjectDetails = async (projectId?: string) => {
  if (projectId) {
    await useProjectStore.getState().fetchProjectDetails(projectId)
  }
}

const initialState: Omit<AnswerState, 'fetchProjectAnswers' | 'fetchAnswer' | 'updateAnswer' | 'confirmAnswer' | 'rejectAnswer' | 'regenerateAnswer' | 'setFilters' | 'clearCurrentAnswer' | 'reset'> = {
  answers: [],
  currentAnswer: null,
  filters: {},
  isLoading: false,
  error: undefined,
}

export const useAnswerStore = create<AnswerState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchProjectAnswers: async (projectId: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const answers = await apiClient.getProjectAnswers(projectId)
          set({ answers, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch answers',
            isLoading: false 
          })
        }
      },

      fetchAnswer: async (answerId: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const answer = await apiClient.getAnswer(answerId)
          set({ currentAnswer: answer, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to fetch answer',
            isLoading: false 
          })
        }
      },

      updateAnswer: async (answerId: string, answerData: Partial<Answer>, projectId?: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const updatedAnswer = await apiClient.updateAnswer(answerId, answerData)
          
          // Update in local state
          if (get().currentAnswer?.id === answerId) {
            set({ currentAnswer: updatedAnswer })
          }
          
          // Update in answers array
          set(state => ({
            answers: state.answers.map(a => 
              a.id === answerId ? updatedAnswer : a
            ),
            isLoading: false
          }))
          await refreshProjectDetails(projectId)
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to update answer',
            isLoading: false 
          })
        }
      },

      confirmAnswer: async (answerId: string, projectId?: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          await apiClient.confirmAnswer(answerId)
          
          // Update in local state
          if (get().currentAnswer?.id === answerId) {
            set({ currentAnswer: { ...get().currentAnswer!, status: 'CONFIRMED' } })
          }
          
          // Update in answers array
          set(state => ({
            answers: state.answers.map(a => 
              a.id === answerId ? { ...a, status: 'CONFIRMED' } : a
            ),
            isLoading: false
          }))
          await refreshProjectDetails(projectId)
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to confirm answer',
            isLoading: false 
          })
        }
      },

      rejectAnswer: async (answerId: string, reason?: string, projectId?: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          await apiClient.rejectAnswer(answerId, reason)
          
          // Update in local state
          if (get().currentAnswer?.id === answerId) {
            set({ currentAnswer: { ...get().currentAnswer!, status: 'REJECTED' } })
          }
          
          // Update in answers array
          set(state => ({
            answers: state.answers.map(a => 
              a.id === answerId ? { ...a, status: 'REJECTED' } : a
            ),
            isLoading: false
          }))
          await refreshProjectDetails(projectId)
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to reject answer',
            isLoading: false 
          })
        }
      },

      regenerateAnswer: async (answerId: string, projectId?: string) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const result = await apiClient.regenerateAnswer(answerId)
          
          // Update in local state
          if (get().currentAnswer?.id === answerId) {
            set({ currentAnswer: result.result })
          }
          
          // Update in answers array
          set(state => ({
            answers: state.answers.map(a => 
              a.id === answerId ? result.result : a
            ),
            isLoading: false
          }))
          await refreshProjectDetails(projectId)
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to regenerate answer',
            isLoading: false 
          })
        }
      },

      setFilters: (filters: Partial<AnswerFilters>) => {
        set(state => ({
          filters: { ...state.filters, ...filters }
        }))
      },

      clearCurrentAnswer: () => {
        set({ 
          currentAnswer: null 
        })
      },

      reset: () => {
        set(initialState)
      },
    }),
    {
      name: 'answer-store',
    }
  )
)

// Selectors
export const useAnswers = () => useAnswerStore(state => state.answers)
export const useCurrentAnswer = () => useAnswerStore(state => state.currentAnswer)
export const useAnswerFilters = () => useAnswerStore(state => state.filters)
export const useAnswerLoading = () => useAnswerStore(state => state.isLoading)
export const useAnswerError = () => useAnswerStore(state => state.error)
