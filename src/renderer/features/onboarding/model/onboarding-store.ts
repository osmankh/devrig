import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingState {
  completed: boolean
  currentStep: number
  totalSteps: number
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  complete: () => void
  reset: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completed: false,
      currentStep: 0,
      totalSteps: 5,

      setStep: (step) => set({ currentStep: step }),

      nextStep: () => {
        const { currentStep, totalSteps } = get()
        if (currentStep < totalSteps - 1) {
          set({ currentStep: currentStep + 1 })
        }
      },

      prevStep: () => {
        const { currentStep } = get()
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 })
        }
      },

      complete: () => set({ completed: true, currentStep: 0 }),
      reset: () => set({ completed: false, currentStep: 0 })
    }),
    {
      name: 'devrig-onboarding',
      partialize: (state) => ({ completed: state.completed })
    }
  )
)
