import { Dialog, DialogContent, DialogTitle, DialogDescription, Button } from '@shared/ui'
import { useOnboardingStore } from '../model/onboarding-store'
import { useRouterStore } from '@app/router/router'

const STEPS = [
  {
    title: 'Welcome to DevRig',
    description:
      'Your AI-powered developer command center. DevRig unifies all your tools into a single intelligent hub.',
    icon: (
      <svg className="h-12 w-12 text-[var(--color-accent-primary)]" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M16 24l6 6 10-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    title: 'Unified Inbox',
    description:
      'All your emails, PRs, tickets, and alerts in one place. AI classifies and prioritizes everything so you see only what matters.',
    icon: (
      <svg className="h-12 w-12 text-[var(--color-accent-primary)]" viewBox="0 0 48 48" fill="none">
        <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M6 30l14-8 4 3 4-3 14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    title: 'Connect Your Plugins',
    description:
      'Install plugins for Gmail, GitHub, Linear, Sentry, and more. Each plugin brings its data into your unified inbox.',
    icon: (
      <svg className="h-12 w-12 text-[var(--color-accent-primary)]" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="2" />
        <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="2" />
        <path d="M24 6v12M24 30v12M6 24h12M30 24h12" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  },
  {
    title: 'AI-Powered Actions',
    description:
      'AI drafts replies, summarizes threads, classifies items, and suggests next actions. Multiple AI models supported.',
    icon: (
      <svg className="h-12 w-12 text-[var(--color-accent-primary)]" viewBox="0 0 48 48" fill="none">
        <path d="M24 4l4 12h12l-10 7 4 12-10-7-10 7 4-12L8 16h12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    title: 'You\'re All Set!',
    description:
      'Start by checking your inbox or installing your first plugin from the marketplace. Press Cmd+K anytime to search.',
    icon: (
      <svg className="h-12 w-12 text-[var(--color-accent-primary)]" viewBox="0 0 48 48" fill="none">
        <path d="M14 24l8 8 14-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
]

export function OnboardingDialog() {
  const completed = useOnboardingStore((s) => s.completed)
  const currentStep = useOnboardingStore((s) => s.currentStep)
  const nextStep = useOnboardingStore((s) => s.nextStep)
  const prevStep = useOnboardingStore((s) => s.prevStep)
  const complete = useOnboardingStore((s) => s.complete)
  const navigate = useRouterStore((s) => s.navigate)

  if (completed) return null

  const step = STEPS[currentStep]
  const isLast = currentStep === STEPS.length - 1

  return (
    <Dialog open={!completed} onOpenChange={() => complete()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="flex flex-col items-center px-8 pt-8 pb-4 text-center">
          <div className="mb-4">{step.icon}</div>
          <DialogTitle className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
            {step.title}
          </DialogTitle>
          <DialogDescription className="mt-2 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
            {step.description}
          </DialogDescription>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep
                  ? 'w-6 bg-[var(--color-accent-primary)]'
                  : 'w-1.5 bg-[var(--color-border-subtle)]'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={complete}
            className="text-[var(--color-text-tertiary)]"
          >
            Skip
          </Button>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={prevStep}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                onClick={() => {
                  complete()
                  navigate({ view: 'inbox' })
                }}
              >
                Get Started
              </Button>
            ) : (
              <Button size="sm" onClick={nextStep}>
                Next
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
