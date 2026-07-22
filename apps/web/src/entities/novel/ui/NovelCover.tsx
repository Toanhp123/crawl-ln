import { BookOpenText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../../shared/lib';

export function NovelCover({
  title,
  coverUrl,
  size = 'sm',
  className
}: {
  title: string;
  coverUrl?: string;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [coverUrl]);
  const shellClass = cn(
    'grid shrink-0 place-items-center overflow-hidden border border-primary-state-border bg-[var(--gradient-primary-cover)] text-primary shadow-[var(--elevation-1)]',
    size === 'lg'
      ? 'aspect-[3/4] w-24 rounded-[var(--radius-lg)]'
      : 'aspect-[3/4] w-[4.25rem] rounded-[var(--radius-md)]',
    className
  );

  if (coverUrl && !failed) {
    return (
      <span className={shellClass}>
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span aria-hidden className={shellClass}>
      <BookOpenText size={size === 'lg' ? 34 : 27} />
      <span className="sr-only">{title}</span>
    </span>
  );
}
