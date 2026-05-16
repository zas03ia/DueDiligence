import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { EvaluationResult, LoadingState } from '../types'
import { apiClient } from '../services/api'

interface EvaluationState extends LoadingState {
  currentEvaluation: EvaluationResult | null
  
  // Actions
  evaluateAnswers: (projectId: string, groundTruthAnswers: Record<string, string>) => Promise<void>
  setCurrentEvaluation: (evaluation: EvaluationResult) => void
  reset: () => void
}

const initialState: Omit<EvaluationState, 'evaluateAnswers' | 'setCurrentEvaluation' | 'reset'> = {
  currentEvaluation: null,
  isLoading: false,
  error: undefined,
}

export const useEvaluationStore = create<EvaluationState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      evaluateAnswers: async (projectId: string, groundTruthAnswers: Record<string, string>) => {
        set({ isLoading: true, error: undefined })
        
        try {
          const evaluation = await apiClient.evaluateAnswers(projectId, groundTruthAnswers)
          set({ currentEvaluation: evaluation, isLoading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to evaluate answers',
            isLoading: false 
          })
          throw error
        }
      },

      setCurrentEvaluation: (evaluation: EvaluationResult) => {
        set({ currentEvaluation: evaluation })
      },

      reset: () => {
        set(initialState)
      },
    }),
    {
      name: 'evaluation-store',
    }
  )
)

// Selectors
export const useCurrentEvaluation = () => useEvaluationStore(state => state.currentEvaluation)
export const useEvaluationLoading = () => useEvaluationStore(state => state.isLoading)
export const useEvaluationError = () => useEvaluationStore(state => state.error)
