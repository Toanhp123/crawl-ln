import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, CircleX, LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import {
  type ActionFeedbackPhase,
  type ActionFeedbackPolicyName,
  type ActionState
} from './actionFeedback';
import { useActionFeedback } from './useActionFeedback';

const buttonVariants = cva(
  'inline-flex min-w-0 items-center justify-center rounded-[var(--button-radius)] border font-[var(--button-font-weight)] transition-[background-color,border-color,color,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:translate-y-px disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
  {
    variants: {
      variant: {
        primary:
          'border-primary bg-primary text-[hsl(var(--color-primary-contrast))] hover:bg-primary-hover active:bg-primary-pressed',
        secondary:
          'border-border-strong bg-surface text-text hover:border-primary-state-border hover:bg-surface2',
        ghost: 'border-transparent bg-transparent text-secondary hover:bg-surface2 hover:text-text',
        danger:
          'border-danger-state-border bg-danger-subtle text-danger hover:bg-danger-state-hover'
      },
      size: {
        sm: 'min-h-[var(--touch-target)] px-3 type-label',
        md: 'min-h-[var(--touch-target)] px-4 type-body',
        lg: 'min-h-[var(--height-control-lg)] px-5 type-body',
        xl: 'min-h-[var(--height-control-xl)] px-5 type-title'
      },
      full: { true: 'w-full' }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    actionState?: ActionState;
    feedbackPolicy?: ActionFeedbackPolicyName;
    leadingIcon?: ReactNode;
  };

function FeedbackIcon({ phase }: { phase: Exclude<ActionFeedbackPhase, 'idle'> }) {
  return (
    <span className="button-feedback-enter grid place-items-center" aria-hidden="true">
      {phase === 'loading' ? (
        <LoaderCircle className="motion-safe:animate-spin" size={16} />
      ) : phase === 'success' ? (
        <Check size={17} strokeWidth={2.4} />
      ) : (
        <CircleX size={17} strokeWidth={2.3} />
      )}
    </span>
  );
}

function ButtonContent({
  children,
  leadingIcon,
  phase
}: {
  children: ReactNode;
  leadingIcon?: ReactNode;
  phase: ActionFeedbackPhase;
}) {
  if (leadingIcon !== undefined) {
    return (
      <span className="inline-flex min-w-0 items-center justify-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
          {phase === 'idle' ? leadingIcon : <FeedbackIcon phase={phase} />}
        </span>
        {children}
      </span>
    );
  }

  return (
    <span className="relative inline-grid min-w-0 place-items-center">
      <span
        className={cn(
          'inline-flex min-w-0 items-center justify-center gap-2',
          phase !== 'idle' && 'invisible'
        )}
      >
        {children}
      </span>
      {phase !== 'idle' ? (
        <span className="absolute inset-0 grid place-items-center">
          <FeedbackIcon phase={phase} />
        </span>
      ) : null}
    </span>
  );
}

export function Button({
  className,
  variant,
  size,
  full,
  asChild,
  actionState = 'idle',
  feedbackPolicy = 'standard',
  leadingIcon,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const phase = useActionFeedback(actionState, feedbackPolicy);
  const feedbackActive = actionState === 'pending' || phase !== 'idle';
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, full }), className)}
      aria-busy={actionState === 'pending' || phase === 'loading' || undefined}
      data-action-state={actionState}
      data-feedback-phase={phase}
      disabled={asChild ? undefined : disabled || feedbackActive}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <ButtonContent leadingIcon={leadingIcon} phase={phase}>
          {children}
        </ButtonContent>
      )}
    </Comp>
  );
}
