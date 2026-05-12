import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { EvaluationResult, LoadingState } from '../types'
import { apiClient } from '../services/api'

interface EvaluationState extends LoadingState {
  currentEvaluation: EvaluationResult | null
  loading: boolean
  error?: string
  
  // Actions
  evaluateAnswers: (projectId: string, groundTruthAnswers: Record<string, string>) => Promise<void>
  setCurrentEvaluation: (evaluation: EvaluationResult) => void
  reset: () => void
}

const initialState: Omit<EvaluationState, 'evaluateAnswers' | 'setCurrentEvaluation' | 'reset'> = {
  currentEvaluation: null,
  loading: false,
  error: undefined,
}

export const useEvaluationStore = create<EvaluationState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      evaluateAnswers: async (projectId: string, groundTruthAnswers: Record<string, string>) => {
        set({ loading: true, error: undefined })
        
        try {
          const evaluation = await apiClient.evaluateAnswers(projectId, groundTruthAnswers)
          set({ currentEvaluation: evaluation, loading: false })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to evaluate answers',
            loading: false 
          })
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
export const useEvaluationLoading = () => useEvaluationStore(state => state.loading)
export const useEvaluationError = () => useEvaluationStore(state => state.error)
