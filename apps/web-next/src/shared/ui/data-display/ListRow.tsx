import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Text } from './Text';

type CommonProps = {
  leading?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  divided?: boolean;
  insetFocus?: boolean;
  showChevron?: boolean;
  className?: string;
};

type InteractiveProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
    onClick: NonNullable<ButtonHTMLAttributes<HTMLButtonElement>['onClick']>;
  };
type StaticProps = CommonProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onClick'> & { onClick?: undefined };
export type ListRowProps = InteractiveProps | StaticProps;

function rowClasses({
  active,
  divided,
  insetFocus,
  className,
  interactive
}: Pick<CommonProps, 'active' | 'divided' | 'insetFocus' | 'className'> & {
  interactive: boolean;
}) {
  return cn(
    'group flex min-h-[var(--list-row-height)] w-full min-w-0 items-center gap-[var(--list-item-gap)] px-[var(--list-item-padding)] py-[var(--list-item-padding-y)] text-left transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-fast)]',
    divided && 'border-b border-border last:border-b-0',
    active ? 'bg-primary-subtle text-text' : 'bg-transparent text-text',
    interactive && 'hover:bg-surface2 active:scale-[.995] focus-visible:outline-none',
    interactive &&
      (insetFocus
        ? 'focus-visible:shadow-[inset_var(--focus-ring)]'
        : 'focus-visible:shadow-[var(--focus-ring)]'),
    className
  );
}

function Content({ leading, title, description, meta, trailing, showChevron }: CommonProps) {
  return (
    <>
      {leading ? (
        <div className="grid h-8 w-8 shrink-0 place-items-center text-secondary transition-colors group-hover:text-primary">
          {leading}
        </div>
      ) : null}
      <div className="min-w-0 flex-1 overflow-hidden">
        <Text as="div" variant="cardTitle" truncate>
          {title}
        </Text>
        {description ? (
          <Text as="div" variant="metadata" tone="muted" className="mt-0.5" truncate>
            {description}
          </Text>
        ) : null}
        {meta ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">{meta}</div>
        ) : null}
      </div>
      {trailing ? <div className="ml-1 shrink-0">{trailing}</div> : null}
      {showChevron ? (
        <ChevronRight
          size={20}
          className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

export function ListRow(props: ListRowProps) {
  const {
    leading,
    title,
    description,
    meta,
    trailing,
    active,
    divided = false,
    insetFocus = false,
    showChevron = false,
    className,
    ...elementProps
  } = props;
  const content = (
    <Content
      leading={leading}
      title={title}
      description={description}
      meta={meta}
      trailing={trailing}
      showChevron={showChevron}
    />
  );
  if ('onClick' in elementProps && elementProps.onClick) {
    const {
      onClick,
      type = 'button',
      disabled,
      ...buttonProps
    } = elementProps as Omit<InteractiveProps, keyof CommonProps>;
    return (
      <button
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={rowClasses({ active, divided, insetFocus, className, interactive: true })}
        {...buttonProps}
      >
        {content}
      </button>
    );
  }
  const { onClick: _onClick, ...divProps } = elementProps as Omit<StaticProps, keyof CommonProps>;
  return (
    <div
      className={rowClasses({ active, divided, insetFocus, className, interactive: false })}
      {...divProps}
    >
      {content}
    </div>
  );
}
