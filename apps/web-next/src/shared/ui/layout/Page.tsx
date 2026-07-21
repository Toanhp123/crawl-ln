import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type PageBottomInset = 'content' | 'stickyAction' | 'none';

type PageProps = HTMLAttributes<HTMLElement> & {
  bottomInset?: PageBottomInset;
};

const bottomInsetClass: Record<PageBottomInset, string> = {
  content: 'pb-[calc(var(--app-nav-total)+var(--space-6))] md:pb-8',
  stickyAction: 'pb-[var(--app-nav-total)] md:pb-0',
  none: 'pb-0'
};

export function Page({ bottomInset = 'content', className, ...props }: PageProps) {
  return (
    <section
      className={cn(
        'mx-auto w-full max-w-[var(--content-max)] space-y-[var(--section-gap)] px-[var(--page-gutter)] pt-[var(--page-y)]',
        bottomInsetClass[bottomInset],
        className
      )}
      {...props}
    />
  );
}
