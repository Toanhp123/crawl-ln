import { Check, CircleX, LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { type ActionFeedbackPolicyName, type ActionState } from '../actions/actionFeedback';
import { useActionFeedback } from '../actions/useActionFeedback';
import { Text } from '../data-display/Text';

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  bordered?: boolean;
  actionState?: ActionState;
  feedbackPolicy?: ActionFeedbackPolicyName;
};

/** Accessible boolean control with canonical motion, sizing and async feedback behavior. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  bordered = false,
  actionState = 'idle',
  feedbackPolicy = 'immediate',
  className,
  disabled,
  ...props
}: SwitchProps) {
  const phase = useActionFeedback(actionState, feedbackPolicy);
  const feedbackBusy = actionState === 'pending' || phase === 'loading';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={feedbackBusy || undefined}
      data-action-state={actionState}
      data-feedback-phase={phase}
      disabled={disabled || feedbackBusy}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex min-h-[var(--touch-target)] w-full items-center justify-between gap-[var(--list-item-gap)] text-left transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:shadow-[inset_var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60',
        bordered
          ? 'border-b border-border px-[var(--list-item-padding)] py-[var(--list-item-padding-y)] last:border-b-0'
          : 'rounded-[var(--radius-md)] border border-border px-[var(--list-item-padding)] py-[var(--list-item-padding-y)] hover:bg-surface2',
        className
      )}
      {...props}
    >
      {label || description ? (
        <span className="min-w-0">
          {label ? (
            <Text as="span" variant="bodySm" className="block font-semibold">
              {label}
            </Text>
          ) : null}
          {description ? (
            <Text as="span" variant="caption" tone="muted" className="mt-1 block">
              {description}
            </Text>
          ) : null}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-pill border transition-[background-color,border-color] duration-[var(--motion-fast)]',
          checked ? 'border-primary bg-primary' : 'border-border-strong bg-surface2',
          phase === 'error' && 'border-danger-state-border'
        )}
      >
        <span
          className={cn(
            'absolute top-1 grid h-4 w-4 place-items-center rounded-pill bg-[hsl(var(--color-primary-contrast))] shadow-[var(--elevation-1)] transition-transform duration-[var(--motion-fast)]',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        >
          {phase === 'loading' ? (
            <LoaderCircle size={11} className="text-primary motion-safe:animate-spin" />
          ) : phase === 'success' ? (
            <Check size={11} className="text-success" strokeWidth={3} />
          ) : phase === 'error' ? (
            <CircleX size={11} className="text-danger" strokeWidth={2.8} />
          ) : null}
        </span>
      </span>
    </button>
  );
}
