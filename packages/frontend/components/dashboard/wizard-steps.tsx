'use client';

export type WizardStep = 'connect' | 'name' | 'review' | 'success';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'connect', label: 'Connect' },
  { id: 'name', label: 'Name' },
  { id: 'review', label: 'Mint' },
  { id: 'success', label: 'Done' },
];

function stepIndex(step: WizardStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

/**
 * Neo-brutalist step indicator for the Create Agent wizard.
 * Shows all 4 steps with the current one highlighted in electric-purple.
 */
export function WizardStepIndicator({ current }: { current: WizardStep }) {
  const currentIdx = stepIndex(current);

  return (
    <div className="flex items-center gap-0" aria-label="Wizard progress">
      {STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isCompleted = i < currentIdx;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step pill */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] font-bold uppercase ${
                isActive
                  ? 'border-2 border-electric-purple bg-electric-purple text-off-white'
                  : isCompleted
                    ? 'border-2 border-pure-black bg-soft-lavender text-pure-black'
                    : 'border-2 border-pure-black/30 bg-white text-on-surface-variant'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isCompleted ? '✓' : i + 1}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-4 sm:w-6 ${
                  i < currentIdx ? 'bg-electric-purple' : 'bg-pure-black/20'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
